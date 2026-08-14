from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import crud
import schemas
import database
import events_state
import os
import requests
import threading
import models
import utils
import subprocess
import hmac
import auth_service
import notification_service
import event_file_service
import datetime
import logging
import time
import jwt
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/events",
    tags=["events"],
    responses={404: {"description": "Not found"}},
)

@router.post("", response_model=schemas.Event)
def create_event(
    event: schemas.EventCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin),
):
    return crud.create_event(db=db, event=event)

@router.get("", response_model=List[schemas.Event])
def read_events(
    skip: int = 0,
    limit: int = 100,
    camera_id: Optional[int] = None,
    type: Optional[str] = None,
    event_type: Optional[str] = None,
    date: Optional[str] = None,
    db: Session = Depends(database.get_db),
    auth_info: tuple[models.User, bool] = Depends(
        auth_service.get_current_user_or_token
    ),
):
    user, is_token = auth_info

    allowed_ids = None
    if user.role == "viewer" and user.restrict_camera_access:
        allowed_ids = crud.get_allowed_camera_ids_for_user(
            db, user.id, permission="replay"
        )
        if allowed_ids is not None:
            if camera_id is not None and camera_id not in allowed_ids:
                raise HTTPException(
                    status_code=403,
                    detail="Not authorized to replay events for this camera",
                )

    events = crud.get_events(
        db, skip=skip, limit=limit, camera_id=camera_id, type=type, event_type=event_type, date=date, allowed_camera_ids=allowed_ids
    )

    return events


@router.get("/status")
def get_motion_status(
    auth_info: tuple[models.User, bool] = Depends(
        auth_service.get_current_user_or_token
    ),
    db: Session = Depends(database.get_db),
):
    user, is_token = auth_info
    """Returns list of camera IDs currently detecting motion and/or recording, plus health info"""
    from health_service import HEALTH_CACHE

    active_ids = list(events_state.ACTIVE_CAMERAS.keys())

    # TTL Check for events_state.LIVE_MOTION to prevent stuck badges if motion_off is missed
    now_ts = time.time()
    for cid in list(events_state.LIVE_MOTION.keys()):
        if now_ts - events_state.LIVE_MOTION[cid].get("_updated_at", now_ts) > 60:
            events_state.LIVE_MOTION.pop(cid, None)

    live_motion = dict(events_state.LIVE_MOTION)
    health = dict(HEALTH_CACHE)

    if user.role == "viewer" and user.restrict_camera_access:
        allowed_ids = crud.get_allowed_camera_ids_for_user(db, user.id)
        if allowed_ids is not None:
            active_ids = [cid for cid in active_ids if cid in allowed_ids]
            live_motion = {
                cid: v for cid, v in live_motion.items() if cid in allowed_ids
            }
            health = {cid: v for cid, v in health.items() if cid in allowed_ids}

    return {
        "active_ids": active_ids,
        "live_motion": live_motion,
        "camera_health": health,
    }

def is_within_schedule(camera: models.Camera):
    """Check if motion detection is currently allowed by schedule"""
    if camera.detect_motion_mode == "Always":
        return True
    if camera.detect_motion_mode == "Manual Toggle":
        return camera.is_active

    # Working Schedule (Day based)
    now = datetime.datetime.now()
    days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ]
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
    db: Session = Depends(database.get_db),
):
    import hmac

    # Verify Secret
    secret_header = request.headers.get("X-Webhook-Secret")
    # Use dedicated WEBHOOK_SECRET if set, otherwise fallback to SECRET_KEY
    expected_secret = os.getenv("WEBHOOK_SECRET", auth_service.SECRET_KEY)

    if not secret_header or not hmac.compare_digest(
        secret_header.encode("utf-8"), expected_secret.encode("utf-8")
    ):
        # Avoid leaking existence or details, but allow local debugging if needed?
        # Strict security: 401.
        logger.warning("[WEBHOOK] Unauthorized access attempt (Invalid Secret).")
        raise HTTPException(status_code=401, detail="Unauthorized")

    camera_id_raw = str(payload.get("camera_id", ""))
    try:
        # Strip _sub or other suffixes if present (e.g. 101_sub -> 101)
        camera_id = int(camera_id_raw.split("_")[0])
    except ValueError:
        logger.error(f"[WEBHOOK] Invalid camera ID format: {camera_id_raw}")
        return {"status": "error", "message": "invalid camera id format"}

    # Fetch camera for settings
    camera = crud.get_camera(db, camera_id)
    if not camera:
        event_type = payload.get("type")
        file_path = payload.get("file_path")
        logger.warning(
            f"[WEBHOOK] Camera ID: {camera_id} not found. Event: {event_type}"
        )
        event_file_service.cleanup_orphaned_file(file_path, camera_id)
        return {"status": "error", "message": "camera not found, file cleaned up"}

    event_type = payload.get("type")  # event_start, picture_save, movie_end
    logger.info(
        f"[WEBHOOK] Received: {event_type} for camera {camera.name} (ID: {camera_id})"
    )

    # Check schedule (Log but don't block - avoid orphaned files)
    in_schedule = is_within_schedule(camera)
    if not in_schedule:
        logger.info(
            f"[WEBHOOK] Event outside schedule: {camera.name}. Saving anyway to prevent orphans."
        )
        # return {"status": "ignored", "reason": "outside schedule"}

    elif event_type == "movie_end" or event_type == "picture_save":
        # Process heavy file operations in background to keep event loop responsive
        background_tasks.add_task(
            event_file_service.process_webhook_file_event,
            camera_id=camera_id,
            event_type=event_type,
            payload=payload,
            in_schedule=in_schedule,
        )
        return {"status": "processing"}

    elif event_type == "event_start":
        logger.info(
            f"[WEBHOOK] Motion event started for camera {camera.name} (ID: {camera_id})"
        )
        events_state.ACTIVE_CAMERAS[camera_id] = payload.get("timestamp")
        if in_schedule:
            notification_service.send_notifications(camera.id, "event_start", payload)

    elif event_type == "camera_health":
        logger.info(
            f"[WEBHOOK] Health event for camera {camera.name} (ID: {camera_id}): {payload.get('message')}"
        )
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
        events_state.LIVE_MOTION[camera_id] = {
            "timestamp": payload.get("timestamp"),
            "source": payload.get("source", "standard"),
            "ai_metadata": payload.get("ai_metadata"),
            "_updated_at": time.time(),
        }
        return {"status": "motion_on_captured"}

    elif event_type == "motion_off":
        # Purely for UI reactive feedback
        if camera_id in events_state.LIVE_MOTION:
            del events_state.LIVE_MOTION[camera_id]
        return {"status": "motion_off_captured"}

    return {"status": "received"}

