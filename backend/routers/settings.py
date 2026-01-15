from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import database
import models

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

@router.get("/")
def get_all_settings(db: Session = Depends(database.get_db)):
    """Get all system settings"""
    settings = db.query(models.SystemSettings).all()
    return {s.key: {"value": s.value, "description": s.description} for s in settings}

@router.get("/{key}")
def get_setting_by_key(key: str, db: Session = Depends(database.get_db)):
    """Get a specific setting by key"""
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    if not setting:
        return {"key": key, "value": None, "description": None}
    return {"key": setting.key, "value": setting.value, "description": setting.description}

@router.put("/{key}")
def update_setting(key: str, value: str, description: str = None, db: Session = Depends(database.get_db)):
    """Update or create a setting"""
    setting = set_setting(db, key, value, description)
    return {"key": setting.key, "value": setting.value, "description": setting.description}

@router.post("/bulk")
def update_bulk_settings(settings: dict, db: Session = Depends(database.get_db)):
    """Update multiple settings at once"""
    for key, value in settings.items():
        set_setting(db, key, str(value))
    return {"message": "Settings updated successfully", "count": len(settings)}

@router.post("/cleanup")
def trigger_cleanup():
    """Manually trigger storage cleanup"""
    from storage_service import run_cleanup
    run_cleanup()
    return {"message": "Storage cleanup triggered successfully"}

# Default settings with descriptions
DEFAULT_SETTINGS = {
    "max_global_storage_gb": {"value": "0", "description": "Maximum total storage for all cameras (0 = unlimited)"},
    "cleanup_enabled": {"value": "true", "description": "Enable automatic cleanup of old recordings"},
    "cleanup_interval_hours": {"value": "24", "description": "How often to run cleanup (in hours)"},
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
