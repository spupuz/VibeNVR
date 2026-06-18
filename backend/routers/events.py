from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import crud
import schemas
import database
import notification_service
import os
import models
import subprocess
import auth_service
import datetime
import logging
import time

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/events",
    tags=["events"],
    responses={404: {"description": "Not found"}},
)

def delete_event_files(event: models.Event) -> int:
    """Helper to safely delete event files from disk with path traversal protection. Returns bytes deleted."""
    deleted_bytes = 0
    # Map internal container paths to /data volume
    paths = []
    if event.file_path:
        paths.append(('file', event.file_path))
    if event.thumbnail_path:
        paths.append(('thumb', event.thumbnail_path))

    for ptype, raw_path in paths:
        path = raw_path
        if path.startswith("/var/lib/motion"):
            path = path.replace("/var/lib/motion", "/data", 1)
        elif path.startswith("/var/lib/vibe/recordings"):
            path = path.replace("/var/lib/vibe/recordings", "/data", 1)

        try:
            # Security Validation: Final path must be within /data/
            abs_path = os.path.abspath(path)
            if not abs_path.startswith("/data/"):
                logger.warning(f"Security Alert: Blocked attempted deletion of file outside storage directory: {path}")
                continue

            if os.path.exists(path):
                if ptype == 'file': # Only count main file size for reporting
                    try:
                        deleted_bytes += os.path.getsize(path)
                    except:
                        pass
                os.remove(path)
        except Exception as e:
            logger.error(f"Error deleting event file {path}: {e}")

    return deleted_bytes

def cleanup_orphaned_file(file_path: str, camera_id: int):
    """Helper to delete files from disk if the camera no longer exists in DB"""
    if not file_path:
        return

    local_path = None
    if file_path.startswith("/var/lib/motion"):
        local_path = file_path.replace("/var/lib/motion", "/data", 1)
    elif file_path.startswith("/var/lib/vibe/recordings"):
        local_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)

    # Security Validation
    if local_path:
        abs_path = os.path.abspath(local_path)
        if not abs_path.startswith("/data/"):
            logger.warning(f"Security Alert: Blocked orphaned file cleanup outside storage: {local_path}")
            return

    if local_path and os.path.exists(local_path):
        try:
            os.remove(local_path)
            logger.info(f"[WEBHOOK] Cleaned up orphaned file for deleted camera {camera_id}: {local_path}")
            # Also try to remove thumbnail if it exists
            base, _ = os.path.splitext(local_path)
            if os.path.exists(base + ".jpg"):
                os.remove(base + ".jpg")
        except Exception as e:
            logger.error(f"[WEBHOOK] Failed to cleanup orphaned file: {e}")

