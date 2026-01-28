from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List
import crud, schemas, database, motion_service, storage_service, probe_service, auth_service, models
import json, asyncio, tarfile, io, re, os
from urllib.parse import urlparse
from typing import Optional

router = APIRouter(
    prefix="/cameras",
    tags=["cameras"],
    responses={404: {"description": "Not found"}},
)

def extract_host(url: str) -> Optional[str]:
    """Helper to extract hostname/IP from RTSP/HTTP URL"""
    try:
        if not url: return None
        # Handle cases where protocol might be missing or weird
        if "://" not in url:
            url = "rtsp://" + url
        parsed = urlparse(url)
        return parsed.hostname
    except:
        return None

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
    
    # Proactive probing: 
    # Trigger if: 1. URL changed OR 2. Auto-Res was just toggled ON OR 3. Res is currently default/missing but Auto-Res is ON
    rtsp_changed = existing_camera.rtsp_url != camera.rtsp_url
    auto_res_just_enabled = camera.auto_resolution and not existing_camera.auto_resolution
    is_res_default = existing_camera.resolution_width in (0, 1920) and existing_camera.resolution_height in (0, 1080)
    
    if camera.auto_resolution and camera.rtsp_url and (rtsp_changed or auto_res_just_enabled or is_res_default):
        print(f"Probing stream for camera {camera.name} (Trigger: {'URL Change' if rtsp_changed else 'Auto-Res Enabled/Default'})...", flush=True)
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
def delete_camera(camera_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    # 1. Stop the camera if running
    motion_service.stop_camera(camera_id)
    
    # 2. Delete media from disk
    storage_service.delete_camera_media(camera_id)
    
    # 3. Delete from DB (Cascade handles associated events)
    db_camera = crud.delete_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # 4. Sync engine config
    motion_service.generate_motion_config(db)
    return db_camera

@router.post("/bulk-delete")
def bulk_delete_cameras(camera_ids: List[int], db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Delete multiple cameras at once"""
    deleted_count = 0
    for camera_id in camera_ids:
        # 1. Stop the camera if running
        motion_service.stop_camera(camera_id)
        
        # 2. Delete media from disk
        storage_service.delete_camera_media(camera_id)
        
        # 3. Delete from DB
        db_camera = crud.delete_camera(db, camera_id=camera_id)
        if db_camera:
            deleted_count += 1
    
    # 4. Sync engine config once
    motion_service.generate_motion_config(db)
    return {"message": f"Successfully deleted {deleted_count} camera(s)", "count": deleted_count}

from fastapi.responses import StreamingResponse, Response
import httpx

@router.get("/{camera_id}/frame")
async def get_camera_frame(camera_id: int, token: str):
    """Proxy a single JPEG frame from the engine (for polling mode)"""
    with database.get_db_ctx() as db:
        auth_service.get_user_from_token(token, db)
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
async def stream_camera(camera_id: int, token: str):
    """Proxy the MJPEG stream from Motion to bypass CORS issues"""
    with database.get_db_ctx() as db:
        auth_service.get_user_from_token(token, db)
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
def export_all_cameras(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Export all cameras settings as JSON"""
    cameras = crud.get_cameras(db)
    export_data = []
    
    fields_to_exclude = {'id', 'created_at', 'groups', 'events'}
    
    for cam in cameras:
        # Pydantic v2 validation (excludes relationships and system fields like ID automatically)
        cam_data = jsonable_encoder(schemas.CameraCreate.model_validate(cam))
        # Include group names in export
        cam_data["groups"] = [g.name for g in cam.groups]
        export_data.append(cam_data)
    
    return Response(
        content=json.dumps({"cameras": export_data, "version": "1.1"}, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=vibenvr_cameras_export.json"}
    )

@router.get("/{camera_id}/export")
def export_single_camera(camera_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Export single camera settings as JSON"""
    cam = crud.get_camera(db, camera_id)
    if cam is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    fields_to_exclude = {'id', 'created_at', 'groups', 'events'}
    
    # Use schema to serialize without relationships
    filtered_data = jsonable_encoder(schemas.CameraCreate.model_validate(cam))
    # Include group names in export
    filtered_data["groups"] = [g.name for g in cam.groups]
    
    return Response(
        content=json.dumps({"camera": filtered_data, "version": "1.1"}, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=vibenvr_camera_{cam.name.replace(' ', '_')}.json"}
    )

@router.post("/import")
async def import_cameras(file: UploadFile = File(...), db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Import cameras from JSON file"""
    try:
        content = await file.read()
        data = json.loads(content)
        
        imported_count = 0
        skipped_count = 0
        cameras_data = data.get("cameras", [data.get("camera")]) if "cameras" in data else [data.get("camera")]
        
        for cam_data in cameras_data:
            if cam_data is None:
                continue
            
            rtsp_url = cam_data.get("rtsp_url")
            host = extract_host(rtsp_url)
            
            if host:
                # Check all existing cameras for the same host
                all_cams = crud.get_cameras(db, limit=1000)
                existing = next((c for c in all_cams if extract_host(c.rtsp_url) == host), None)
                
                if existing:
                    print(f"[IMPORT] Skipping camera {cam_data.get('name')} - Host/IP already exists: {host}", flush=True)
                    skipped_count += 1
                    continue

            # Extract and remove groups to avoid schema validation error
            group_names = cam_data.pop("groups", [])
            
            # Create new camera with imported settings
            new_camera = schemas.CameraCreate(**cam_data)
            db_camera = crud.create_camera(db, new_camera)
            
            # Handle group associations
            for g_name in group_names:
                db_group = db.query(models.CameraGroup).filter(models.CameraGroup.name == g_name).first()
                if not db_group:
                    db_group = models.CameraGroup(name=g_name)
                    db.add(db_group)
                    db.flush()
                
                # Double check association
                if db_camera not in db_group.cameras:
                    db_group.cameras.append(db_camera)
            
            imported_count += 1
        
        motion_service.generate_motion_config(db)
        
        msg = f"Successfully imported {imported_count} camera(s)"
        if skipped_count > 0:
            msg += f". {skipped_count} camera(s) skipped (already existing)."
            
        return {"message": msg, "count": imported_count, "skipped": skipped_count}
    
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/import/motioneye")
async def import_motioneye_cameras(file: UploadFile = File(...), db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Import cameras from MotionEye backup (.tar.gz)"""
    if not file.filename.endswith('.tar.gz'):
        raise HTTPException(status_code=400, detail="File must be a .tar.gz backup from MotionEye")
    
    try:
        content = await file.read()
        tar_stream = io.BytesIO(content)
        imported_count = 0
        skipped_count = 0
        
        with tarfile.open(fileobj=tar_stream, mode='r:gz') as tar:
            members = tar.getmembers()
            print(f"[IMPORT] Tar contains {len(members)} entries", flush=True)
            
            for member in members:
                filename = os.path.basename(member.name)
                print(f"[IMPORT] Checking member: {member.name} (file: {filename})", flush=True)
                
                # Check for camera-X.conf or camera_X.conf
                if filename.endswith('.conf') and (filename.startswith('camera-') or filename.startswith('camera_')):
                    print(f"[IMPORT] Parsing config: {member.name}", flush=True)
                    f = tar.extractfile(member)
                    if f:
                        conf_text = f.read().decode('utf-8', errors='ignore')
                        
                        # Parsing Logic
                        # Extract basic info using regex - case insensitive for robustness
                        cam_name_match = re.search(r'^camera_name\s+(.*)', conf_text, re.MULTILINE | re.IGNORECASE)
                        url_match = re.search(r'^netcam_url\s+(.*)', conf_text, re.MULTILINE | re.IGNORECASE)
                        userpass_match = re.search(r'^netcam_userpass\s+(.*)', conf_text, re.MULTILINE | re.IGNORECASE)
                        width_match = re.search(r'^width\s+(\d+)', conf_text, re.MULTILINE | re.IGNORECASE)
                        height_match = re.search(r'^height\s+(\d+)', conf_text, re.MULTILINE | re.IGNORECASE)
                        fps_match = re.search(r'^framerate\s+(\d+)', conf_text, re.MULTILINE | re.IGNORECASE)
                        rotation_match = re.search(r'^rotate\s+(\d+)', conf_text, re.MULTILINE | re.IGNORECASE)
                        
                        if not url_match:
                            print(f"[IMPORT] No netcam_url found in {member.name}, skipping.", flush=True)
                            continue
                            
                        # Build VibeNVR Schema
                        name = cam_name_match.group(1).strip() if cam_name_match else f"Imported {filename}"
                        rtsp_url = url_match.group(1).strip()

                        # Handle userpass injection if present in netcam_userpass but not in URL
                        if userpass_match and '@' not in rtsp_url:
                            userpass = userpass_match.group(1).strip()
                            if '://' in rtsp_url:
                                proto, rest = rtsp_url.split('://', 1)
                                rtsp_url = f"{proto}://{userpass}@{rest}"
                        
                        # Duplicate check (after URL is finalized)
                        host = extract_host(rtsp_url)
                        if host:
                            all_cams = crud.get_cameras(db, limit=1000)
                            existing = next((c for c in all_cams if extract_host(c.rtsp_url) == host), None)
                            
                            if existing:
                                print(f"[IMPORT] Skipping camera {name} - Host/IP already exists: {host}", flush=True)
                                skipped_count += 1
                                continue

                        # Check for sensitive info in URL and mask it for logs
                        safe_url_log = re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', rtsp_url)
                        print(f"[IMPORT] Found camera: {name} with URL: {safe_url_log}", flush=True)

                        # Create Camera
                        new_cam = schemas.CameraCreate(
                            name=name,
                            rtsp_url=rtsp_url,
                            resolution_width=int(width_match.group(1)) if width_match else 800,
                            resolution_height=int(height_match.group(1)) if height_match else 600,
                            framerate=int(fps_match.group(1)) if fps_match else 15,
                            rotation=int(rotation_match.group(1)) if rotation_match else 0,
                            auto_resolution=True if not (width_match and height_match) else False
                        )
                        
                        # Additional detections from MotionEye comments
                        if '# @enabled off' in conf_text:
                            new_cam.is_active = False
                        
                        if 'movie_output on' in conf_text or 'movie_output_motion on' in conf_text:
                            new_cam.recording_mode = "Motion Triggered"
                        else:
                            new_cam.recording_mode = "Off"
                            
                        # Validate using Pydantic Schema to enforce security (Path traversal etc)
                        try:
                            # Re-validate created object through schema
                            # This ensures field validators in schemas.py are triggered (e.g. rtsp_url file:// check)
                            validated_cam = schemas.CameraCreate.model_validate(new_cam)
                            crud.create_camera(db, validated_cam)
                            imported_count += 1
                        except Exception as e:
                             print(f"[IMPORT] Security/Validation Error for {filename}: {e}", flush=True)
                             continue
        
        print(f"[IMPORT] Total imported: {imported_count}", flush=True)
        motion_service.generate_motion_config(db)
        
        msg = f"Successfully imported {imported_count} camera(s) from MotionEye backup"
        if skipped_count > 0:
            msg += f". {skipped_count} camera(s) skipped (already existing)."
            
        return {"message": msg, "count": imported_count, "skipped": skipped_count}

    except Exception as e:
        print(f"MotionEye Import Error: {e}", flush=True)
        raise HTTPException(status_code=400, detail=f"Failed to parse MotionEye backup: {str(e)}")

@router.post("/{camera_id}/cleanup")
def cleanup_camera(camera_id: int, type: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    if type and type not in ['video', 'snapshot']:
        raise HTTPException(status_code=400, detail="Invalid cleanup type. Must be 'video' or 'snapshot'")
        
    storage_service.cleanup_camera(db, db_camera, media_type=type)
    return {"status": "success", "message": f"Cleanup triggered for camera {db_camera.name} (type={type})"}

@router.post("/{camera_id}/snapshot")
def manual_snapshot(camera_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    success = motion_service.trigger_snapshot(camera_id)
    if success:
        return {"status": "success", "message": "Snapshot triggered"}
    else:
        raise HTTPException(status_code=500, detail="Failed to trigger snapshot via Motion")