@router.delete("/{event_id}", response_model=schemas.Event)
def delete_event(
    event_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin),
):
    # 1. Delete from DB
    event = crud.delete_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # 2. Delete files safely using helper
    event_file_service.delete_event_files(event)

    return event

@router.get("/{event_id}/download")
async def download_event(event_id: int, request: Request, token: Optional[str] = None):
    """Download event file with proper headers for cross-origin support"""
    # Try query param first (for backward compatibility), then cookie
    media_token = token or request.cookies.get("media_token")
    if not media_token:
        raise HTTPException(status_code=401, detail="Missing media authentication")

    access_result = await run_in_threadpool(event_file_service._verify_event_access_sync, media_token, event_id)
    if access_result["status"] != 200:
        raise HTTPException(status_code=access_result["status"], detail=access_result["detail"])

    file_path = access_result["file_path"]
    event_type = access_result["event_type"]

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
        raise HTTPException(
            status_code=403, detail="Access denied: File outside storage directory"
        )

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
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.post("/bulk-delete")
def bulk_delete_events(
    request: schemas.BulkDeleteRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin),
):
    """Delete multiple individual events by ID"""
    deleted_count = 0
    errors = []

    # ⚡ Bolt: Fetch all events in a single O(1) query instead of O(N) queries inside the loop
    events = db.query(models.Event).filter(models.Event.id.in_(request.event_ids)).all()
    events_map = {event.id: event for event in events}

    events_to_delete_ids = []

    for event_id in request.event_ids:
        event = events_map.get(event_id)
        if not event:
            errors.append(f"Event {event_id} not found")
            continue

        # Safely delete files and then the DB record
        event_file_service.delete_event_files(event)
        events_to_delete_ids.append(event.id)
        deleted_count += 1

    # Bulk delete via IN clause to avoid N+1 DB operations
    # SQLite has a limit on variables per query (SQLITE_MAX_VARIABLE_NUMBER, default 999)
    # Batch deletes in chunks of 900
    batch_size = 900
    for i in range(0, len(events_to_delete_ids), batch_size):
        batch = events_to_delete_ids[i : i + batch_size]
        db.query(models.Event).filter(models.Event.id.in_(batch)).delete(
            synchronize_session=False
        )

    db.commit()
    return {"deleted_count": deleted_count, "errors": errors}

@router.delete("/bulk/all")
def delete_all_events(
    event_type: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin),
):
    """
    Delete all events.
    - event_type=video: Delete only video events
    - event_type=picture: Delete only picture events
    - No event_type: Delete all events
    """

    query = db.query(models.Event)
    if event_type:
        query = query.filter(models.Event.type == event_type)

    # Bolt: Fix N+1 queries during massive deletions and eliminate memory loading of massive dataset
    # We load IDs and size attributes selectively to limit memory footprint.
    events_metadata = query.with_entities(
        models.Event.id, models.Event.file_path, models.Event.thumbnail_path
    ).all()
    deleted_count = 0
    deleted_size = 0
    events_to_delete_ids = []

    for event_id, file_path, thumbnail_path in events_metadata:
        # create a dummy event for file deletion logic
        dummy_event = models.Event(
            id=event_id, file_path=file_path, thumbnail_path=thumbnail_path
        )

        # Safely delete files and track size
        deleted_size += event_file_service.delete_event_files(dummy_event)
        events_to_delete_ids.append(event_id)
        deleted_count += 1

    # Bulk delete via IN clause to avoid N+1 DB operations
    # SQLite has a limit on variables per query (SQLITE_MAX_VARIABLE_NUMBER, default 999)
    # Batch deletes in chunks of 900
    batch_size = 900
    for i in range(0, len(events_to_delete_ids), batch_size):
        batch = events_to_delete_ids[i : i + batch_size]
        db.query(models.Event).filter(models.Event.id.in_(batch)).delete(
            synchronize_session=False
        )

    db.commit()

    return {
        "deleted_count": deleted_count,
        "deleted_size_bytes": deleted_size,
        "deleted_size_mb": round(deleted_size / (1024 * 1024), 2),
        "type": event_type or "all",
    }