@router.post("", response_model=schemas.Event)
def create_event(event: schemas.EventCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    return crud.create_event(db=db, event=event)


@router.get("", response_model=List[schemas.Event])
def read_events(
    skip: int = 0,
    limit: int = 100,
    camera_id: Optional[int] = None,
    type: Optional[str] = None,
    date: Optional[str] = None,
    db: Session = Depends(database.get_db),
    auth_info: tuple[models.User, bool] = Depends(auth_service.get_current_user_or_token)
):
    user, is_token = auth_info
    events = crud.get_events(db, skip=skip, limit=limit, camera_id=camera_id, type=type, date=date)

    if user.role == "viewer" and user.restrict_camera_access:
        allowed_ids = crud.get_allowed_camera_ids_for_user(db, user.id, permission="replay")
        if allowed_ids is not None:
            if camera_id is not None and camera_id not in allowed_ids:
                raise HTTPException(status_code=403, detail="Not authorized to replay events for this camera")
            events = [e for e in events if e.camera_id in allowed_ids]

    return events
# Track active motion events globally
# camera_id -> start_timestamp
ACTIVE_CAMERAS = {}
# Track PURE motion detection (for UI reactive borders)
LIVE_MOTION = {}

@router.get("/status")
def get_motion_status(auth_info: tuple[models.User, bool] = Depends(auth_service.get_current_user_or_token), db: Session = Depends(database.get_db)):
    user, is_token = auth_info
    """Returns list of camera IDs currently detecting motion and/or recording, plus health info"""
    from health_service import HEALTH_CACHE

    active_ids = list(ACTIVE_CAMERAS.keys())

    # TTL Check for LIVE_MOTION to prevent stuck badges if motion_off is missed
    now_ts = time.time()
    for cid in list(LIVE_MOTION.keys()):
        if now_ts - LIVE_MOTION[cid].get("_updated_at", now_ts) > 60:
            LIVE_MOTION.pop(cid, None)

    live_motion = dict(LIVE_MOTION)
    health = dict(HEALTH_CACHE)

    if user.role == "viewer" and user.restrict_camera_access:
        allowed_ids = crud.get_allowed_camera_ids_for_user(db, user.id)
        if allowed_ids is not None:
            active_ids = [cid for cid in active_ids if cid in allowed_ids]
            live_motion = {cid: v for cid, v in live_motion.items() if cid in allowed_ids}
            health = {cid: v for cid, v in health.items() if cid in allowed_ids}

    return {
        "active_ids": active_ids,
        "live_motion": live_motion,
        "camera_health": health
    }

def is_within_schedule(camera: models.Camera):
    """Check if motion detection is currently allowed by schedule"""
    if camera.detect_motion_mode == "Always":
        return True
    if camera.detect_motion_mode == "Manual Toggle":
        return camera.is_active

    # Working Schedule (Day based)
    now = datetime.datetime.now()
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    current_day = days[now.weekday()]

    # Check if day is enabled
    is_day_allowed = getattr(camera, f"schedule_{current_day}", True)
    if not is_day_allowed:
        return False

    # Time Schedule Check for specific day
    start_str = getattr(camera, f"schedule_{current_day}_start", "00:00") or "00:00"
    end_str = getattr(camera, f"schedule_{current_day}_end", "23:59") or "23:59"

    current_time_str = now.strftime("%H:%M")

    if start_str <= end_str:
        return start_str <= current_time_str <= end_str
    else:
        # Cross-midnight (e.g. 22:00 to 06:00)
        return current_time_str >= start_str or current_time_str <= end_str

@router.post("/webhook")
async def webhook_event(
    request: Request,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    # Verify Secret
    secret_header = request.headers.get("X-Webhook-Secret")
    # Use dedicated WEBHOOK_SECRET if set, otherwise fallback to SECRET_KEY
    expected_secret = os.getenv("WEBHOOK_SECRET", auth_service.SECRET_KEY)

    if secret_header != expected_secret:
        # Avoid leaking existence or details, but allow local debugging if needed?
        # Strict security: 401.
        logger.warning("[WEBHOOK] Unauthorized access attempt (Invalid Secret).")
        raise HTTPException(status_code=401, detail="Unauthorized")

    camera_id = payload.get("camera_id")
    # Fetch camera for settings
    camera = crud.get_camera(db, camera_id)
    if not camera:
        event_type = payload.get("type")
        file_path = payload.get("file_path")
        logger.warning(f"[WEBHOOK] Camera ID: {camera_id} not found. Event: {event_type}")
        cleanup_orphaned_file(file_path, camera_id)
        return {"status": "error", "message": "camera not found, file cleaned up"}

    event_type = payload.get("type") # event_start, picture_save, movie_end
    logger.info(f"[WEBHOOK] Received: {event_type} for camera {camera.name} (ID: {camera_id})")

    # Check schedule (Log but don't block - avoid orphaned files)
    in_schedule = is_within_schedule(camera)
    if not in_schedule:
        logger.info(f"[WEBHOOK] Event outside schedule: {camera.name}. Saving anyway to prevent orphans.")
        # return {"status": "ignored", "reason": "outside schedule"}

    elif event_type == "movie_end" or event_type == "picture_save":
        # Process heavy file operations in background to keep event loop responsive
        background_tasks.add_task(
            process_webhook_file_event,
            camera_id=camera_id,
            event_type=event_type,
            payload=payload,
            in_schedule=in_schedule
        )
        return {"status": "processing"}

    elif event_type == "event_start":
        logger.info(f"[WEBHOOK] Motion event started for camera {camera.name} (ID: {camera_id})")
        ACTIVE_CAMERAS[camera_id] = payload.get("timestamp")
        if in_schedule:
            notification_service.send_notifications(camera.id, "event_start", payload)

    elif event_type == "camera_health":
        logger.info(f"[WEBHOOK] Health event for camera {camera.name} (ID: {camera_id}): {payload.get('message')}")
        # Update Health Cache immediately for UI responsiveness
        try:
            from health_service import HEALTH_CACHE
            new_status = payload.get("status")
            if new_status:
                HEALTH_CACHE[camera.id] = new_status
                # Persist to DB
                camera.status = new_status
                if new_status == "CONNECTED":
                    from datetime import datetime, timezone
                    camera.last_seen = datetime.now(timezone.utc)
                db.commit()
        except ImportError:
            pass
        # Always send health notifications regardless of schedule (it's a system alert)
        notification_service.send_notifications(camera.id, "camera_health", payload)

    elif event_type == "motion_on":
        # Purely for UI reactive feedback
        LIVE_MOTION[camera_id] = {
            "timestamp": payload.get("timestamp"),
            "source": payload.get("source", "standard"),
            "ai_metadata": payload.get("ai_metadata"),
            "_updated_at": time.time()
        }
        return {"status": "motion_on_captured"}

    elif event_type == "motion_off":
        # Purely for UI reactive feedback
        if camera_id in LIVE_MOTION:
            del LIVE_MOTION[camera_id]
        return {"status": "motion_off_captured"}

    return {"status": "received"}

def process_webhook_file_event(camera_id: int, event_type: str, payload: dict, in_schedule: bool):
    """
    Background task for heavy I/O operations (ffprobe, ffmpeg, DB writes).
    Prevents the main API event loop from blocking.
    """
    db = database.SessionLocal()
    try:
        camera = crud.get_camera(db, camera_id)
        if not camera:
            return

        file_path = payload.get("file_path")
        if not file_path:
            return

        # Map path
        if file_path.startswith("/var/lib/motion"):
            local_path = file_path.replace("/var/lib/motion", "/data", 1)
        elif file_path.startswith("/var/lib/vibe/recordings"):
             local_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)
        else:
             local_path = None

        file_size = 0
        if local_path and os.path.exists(local_path):
            file_size = os.path.getsize(local_path)

        ts_str = payload.get("timestamp")
        try:
            ts = datetime.datetime.fromisoformat(ts_str)
        except:
            ts = datetime.datetime.now().astimezone()

        event_data = schemas.EventCreate(
            camera_id=camera_id,
            timestamp_start=ts,
            type="video" if event_type == "movie_end" else "snapshot",
            event_type="motion",
            file_path=file_path,
            file_size=file_size,
            width=payload.get("width"),
            height=payload.get("height"),
            motion_score=0.0,
            ai_metadata=payload.get("ai_metadata")
        )

        if event_type == "movie_end":
            # Remove from active cameras on movie end
            if camera_id in ACTIVE_CAMERAS:
                del ACTIVE_CAMERAS[camera_id]

            # Get Duration using ffprobe
            if local_path and os.path.exists(local_path):
                # Security: Prevent argument injection
                if not os.path.basename(local_path).startswith("-"):
                    try:
                        cmd = [
                            "ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=noprint_wrappers=1:nokey=1", local_path
                        ]
                        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
                        if result.returncode == 0:
                            duration_str = result.stdout.strip()
                            if duration_str and duration_str != "N/A":
                                duration_sec = float(duration_str)
                                event_data.timestamp_end = ts + datetime.timedelta(seconds=duration_sec)
                    except Exception as e:
                        logger.error(f"[BG-WORK] ffprobe failed: {e}")

            # Generate Thumbnail
            try:
                if local_path and os.path.exists(local_path):
                    base, _ = os.path.splitext(local_path)
                    local_thumb = f"{base}.jpg"
                    base_db, _ = os.path.splitext(file_path)
                    db_thumb = f"{base_db}.jpg"

                    subprocess.run([
                        "ffmpeg", "-y", "-i", local_path,
                        "-ss", "00:00:01", "-vframes", "1", "-vf", "scale=320:-1",
                        local_thumb
                    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)

                    if os.path.exists(local_thumb):
                        event_data.thumbnail_path = db_thumb
            except Exception as e:
                logger.error(f"[BG-WORK] Thumbnail failed: {e}")
        else:
            # For picture_save, thumbnail is the same as image
            event_data.thumbnail_path = file_path

        try:
            crud.create_event(db, event_data)
            if in_schedule:
                notification_service.send_notifications(camera.id, event_type, payload)
        except Exception as e:
            err_str = str(e).lower()
            if "foreignkeyviolation" in err_str or "foreign key constraint" in err_str:
                cleanup_orphaned_file(file_path, camera_id)
            else:
                logger.error(f"[BG-WORK] DB Error: {e}")

    except Exception as e:
        logger.error(f"[BG-WORK] General error: {e}")
    finally:
        db.close()

    return {"status": "received"}

@router.delete("/{event_id}", response_model=schemas.Event)
def delete_event(event_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    # 1. Delete from DB
    event = crud.delete_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # 2. Delete files safely using helper
    delete_event_files(event)

    return event

@router.get("/{event_id}/download")
async def download_event(event_id: int, request: Request, token: Optional[str] = None):
    """Download event file with proper headers for cross-origin support"""
    # Try query param first (for backward compatibility), then cookie
    media_token = token or request.cookies.get("media_token")
    if not media_token:
        raise HTTPException(status_code=401, detail="Missing media authentication")

    with database.get_db_ctx() as db:
        user = await auth_service.get_user_from_token(media_token, db)
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        if user.role == "viewer" and user.restrict_camera_access:
            allowed_ids = crud.get_allowed_camera_ids_for_user(db, user.id, permission="replay")
            if allowed_ids is not None and event.camera_id not in allowed_ids:
                raise HTTPException(status_code=403, detail="Not authorized to download this event")

        if not event.file_path:
            raise HTTPException(status_code=404, detail="No file associated with this event")

        file_path = event.file_path
        event_type = event.type

    # db is closed here
    # Convert DB path to backend filesystem path
    prefix = "/var/lib/motion"
    backend_prefix = "/data"

    if file_path.startswith(prefix):
        file_path = file_path.replace(prefix, backend_prefix, 1)
    elif file_path.startswith("/var/lib/vibe/recordings"):
        file_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)

    # Security Validation: Path must be within /data/
    if not os.path.abspath(file_path).startswith("/data/"):
        logger.warning(f"Security Alert: Attempted access to {file_path}")
        raise HTTPException(status_code=403, detail="Access denied: File outside storage directory")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Get filename from path
    filename = os.path.basename(file_path)

    # Determine media type
    media_type = "video/mp4" if event_type == "video" else "image/jpeg"

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/bulk-delete")
def bulk_delete_events(request: schemas.BulkDeleteRequest, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Delete multiple individual events by ID"""
    deleted_count = 0
    errors = []

    for event_id in request.event_ids:
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            errors.append(f"Event {event_id} not found")
            continue

        # Safely delete files and then the DB record
        delete_event_files(event)
        db.delete(event)
        deleted_count += 1

    db.commit()
    return {"deleted_count": deleted_count, "errors": errors}

@router.delete("/bulk/all")
def delete_all_events(event_type: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """
    Delete all events.
    - event_type=video: Delete only video events
    - event_type=picture: Delete only picture events
    - No event_type: Delete all events
    """

    query = db.query(models.Event)
    if event_type:
        query = query.filter(models.Event.type == event_type)

    events = query.all()
    deleted_count = 0
    deleted_size = 0

    for event in events:
        # Safely delete files and track size
        deleted_size += delete_event_files(event)

        # Delete from DB
        db.delete(event)
        deleted_count += 1

    db.commit()

    return {
        "deleted_count": deleted_count,
        "deleted_size_bytes": deleted_size,
        "deleted_size_mb": round(deleted_size / (1024 * 1024), 2),
        "type": event_type or "all"
    }
