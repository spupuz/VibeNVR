from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import Optional
import database
import models
import schemas
import auth_service
import json, time
import datetime, motion_service

router = APIRouter(prefix="/settings", tags=["settings"])

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
            
        elif key == "opt_verbose_engine_logs":
            if value.lower() not in ["true", "false"]:
                raise ValueError("Must be 'true' or 'false'")
            
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
def get_all_settings(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    """Get all system settings"""
    settings = db.query(models.SystemSettings).all()
    return {s.key: {"value": s.value, "description": s.description} for s in settings}

@router.get("/{key}")
def get_setting_by_key(key: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    """Get a specific setting by key"""
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
def export_backup(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
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
async def import_backup(
    file: UploadFile = File(...), 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
    """Import configuration from JSON"""
    try:
        content = await file.read()
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
                        print(f"[BACKUP] Skipping invalid optimization setting {s['key']}: {e.detail}")
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
        # Strategy: Upsert based on ID.
        if "cameras" in data:
            for c in data["cameras"]:
                cam_id = c.get("id")
                # Remove fields that might cause issues if they don't exist or are calculated (none here mostly)
                # Parse datetimes if necessary, but string usually works with matching types?
                # SQLAlchemy expects python objects for DateTime columns if not using specific drivers.
                # jsonable_encoder converted them to ISO strings.
                # We need to ensure models accept them or convert back.
                # simpler: Let's try direct attribute setting.
                
                # Check exist
                existing_cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
                if not existing_cam:
                    existing_cam = models.Camera(id=cam_id)
                    db.add(existing_cam)
                
                # Validate data using schema to enforce security (path traversal checks)
                try:
                    # Remove ID if present as it's not in Create schema
                    cam_data = {k: v for k, v in c.items() if k != 'id' and k != 'events' and k != 'groups'}
                    clean_cam = schemas.CameraCreate(**cam_data)
                    
                    # Apply validated fields
                    for k, v in clean_cam.model_dump(exclude_unset=True).items():
                         if hasattr(existing_cam, k):
                             setattr(existing_cam, k, v)
                except Exception as e:
                     print(f"[BACKUP] Security Warning: Skipping invalid camera config for ID {cam_id}: {e}", flush=True)
                     continue

        # 4. Restore Groups
        if "groups" in data:
            for g in data["groups"]:
                grp_id = g.get("id")
                existing_grp = db.query(models.CameraGroup).filter(models.CameraGroup.id == grp_id).first()
                if not existing_grp:
                    existing_grp = models.CameraGroup(id=grp_id)
                    db.add(existing_grp)
                
                for k, v in g.items():
                    if k == "cameras": continue
                    if hasattr(existing_grp, k):
                        setattr(existing_grp, k, v)
        
        db.flush() # Sync ID sequences?
        
        # 5. Restore Associations
        # Wipe existing associations for robustness or merge?
        # Merging is safer.
        if "associations" in data:
            print(f"[BACKUP] Restoring {len(data['associations'])} camera-group associations", flush=True)
            for a in data["associations"]:
                 cam_id = a.get("camera_id")
                 grp_id = a.get("group_id")
                 if cam_id and grp_id:
                     # Verify both exist before associating
                     cam_exists = db.query(models.Camera).filter_by(id=cam_id).first()
                     grp_exists = db.query(models.CameraGroup).filter_by(id=grp_id).first()
                     
                     if cam_exists and grp_exists:
                         exists = db.query(models.CameraGroupAssociation).filter_by(camera_id=cam_id, group_id=grp_id).first()
                         if not exists:
                             assoc = models.CameraGroupAssociation(camera_id=cam_id, group_id=grp_id)
                             db.add(assoc)

        # 6. Restore Users
        if "users" in data:
            print(f"[BACKUP] Restoring {len(data['users'])} users", flush=True)
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
