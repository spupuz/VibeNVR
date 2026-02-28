from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import Optional
from slowapi import Limiter
from slowapi.util import get_remote_address
import database
import models
import schemas
import auth_service
import json, time, logging
import datetime, motion_service
import requests
import telemetry_service

router = APIRouter(prefix="/settings", tags=["settings"])
limiter = Limiter(key_func=get_remote_address)

@router.post("/telemetry/report")
def manual_telemetry_report(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Trigger a manual telemetry report (Admin only)"""
    status_code = telemetry_service.send_telemetry()
    return {"status": "ok", "scarf_status": status_code}

def get_setting(db: Session, key: str) -> Optional[str]:
    """Get a setting value by key"""
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    return setting.value if setting else None


# Validation Constants
VALID_FFMPEG_PRESETS = {
    "ultrafast", "superfast", "veryfast", "faster", "fast", 
    "medium", "slow", "slower", "veryslow"
}

def validate_setting(key: str, value: str):
    """Validate setting values to prevent invalid configuration"""
    try:
        if key == "opt_ffmpeg_preset":
            if value not in VALID_FFMPEG_PRESETS:
                raise ValueError(f"Invalid preset. Must be one of: {', '.join(VALID_FFMPEG_PRESETS)}")
        
        elif key in ["opt_live_view_fps_throttle", "opt_motion_fps_throttle"]:
            v = int(value)
            if v < 1: raise ValueError("Throttle must be >= 1")
            
        elif key == "opt_live_view_height_limit":
            v = int(value)
            if v < 144: raise ValueError("Height limit must be >= 144")
            
        elif key == "opt_motion_analysis_height":
            v = int(value)
            if v < 64: raise ValueError("Motion analysis height must be >= 64")
            
        elif key in ["opt_live_view_quality", "opt_snapshot_quality"]:
            v = int(value)
            if v < 1 or v > 100: raise ValueError("Quality must be between 1 and 100")
            
        elif key in ["opt_verbose_engine_logs", "telemetry_enabled"]:
            if value.lower() not in ["true", "false"]:
                raise ValueError("Must be 'true' or 'false'")
        
        elif key == "notify_webhook_url" and value:
            import socket
            from urllib.parse import urlparse
            import ipaddress
            try:
                parsed = urlparse(value)
                if not parsed.scheme or not parsed.netloc:
                    raise ValueError('Invalid URL format')
                host = parsed.hostname
                try:
                    ip_addr = ipaddress.ip_address(host)
                except ValueError:
                    try:
                        ip_addr = ipaddress.ip_address(socket.gethostbyname(host))
                    except Exception:
                        return
                if ip_addr.is_loopback or ip_addr.is_private or ip_addr.is_reserved or ip_addr.is_link_local:
                    # Allow local/private IPs for webhooks in local lab/dev environments
                    pass
            except Exception as e:
                if isinstance(e, ValueError): raise e
                raise ValueError(f'Invalid or unreachable URL: {str(e)}')
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid value for {key}: {str(e)}")

def set_setting(db: Session, key: str, value: str, description: str = None):
    """Set a setting value, create if doesn't exist"""
    validate_setting(key, value)
    
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    if setting:
        setting.value = value
        if description:
            setting.description = description
    else:
        setting = models.SystemSettings(key=key, value=value, description=description)
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting

@router.get("")
def get_all_settings(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Get all system settings"""
    settings = db.query(models.SystemSettings).all()
    return {s.key: {"value": s.value, "description": s.description} for s in settings}

@router.get("/{key}")
def get_setting_by_key(key: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    """Get a specific setting by key"""
    if current_user.role != "admin":
        safe_keys = ["default_landing_page", "telemetry_enabled", "instance_id"]
        if key not in safe_keys:
            raise HTTPException(status_code=403, detail="Not authorized to access this setting")
            
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    if not setting:
        # Fallback to DEFAULT_SETTINGS if available
        if key in DEFAULT_SETTINGS:
            return {"key": key, "value": DEFAULT_SETTINGS[key]["value"], "description": DEFAULT_SETTINGS[key]["description"]}
        return {"key": key, "value": None, "description": None}
    return {"key": setting.key, "value": setting.value, "description": setting.description}

@router.put("/{key}")
def update_setting(key: str, value: str, description: str = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Update or create a setting"""
    setting = set_setting(db, key, value, description)
    if key.startswith("opt_"):
        motion_service.sync_global_config(db)
    return {"key": setting.key, "value": setting.value, "description": setting.description}

@router.post("/bulk")
def update_bulk_settings(settings: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Update multiple settings at once"""
    for key, value in settings.items():
        set_setting(db, key, str(value))
    
    # Sync global config if any opt_ setting was updated
    if any(k.startswith("opt_") for k in settings.keys()):
        motion_service.sync_global_config(db)
        
    return {"message": "Settings updated successfully", "count": len(settings)}

@router.post("/cleanup")
def trigger_cleanup(current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Manually trigger storage cleanup"""
    from storage_service import run_cleanup
    run_cleanup()
    return {"message": "Storage cleanup triggered successfully"}

# Default settings with descriptions
DEFAULT_SETTINGS = {
    "max_global_storage_gb": {"value": "0", "description": "Maximum total storage for all cameras (0 = unlimited)"},
    "cleanup_enabled": {"value": "true", "description": "Enable automatic cleanup of old recordings"},
    "cleanup_interval_hours": {"value": "24", "description": "How often to run cleanup (in hours)"},
    
    # Notification Settings
    "smtp_server": {"value": "", "description": "SMTP Server Address"},
    "smtp_port": {"value": "587", "description": "SMTP Port (e.g. 587 or 465)"},
    "smtp_username": {"value": "", "description": "SMTP Username"},
    "smtp_password": {"value": "", "description": "SMTP Password"},
    "smtp_from_email": {"value": "", "description": "Email Sender Address"},
    "telegram_bot_token": {"value": "", "description": "Telegram Bot Token for global notifications"},
    "telegram_chat_id": {"value": "", "description": "Telegram Chat ID for global notifications"},
    "notify_email_recipient": {"value": "", "description": "Default recipient for email notifications"},
    "notify_webhook_url": {"value": "", "description": "Global Webhook URL for notifications"},
    "default_landing_page": {"value": "live", "description": "Default page when opening the app (dashboard, timeline, live)"},
    
    # Log Settings
    "log_max_size_mb": {"value": "50", "description": "Maximum size of a log file before rotation (MB)"},
    "log_backup_count": {"value": "5", "description": "Number of rotated log files to keep"},
    "log_rotation_check_minutes": {"value": "60", "description": "How often to check for log rotation (minutes)"},

    # Optimization Settings (Advanced)
    "opt_live_view_fps_throttle": {"value": "2", "description": "Process every Nth frame for Live View (higher = less CPU)"},
    "opt_motion_fps_throttle": {"value": "3", "description": "Process every Nth frame for Motion Detection (higher = less CPU)"},
    "opt_live_view_height_limit": {"value": "720", "description": "Max height for live stream (downscales if larger)"},
    "opt_motion_analysis_height": {"value": "180", "description": "Height for motion analysis resizing (smaller = faster)"},
    "opt_live_view_quality": {"value": "60", "description": "JPEG Quality for live stream (1-100)"},
    "opt_snapshot_quality": {"value": "90", "description": "JPEG Quality for snapshots (1-100)"},
    "opt_ffmpeg_preset": {"value": "ultrafast", "description": "FFmpeg preset for transcoding (ultrafast, superfast, veryfast, faster, fast, medium)"},
    "opt_verbose_engine_logs": {"value": "false", "description": "Enable verbose logs from OpenCV/FFmpeg in the engine"},
    "telemetry_enabled": {"value": "true", "description": "Enable anonymous telemetry to help improve VibeNVR"},
    "instance_id": {"value": "", "description": "Unique anonymous ID for this VibeNVR instance"},
}

@router.post("/init-defaults")
def init_default_settings(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Initialize default settings if they don't exist"""
    created = 0
    for key, data in DEFAULT_SETTINGS.items():
        existing = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
        if not existing:
            set_setting(db, key, data["value"], data["description"])
            created += 1
    return {"message": f"Initialized {created} default settings"}

# -----------------------------------------------------------------------------
# BACKUP & RESTORE
# -----------------------------------------------------------------------------

@router.get("/backup/export")
@limiter.limit("5/minute")
def export_backup(request: Request, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Export configuration to JSON"""
    data = {
        "timestamp": datetime.datetime.now().isoformat(),
        "version": "1.0",
        "settings": jsonable_encoder(db.query(models.SystemSettings).all()),
        "cameras": jsonable_encoder([schemas.Camera.model_validate(c) for c in db.query(models.Camera).all()]),
        "groups": jsonable_encoder([schemas.CameraGroup.model_validate(g) for g in db.query(models.CameraGroup).all()]),
        "associations": [{"camera_id": a.camera_id, "group_id": a.group_id} for a in db.query(models.CameraGroupAssociation).all()],
        "users": [{
            "username": u.username,
            "email": u.email,
            "hashed_password": u.hashed_password,
            "role": u.role
        } for u in db.query(models.User).all()]
    }
    
    filename = f"vibenvr_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/backup/import")
@limiter.limit("5/minute")
async def import_backup(
    request: Request,
    file: UploadFile = File(...), 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
    """Import configuration from JSON"""
    MAX_BACKUP_SIZE = 10 * 1024 * 1024  # 10 MB
    try:
        content = await file.read(MAX_BACKUP_SIZE + 1)
        if len(content) > MAX_BACKUP_SIZE:
            raise HTTPException(status_code=400, detail="File too large (max 10 MB)")
        data = json.loads(content)
        
        # 1. Restore Check
        if not isinstance(data, dict) or "cameras" not in data:
            raise HTTPException(status_code=400, detail="Invalid backup file format")

        # 2. Restore Settings
        if "settings" in data:
            for s in data["settings"]:
                # Merge: Update if exists, insert if not
                # DB merge requires an object
                # Filter out nulls if needed, or just overwrite
                existing = db.query(models.SystemSettings).filter(models.SystemSettings.key == s["key"]).first()
                
                # OPTIMIZATION: Validate optimization settings during import
                if s["key"].startswith("opt_"):
                    try:
                        validate_setting(s["key"], str(s["value"]))
                    except HTTPException as e:
                        logging.warning(f"[BACKUP] Skipping invalid optimization setting {s['key']}: {e.detail}")
                        continue
                
                if existing:
                    existing.value = s["value"]
                    existing.description = s.get("description")
                else:
                    new_setting = models.SystemSettings(
                        key=s["key"], value=s["value"], description=s.get("description")
                    )
                    db.add(new_setting)
        
        # 3. Restore Cameras
        # Strategy: De-duplication by RTSP URL if ID doesn't match
        cam_id_map = {} # backup_id -> actual_db_id
        if "cameras" in data:
            # We need extract_host logic here to match by Host/IP if URL changes slightly (e.g. credentials)
            from urllib.parse import urlparse
            def get_host(url):
                try:
                    if not url: return None
                    if "://" not in url: url = "rtsp://" + url
                    return urlparse(url).hostname
                except: return None

            for c in data["cameras"]:
                backup_id = c.get("id")
                rtsp_url = c.get("rtsp_url")
                cam_host = get_host(rtsp_url)
                
                # 1. Try match by ID
                existing_cam = db.query(models.Camera).filter(models.Camera.id == backup_id).first()
                
                # 2. If not found by ID, try match by Host/IP (like in single import)
                if not existing_cam and cam_host:
                    # Get all cameras to check host (could be optimized with a specialized query if needed)
                    all_cams = db.query(models.Camera).all()
                    existing_cam = next((cam for cam in all_cams if get_host(cam.rtsp_url) == cam_host), None)
                
                if not existing_cam:
                    # Create new but DON'T force the backup ID if it might conflict
                    # Let auto-increment handle it if the backup ID is already taken by a DIFFERENT camera
                    id_conflict = db.query(models.Camera).filter(models.Camera.id == backup_id).first()
                    if id_conflict:
                        existing_cam = models.Camera() # New ID
                    else:
                        existing_cam = models.Camera(id=backup_id)
                    db.add(existing_cam)
                
                # Validate data using schema
                try:
                    cam_data = {k: v for k, v in c.items() if k not in ['id', 'events', 'groups', 'last_frame_path', 'last_thumbnail_path']}
                    clean_cam = schemas.CameraCreate(**cam_data)
                    
                    # Apply validated fields
                    for k, v in clean_cam.model_dump(exclude_unset=True).items():
                         if hasattr(existing_cam, k):
                             setattr(existing_cam, k, v)
                    
                    db.flush() # Ensure ID is generated if new
                    cam_id_map[backup_id] = existing_cam.id
                except Exception as e:
                     logging.warning(f"[BACKUP] Security Warning: Skipping invalid camera config for ID {backup_id}: {e}")
                     continue

        # 4. Restore Groups
        grp_id_map = {} # backup_id -> actual_db_id
        if "groups" in data:
            for g in data["groups"]:
                backup_grp_id = g.get("id")
                # Try match by name if ID differs? Usually Groups are few, match by name is safer.
                existing_grp = db.query(models.CameraGroup).filter(models.CameraGroup.name == g.get("name")).first()
                if not existing_grp:
                    existing_grp = models.CameraGroup()
                    db.add(existing_grp)
                
                for k, v in g.items():
                    if k in ["cameras", "id"]: continue
                    if hasattr(existing_grp, k):
                        setattr(existing_grp, k, v)
                
                db.flush()
                grp_id_map[backup_grp_id] = existing_grp.id
        
        # 5. Restore Associations
        if "associations" in data:
            logging.info(f"[BACKUP] Restoring {len(data['associations'])} camera-group associations")
            for a in data["associations"]:
                 old_cam_id = a.get("camera_id")
                 old_grp_id = a.get("group_id")
                 
                 # Map to new IDs
                 new_cam_id = cam_id_map.get(old_cam_id)
                 new_grp_id = grp_id_map.get(old_grp_id)
                 
                 if new_cam_id and new_grp_id:
                     exists = db.query(models.CameraGroupAssociation).filter_by(
                         camera_id=new_cam_id, group_id=new_grp_id
                     ).first()
                     if not exists:
                         assoc = models.CameraGroupAssociation(camera_id=new_cam_id, group_id=new_grp_id)
                         db.add(assoc)

        # 6. Restore Users
        if "users" in data:
            logging.info(f"[BACKUP] Restoring {len(data['users'])} users")
            for u in data["users"]:
                existing_user = db.query(models.User).filter(models.User.username == u["username"]).first()
                if not existing_user:
                    new_user = models.User(
                        username=u["username"],
                        email=u.get("email"),
                        hashed_password=u["hashed_password"],
                        role=u.get("role", "viewer")
                    )
                    db.add(new_user)
                else:
                    # Update existing user role/email? 
                    # Generally safer to just restore missing ones to avoid locking out the person doing the restore if they changed their pwd.
                    existing_user.role = u.get("role", existing_user.role)
                    existing_user.email = u.get("email", existing_user.email)

        db.commit()
        
        # 6. Apply settings to engine (Force clean restart)
        try:
             # Stop everyone first to avoid conflicts and stale threads
             motion_service.stop_all_engines()
             # Wait a small moment for OS cleanup
             time.sleep(1)
             motion_service.generate_motion_config(db)
        except Exception as e:
             print(f"[BACKUP] Warning: Failed to sync engine after import: {e}", flush=True)

        return {"message": "Backup imported successfully. All cameras synced."}

    except Exception as e:
        db.rollback()
        print(f"Import Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to import backup: {str(e)}")


# Rate limiting for orphan sync (prevent abuse)
_last_orphan_sync_time = None

from fastapi import BackgroundTasks

# State for orphan sync background task
# NOTE: This uses in-memory global state. This limits the application to running with
# a single worker process (default for uvicorn). If multiple workers are used (e.g. gunicorn),
# this state will not be shared, and status polling will fail.
_sync_state = {
    "status": "idle",
    "result": None,
    "started_at": None,
    "completed_at": None
}

@router.get("/sync-orphans/status")
def get_orphan_sync_status(current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Get the status of the orphan sync background task"""
    return _sync_state

@router.post("/sync-orphans")
def sync_orphan_recordings(
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
    """
    Manually trigger orphan recording recovery.
    Scans /data/ for recordings not in the database and imports them.
    Admin-only with 5-minute cooldown to prevent abuse.
    Runs in background.
    """
    import time
    global _last_orphan_sync_time, _sync_state
    
    # Rate limit: 5 minutes between runs
    if _last_orphan_sync_time:
        elapsed = time.time() - _last_orphan_sync_time
        if elapsed < 300:  # 5 minutes, but allow retry if error or complete
            # If currently running, definitely block
            if _sync_state["status"] == "running":
                 raise HTTPException(status_code=409, detail="Sync already in progress")
            
            # If recently completed, enforce limit? 
            # User wants to run it. Let's enforce rate limit to prevent disk thrashing.
            remaining = int(300 - elapsed)
            raise HTTPException(
                status_code=429, 
                detail=f"Please wait {remaining} seconds before running again"
            )
    
    _last_orphan_sync_time = time.time()
    
    # Reset state
    _sync_state["status"] = "running"
    _sync_state["result"] = None
    _sync_state["started_at"] = time.time()
    _sync_state["completed_at"] = None
    
    def run_sync_task():
        global _sync_state
        try:
            import sync_recordings
            print(f"[Admin] User {current_user.username} triggered orphan sync (Background Task Started)", flush=True)
            stats = sync_recordings.sync_recordings(dry_run=False)
            
            _sync_state["result"] = stats
            _sync_state["status"] = "completed"
            
            if "error" in stats: # Check if script returned error dict
                 _sync_state["status"] = "error"

            print(f"[Admin] Orphan sync background task finished.", flush=True)
        except Exception as e:
            print(f"[Admin] Orphan sync error: {e}", flush=True)
            _sync_state["status"] = "error"
            _sync_state["result"] = {"error": str(e)}
        finally:
            _sync_state["completed_at"] = time.time()
            # Also log purely for visibility if needed, though script prints it too.
            # But the script print might be inside the function.
            # Since we imported sync_recordings, its print goes to stdout.
            # We already added the print inside sync_recordings.py, so it should be fine.
            # However, if we want to be 100% sure the return value (result) is also logged in format:
            try:
                import json
                if _sync_state["result"]:
                     print(f"JSON_SUMMARY:{json.dumps(_sync_state['result'])}")
            except:
                pass

    background_tasks.add_task(run_sync_task)
    return {"message": "Orphan recording recovery started in background."}

@router.post("/init-defaults")
def init_default_settings(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Initialize default settings if they don't exist"""
    count = 0
    for key, data in DEFAULT_SETTINGS.items():
        existing = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
        if not existing:
            setting = models.SystemSettings(key=key, value=data["value"], description=data["description"])
            db.add(setting)
            count += 1
    db.commit()
    return {"message": "Defaults initialized", "created_count": count}

@router.post("/test-notify")
def test_notification(config: schemas.TestNotificationConfig, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Send a test notification synchronously using provided credentials, falling back to DB defaults"""
    try:
        channel = config.channel
        settings = config.settings
        
        # Helper to get setting from payload OR database
        def get_conf(key, default=None):
            val = settings.get(key)
            if val: return val
            return get_setting(db, key) or default

        if channel == "email":
            import smtplib
            from email.mime.text import MIMEText
            
            import socket
            
            smtp_server = get_conf("smtp_server")
            smtp_port = int(get_conf("smtp_port", "587"))
            smtp_user = get_conf("smtp_username")
            smtp_pass = get_conf("smtp_password")
            smtp_from = get_conf("smtp_from_email")
            
            # Recipient priority: Payload 'recipient' -> DB 'notify_email_recipient'
            recipient = settings.get("recipient") 
            if not recipient:
                recipient = get_setting(db, "notify_email_recipient")
            
            if not all([smtp_server, smtp_from, recipient]):
                raise ValueError("Missing required Email settings (Server, From, Recipient). Configure them in Global Settings first.")
                
            msg = MIMEText("This is a test notification from VibeNVR.\nIf you see this, your Email settings are correct!")
            msg['Subject'] = "VibeNVR Test Notification"
            msg['From'] = smtp_from
            msg['To'] = recipient
            
            try:
                # Handle implicit SSL (Port 465) vs STARTTLS (Port 587/25)
                if smtp_port == 465:
                    server = smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=10)
                else:
                    server = smtplib.SMTP(smtp_server, smtp_port, timeout=10)
                    server.starttls()
                
                with server:
                    if smtp_user and smtp_pass:
                        try:
                            server.login(smtp_user, smtp_pass)
                        except smtplib.SMTPAuthenticationError:
                            raise ValueError("Authentication failed: Incorrect Username or Password.")
                    
                    server.send_message(msg)
            except (socket.timeout, ConnectionRefusedError, OSError) as e:
                 raise ValueError(f"Connection failed: Unable to connect to {smtp_server}:{smtp_port}. ({str(e)})")
            except smtplib.SMTPException as e:
                 raise ValueError(f"SMTP Error: {str(e)}")
                 
            return {"status": "success", "message": f"Test email sent to {recipient}"}
            
        elif channel == "telegram":
            token = get_conf("telegram_bot_token")
            chat_id = settings.get("telegram_chat_id") or get_conf("telegram_chat_id")
            
            if not token or not chat_id:
                raise ValueError("Missing Telegram Token or Chat ID. Configure them in Global Settings first.")
                
            api_url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": "🔔 VibeNVR Test Notification\n\nSucccess! Your Telegram bot is configured correctly."
            }
            
            resp = requests.post(api_url, json=payload, timeout=10)
            if not resp.ok:
                raise ValueError(f"Telegram API Error: {resp.text}")
                
            return {"status": "success", "message": "Test Telegram message sent"}
            
        elif channel == "webhook":
            url = settings.get("notify_webhook_url") or get_conf("notify_webhook_url")
            
            if not url:
                raise ValueError("Missing Webhook URL. Configure it in Global Settings first.")
                
            payload = {
                "event": "test",
                "message": "VibeNVR Test Webhook",
                "timestamp": datetime.datetime.now().isoformat()
            }
            
            resp = requests.post(url, json=payload, timeout=10)
            if not resp.ok:
                raise ValueError(f"Webhook returned error: {resp.status_code} {resp.text}")
                
            return {"status": "success", "message": f"Test payload sent to {url}"}
            
        else:
            raise ValueError(f"Unknown channel: {channel}")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
