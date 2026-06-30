from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, selectinload
from typing import Optional
from slowapi import Limiter
from slowapi.util import get_remote_address
import database
import models
import schemas
import auth_service
import json
import time
import logging
import datetime
import motion_service
import backup_service
import requests
import os
import telemetry_service
import settings_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])
limiter = Limiter(key_func=get_remote_address)

@router.post("/telemetry/report")
def manual_telemetry_report(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Trigger a manual telemetry report (Admin only)"""
    status_code = telemetry_service.send_telemetry()
    return {"status": "ok" if status_code == 200 else "error"}

def get_setting(db: Session, key: str) -> Optional[str]:
    return settings_service.get_setting(db, key)


# Validation Constants
VALID_FFMPEG_PRESETS = {
    "ultrafast", "superfast", "veryfast", "faster", "fast", 
    "medium", "slow", "slower", "veryslow"
}

def validate_setting(key: str, value: str):
    settings_service.validate_setting(key, value)

def set_setting(db: Session, key: str, value: str, description: str = None):
    return settings_service.set_setting(db, key, value, description)

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
    if key == "go2rtc_enabled":
        # Toggling the gateway changes every camera's effective URL, so restart
        # all camera threads and do a full re-sync (also (de)registers go2rtc streams).
        motion_service.stop_all_engines()
        motion_service.generate_motion_config(db)
    elif key.startswith("opt_") or key.startswith("mqtt_") or key.startswith("ai_"):
        motion_service.sync_global_config(db)
    return {"key": setting.key, "value": setting.value, "description": setting.description}

@router.post("/bulk")
def update_bulk_settings(settings: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Update multiple settings at once"""
    # Detect an actual change of the go2rtc toggle (not merely its presence in
    # the payload) so we only restart cameras when the gateway is flipped.
    go2rtc_changed = False
    if "go2rtc_enabled" in settings:
        existing = db.query(models.SystemSettings).filter(models.SystemSettings.key == "go2rtc_enabled").first()
        old_val = (existing.value if existing else "false").lower() == "true"
        new_val = str(settings["go2rtc_enabled"]).lower() == "true"
        go2rtc_changed = old_val != new_val

    for key, value in settings.items():
        # Validation for known numeric keys
        numeric_keys = [
            "max_global_storage_gb", "cleanup_interval_hours", 
            "backup_auto_frequency_hours", "backup_auto_retention",
            "opt_live_view_fps_throttle", "opt_motion_fps_throttle",
            "opt_live_view_height_limit", "opt_motion_analysis_height",
            "opt_live_view_quality", "opt_snapshot_quality"
        ]
        if key in numeric_keys:
            try:
                # Value might be string, int, or float from JSON
                val_num = float(value)
                if val_num < 0:
                     raise HTTPException(status_code=400, detail=f"Value for {key} must be non-negative")
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail=f"Value for {key} must be a number")

        set_setting(db, key, str(value))
    
    # A go2rtc toggle changes every camera's effective URL → full restart + re-sync.
    if go2rtc_changed:
        motion_service.stop_all_engines()
        motion_service.generate_motion_config(db)
    # Otherwise sync global config if any opt_, mqtt_, or ai_ settings were updated
    elif any(k.startswith("opt_") or k.startswith("mqtt_") or k.startswith("ai_") for k in settings.keys()):
        motion_service.sync_global_config(db)

    return {"message": "Settings updated successfully", "count": len(settings)}

