from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import crud, schemas, database, os, requests, threading, models, subprocess, auth_service
from sqlalchemy.exc import IntegrityError
import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/events",
    tags=["events"],
    responses={404: {"description": "Not found"}},
)

def send_notifications(camera_id: int, event_type: str, details: dict):
    """Async wrapper for sending notifications using Global + Camera settings"""
    def _send():
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        from email.mime.image import MIMEImage
        
        # Open a new DB session for this thread
        db_notify = database.SessionLocal()
        try:
            # Re-fetch camera to avoid DetachedInstanceError
            camera = db_notify.query(models.Camera).filter(models.Camera.id == camera_id).first()
            if not camera:
                logger.warning(f"[NOTIFY] Camera {camera_id} not found, aborting notification.")
                return

            # Helper to get setting
            def get_conf(key):
                s = db_notify.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
                return s.value if s else ""

            # Fetch Global Settings
            smtp_server = get_conf("smtp_server")
            smtp_port = int(get_conf("smtp_port") or "587")
            smtp_user = get_conf("smtp_username")
            smtp_pass = get_conf("smtp_password")
            smtp_from = get_conf("smtp_from_email")
            
            global_tg_token = get_conf("telegram_bot_token")
            global_tg_chat = get_conf("telegram_chat_id")
            global_email_recipient = get_conf("notify_email_recipient")
            global_webhook_url = get_conf("notify_webhook_url")
            
            # Global Attach Settings (Default to True if not set)
            global_attach_email = get_conf("global_attach_image_email") != "false"
            global_attach_telegram = get_conf("global_attach_image_telegram") != "false"

            # Resolve effective config based on Event Type
            is_health_event = (event_type == "camera_health")
            
            if is_health_event:
                # Health Specific -> Global Fallback
                tg_token = camera.notify_health_telegram_token or global_tg_token
                tg_chat = camera.notify_health_telegram_chat_id or global_tg_chat
                email_recipient = camera.notify_health_email_recipient or global_email_recipient
                webhook_url = camera.notify_health_webhook_url or global_webhook_url
            else:
                # Standard (Motion/Event) -> Global Fallback
                tg_token = camera.notify_telegram_token or global_tg_token
                tg_chat = camera.notify_telegram_chat_id or global_tg_chat
                email_recipient = camera.notify_email_address or global_email_recipient
                webhook_url = camera.notify_webhook_url or global_webhook_url
            
            # Prepare Attachment (Snapshot)
            file_path = details.get("file_path")
            image_path = None
            
            # If path provided
            if file_path:
                # If it's a video, try to find the timestamp-based thumb or .jpg replacement
                if file_path.endswith(".mp4") or file_path.endswith(".mkv"):
                    possible_jpg = file_path.rsplit('.', 1)[0] + ".jpg"
                    # Check if exists (need to map path first)
                    # We defer check until path mapping is done
                    image_path = possible_jpg
                elif file_path.endswith(".jpg"):
                    image_path = file_path
                        
            # Fix path mapping (Internal Container -> Backend /data volume)
            def map_path(p):
                if not p: return None
                if p.startswith("/var/lib/motion"):
                    return p.replace("/var/lib/motion", "/data", 1)
                elif p.startswith("/var/lib/vibe/recordings"):
                    return p.replace("/var/lib/vibe/recordings", "/data", 1)
                return p

            if image_path:
                image_path = map_path(image_path)
                if not os.path.exists(image_path):
                    # If derived jpg doesn't exist, try original file if it was a jpg
                    if file_path.endswith(".jpg"):
                         orig_mapped = map_path(file_path)
                         if os.path.exists(orig_mapped):
                             image_path = orig_mapped
                         else:
                             image_path = None
                    else:
                        image_path = None
            
            if image_path:
                 logger.info(f"[NOTIFY] Attaching image: {image_path}")

            # ---------------------------------------------------------
            # 1. Telegram Notification
            # ---------------------------------------------------------
            
            # Format Timestamp
            ts_raw = details.get('timestamp')
            ts_formatted = ts_raw
            try:
                if ts_raw:
                    dt = datetime.datetime.fromisoformat(str(ts_raw))
                    ts_formatted = dt.strftime("%Y-%m-%d %H:%M:%S")
            except:
                pass

            should_notify_tg = False
            if event_type == "event_start":
                should_notify_tg = camera.notify_start_telegram
                caption = f"🚨 *Motion Detected!*\n📷 Camera: {camera.name}\n⏰ Time: {ts_formatted}"
            elif event_type == "camera_health":
                should_notify_tg = camera.notify_health_telegram
                caption = f"{details.get('title', 'Camera Alert')}\n{details.get('message', '')}"

            if should_notify_tg and tg_token and tg_chat:
                try:
                    # Check both Camera setting AND Global setting (Master switch logic)
                    if image_path and camera.notify_attach_image_telegram and global_attach_telegram:
                        # Send Photo
                        url = f"https://api.telegram.org/bot{tg_token}/sendPhoto"
                        with open(image_path, 'rb') as f:
                            files = {'photo': f}
                            data = {'chat_id': tg_chat, 'caption': caption, 'parse_mode': 'Markdown'}
                            requests.post(url, data=data, files=files, timeout=10)
                    else:
                        # Send Text
                        url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                        requests.post(url, json={
                            "chat_id": tg_chat,
                            "text": caption,
                            "parse_mode": "Markdown"
                        }, timeout=5)
                except Exception as e:
                    logger.error(f"[NOTIFY] Telegram failed: {e}")

            # ---------------------------------------------------------
            # 2. Email Notification
            # ---------------------------------------------------------
            should_notify_email = False
            if event_type == "event_start":
                should_notify_email = camera.notify_start_email
                subject = f"Motion Detected: {camera.name}"
                body_title = "Motion Detected"
            elif event_type == "camera_health":
                should_notify_email = camera.notify_health_email
                subject = details.get('title', f"Camera Alert: {camera.name}")
                body_title = "Camera Health Alert"

            if should_notify_email and smtp_server and email_recipient:
                try:
                    msg = MIMEMultipart()
                    msg['Subject'] = subject
                    msg['From'] = smtp_from or "vibenvr@localhost"
                    msg['To'] = email_recipient

                    html_body = f"""
                    <h2>{body_title}</h2>
                    <p><b>Camera:</b> {camera.name}</p>
                    <p>{details.get('message', f"Event: {event_type}")}</p>
                    <p><b>Time:</b> {details.get('timestamp', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))}</p>
                    <p><i>VibeNVR Alert System</i></p>
                    """
                    msg.attach(MIMEText(html_body, 'html'))

                    if image_path and camera.notify_attach_image_email and global_attach_email:
                        with open(image_path, 'rb') as f:
                            img = MIMEImage(f.read())
                            img.add_header('Content-Disposition', 'attachment', filename=os.path.basename(image_path))
                            msg.attach(img)

                    # Connect and send
                    server = smtplib.SMTP(smtp_server, smtp_port)
                    server.set_debuglevel(0)
                    server.starttls()
                    if smtp_user and smtp_pass:
                        server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
                    server.quit()
                    logger.info(f"[NOTIFY] Email sent to {email_recipient}")
                except Exception as e:
                    logger.error(f"[NOTIFY] Email failed: {e}")

            # ---------------------------------------------------------
            # 3. Webhook (Legacy/Existing)
            # ---------------------------------------------------------
            should_notify_webhook = False
            if event_type == "event_start":
                should_notify_webhook = camera.notify_start_webhook
            elif event_type == "movie_end":
                should_notify_webhook = camera.notify_end_webhook
            elif event_type == "camera_health":
                should_notify_webhook = camera.notify_health_webhook

            if should_notify_webhook and webhook_url:
                try:
                    requests.post(webhook_url, json={
                        "camera_name": camera.name,
                        "event": event_type,
                        "title": details.get("title"),
                        "message": details.get("message"),
                        "timestamp": details.get("timestamp"),
                        "file_path": details.get("file_path")
                    }, timeout=5)
                except Exception as e:
                    logger.error(f"[NOTIFY] Webhook failed: {e}")
        except Exception as e:
            logger.error(f"[NOTIFY] General error: {e}")
        finally:
            db_notify.close()

    threading.Thread(target=_send, daemon=True).start()

