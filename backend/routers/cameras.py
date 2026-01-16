from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response
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

@router.post("/", response_model=schemas.Camera)
def create_camera(camera: schemas.CameraCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    # Auto-detect resolution if passthrough is enabled
    if camera.movie_passthrough and camera.rtsp_url:
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

@router.get("/", response_model=List[schemas.Camera])
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
    # Auto-detect resolution if passthrough is enabled
    if camera.movie_passthrough and camera.rtsp_url:
        print(f"Probing stream for camera {camera.name}...", flush=True)
        dims = probe_service.probe_stream(camera.rtsp_url)
        if dims:
            print(f"Detected resolution: {dims['width']}x{dims['height']}", flush=True)
            camera.resolution_width = dims['width']
            camera.resolution_height = dims['height']
        else:
            print("Probe failed, using provided resolution.", flush=True)

    db_camera = crud.update_camera(db, camera_id=camera_id, camera=camera)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    motion_service.generate_motion_config(db)
    return db_camera

@router.delete("/{camera_id}", response_model=schemas.Camera)
def delete_camera(camera_id: int, db: Session = Depends(database.get_db)):
    db_camera = crud.delete_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    motion_service.generate_motion_config(db)
    return db_camera

from fastapi.responses import StreamingResponse
import httpx

@router.get("/{camera_id}/stream")
async def stream_camera(camera_id: int, db: Session = Depends(database.get_db)):
    """Proxy the MJPEG stream from Motion to bypass CORS issues"""
    db_camera = crud.get_camera(db, camera_id=camera_id)
    if db_camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Use explicit container name for hostname stability
    motion_stream_url = f"http://vibenvr-motion:{8100 + camera_id}/"
    
    async def generate():
        print(f"[STREAM] Starting proxy for camera {camera_id} from {motion_stream_url}", flush=True)
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", motion_stream_url) as response:
                    if response.status_code != 200:
                        print(f"[STREAM] Motion returned status {response.status_code}, aborting.", flush=True)
                        return
                    
                    async for chunk in response.aiter_bytes(chunk_size=32768):
                        yield chunk
        except Exception as e:
            print(f"[STREAM] Proxy error for camera {camera_id}: {type(e).__name__}: {e}", flush=True)
            # End of stream will close connection, triggering frontend onError
    
    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=BoundaryString"
    )


# ============ IMPORT/EXPORT ENDPOINTS ============

@router.get("/export/all")
def export_all_cameras(db: Session = Depends(database.get_db)):
    """Export all cameras settings as JSON"""
    cameras = crud.get_cameras(db)
    export_data = []
    for cam in cameras:
        cam_dict = {
            "name": cam.name,
            "rtsp_url": cam.rtsp_url,
            "stream_url": cam.stream_url,
            "location": cam.location,
            "is_active": cam.is_active,
            "resolution_width": cam.resolution_width,
            "resolution_height": cam.resolution_height,
            "framerate": cam.framerate,
            "rotation": cam.rotation,
            "text_left": cam.text_left,
            "text_right": cam.text_right,
            "text_scale": cam.text_scale,
            "storage_path": cam.storage_path,
            "root_directory": cam.root_directory,
            "stream_quality": cam.stream_quality,
            "stream_max_rate": cam.stream_max_rate,
            "stream_port": cam.stream_port,
            "movie_file_name": cam.movie_file_name,
            "movie_passthrough": cam.movie_passthrough,
            "movie_quality": cam.movie_quality,
            "recording_mode": cam.recording_mode,
            "max_movie_length": cam.max_movie_length,
            "preserve_movies": cam.preserve_movies,
            "auto_threshold_tuning": cam.auto_threshold_tuning,
            "auto_noise_detection": cam.auto_noise_detection,
            "light_switch_detection": cam.light_switch_detection,
            "despeckle_filter": cam.despeckle_filter,
            "motion_gap": cam.motion_gap,
            "captured_before": cam.captured_before,
            "captured_after": cam.captured_after,
            "min_motion_frames": cam.min_motion_frames,
            "mask": cam.mask,
            "show_frame_changes": cam.show_frame_changes,
            "create_debug_media": cam.create_debug_media,
            "detect_motion_mode": cam.detect_motion_mode,
        }
        export_data.append(cam_dict)
    
    return Response(
        content=json.dumps({"cameras": export_data, "version": "1.0"}, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=vibenvr_cameras_export.json"}
    )

@router.get("/{camera_id}/export")
def export_single_camera(camera_id: int, db: Session = Depends(database.get_db)):
    """Export single camera settings as JSON"""
    cam = crud.get_camera(db, camera_id)
    if cam is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    cam_dict = {
        "name": cam.name,
        "rtsp_url": cam.rtsp_url,
        "stream_url": cam.stream_url,
        "location": cam.location,
        "is_active": cam.is_active,
        "resolution_width": cam.resolution_width,
        "resolution_height": cam.resolution_height,
        "framerate": cam.framerate,
        "rotation": cam.rotation,
        "text_left": cam.text_left,
        "text_right": cam.text_right,
        "text_scale": cam.text_scale,
        "movie_file_name": cam.movie_file_name,
        "movie_passthrough": cam.movie_passthrough,
        "movie_quality": cam.movie_quality,
        "recording_mode": cam.recording_mode,
        "preserve_movies": cam.preserve_movies,
        "auto_threshold_tuning": cam.auto_threshold_tuning,
        "auto_noise_detection": cam.auto_noise_detection,
        "light_switch_detection": cam.light_switch_detection,
        "despeckle_filter": cam.despeckle_filter,
        "motion_gap": cam.motion_gap,
        "captured_before": cam.captured_before,
        "captured_after": cam.captured_after,
        "min_motion_frames": cam.min_motion_frames,
        "mask": cam.mask,
        "show_frame_changes": cam.show_frame_changes,
        "create_debug_media": cam.create_debug_media,
        "detect_motion_mode": cam.detect_motion_mode,
    }
    
    return Response(
        content=json.dumps({"camera": cam_dict, "version": "1.0"}, indent=2),
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
