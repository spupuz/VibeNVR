import os
import datetime
import logging
import subprocess
import jwt
import threading
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

# Max 2 concurrent ffprobe/ffmpeg processes for thumbnail extraction to prevent I/O thrashing
THUMBNAIL_SEMAPHORE = threading.Semaphore(2)

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
    data_dir = os.path.abspath("/data")
    if os.path.commonpath([abs_path, data_dir]) == data_dir:
        return True
    
    session = db or database.SessionLocal()
    try:
        for p in session.query(models.StorageProfile).all():
            if p.path:
                p_abs = os.path.abspath(p.path)
                if os.path.commonpath([abs_path, p_abs]) == p_abs:
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

    from storage_service import translate_path
    
    # We might not have a session passed in, so we get one if needed for sftp
    import database
    import crud
    db_local = db or database.SessionLocal()
    
    try:
        for ptype, raw_path in paths:
            if raw_path.startswith("sftp://"):
                try:
                    profile_id = int(raw_path.split("sftp://")[1].split("/")[0])
                    remote_path = raw_path.split(f"sftp://{profile_id}")[1]
                    profile = crud.get_storage_profile(db_local, profile_id)
                    if profile:
                        import sftp_client
                        size = sftp_client.delete_file(profile, remote_path)
                        if ptype == "file":
                            deleted_bytes += size
                except Exception as e:
                    logger.error(f"Error deleting remote SFTP file {raw_path}: {e}")
                continue

            path = translate_path(raw_path)

            try:
                # Security Validation: Final path must be safe
                if not is_path_safe(path, db_local):
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
    finally:
        if not db:
            db_local.close()

    return deleted_bytes


def cleanup_orphaned_file(file_path: str, camera_id: int):
    """Helper to delete files from disk if the camera no longer exists in DB"""
    if not file_path:
        return

    if file_path.startswith("sftp://"):
        try:
            profile_id = int(file_path.split("sftp://")[1].split("/")[0])
            remote_path = file_path.split(f"sftp://{profile_id}")[1]
            import database
            import crud
            with database.get_db_ctx() as db:
                profile = crud.get_storage_profile(db, profile_id)
                if profile:
                    import sftp_client
                    sftp_client.delete_file(profile, remote_path)
                    # For thumbnails
                    base, _ = os.path.splitext(remote_path)
                    sftp_client.delete_file(profile, base + ".jpg")
            logger.info(f"[WEBHOOK] Cleaned up orphaned SFTP file for deleted camera {camera_id}: {file_path}")
        except Exception as e:
            logger.error(f"[WEBHOOK] Failed to cleanup orphaned SFTP file: {e}")
        return

    from storage_service import translate_path
    local_path = translate_path(file_path)

    # Security Validation
    if local_path:
        # Avoid creating DB connection if not strictly necessary, but is_path_safe requires DB session.
        # Create ad-hoc session for safe validation.
        if not is_path_safe(local_path):
            logger.warning(
                f"Security Alert: Blocked orphaned file deletion outside allowed directories: {local_path}"
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
            event_source=payload.get("event_source"),
            event_metadata=payload.get("event_metadata"),
        )

        if event_type == "movie_end":
            # Remove from active cameras on movie end
            if camera_id in events_state.ACTIVE_CAMERAS:
                del events_state.ACTIVE_CAMERAS[camera_id]

            # Acquire semaphore to limit concurrent disk-heavy I/O operations
            with THUMBNAIL_SEMAPHORE:
                # Get Duration using ffprobe
                if local_path and os.path.exists(local_path):
                    try:
                        # Security: Prevent argument injection by using absolute path
                        safe_path = os.path.abspath(local_path)
                        cmd = [
                            "ffprobe",
                            "-v",
                            "error",
                            "-show_entries",
                            "format=duration",
                            "-of",
                            "default=noprint_wrappers=1:nokey=1",
                            "-i",
                            safe_path,
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

                        # Security: Prevent argument injection by using absolute path
                        safe_path = os.path.abspath(local_path)
                        subprocess.run(
                            [
                                "ffmpeg",
                                "-y",
                                "-i",
                                safe_path,
                                "-ss",
                                "00:00:01",
                                "-vframes",
                                "1",
                                "-vf",
                                "scale=320:-1",
                                local_thumb,
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

        # ---- SFTP DIRECT UPLOAD BYPASS ----
        # If target profile is SFTP, upload immediately instead of waiting for archiver
        try:
            target_profile = None
            if db_event_type in ["motion", "manual"] and camera.motion_storage_profile:
                target_profile = camera.motion_storage_profile
            elif db_event_type == "continuous" and camera.continuous_storage_profile:
                target_profile = camera.continuous_storage_profile
            elif event_type == "picture_save" and camera.snapshot_storage_profile:
                target_profile = camera.snapshot_storage_profile
            else:
                target_profile = camera.storage_profile

            if target_profile and target_profile.storage_type == 'sftp':
                import sftp_client
                parts = file_path.split(os.sep)
                if len(parts) >= 2:
                    dest_suffix = f"{camera_id}/{parts[-2]}/{parts[-1]}"
                else:
                    dest_suffix = f"{camera_id}/{os.path.basename(file_path)}"
                
                # Upload Main File
                if local_path and os.path.exists(local_path):
                    remote_file = sftp_client.upload_file(target_profile, local_path, dest_suffix)
                    if remote_file:
                        event_data.file_path = f"sftp://{target_profile.id}{remote_file}"
                        try:
                            os.remove(local_path)
                        except Exception:
                            pass
                
                # Upload Thumbnail
                if getattr(event_data, 'thumbnail_path', None):
                    if event_type == "picture_save":
                        # For snapshots, the thumbnail is the exact same file as the main event file
                        # which was already uploaded and its path updated to sftp://...
                        event_data.thumbnail_path = event_data.file_path
                    else:
                        local_thumb = storage_service.translate_path(event_data.thumbnail_path)
                        if local_thumb and os.path.exists(local_thumb):
                            thumb_suffix = dest_suffix.rsplit('.', 1)[0] + '.jpg'
                            remote_thumb = sftp_client.upload_file(target_profile, local_thumb, thumb_suffix)
                            if remote_thumb:
                                event_data.thumbnail_path = f"sftp://{target_profile.id}{remote_thumb}"
                                try:
                                    os.remove(local_thumb)
                                except Exception:
                                    pass
        except Exception as sftp_err:
            logger.error(f"[BG-WORK] SFTP direct upload failed: {sftp_err}")
        # -----------------------------------

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
