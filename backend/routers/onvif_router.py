from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sse_starlette.sse import EventSourceResponse
import asyncio
from typing import List
import json
import schemas
import onvif_service
import auth_service
from sqlalchemy.orm import Session
import database
import crud

router = APIRouter(prefix="/onvif", tags=["onvif"])


@router.get("/scan/stream")
async def scan_onvif_stream(
    ip_range: str = Query(..., description="IP range to scan"),
    timeout: float = Query(2.0, description="Timeout in seconds per port check"),
    retries: int = Query(2, description="Max retries per port check"),
    x_scanner_user: str = Header(default=""),
    x_scanner_password: str = Header(default=""),
    current_user: schemas.User = Depends(auth_service.get_current_active_admin)
):
    """Scan an IP range and stream results/progress via SSE securely (Headers)."""
    
    # Expand IPs early to know total count
    ips_list = onvif_service.get_ips_from_range(ip_range)
    total = len(ips_list)
    user = x_scanner_user
    password = x_scanner_password
    
    async def sse_generator():
        print("DEBUG SCAN: starting generator")
        if not ips_list:
            print("DEBUG SCAN: no IPs, exiting generator")
            yield {"event": "error", "data": json.dumps({"message": "Invalid IP range"})}
            return

        yield {"event": "start", "data": json.dumps({"total": total})}
        
        semaphore = asyncio.Semaphore(10) # Keep concurrency low for WiFi stability
        
        async def process_ip(ip):
            async with semaphore:
                # Scanning
                scan_res = await onvif_service.scan_host(ip, timeout=timeout, retries=retries)
                rtsp_open = scan_res["rtsp"]
                onvif_ports = scan_res["onvif"]
                
                best_device = None
                if onvif_ports:
                    probe_tasks = [onvif_service.quick_probe(ip, p, user, password) for p in onvif_ports]
                    probe_results = await asyncio.gather(*probe_tasks)
                    verified = [r for r in probe_results if r]
                    if verified:
                        verified.sort(key=lambda x: (x.get("manufacturer") is not None, x.get("auth_required") is False), reverse=True)
                        best_device = verified[0]
                        best_device["rtsp_open"] = rtsp_open
                    else:
                        # Fallback: ports are open but probe completely failed
                        best_device = {
                            "ip": ip,
                            "port": onvif_ports[0],
                            "status": "potential_onvif",
                            "rtsp_open": rtsp_open,
                            "auth_required": True # Assume auth might be needed if probe failed
                        }
                
                if not best_device and rtsp_open:
                    best_device = {
                        "ip": ip, "port": 0, "status": "rtsp_only", "rtsp_open": True
                    }
                    
                if best_device:
                    return {"ip": ip, "result": best_device}
                return {"ip": ip}

        tasks = [asyncio.create_task(process_ip(ip)) for ip in ips_list]
        completed = 0
        
        try:
            # As tasks complete, yield results
            for task in asyncio.as_completed(tasks):
                try:
                    res = await task
                    completed += 1
                    progress = {
                        "ip": res["ip"] if res else "",
                        "current": completed,
                        "total": total,
                        "percent": round((completed / total) * 100)
                    }
                    yield {"event": "progress", "data": json.dumps(progress)}
                    
                    if res and res.get("result"):
                        yield {"event": "result", "data": json.dumps(res["result"])}
                except asyncio.CancelledError:
                    # Reraise so the generator shuts down properly internally
                    raise
                except Exception as e:
                    yield {"event": "error", "data": json.dumps({"message": str(e)})}
    
            yield {"event": "done", "data": json.dumps({"total": total})}
        finally:
            # Client disconnected (or stream ended), cancel all pending scan tasks
            # This prevents thousands of leaked connection attempts and "Too many open files" errors
            for task in tasks:
                if not task.done():
                    task.cancel()

    # Add X-Accel-Buffering to prevent Nginx from caching the stream chunks
    return EventSourceResponse(sse_generator(), headers={
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache"
    })

@router.post("/probe", response_model=schemas.OnvifDeviceDetails)
async def probe_onvif_device(req: schemas.OnvifProbeRequest, current_user: schemas.User = Depends(auth_service.get_current_active_admin)):
    """Full probe of a specific device to get profiles and RTSP URLs."""
    try:
        details = await onvif_service.get_onvif_details(req.ip, req.port, req.user or "", req.password or "")
        if not details:
            raise HTTPException(status_code=400, detail="Could not retrieve ONVIF details from device. Check credentials and connection.")
        return details
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=400, detail=f"Connection refused: Could not connect to {req.ip}:{req.port}. Is the port correct?")
    except Exception as e:
        err_str = str(e)
        if "Connection refused" in err_str or "111" in err_str:
             raise HTTPException(status_code=400, detail=f"Connection refused at {req.ip}:{req.port}. Try a different port (e.g. 80, 8080, 8000, 8899).")
        raise HTTPException(status_code=500, detail=f"Internal probe error: {err_str}")