def cleanup_orphaned_file(file_path: str, camera_id: int):
    """Helper to delete files from disk if the camera no longer exists in DB"""
    if not file_path:
        return
        
    local_path = None
    if file_path.startswith("/var/lib/motion"):
        local_path = file_path.replace("/var/lib/motion", "/data", 1)
    elif file_path.startswith("/var/lib/vibe/recordings"):
        local_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)
    
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
    return events
# Track active motion events globally
# camera_id -> start_timestamp
ACTIVE_CAMERAS = {}
# Track PURE motion detection (for UI reactive borders)
LIVE_MOTION = {}

@router.get("/status")
def get_motion_status(auth_info: tuple[models.User, bool] = Depends(auth_service.get_current_user_or_token)):
    user, is_token = auth_info
    """Returns list of camera IDs currently detecting motion and/or recording, plus health info"""
    from health_service import HEALTH_CACHE
    return {
        "active_ids": list(ACTIVE_CAMERAS.keys()),
        "live_motion_ids": list(LIVE_MOTION.keys()),
        "camera_health": HEALTH_CACHE
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
        logger.warning(f"[WEBHOOK] Unauthorized access attempt (Invalid Secret).")
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
            send_notifications(camera.id, "event_start", payload)

    elif event_type == "camera_health":
        logger.info(f"[WEBHOOK] Health event for camera {camera.name} (ID: {camera_id}): {payload.get('message')}")
        # Update Health Cache immediately for UI responsiveness
        try:
            from health_service import HEALTH_CACHE
            new_status = payload.get("status")
            if new_status:
                HEALTH_CACHE[camera.id] = new_status
        except ImportError:
            pass
        # Always send health notifications regardless of schedule (it's a system alert)
        send_notifications(camera.id, "camera_health", payload)

    elif event_type == "motion_on":
        # Purely for UI reactive feedback
        LIVE_MOTION[camera_id] = payload.get("timestamp")
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
            motion_score=0.0
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
                            duration_sec = float(result.stdout.strip())
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
                send_notifications(camera.id, event_type, payload)
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
                logger.warning(f"File not found: {file_path}")
                
            # Delete thumbnail if exists
            if event.thumbnail_path:
                thumb_path = event.thumbnail_path
                if thumb_path.startswith("/var/lib/motion"):
                    thumb_path = thumb_path.replace("/var/lib/motion", "/data", 1)
                elif thumb_path.startswith("/var/lib/vibe/recordings"):
                    thumb_path = thumb_path.replace("/var/lib/vibe/recordings", "/data", 1)
                
                try:
                    if os.path.exists(thumb_path):
                        os.remove(thumb_path)
                except Exception as e:
                    logger.error(f"Error deleting thumbnail {thumb_path}: {e}")
                    
        except Exception as e:
            logger.error(f"Error deleting file {file_path}: {e}")
            
    return event

@router.get("/{event_id}/download")
async def download_event(event_id: int, token: str):
    """Download event file with proper headers for cross-origin support"""
    with database.get_db_ctx() as db:
        await auth_service.get_user_from_token(token, db)
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
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

@router.delete("/bulk/all")
def delete_all_events(event_type: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """
    Delete all events. 
    - event_type=video: Delete only video events
    - event_type=picture: Delete only picture events
    - No event_type: Delete all events
    """
    import shutil
    
    query = db.query(models.Event)
    if event_type:
        query = query.filter(models.Event.type == event_type)
    
    events = query.all()
    deleted_count = 0
    deleted_size = 0
    
    for event in events:
        # Delete file
        if event.file_path:
            file_path = event.file_path
            if file_path.startswith("/var/lib/motion"):
                file_path = file_path.replace("/var/lib/motion", "/data", 1)
            elif file_path.startswith("/var/lib/vibe/recordings"):
                file_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)
            
            try:
                if os.path.exists(file_path):
                    deleted_size += os.path.getsize(file_path)
                    os.remove(file_path)
            except Exception as e:
                logger.error(f"Error deleting file {file_path}: {e}")
        
        # Delete thumbnail
        if event.thumbnail_path:
            thumb_path = event.thumbnail_path
            if thumb_path.startswith("/var/lib/motion"):
                thumb_path = thumb_path.replace("/var/lib/motion", "/data", 1)
            elif thumb_path.startswith("/var/lib/vibe/recordings"):
                thumb_path = thumb_path.replace("/var/lib/vibe/recordings", "/data", 1)
            
            try:
                if os.path.exists(thumb_path):
                    os.remove(thumb_path)
            except:
                pass
        
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