@router.post("/cleanup")
def trigger_cleanup(camera_id: int = None, media_type: str = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Manually trigger storage cleanup"""
    from storage_service import run_cleanup, cleanup_camera
    
    if camera_id:
        camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
        if not camera:
            return {"error": "Camera not found"}, 404
        cleanup_camera(db, camera, media_type=media_type)
        return {"message": f"Cleanup for camera {camera.name} triggered successfully"}
    
    run_cleanup()
    return {"message": "Global storage cleanup triggered successfully"}

@router.get("/engine/debug-status")
def get_engine_debug_status(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Proxy to engine's debug status for diagnostics and testing (Admin only)"""
    try:
        resp = requests.get("http://engine:8000/debug/status", timeout=5)
        if resp.status_code != 200:
             raise HTTPException(status_code=resp.status_code, detail=f"Engine returned error: {resp.text}")
        return resp.json()
    except requests.exceptions.RequestException as e:
        logging.error(f"Engine Debug Proxy Error: {e}")
        raise HTTPException(status_code=503, detail=f"Engine unreachable: {str(e)}")

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
    "smtp_verify_cert": {"value": "true", "description": "Verify SMTP Server Certificate (SSL/TLS)"},
    "telegram_bot_token": {"value": "", "description": "Telegram Bot Token for global notifications"},
    "telegram_chat_id": {"value": "", "description": "Telegram Chat ID for global notifications"},
    "telegram_proxy_enabled": {"value": "false", "description": "Enable SOCKS/HTTPS Proxy for Telegram"},
    "telegram_proxy_url": {"value": "", "description": "Telegram Proxy URL (e.g. socks5://user:pass@host:port)"},
    "telegram_proxy_retries": {"value": "3", "description": "Maximum retries if proxy fails"},
    "telegram_proxy_retry_delay": {"value": "2", "description": "Seconds to wait between retries"},
    "notify_email_recipient": {"value": "", "description": "Default recipient for email notifications"},
    "notify_webhook_url": {"value": "", "description": "Global Webhook URL for notifications"},
    "default_landing_page": {"value": "live", "description": "Default page when opening the app (dashboard, timeline, live)"},
    
    # AI Detection Settings
    "ai_enabled": {"value": "false", "description": "Enable Global AI Detection Engine"},
    "ai_model": {"value": "mobilenet_ssd_v2", "description": "Global AI Model architecture (mobilenet_ssd_v2, yolo_v8)"},
    "ai_hardware": {"value": "auto", "description": "Global AI Hardware Accelerator (auto, cpu, tpu)"},

    # go2rtc Stream Gateway
    "go2rtc_enabled": {"value": "false", "description": "Route all cameras through the internal go2rtc gateway for stability with flaky cameras (no exposed ports)"},

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
    "opt_verbose_engine_logs": {"value": "false", "description": "Enable verbose logs from PyAV/FFmpeg in the engine"},
    "telemetry_enabled": {"value": "true", "description": "Enable anonymous telemetry to help improve VibeNVR"},
    "instance_id": {"value": "", "description": "Unique anonymous ID for this VibeNVR instance"},
    "default_live_view_mode": {"value": "auto", "description": "Default streaming mode for new cameras (auto, webcodecs, mjpeg)"},
    
    # Automatic Backup Settings
    "backup_auto_enabled": {"value": "false", "description": "Enable automatic configuration backups to /data/backups/"},
    "backup_auto_frequency_hours": {"value": "24", "description": "Frequency in hours for automatic backups"},
    "backup_auto_retention": {"value": "7", "description": "Number of backup files to retain in the folder"},

    # MQTT Settings
    "mqtt_enabled": {"value": "false", "description": "Enable internal MQTT Service for Home Assistant integration"},
    "mqtt_host": {"value": "", "description": "MQTT Broker Host (e.g. 192.168.1.50)"},
    "mqtt_port": {"value": "1883", "description": "MQTT Broker Port (default 1883)"},
    "mqtt_username": {"value": "", "description": "MQTT Username (optional)"},
    "mqtt_password": {"value": "", "description": "MQTT Password (optional)"},
    "mqtt_topic_prefix": {"value": "vibenvr", "description": "MQTT Topic Prefix (default: vibenvr)"},
}

@router.post("/init-defaults")
def init_default_settings(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Initialize default settings if they don't exist"""
    created = 0
    logger.info("Checking system settings initialization...")
    for key, data in DEFAULT_SETTINGS.items():
        existing = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
        if not existing:
            logger.info(f"Initializing missing setting: {key} = {data['value']}")
            set_setting(db, key, data["value"], data["description"])
            created += 1
    
    if created > 0:
        logger.info(f"Successfully initialized {created} default settings.")
    return {"message": f"Initialized {created} default settings"}

# -----------------------------------------------------------------------------
# BACKUP & RESTORE
# -----------------------------------------------------------------------------

def _generate_backup_data(db: Session) -> dict:
    """Helper to generate backup data from the database."""
    return {
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
            "avatar_path": u.avatar_path,
            "restrict_camera_access": u.restrict_camera_access,
            "allowed_camera_ids": [c.id for c in u.allowed_cameras],
            "allowed_group_ids": [g.id for g in u.allowed_groups]
        } for u in db.query(models.User).options(selectinload(models.User.allowed_cameras), selectinload(models.User.allowed_groups)).all()],
        "api_tokens": [{
            "name": t.name,
            "token_hash": t.token_hash,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
            "is_active": t.is_active,
            "username": t.created_by.username if t.created_by else None
        } for t in db.query(models.ApiToken).options(selectinload(models.ApiToken.created_by)).all()],
        "recovery_codes": [{
            "username": r.user.username,
            "code_hash": r.code_hash,
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in db.query(models.RecoveryCode).options(selectinload(models.RecoveryCode.user)).all()],
        "trusted_devices": [{
            "username": d.user.username,
            "token": d.token,
            "name": d.name,
            "last_used": d.last_used.isoformat() if d.last_used else None,
            "expires_at": d.expires_at.isoformat() if d.expires_at else None,
            "created_at": d.created_at.isoformat() if d.created_at else None
        } for d in db.query(models.TrustedDevice).options(selectinload(models.TrustedDevice.user)).all()]
    }

