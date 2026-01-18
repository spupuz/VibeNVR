from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List
import crud, schemas, database, motion_service, storage_service, probe_service, auth_service, models
import json, asyncio
from typing import Optional

router = APIRouter(
    prefix="/cameras",
    tags=["cameras"],
    responses={404: {"description": "Not found"}},
)

@router.post("", response_model=schemas.Camera)
def create_camera(camera: schemas.CameraCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    # Auto-detect resolution if passthrough is enabled
    # Auto-detect resolution if enabled
    if camera.auto_resolution and camera.rtsp_url:
        print(f"Probing stream for camera {camera.name}...", flush=True)
        dims = probe_service.probe_stream(camera.rtsp_url)
        if dims:
            print(f"Detected resolution: {dims['width']}x{dims['height']}", flush=True)
            camera.resolution_width = dims['width']
            camera.resolution_height = dims['height']
        else:
            print("Probe failed, using provided resolution.", flush=True)

    new_camera = crud.create_camera(db=db, camera=camera)
    motion_service.generate_motion_config(db)
    return new_camera

@router.get("", response_model=List[schemas.Camera])
def read_cameras(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    cameras = crud.get_cameras(db, skip=skip, limit=limit)
    return cameras

@router.get("/{camera_id}", response_model=schemas.Camera)
def read_camera(camera_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return db_camera

@router.put("/{camera_id}", response_model=schemas.Camera)
def update_camera(camera_id: int, camera: schemas.CameraCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    # Get existing camera to check if RTSP URL changed
    existing_camera = crud.get_camera(db, camera_id=camera_id)
    if existing_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Only probe if auto_resolution is enabled AND RTSP URL changed
    rtsp_changed = existing_camera.rtsp_url != camera.rtsp_url
    if camera.auto_resolution and camera.rtsp_url and rtsp_changed:
        print(f"Probing stream for camera {camera.name} (URL changed)...", flush=True)
        dims = probe_service.probe_stream(camera.rtsp_url)
        if dims:
            print(f"Detected resolution: {dims['width']}x{dims['height']}", flush=True)
            camera.resolution_width = dims['width']
            camera.resolution_height = dims['height']
        else:
            print("Probe failed, using provided resolution.", flush=True)

    # Store old active status to decide on start vs update
    was_active = existing_camera.is_active
    
    db_camera = crud.update_camera(db, camera_id=camera_id, camera=camera)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # If active status changed, we might need to start/stop the camera in Engine
    # If it was inactive and now active -> Start
    # If it was active and now inactive -> Stop? (Sync handles it?)
    # For now, let's just Sync All if active status changes, simpler.
    if was_active != db_camera.is_active:
        print(f"Camera {camera.name} active status changed ({was_active} -> {db_camera.is_active}). Syncing Engine...", flush=True)
        if db_camera.is_active:
            motion_service.update_camera_runtime(db_camera)
        else:
            motion_service.stop_camera(db_camera.id)
    else:
        # Just update runtime config if active
        if db_camera.is_active:
            print(f"Camera {camera.name} updated. Applying runtime config...", flush=True)
            motion_service.update_camera_runtime(db_camera)
        else:
            print(f"Camera {camera.name} updated (inactive). Ensuring it is stopped...", flush=True)
            motion_service.stop_camera(db_camera.id)

    return db_camera

@router.post("/{camera_id}/recording")
def toggle_camera_recording(camera_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """
    Toggle recording mode for a specific camera.
    Uses Motion's per-camera config API to avoid full restart.
    """
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Toggle between Always and Motion Triggered
    new_mode = 'Motion Triggered' if db_camera.recording_mode == 'Always' else 'Always'
    
    # Update DB
    db_camera.recording_mode = new_mode
    db.commit()
    db.refresh(db_camera)
    
    # Toggle in Motion without full restart (update config file + per-camera restart)
    success = motion_service.toggle_recording_mode(camera_id, db_camera)
    
    if not success:
        # Fallback: regenerate config and restart (slower but reliable)
        print("Per-camera toggle failed, falling back to full restart", flush=True)
        motion_service.generate_motion_config(db)
    
    return db_camera

@router.delete("/{camera_id}", response_model=schemas.Camera)
def delete_camera(camera_id: int, db: Session = Depends(database.get_db)):
    db_camera = crud.delete_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    motion_service.generate_motion_config(db)
    return db_camera

from fastapi.responses import StreamingResponse, Response
import httpx

@router.get("/{camera_id}/frame")
async def get_camera_frame(camera_id: int, db: Session = Depends(database.get_db), user=Depends(auth_service.get_current_user_mixed)):
    """Proxy a single JPEG frame from the engine (for polling mode)"""
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    frame_url = f"http://engine:8000/cameras/{camera_id}/frame"
    
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(frame_url)
            return Response(
                content=response.content,
                media_type="image/jpeg",
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
            )
    except Exception as e:
        print(f"[FRAME] Error getting frame for camera {camera_id}: {e}", flush=True)
        # Return placeholder on error
        placeholder = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x03\x02\x02\x03\x02\x02\x03\x03\x03\x03\x04\x06\x0b\x07\x06\x06\x06\x06\r\x0b\x0b\x08\x0b\x0c\r\x0f\x0e\x0e\x0c\x0c\x0c\r\x0f\x10\x12\x17\x15\x15\x15\x17\x11\x13\x19\x1b\x18\x15\x1a\x14\x11\x11\x14\x1b\x15\x18\x1a\x1d\x1d\x1e\x1e\x1e\x13\x17 !\x1f\x1d!\x19\x1e\x1e\x1d\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x03\x01"\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00?\x00\xbf\x00\xff\xd9'
        return Response(content=placeholder, media_type="image/jpeg")

@router.get("/{camera_id}/stream")
async def stream_camera(camera_id: int, db: Session = Depends(database.get_db), user=Depends(auth_service.get_current_user_mixed)):
    """Proxy the MJPEG stream from Motion to bypass CORS issues"""
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Use explicit container name for hostname stability
    # Motion used 8100+ID, VibeEngine uses API path
    motion_stream_url = f"http://engine:8000/cameras/{camera_id}/stream"
    
    async def generate():
        print(f"[STREAM] Starting proxy for camera {camera_id} from {motion_stream_url}", flush=True)
        try:
            # Connection timeout 5s, Read timeout None (infinite stream)
            timeout = httpx.Timeout(None, connect=5.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                try:
                    async with client.stream("GET", motion_stream_url) as response:
                        if response.status_code != 200:
                            print(f"[STREAM] Motion returned status {response.status_code}, aborting.", flush=True)
                            return
                        
                        count = 0
                        async for chunk in response.aiter_bytes():
                            yield chunk
                            count += 1
                            if count % 100 == 0:
                                print(f"[STREAM] Camera {camera_id} proxy active, chunk {count}", flush=True)
                except Exception as e:
                    print(f"[STREAM] Proxy error loop for {camera_id}: {e}", flush=True)
        except Exception as e:
            print(f"[STREAM] Proxy error for camera {camera_id}: {type(e).__name__}: {e}", flush=True)
        finally:
            print(f"[STREAM] Proxy finished for camera {camera_id}", flush=True)
    
    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )


# ============ IMPORT/EXPORT ENDPOINTS ============

@router.get("/export/all")
def export_all_cameras(db: Session = Depends(database.get_db)):
    """Export all cameras settings as JSON"""
    cameras = crud.get_cameras(db)
    export_data = []
    
    fields_to_exclude = {'id', 'created_at', 'groups', 'events'}
    
    for cam in cameras:
        # Pydantic v2 validation (excludes relationships and system fields like ID automatically)
        cam_data = jsonable_encoder(schemas.CameraCreate.model_validate(cam))
        export_data.append(cam_data)
    
    return Response(
        content=json.dumps({"cameras": export_data, "version": "1.1"}, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=vibenvr_cameras_export.json"}
    )

@router.get("/{camera_id}/export")
def export_single_camera(camera_id: int, db: Session = Depends(database.get_db)):
    """Export single camera settings as JSON"""
    cam = crud.get_camera(db, camera_id)
    if cam is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    fields_to_exclude = {'id', 'created_at', 'groups', 'events'}
    
    # Use schema to serialize without relationships
    filtered_data = jsonable_encoder(schemas.CameraCreate.model_validate(cam))
    
    return Response(
        content=json.dumps({"camera": filtered_data, "version": "1.1"}, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=vibenvr_camera_{cam.name.replace(' ', '_')}.json"}
    )

@router.post("/import")
async def import_cameras(file: UploadFile = File(...), db: Session = Depends(database.get_db)):
    """Import cameras from JSON file"""
    try:
        content = await file.read()
        data = json.loads(content)
        
        imported_count = 0
        cameras_data = data.get("cameras", [data.get("camera")]) if "cameras" in data else [data.get("camera")]
        
        for cam_data in cameras_data:
            if cam_data is None:
                continue
            # Create new camera with imported settings
            new_camera = schemas.CameraCreate(**cam_data)
            crud.create_camera(db, new_camera)
            imported_count += 1
        
        motion_service.generate_motion_config(db)
        return {"message": f"Successfully imported {imported_count} camera(s)", "count": imported_count}
    
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{camera_id}/cleanup")
def cleanup_camera(camera_id: int, type: Optional[str] = None, db: Session = Depends(database.get_db)):
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    if type and type not in ['video', 'snapshot']:
        raise HTTPException(status_code=400, detail="Invalid cleanup type. Must be 'video' or 'snapshot'")
        
    storage_service.cleanup_camera(db, db_camera, media_type=type)
    return {"status": "success", "message": f"Cleanup triggered for camera {db_camera.name} (type={type})"}

@router.post("/{camera_id}/snapshot")
def manual_snapshot(camera_id: int, db: Session = Depends(database.get_db)):
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    success = motion_service.trigger_snapshot(camera_id)
    if success:
        return {"status": "success", "message": "Snapshot triggered"}
    else:
        raise HTTPException(status_code=500, detail="Failed to trigger snapshot via Motion")
