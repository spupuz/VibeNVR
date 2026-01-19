from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import Optional
import database
import models
import schemas
import auth_service
import json
from datetime import datetime

router = APIRouter(prefix="/settings", tags=["settings"])

def get_setting(db: Session, key: str) -> Optional[str]:
    """Get a setting value by key"""
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    return setting.value if setting else None

def set_setting(db: Session, key: str, value: str, description: str = None):
    """Set a setting value, create if doesn't exist"""
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
    return {"key": setting.key, "value": setting.value, "description": setting.description}

@router.post("/bulk")
def update_bulk_settings(settings: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Update multiple settings at once"""
    for key, value in settings.items():
        set_setting(db, key, str(value))
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
}

@router.post("/init-defaults")
def init_default_settings(db: Session = Depends(database.get_db)):
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
        "timestamp": datetime.now().isoformat(),
        "version": "1.0",
        "settings": jsonable_encoder(db.query(models.SystemSettings).all()),
        "cameras": jsonable_encoder([schemas.Camera.model_validate(c) for c in db.query(models.Camera).all()]),
        "groups": jsonable_encoder([schemas.CameraGroup.model_validate(g) for g in db.query(models.CameraGroup).all()]),
        "associations": [{"camera_id": a.camera_id, "group_id": a.group_id} for a in db.query(models.CameraGroupAssociation).all()]
    }
    
    filename = f"vibenvr_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
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
                
                for k, v in c.items():
                    if k == "events" or k == "groups": continue # Skip relationships
                    if hasattr(existing_cam, k):
                        setattr(existing_cam, k, v)

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

        db.commit()
        return {"message": "Backup imported successfully. Please refresh the page."}

    except Exception as e:
        db.rollback()
        print(f"Import Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to import backup: {str(e)}")

