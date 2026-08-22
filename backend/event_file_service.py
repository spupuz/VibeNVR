import os
import datetime
import logging
import subprocess
import jwt
from typing import Optional
from sqlalchemy.orm import Session

import crud
import models
import schemas
import database
import events_state
import auth_service
import storage_service
import notification_service

logger = logging.getLogger(__name__)

def _verify_event_access_sync(token: str, event_id: int) -> dict:
    """Thread-safe synchronous wrapper for verifying event download access."""
    db = database.SessionLocal()
    try:
        # Decode JWT token
        try:
            payload = jwt.decode(token, auth_service.SECRET_KEY, algorithms=[auth_service.ALGORITHM])
            username: str = payload.get("sub")
            if not username:
                return {"status": 401, "detail": "Invalid token"}
        except jwt.PyJWTError:
            return {"status": 401, "detail": "Invalid token"}

        # Get User
        user = db.query(models.User).filter(models.User.username == username).first()
        if user is None:
            return {"status": 401, "detail": "User not found"}

        # Get Event
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            return {"status": 404, "detail": "Event not found"}

        # Check access
        if user.role == "viewer" and user.restrict_camera_access:
            allowed_ids = crud.get_allowed_camera_ids_for_user(db, user.id, permission="replay")
            if allowed_ids is not None and event.camera_id not in allowed_ids:
                return {"status": 403, "detail": "Not authorized to download this event"}

        if not event.file_path:
            return {"status": 404, "detail": "No file associated with this event"}

        return {
            "status": 200,
            "file_path": event.file_path,
            "event_type": event.type
        }
    finally:
        db.close()


def is_path_safe(path: str, db: Session = None) -> bool:
    """Check if a path is safe to access (inside /data/ or a valid storage profile)."""
    if not path:
        return False
    abs_path = os.path.abspath(path)
    if abs_path.startswith("/data/"):
        return True
    
    session = db or database.SessionLocal()
    try:
        for p in session.query(models.StorageProfile).all():
            if p.path:
                p_abs = os.path.abspath(p.path)
                if abs_path == p_abs or abs_path.startswith(p_abs + ('' if p_abs.endswith(os.sep) else os.sep)):
                    return True
        return False
    finally:
        if db is None:
            session.close()


def delete_event_files(event: models.Event, db: Session = None) -> int:
    """Helper to safely delete event files from disk with path traversal protection. Returns bytes deleted."""
    deleted_bytes = 0
    # Map internal container paths to /data volume
    paths = []
    if event.file_path:
        paths.append(("file", event.file_path))
    if event.thumbnail_path:
        paths.append(("thumb", event.thumbnail_path))

    for ptype, raw_path in paths:
        path = raw_path
        if path.startswith("/var/lib/motion"):
            path = path.replace("/var/lib/motion", "/data", 1)
        elif path.startswith("/var/lib/vibe/recordings"):
            path = path.replace("/var/lib/vibe/recordings", "/data", 1)

        try:
            # Security Validation: Final path must be safe
            if not is_path_safe(path, db):
                logger.warning(
                    f"Security Alert: Blocked attempted deletion of file outside allowed storage directories: {path}"
                )
                continue

            if os.path.exists(path):
                if ptype == "file":  # Only count main file size for reporting
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
            logger.warning(
                f"Security Alert: Blocked orphaned file cleanup outside storage: {local_path}"
            )
            return

    if local_path and os.path.exists(local_path):
        try:
            os.remove(local_path)
            logger.info(
                f"[WEBHOOK] Cleaned up orphaned file for deleted camera {camera_id}: {local_path}"
            )
            # Also try to remove thumbnail if it exists
            base, _ = os.path.splitext(local_path)
            if os.path.exists(base + ".jpg"):
                os.remove(base + ".jpg")
        except Exception as e:
            logger.error(f"[WEBHOOK] Failed to cleanup orphaned file: {e}")


def process_webhook_file_event(
    camera_id: int, event_type: str, payload: dict, in_schedule: bool
):
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
        local_path = storage_service.translate_path(file_path)

        # Security Validation
        if local_path:
            if not is_path_safe(local_path, db):
                logger.warning(
                    f"Security Alert: Blocked attempted access to file outside allowed storage directories: {local_path}"
                )
                local_path = None

        file_size = 0
        if local_path and os.path.exists(local_path):
            file_size = os.path.getsize(local_path)

        ts_str = payload.get("timestamp")
        try:
            ts = datetime.datetime.fromisoformat(ts_str)
        except:
            ts = datetime.datetime.now().astimezone()

        reason = str(payload.get("reason", "unknown")).lower()
        if reason in ["continuous", "motion", "manual"]:
            db_event_type = reason
        else:
            if reason != "unknown":
                logger.warning(f"Unrecognized recording reason '{reason}', defaulting to 'unknown'")
            db_event_type = "unknown"

        event_data = schemas.EventCreate(
            camera_id=camera_id,
            timestamp_start=ts,
            type="video" if event_type == "movie_end" else "snapshot",
            event_type=db_event_type,
            file_path=file_path,
            file_size=file_size,
            width=payload.get("width"),
            height=payload.get("height"),
            motion_score=0.0,
            ai_metadata=payload.get("ai_metadata"),
        )

        if event_type == "movie_end":
            # Remove from active cameras on movie end
            if camera_id in events_state.ACTIVE_CAMERAS:
                del events_state.ACTIVE_CAMERAS[camera_id]

            # Get Duration using ffprobe
            if local_path and os.path.exists(local_path):
                # Security: Prevent argument injection by using absolute paths
                try:
                    cmd = [
                        "ffprobe",
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        "-i",
                        os.path.abspath(local_path),
                    ]
                    result = subprocess.run(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        timeout=10,
                    )
                    if result.returncode == 0:
                        duration_str = result.stdout.strip()
                        if duration_str and duration_str != "N/A":
                            duration_sec = float(duration_str)
                            event_data.timestamp_end = ts + datetime.timedelta(
                                seconds=duration_sec
                            )
                except Exception as e:
                    logger.error(f"[BG-WORK] ffprobe failed: {e}")

            # Generate Thumbnail
            try:
                if local_path and os.path.exists(local_path):
                    base, _ = os.path.splitext(local_path)
                    local_thumb = f"{base}.jpg"
                    base_db, _ = os.path.splitext(file_path)
                    db_thumb = f"{base_db}.jpg"

                    subprocess.run(
                        [
                            "ffmpeg",
                            "-y",
                            "-i",
                            os.path.abspath(local_path),
                            "-ss",
                            "00:00:01",
                            "-vframes",
                            "1",
                            "-vf",
                            "scale=320:-1",
                            os.path.abspath(local_thumb),
                        ],
                        check=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=15,
                    )

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