@router.get("/backup/export")
@limiter.limit("5/minute")
def export_backup(request: Request, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Export configuration to JSON"""
    data = _generate_backup_data(db)
    
    filename = f"vibenvr_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

async def perform_restore(data: dict, db: Session):
    """Core logic to restore system state from a JSON dictionary"""
    if not isinstance(data, dict) or "cameras" not in data:
        raise HTTPException(status_code=400, detail="Invalid backup file format")

    # 1. Restore Settings
    if "settings" in data:
        for s in data["settings"]:
            existing = db.query(models.SystemSettings).filter(models.SystemSettings.key == s["key"]).first()
            
            if s["key"].startswith("opt_") or s["key"].startswith("mqtt_"):
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
    
    # 2. Restore Storage Profiles
    profile_id_map = {} 
    if "storage_profiles" in data:
        for p in data["storage_profiles"]:
            backup_p_id = p.get("id")
            existing_p = db.query(models.StorageProfile).filter(models.StorageProfile.name == p.get("name")).first()
            if not existing_p:
                existing_p = models.StorageProfile()
                db.add(existing_p)
            
            for k, v in p.items():
                if k == "id": continue
                if hasattr(existing_p, k):
                    setattr(existing_p, k, v)
            
            db.flush()
            profile_id_map[backup_p_id] = existing_p.id

    # 3. Restore Cameras
    cam_id_map = {} 
    from urllib.parse import urlparse
    def get_host(url):
        try:
            if not url: return None
            if "://" not in url: url = "rtsp://" + url
            return urlparse(url).hostname
        except: return None

    if "cameras" in data:
        for c in data["cameras"]:
            backup_id = c.get("id")
            rtsp_url = c.get("rtsp_url")
            cam_host = get_host(rtsp_url)
            
            existing_cam = db.query(models.Camera).filter(models.Camera.id == backup_id).first()
            if not existing_cam and cam_host:
                all_cams = db.query(models.Camera).all()
                existing_cam = next((cam for cam in all_cams if get_host(cam.rtsp_url) == cam_host), None)
            
            if not existing_cam:
                id_conflict = db.query(models.Camera).filter(models.Camera.id == backup_id).first()
                existing_cam = models.Camera() if id_conflict else models.Camera(id=backup_id)
                db.add(existing_cam)
            
            try:
                cam_data = {k: v for k, v in c.items() if k not in ['id', 'events', 'groups', 'last_frame_path', 'last_thumbnail_path']}
                clean_cam = schemas.CameraCreate(**cam_data)
                
                for k, v in clean_cam.model_dump(exclude_unset=True).items():
                     if k == "storage_profile_id" and v in profile_id_map:
                         setattr(existing_cam, k, profile_id_map[v])
                     elif hasattr(existing_cam, k):
                         setattr(existing_cam, k, v)
                
                db.flush() 
                cam_id_map[backup_id] = existing_cam.id
            except Exception as e:
                 logging.warning(f"[BACKUP] Security Warning: Skipping invalid camera config for ID {backup_id}: {e}")
                 continue

    # 4. Restore Groups
    grp_id_map = {} 
    if "groups" in data:
        for g in data["groups"]:
            backup_grp_id = g.get("id")
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
        for a in data["associations"]:
             new_cam_id = cam_id_map.get(a.get("camera_id"))
             new_grp_id = grp_id_map.get(a.get("group_id"))
             if new_cam_id and new_grp_id:
                 exists = db.query(models.CameraGroupAssociation).filter_by(
                     camera_id=new_cam_id, group_id=new_grp_id
                 ).first()
                 if not exists:
                     db.add(models.CameraGroupAssociation(camera_id=new_cam_id, group_id=new_grp_id))

    # 6. Restore Users
    if "users" in data:
        for u in data["users"]:
            existing_user = db.query(models.User).filter(models.User.username == u["username"]).first()
            if not existing_user:
                new_user = models.User(
                    username=u["username"],
                    email=u.get("email"),
                    hashed_password=u["hashed_password"],
                    role=u.get("role", "viewer"),
                    is_2fa_enabled=u.get("is_2fa_enabled", False),
                    totp_secret=u.get("totp_secret"),
                    avatar_path=u.get("avatar_path"),
                    restrict_camera_access=u.get("restrict_camera_access", False)
                )
                if "allowed_camera_ids" in u:
                    mapped_cam_ids = [cam_id_map.get(cid, cid) for cid in u["allowed_camera_ids"]]
                    new_user.allowed_cameras = db.query(models.Camera).filter(models.Camera.id.in_(mapped_cam_ids)).all()
                if "allowed_group_ids" in u:
                    mapped_grp_ids = [grp_id_map.get(gid, gid) for gid in u["allowed_group_ids"]]
                    new_user.allowed_groups = db.query(models.CameraGroup).filter(models.CameraGroup.id.in_(mapped_grp_ids)).all()
                db.add(new_user)
            else:
                existing_user.role = u.get("role", existing_user.role)
                existing_user.email = u.get("email", existing_user.email)
                if "restrict_camera_access" in u:
                    existing_user.restrict_camera_access = u.get("restrict_camera_access")
                if "allowed_camera_ids" in u:
                    mapped_cam_ids = [cam_id_map.get(cid, cid) for cid in u["allowed_camera_ids"]]
                    existing_user.allowed_cameras = db.query(models.Camera).filter(models.Camera.id.in_(mapped_cam_ids)).all()
                if "allowed_group_ids" in u:
                    mapped_grp_ids = [grp_id_map.get(gid, gid) for gid in u["allowed_group_ids"]]
                    existing_user.allowed_groups = db.query(models.CameraGroup).filter(models.CameraGroup.id.in_(mapped_grp_ids)).all()
    
    # 7. Restore API Tokens
    if "api_tokens" in data:
        for t in data["api_tokens"]:
            username = t.get("username")
            if not username: continue
            
            user = db.query(models.User).filter(models.User.username == username).first()
            if user:
                # Check if token hash already exists
                existing_token = db.query(models.ApiToken).filter(models.ApiToken.token_hash == t["token_hash"]).first()
                if not existing_token:
                    from datetime import datetime
                    def parse_dt(dt_str):
                        return datetime.fromisoformat(dt_str) if dt_str else None
                    
                    new_token = models.ApiToken(
                        name=t["name"],
                        token_hash=t["token_hash"],
                        created_at=parse_dt(t.get("created_at")),
                        last_used_at=parse_dt(t.get("last_used_at")),
                        expires_at=parse_dt(t.get("expires_at")),
                        is_active=t.get("is_active", True),
                        created_by_user_id=user.id
                    )
                    db.add(new_token)

    # 8. Restore Recovery Codes
    if "recovery_codes" in data:
        for r in data["recovery_codes"]:
            username = r.get("username")
            if not username: continue
            
            user = db.query(models.User).filter(models.User.username == username).first()
            if user:
                # Check if code hash already exists for this user
                existing_code = db.query(models.RecoveryCode).filter(
                    models.RecoveryCode.user_id == user.id,
                    models.RecoveryCode.code_hash == r["code_hash"]
                ).first()
                if not existing_code:
                    from datetime import datetime
                    new_code = models.RecoveryCode(
                        user_id=user.id,
                        code_hash=r["code_hash"],
                        created_at=datetime.fromisoformat(r["created_at"]) if r.get("created_at") else None
                    )
                    db.add(new_code)
    
    # 9. Restore Trusted Devices
    if "trusted_devices" in data:
        for d in data["trusted_devices"]:
            username = d.get("username")
            if not username: continue
            
            user = db.query(models.User).filter(models.User.username == username).first()
            if user:
                # Check if device token hash already exists for this user
                existing_device = db.query(models.TrustedDevice).filter(
                    models.TrustedDevice.user_id == user.id,
                    models.TrustedDevice.token == d["token"]
                ).first()
                if not existing_device:
                    from datetime import datetime
                    def parse_dt(dt_str):
                        return datetime.fromisoformat(dt_str) if dt_str else None
                    
                    new_device = models.TrustedDevice(
                        user_id=user.id,
                        token=d["token"],
                        name=d.get("name"),
                        last_used=parse_dt(d.get("last_used")),
                        expires_at=parse_dt(d.get("expires_at")),
                        created_at=parse_dt(d.get("created_at"))
                    )
                    db.add(new_device)
    
    db.commit()
    return {"message": "Configuration restored successfully"}

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
        return await perform_restore(data, db)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        db.rollback()
        logging.error(f"Import failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/backup/list")
def list_backups(current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """List available backup files on the server"""
    if not os.path.exists(backup_service.BACKUP_DIR):
        return []
    
    files = []
    for f in os.listdir(backup_service.BACKUP_DIR):
        if f.endswith(".json"):
            path = os.path.join(backup_service.BACKUP_DIR, f)
            stats = os.stat(path)
            files.append({
                "filename": f,
                "size": stats.st_size,
                "created_at": datetime.datetime.fromtimestamp(stats.st_ctime).isoformat()
            })
    
    # Sort descending
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return files

@router.post("/backup/run")
def manual_backup(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Manually trigger a system backup"""
    backup_service.run_backup(is_manual=True)
    return {"message": "Manual backup completed successfully"}

@router.delete("/backup/{filename}")
def delete_backup(filename: str, current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Delete a specific backup file"""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    path = os.path.join(backup_service.BACKUP_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
        return {"message": f"Backup {filename} deleted"}
    else:
        raise HTTPException(status_code=404, detail="Backup not found")

@router.post("/backup/restore-file/{filename}")
async def restore_backup_from_file(filename: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Restore system configuration from a file on the server"""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    path = os.path.join(backup_service.BACKUP_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Backup file not found")
    
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return await perform_restore(data, db)
    except Exception as e:
        db.rollback()
        logging.error(f"Restore from file failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
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
    global _last_orphan_sync_time
    
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
        try:
            import sync_recordings
            print(f"[Admin] User {current_user.username} triggered orphan sync (Background Task Started)", flush=True)
            stats = sync_recordings.sync_recordings(dry_run=False)
            
            _sync_state["result"] = stats
            _sync_state["status"] = "completed"
            
            if "error" in stats: # Check if script returned error dict
                 _sync_state["status"] = "error"

            print("[Admin] Orphan sync background task finished.", flush=True)
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
            smtp_verify_cert = str(get_conf("smtp_verify_cert")).lower() != "false"
            
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
                    server.ehlo()
                    if server.has_extn('starttls'):
                        import ssl
                        context = ssl.create_default_context()
                        if not smtp_verify_cert:
                            context.check_hostname = False
                            context.verify_mode = ssl.CERT_NONE
                        server.starttls(context=context)
                        server.ehlo()
                
                with server:
                    if smtp_user and smtp_pass:
                        try:
                            server.login(smtp_user, smtp_pass)
                        except smtplib.SMTPAuthenticationError:
                            raise ValueError("Authentication failed: Incorrect Username or Password.")
                    
                    server.send_message(msg)
            except smtplib.SMTPException as e:
                 raise ValueError(f"SMTP Error: {str(e)}")
            except (socket.timeout, ConnectionRefusedError, OSError) as e:
                 raise ValueError(f"Connection failed: Unable to connect to {smtp_server}:{smtp_port}. ({str(e)})")
                 
            return {"status": "success", "message": f"Test email sent to {recipient}"}
            
        elif channel == "telegram":
            token = get_conf("telegram_bot_token")
            chat_id = settings.get("telegram_chat_id") or get_conf("telegram_chat_id")
            
            proxy_enabled = settings.get("telegram_proxy_enabled")
            if proxy_enabled is None:
                proxy_enabled = str(get_conf("telegram_proxy_enabled")).lower() == "true"
            else:
                proxy_enabled = str(proxy_enabled).lower() == "true"
            
            proxy_url = settings.get("telegram_proxy_url")
            if proxy_url is None:
                proxy_url = get_conf("telegram_proxy_url")
            
            if not token or not chat_id:
                raise ValueError("Missing Telegram Token or Chat ID. Configure them in Global Settings first.")
                
            api_url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": "🔔 VibeNVR Test Notification\n\nSucccess! Your Telegram bot is configured correctly."
            }
            
            proxies = None
            if proxy_enabled and proxy_url:
                proxies = {"http": proxy_url, "https": proxy_url}
            
            retries = int(settings.get("telegram_proxy_retries", get_conf("telegram_proxy_retries")) or 3)
            delay = int(settings.get("telegram_proxy_retry_delay", get_conf("telegram_proxy_retry_delay")) or 2)
            
            last_err = None
            import time
            for attempt in range(max(1, retries)):
                try:
                    resp = requests.post(api_url, json=payload, proxies=proxies, timeout=10)
                    if not resp.ok:
                        raise ValueError(f"Telegram API Error: {resp.text}")
                    return {"status": "success", "message": "Test Telegram message sent"}
                except Exception as e:
                    last_err = e
                    if attempt < max(1, retries) - 1:
                        logger.warning(f"Telegram Test attempt {attempt+1} failed, retrying in {delay}s...")
                        time.sleep(delay)
            
            raise ValueError(str(last_err))
            
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
