from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import crud, schemas, database, os, requests, threading, models, subprocess
from datetime import datetime

router = APIRouter(
    prefix="/events",
    tags=["events"],
    responses={404: {"description": "Not found"}},
)

def send_notifications(camera: models.Camera, event_type: str, details: dict):
    """Async wrapper for sending notifications"""
    def _send():
        # 1. Webhooks
        if (event_type == "event_start" and camera.notify_start_webhook) or \
           (event_type == "movie_end" and camera.notify_end_webhook):
            if camera.notify_webhook_url:
                try:
                    requests.post(camera.notify_webhook_url, json={
                        "camera_name": camera.name,
                        "event": event_type,
                        "timestamp": details.get("timestamp"),
                        "file_path": details.get("file_path")
                    }, timeout=5)
                except Exception as e:
                    print(f"[NOTIFY] Webhook failed: {e}")

        # 2. Telegram
        if event_type == "event_start" and camera.notify_start_telegram:
            if camera.notify_telegram_token and camera.notify_telegram_chat_id:
                msg = f"🚨 *Motion Detected!*\nCamera: {camera.name}\nTime: {details.get('timestamp')}"
                url = f"https://api.telegram.org/bot{camera.notify_telegram_token}/sendMessage"
                try:
                    requests.post(url, json={
                        "chat_id": camera.notify_telegram_chat_id,
                        "text": msg,
                        "parse_mode": "Markdown"
                    }, timeout=5)
                except Exception as e:
                    print(f"[NOTIFY] Telegram failed: {e}")

        # 3. Email (Placeholder Log)
        if event_type == "event_start" and camera.notify_start_email:
            if camera.notify_email_address:
                print(f"[NOTIFY] MOCK EMAIL to {camera.notify_email_address}: Motion on {camera.name}")

    threading.Thread(target=_send, daemon=True).start()

@router.post("", response_model=schemas.Event)
def create_event(event: schemas.EventCreate, db: Session = Depends(database.get_db)):
    return crud.create_event(db=db, event=event)