@router.post("/deep-scan", response_model=List[dict])
async def deep_scan_onvif(req: schemas.OnvifDeepScanRequest, current_user: schemas.User = Depends(auth_service.get_current_active_admin)):
    """Deep scan all ports of a single host to find ONVIF."""
    open_ports = await onvif_service.deep_scan_host(req.ip)
    
    # Prune ports that are definitely not ONVIF (like 554 RTSP) to keep it fast
    potential_ports = [p for p in open_ports if p != 554]
    
    # Try to quick probe them in parallel
    results = await asyncio.gather(*[onvif_service.quick_probe(req.ip, p) for p in potential_ports])
    
    # Filter only functional ONVIF results
    final = [r for r in results if r is not None]
    
    if not final:
        # If no ONVIF found but 554 is open, return a placeholder
        if 554 in open_ports:
            return [{
                "ip": req.ip,
                "port": 0,
                "status": "rtsp_only",
                "rtsp_open": True
            }]
            
    return final

@router.post("/ptz/move/{camera_id}")
async def ptz_move(
    camera_id: int, 
    req: schemas.PTZMoveRequest,
    db: Session = Depends(database.get_db),
    current_user: schemas.User = Depends(auth_service.get_current_active_admin)
):
    """Trigger continuous PTZ movement."""
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    success = await onvif_service.ptz_continuous_move(camera, req.pan, req.tilt, req.zoom)
    if not success:
        raise HTTPException(status_code=500, detail="PTZ Move command failed")
    return {"status": "ok"}

@router.post("/ptz/stop/{camera_id}")
async def ptz_stop(
    camera_id: int,
    db: Session = Depends(database.get_db),
    current_user: schemas.User = Depends(auth_service.get_current_active_admin)
):
    """Stop PTZ movement."""
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    success = await onvif_service.ptz_stop(camera)
    if not success:
        raise HTTPException(status_code=500, detail="PTZ Stop command failed")
    return {"status": "ok"}

@router.post("/ptz/set-home/{camera_id}")
async def ptz_set_home(
    camera_id: int,
    db: Session = Depends(database.get_db),
    current_user: schemas.User = Depends(auth_service.get_current_active_admin)
):
    """Set the current position as the home position."""
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    success = await onvif_service.ptz_set_home(camera)
    if not success:
        raise HTTPException(
            status_code=400, 
            detail="Failed to set home position. Your camera might not support ONVIF SetHomePosition."
        )
    return {"status": "success"}

@router.post("/ptz/goto-home/{camera_id}")
async def ptz_goto_home(
    camera_id: int,
    db: Session = Depends(database.get_db),
    current_user: schemas.User = Depends(auth_service.get_current_active_admin)
):
    """Go to the configured home position."""
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    success = await onvif_service.ptz_goto_home(camera)
    if not success:
        raise HTTPException(
            status_code=400, 
            detail="Failed to trigger Go to Home. Your camera hardware might not support this command and no fallback presets (Home/1) were found."
        )
    return {"status": "success"}
    
@router.post("/ptz/goto-preset/{camera_id}")
async def ptz_goto_preset(
    camera_id: int,
    req: schemas.PTZGotoPresetRequest,
    db: Session = Depends(database.get_db),
    current_user: schemas.User = Depends(auth_service.get_current_active_admin)
):
    """Go to a specific PTZ preset."""
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    success = await onvif_service.ptz_goto_preset(camera, req.preset_token)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to trigger PTZ GotoPreset")
    return {"status": "success"}

@router.get("/ptz/presets/{camera_id}")
async def get_ptz_presets(
    camera_id: int,
    db: Session = Depends(database.get_db),
    current_user: schemas.User = Depends(auth_service.get_current_active_admin)
):
    """Get list of PTZ presets."""
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    presets = await onvif_service.get_ptz_presets(camera)
    return presets

@router.post("/ptz/probe-features/{camera_id}")
async def probe_ptz_features(
    camera_id: int,
    db: Session = Depends(database.get_db),
    current_user: schemas.User = Depends(auth_service.get_current_active_admin)
):
    """Manually trigger a probe for ONVIF features and update camera status."""
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # 1. Probe ONVIF
    features = await onvif_service.get_onvif_features(camera)
    
    # 2. Update DB
    camera.ptz_can_pan_tilt = features["ptz_can_pan_tilt"]
    camera.ptz_can_zoom = features["ptz_can_zoom"]
    camera.onvif_can_events = features["onvif_can_events"]
    camera.audio_enabled = features["audio_enabled"]
    db.commit()
    db.refresh(camera)
    
    # Trigger subscription update if mode is ONVIF Edge
    from onvif_event_service import event_manager
    event_manager.update_subscription(camera_id)
    
    return features
