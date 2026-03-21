import os
import json
import time
import logging
import threading
import datetime
from sqlalchemy.orm import Session
from fastapi.encoders import jsonable_encoder

import models
import database
import schemas
import settings_service

logger = logging.getLogger(__name__)

BACKUP_DIR = "/data/backups"

def run_backup(is_manual: bool = False):
    """Generate a configuration backup and save it to the backup folder"""
    try:
        if not os.path.exists(BACKUP_DIR):
            os.makedirs(BACKUP_DIR, exist_ok=True)

        with database.get_db_ctx() as db:
            logger.info(f"Starting {'manual' if is_manual else 'automatic'} configuration backup...")
            
            data = {
                "timestamp": datetime.datetime.now().isoformat(),
                "version": "1.0",
                "settings": jsonable_encoder(db.query(models.SystemSettings).all()),
                "cameras": jsonable_encoder([schemas.Camera.model_validate(c) for c in db.query(models.Camera).all()]),
                "groups": jsonable_encoder([schemas.CameraGroup.model_validate(g) for g in db.query(models.CameraGroup).all()]),
                "storage_profiles": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "path": p.path,
                        "description": p.description,
                        "max_size_gb": p.max_size_gb
                    } for p in db.query(models.StorageProfile).all()
                ],
                "associations": [{"camera_id": a.camera_id, "group_id": a.group_id} for a in db.query(models.CameraGroupAssociation).all()],
                "users": [{
                    "username": u.username,
                    "email": u.email,
                    "hashed_password": u.hashed_password,
                    "role": u.role,
                    "is_2fa_enabled": u.is_2fa_enabled,
                    "totp_secret": u.totp_secret,
                    "avatar_path": u.avatar_path
                } for u in db.query(models.User).all()],
                "api_tokens": [{
                    "name": t.name,
                    "token_hash": t.token_hash,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                    "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
                    "expires_at": t.expires_at.isoformat() if t.expires_at else None,
                    "is_active": t.is_active,
                    "username": t.created_by.username if t.created_by else None
                } for t in db.query(models.ApiToken).all()],
                "recovery_codes": [{
                    "username": r.user.username,
                    "code_hash": r.code_hash,
                    "created_at": r.created_at.isoformat() if r.created_at else None
                } for r in db.query(models.RecoveryCode).all()],
                "trusted_devices": [{
                    "username": d.user.username,
                    "token": d.token,
                    "name": d.name,
                    "last_used": d.last_used.isoformat() if d.last_used else None,
                    "expires_at": d.expires_at.isoformat() if d.expires_at else None,
                    "created_at": d.created_at.isoformat() if d.created_at else None
                } for d in db.query(models.TrustedDevice).all()]
            }

            prefix = "manual" if is_manual else "auto"
            filename = f"vibe_backup_{prefix}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            filepath = os.path.join(BACKUP_DIR, filename)
            
            with open(filepath, "w") as f:
                json.dump(data, f, indent=2)
            
            logger.info(f"{'Manual' if is_manual else 'Automatic'} backup saved to {filepath}")
            
            if not is_manual:
                # Retention cleanup (only for automatic backups)
                retention_str = settings_service.get_setting(db, "backup_auto_retention")
                retention = int(retention_str) if retention_str else 7
                cleanup_old_backups(retention)

    except Exception as e:
        logger.error(f"Error during automatic backup: {e}")

def get_last_auto_backup_timestamp():
    """Get the timestamp of the most recent automatic backup file"""
    try:
        if not os.path.exists(BACKUP_DIR):
            return 0
        
        backups = [f for f in os.listdir(BACKUP_DIR) if (f.startswith("vibe_backup_auto_") or f.startswith("vibenvr_auto_backup_")) and f.endswith(".json")]
        if not backups:
            return 0
            
        backups.sort()
        latest_file = backups[-1]
        
        # Files are named vibe_backup_auto_YYYYMMDD_HHMMSS.json
        return os.path.getmtime(os.path.join(BACKUP_DIR, latest_file))
    except Exception as e:
        logger.error(f"Error getting last backup timestamp: {e}")
        return 0

def cleanup_old_backups(retention: int):
    """Keep only the latest N backups in the backup directory"""
    try:
        if not os.path.exists(BACKUP_DIR):
            return

        # Support both new vibe_backup_auto_ and legacy vibenvr_auto_backup_
        backups = [f for f in os.listdir(BACKUP_DIR) if (f.startswith("vibe_backup_auto_") or f.startswith("vibenvr_auto_backup_")) and f.endswith(".json")]
        backups.sort() 

        if len(backups) > retention:
            to_delete = backups[:-retention]
            for b in to_delete:
                os.remove(os.path.join(BACKUP_DIR, b))
            logger.info(f"Deleted {len(to_delete)} old backups (Retention: {retention})")
    except Exception as e:
        logger.error(f"Error cleaning up old backups: {e}")

def backup_monitor_loop():
    """Background loop to run backups periodically"""
    is_first_check = True
    while True:
        try:
            # We check settings every iteration
            with database.get_db_ctx() as db:
                enabled = settings_service.get_setting(db, "backup_auto_enabled") == "true"
                frequency_hours_str = settings_service.get_setting(db, "backup_auto_frequency_hours")
                frequency_hours = int(frequency_hours_str) if frequency_hours_str else 24

            if not enabled:
                time.sleep(3600) # Check again in 1 hour if disabled
                continue

            if is_first_check:
                is_first_check = False
                last_ts = get_last_auto_backup_timestamp()
                if last_ts > 0:
                    elapsed_seconds = time.time() - last_ts
                    wait_needed = (frequency_hours * 3600) - elapsed_seconds
                    if wait_needed > 0:
                        logger.info(f"Startup: last auto backup was {elapsed_seconds/3600:.1f}h ago. Waiting {wait_needed/3600:.1f}h before next.")
                        time.sleep(wait_needed)
            
            run_backup()
            
            # Use a wait for the configured interval (converted to seconds)
            # We use at least 1 hour to prevent accidental high-frequency disk thrashing
            interval_seconds = max(1, frequency_hours) * 3600
            time.sleep(interval_seconds)
        except Exception as e:
            logger.error(f"Error in backup monitor loop: {e}")
            time.sleep(600) # Wait 10 mins on error

def start_scheduler():
    """Start the backup scheduler thread"""
    t = threading.Thread(target=backup_monitor_loop, daemon=True, name="BackupSchedulerThread")
    t.start()
    logger.info("Backup scheduler started.")
