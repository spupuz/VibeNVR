import os
import platform
import uuid
import requests
import logging
import threading
import time
from sqlalchemy.orm import Session
import database
import models
import json
import psutil

logger = logging.getLogger(__name__)

def get_system_info():
    # Gather CPU and RAM info
    cpu_count = psutil.cpu_count(logical=True)
    ram_gb = round(psutil.virtual_memory().total / (1024**3))
    
    # Extract precise processor model (platform.processor() can be empty on Linux)
    processor = platform.processor()
    if not processor and platform.system() == "Linux":
        try:
            with open("/proc/cpuinfo", "r") as f:
                for line in f:
                    if line.strip().startswith("model name"):
                        processor = line.split(":", 1)[1].strip()
                        break
        except Exception:
            pass
    
    if not processor:
        processor = "unknown"
        
    # Check for Hardware Acceleration settings
    # Since telemetry runs in the backend but HW_ACCEL is defined in the engine,
    # we try to fetch the real status from the engine API.
    hw_accel = False
    hw_type = "unknown"
    try:
        # Internal engine stats endpoint
        resp = requests.get("http://engine:8000/stats", timeout=2)
        if resp.ok:
            data = resp.json()
            # We mark as active if the engine reports 'ready' (available) or 'active' (in use)
            hw_accel = data.get("hw_accel_status") in ["ready", "active"]
            hw_type = data.get("hw_accel_type", "unknown")
    except Exception:
        # Fallback to backend env (usually false)
        hw_accel = os.environ.get("HW_ACCEL", "false").lower() == "true"
        hw_type = os.environ.get("HW_ACCEL_TYPE", "none")
    
    return {
        "os": platform.system(),
        "arch": platform.machine(),
        "release": platform.release(),
        "processor": processor,
        "cpu_count": cpu_count,
        "ram_gb": ram_gb,
        "gpu_active": hw_accel,
        "gpu_type": hw_type
    }

def get_app_version():
    try:
        # Try to read from package.json in the parent dir (backend)
        base_dir = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(base_dir, "package.json"), "r") as f:
            data = json.load(f)
            return data.get("version", "unknown")
    except:
        return "unknown"

def gather_metrics(db: Session):
    try:
        camera_count = db.query(models.Camera).count()
        user_count = db.query(models.User).count()
        group_count = db.query(models.CameraGroup).count()
        event_count = db.query(models.Event).count()
        
        # Check if notifications are enabled (simplified)
        notifications_enabled = db.query(models.Camera).filter(
            (models.Camera.notify_telegram_token != None) | 
            (models.Camera.notify_email_address != None) |
            (models.Camera.notify_webhook_url != None)
        ).count() > 0

        # New metrics
        mqtt_enabled_setting = db.query(models.SystemSettings).filter_by(key="mqtt_enabled").first()
        mqtt_active = mqtt_enabled_setting.value.lower() == "true" if mqtt_enabled_setting and mqtt_enabled_setting.value else False

        motion_opencv = db.query(models.Camera).filter(models.Camera.detect_engine == "OpenCV").count()
        motion_onvif = db.query(models.Camera).filter(models.Camera.detect_engine == "ONVIF Edge").count()
        # More robust match for AI engine (handles "AI", "ai", or full descriptive strings)
        motion_ai_engine = db.query(models.Camera).filter(models.Camera.detect_engine.ilike("%AI%")).count()
        motion_ai = db.query(models.Camera).filter(models.Camera.ai_enabled == True).count()
        
        onvif_count = db.query(models.Camera).filter(models.Camera.onvif_host != None).count()
        substream_count = db.query(models.Camera).filter(models.Camera.sub_rtsp_url != None).count()

        return {
            "cameras": camera_count,
            "users": user_count,
            "groups": group_count,
            "events": event_count,
            "notifications": notifications_enabled,
            "mqtt_active": mqtt_active,
            "motion_opencv": motion_opencv,
            "motion_onvif": motion_onvif,
            "motion_ai_engine": motion_ai_engine,
            "motion_ai": motion_ai,
            "onvif_count": onvif_count,
            "substream_count": substream_count
        }
    except Exception as e:
        logger.error(f"Error gathering telemetry metrics: {e}")
        return {
            "cameras": 0, "users": 0, "groups": 0, "events": 0, "notifications": False,
            "mqtt_active": False, "motion_opencv": 0, "motion_onvif": 0, "motion_ai_engine": 0, "motion_ai": 0,
            "onvif_count": 0, "substream_count": 0
        }