@router.get("", response_model=List[schemas.Event])
def read_events(
    skip: int = 0, 
    limit: int = 100, 
    camera_id: Optional[int] = None, 
    type: Optional[str] = None, 
    date: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    events = crud.get_events(db, skip=skip, limit=limit, camera_id=camera_id, type=type, date=date)
    return events
# Track active motion events globally
# camera_id -> start_timestamp
ACTIVE_CAMERAS = {}

@router.get("/status")
def get_motion_status():
    """Returns list of camera IDs currently detecting motion"""
    return {"active_ids": list(ACTIVE_CAMERAS.keys())}

def is_within_schedule(camera: models.Camera):
    """Check if motion detection is currently allowed by schedule"""
    if camera.detect_motion_mode == "Always":
        return True
    if camera.detect_motion_mode == "Manual Toggle":
        return camera.is_active
    
    # Working Schedule (Day based)
    now = datetime.now()
    day_map = {
        0: camera.schedule_monday,
        1: camera.schedule_tuesday,
        2: camera.schedule_wednesday,
        3: camera.schedule_thursday,
        4: camera.schedule_friday,
        5: camera.schedule_saturday,
        6: camera.schedule_sunday
    }
    return day_map.get(now.weekday(), True)

@router.post("/webhook")
async def webhook_event(payload: dict, db: Session = Depends(database.get_db)):
    camera_id = payload.get("camera_id")
    # Fetch camera for settings
    camera = crud.get_camera(db, camera_id)
    if not camera:
        print(f"[WEBHOOK] Camera ID: {camera_id} not found")
        return {"status": "error", "message": "camera not found"}

    event_type = payload.get("type") # event_start, picture_save, movie_end
    print(f"[WEBHOOK] Received: {event_type} for camera {camera.name} (ID: {camera_id})")

    # Check schedule
    if not is_within_schedule(camera):
        print(f"[WEBHOOK] Ignored due to schedule: {camera.name}")
        return {"status": "ignored", "reason": "outside schedule"}

    if event_type == "movie_end":
        file_path = payload.get("file_path")
        print(f"[WEBHOOK] Saving movie event for {camera.name}: {file_path}")
        
        # Calculate file size
        if file_path and file_path.startswith("/var/lib/motion"):
            local_path = file_path.replace("/var/lib/motion", "/data", 1)
        elif file_path and file_path.startswith("/var/lib/vibe/recordings"):
             local_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)
        else:
             local_path = None
             
        file_size = 0
        if local_path and os.path.exists(local_path):
            file_size = os.path.getsize(local_path)

        # Remove from active cameras on movie end
        if camera_id in ACTIVE_CAMERAS:
            del ACTIVE_CAMERAS[camera_id]
        
        from datetime import datetime
        ts_str = payload.get("timestamp")
        try:
            ts = datetime.fromisoformat(ts_str)
        except:
            ts = datetime.now().astimezone()

        event_data = schemas.EventCreate(
            camera_id=camera_id,
            timestamp_start=ts, 
            type="video",
            event_type="motion",
            file_path=file_path,
            file_size=file_size,
            width=payload.get("width"),
            height=payload.get("height"),
            motion_score=0.0
        )
        
        # Generate Thumbnail
        try:
            if local_path and os.path.exists(local_path):
                # /data/Camera1/xxx.mp4 -> /data/Camera1/xxx.jpg
                base, _ = os.path.splitext(local_path)
                local_thumb = f"{base}.jpg"
                
                # DB path
                base_db, _ = os.path.splitext(file_path)
                db_thumb = f"{base_db}.jpg"
                
                # Run ffmpeg to extract frame at 1s or 0s
                # -ss 1 : seek 1 second
                # -vframes 1: output 1 frame
                subprocess.run([
                    "ffmpeg", "-y", "-i", local_path, 
                    "-ss", "00:00:01", "-vframes", "1", "-vf", "scale=320:-1",
                    local_thumb
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                if os.path.exists(local_thumb):
                    event_data.thumbnail_path = db_thumb
                    print(f"[WEBHOOK] Thumbnail generated: {db_thumb}")
        except Exception as e:
            print(f"[WEBHOOK] Failed to generate thumbnail: {e}")

        try:
            crud.create_event(db, event_data)
            print(f"[WEBHOOK] Event saved successfully")
            # Notification for movie end (if configured)
            send_notifications(camera, "movie_end", payload)
        except Exception as e:
            print(f"[WEBHOOK] ERROR saving event: {e}")
            
    elif event_type == "event_start":
        print(f"[WEBHOOK] Motion event started for camera {camera.name} (ID: {camera_id})")
        ACTIVE_CAMERAS[camera_id] = payload.get("timestamp")
        send_notifications(camera, "event_start", payload)
        
    elif event_type == "picture_save":
        file_path = payload.get("file_path")
        print(f"[WEBHOOK] Saving picture event for {camera.name}: {file_path}")
        
        # Calculate file size
        if file_path and file_path.startswith("/var/lib/motion"):
            local_path = file_path.replace("/var/lib/motion", "/data", 1)
        elif file_path and file_path.startswith("/var/lib/vibe/recordings"):
             local_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)
        else:
             local_path = None
        file_size = 0
        if local_path and os.path.exists(local_path):
            file_size = os.path.getsize(local_path)

        from datetime import datetime
        ts_str = payload.get("timestamp")
        try:
            ts = datetime.fromisoformat(ts_str)
        except:
            ts = datetime.now().astimezone()

        event_data = schemas.EventCreate(
            camera_id=camera_id,
            timestamp_start=ts, 
            type="snapshot",
            event_type="motion",
            file_path=file_path,
            file_size=file_size,
            width=payload.get("width"),
            height=payload.get("height"),
            thumbnail_path=file_path, # Use same for now
            motion_score=0.0
        )
        try:
            crud.create_event(db, event_data)
        except Exception as e:
            print(f"[WEBHOOK] ERROR saving picture event: {e}")
        
    return {"status": "received"}

@router.delete("/{event_id}", response_model=schemas.Event)
def delete_event(event_id: int, db: Session = Depends(database.get_db)):
    # 1. Delete from DB
    event = crud.delete_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # 2. Delete file
    if event.file_path:
        # DB path: /var/lib/motion/Camera1/...
        # Backend path: /data/Camera1/...
        # Replace /var/lib/motion/ with /data/
        # Or just use relative path if it's consistent.
        # Check if path starts with /var/lib/motion
        prefix = "/var/lib/motion"
        backend_prefix = "/data"
        
        file_path = event.file_path
        if file_path.startswith("/var/lib/motion"):
            file_path = file_path.replace("/var/lib/motion", "/data", 1)
        elif file_path.startswith("/var/lib/vibe/recordings"):
            file_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)
        
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
            else:
                print(f"File not found: {file_path}")
                
            # Delete thumbnail if exists
            if event.thumbnail_path:
                thumb_path = event.thumbnail_path
            if thumb_path.startswith("/var/lib/motion"):
                thumb_path = thumb_path.replace("/var/lib/motion", "/data", 1)
            elif thumb_path.startswith("/var/lib/vibe/recordings"):
                thumb_path = thumb_path.replace("/var/lib/vibe/recordings", "/data", 1)
                if os.path.exists(thumb_path):
                    os.remove(thumb_path)
                    
        except Exception as e:
            print(f"Error deleting file {file_path}: {e}")
            
    return event

@router.get("/{event_id}/download")
def download_event(event_id: int, db: Session = Depends(database.get_db)):
    """Download event file with proper headers for cross-origin support"""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not event.file_path:
        raise HTTPException(status_code=404, detail="No file associated with this event")
    
    # Convert DB path to backend filesystem path
    prefix = "/var/lib/motion"
    backend_prefix = "/data"
    
    file_path = event.file_path
    if file_path.startswith(prefix):
        file_path = file_path.replace(prefix, backend_prefix, 1)
    elif file_path.startswith("/var/lib/vibe/recordings"):
        file_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # Get filename from path
    filename = os.path.basename(file_path)
    
    # Determine media type
    media_type = "video/mp4" if event.type == "video" else "image/jpeg"
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