def send_telemetry():
    with database.get_db_ctx() as db:
        # Check if telemetry is enabled
        enabled = db.query(models.SystemSettings).filter_by(key="telemetry_enabled").first()
        if not enabled or enabled.value.lower() != "true":
            logger.info("Telemetry is disabled, skipping.")
            return

        # Get or generate instance_id
        instance_id_setting = db.query(models.SystemSettings).filter_by(key="instance_id").first()
        if not instance_id_setting or not instance_id_setting.value:
            new_id = str(uuid.uuid4())
            if not instance_id_setting:
                instance_id_setting = models.SystemSettings(key="instance_id", value=new_id, description="Unique anonymous ID")
                db.add(instance_id_setting)
            else:
                instance_id_setting.value = new_id
            db.commit()
            instance_id = new_id
        else:
            instance_id = instance_id_setting.value

        metrics = gather_metrics(db)
        sys_info = get_system_info()
        version = get_app_version()

        # VibeNVR Telemetry Worker (Cloudflare) - Primary endpoint
        # Default URL points to the Cloudflare Worker which securely captures metrics
        # without logging any IP address. Override via CLOUDFLARE_TELEMETRY_URL env var.
        cf_telemetry_url = os.environ.get(
            "CLOUDFLARE_TELEMETRY_URL",
            "https://vibenvr-telemetry.spupuz.workers.dev/telemetry.png"
        )
        
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            
            payload = {
                "instance_id": instance_id,
                "version": version,
                "os": sys_info["os"],
                "arch": sys_info["arch"],
                "cpu": sys_info["cpu_count"],
                "cpu_model": sys_info["processor"],
                "ram": sys_info["ram_gb"],
                "gpu": sys_info["gpu_active"],
                "cameras": metrics["cameras"],
                "groups": metrics["groups"],
                "events": metrics["events"],
                "notifications": metrics["notifications"],
                "mqtt_active": metrics["mqtt_active"],
                "motion_opencv": metrics.get("motion_opencv", 0),
                "motion_onvif": metrics.get("motion_onvif", 0),
                "motion_ai_engine": metrics.get("motion_ai_engine", 0),
                "motion_ai": metrics.get("motion_ai", 0),
                "onvif_count": metrics["onvif_count"],
                "substream_count": metrics["substream_count"]
            }
            
            logger.info(f"Reporting telemetry: {payload}")
            
            # --- Primary: Cloudflare Analytics Worker ---
            try:
                cf_response = requests.get(cf_telemetry_url, params=payload, headers=headers, timeout=10)
                if cf_response.ok:
                    logger.info(f"Telemetry sent to Cloudflare Worker (Status: {cf_response.status_code})")
                else:
                    logger.warning(f"Cloudflare Worker returned status: {cf_response.status_code}")
            except Exception as cf_err:
                logger.error(f"Failed to send telemetry to Cloudflare: {cf_err}")


            
            return 200
            
        except Exception as e:
            logger.error(f"Failed to send telemetry: {e}")
            return 500

def telemetry_scheduler():
    # Run once shortly after startup
    time.sleep(30)
    while True:
        try:
            send_telemetry()
        except Exception as e:
            logger.error(f"Error in telemetry scheduler: {e}")
        
        # Run once every 24 hours
        time.sleep(86400)

def start_telemetry():
    thread = threading.Thread(target=telemetry_scheduler, daemon=True, name="Telemetry")
    thread.start()
