import os
import requests
import threading
import time
import json
from typing import Any
from sqlalchemy.orm import Session, object_session
from models import Camera, SystemSettings

# VibeEngine Control URL
ENGINE_BASE_URL = "http://engine:8000"

# Global lock for camera synchronization
sync_lock = threading.Lock()

def _parse_ai_object_types(v: Any) -> list[str]:
    if v is None:
        return ["person", "vehicle"]
    
    if isinstance(v, list):
        return [str(item) for item in v]
        
    if isinstance(v, str):
        v_sanitized = v.strip()
        if not v_sanitized or v_sanitized == "[]":
            return []
            
        try:
            data = json.loads(v_sanitized)
            if isinstance(data, list):
                return [str(item) for item in data]
        except:
            try:
                data = json.loads(v_sanitized.replace("'", '"'))
                if isinstance(data, list):
                    return [str(item) for item in data]
            except:
                pass
        
        if "," in v_sanitized:
            return [item.strip() for item in v_sanitized.split(",") if item.strip()]
        return [v_sanitized]

    return ["person", "vehicle"]

def get_optimization_settings(db: Session) -> dict:
    """Read optimization settings from DB with defaults (if not initialized yet)"""
    # Defaults must match routers/settings.py
    defaults = {
        "opt_live_view_fps_throttle": 2,
        "opt_motion_fps_throttle": 3,
        "opt_live_view_height_limit": 720,
        "opt_motion_analysis_height": 180,
        "opt_live_view_quality": 60,
        "opt_snapshot_quality": 90,
        "opt_ffmpeg_preset": "ultrafast",
        "opt_pre_capture_fps_throttle": 1,
        "opt_verbose_engine_logs": False,
        "ai_model": "mobilenet_ssd_v2",
        "ai_hardware": "auto"
    }
    
    try:
        settings = db.query(SystemSettings).filter(SystemSettings.key.startswith("opt_")).all()
        for s in settings:
            # Most are integers, preset is string, some are boolean
            if s.key == "opt_ffmpeg_preset":
                defaults[s.key] = s.value
            elif s.key == "opt_verbose_engine_logs":
                defaults[s.key] = s.value.lower() == "true"
            else:
                try:
                    defaults[s.key] = int(s.value)
                except:
                    pass # Keep default if invalid
        
        # Also fetch ai_model and ai_hardware separately (not opt_ keys)
        for key in ["ai_model", "ai_hardware"]:
            setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
            if setting:
                defaults[key] = setting.value
    except Exception as e:
        print(f"Error reading optimization settings: {e}")
        
    return defaults

def camera_to_config(cam: Camera, opt_settings: dict = None) -> dict:
    """ Convert DB Camera model to VibeEngine config dict """
    if opt_settings is None:
        opt_settings = {}
        
    config = {
        "id": cam.id,
        "rtsp_url": cam.rtsp_url,
        "name": cam.name,
        "width": cam.resolution_width or 1920, # Fallback if 0/None
        "height": cam.resolution_height or 1080,
        "framerate": cam.framerate or 15,
        "text_left": cam.text_left or "",
        "text_right": cam.text_right or "",
        "text_scale": cam.text_scale or 1.0,
        "rotation": cam.rotation or 0,
        "recording_mode": cam.recording_mode,
        "threshold": cam.threshold or 1500,
        "motion_gap": cam.motion_gap or 10,
        "pre_capture": (cam.captured_before or 0) * (cam.framerate or 15),
        "post_capture": cam.captured_after or 0,
        "movie_quality": cam.movie_quality or 75,
        "movie_passthrough": cam.movie_passthrough if cam.movie_passthrough is not None else False,
        "max_movie_length": cam.max_movie_length or 0,
        "record_audio": cam.record_audio if cam.record_audio is not None else False,
        "movie_file_name": cam.movie_file_name or "%Y-%m-%d/%H-%M-%S",
        "picture_quality": cam.picture_quality or 75,
        "picture_recording_mode": cam.picture_recording_mode or "Manual",
        "picture_file_name": cam.picture_file_name or "%Y-%m-%d/%H-%M-%S-%q",
        "show_motion_box": False, # Disabled as requested by user
        "min_motion_frames": cam.min_motion_frames or 2,
        "despeckle_filter": cam.despeckle_filter if cam.despeckle_filter is not None else False,
        "detect_motion_mode": cam.detect_motion_mode if cam.detect_motion_mode not in (None, 'Off', '') else "Always",
        "detect_engine": cam.detect_engine or "OpenCV",
        "privacy_masks": cam.privacy_masks,
        "motion_masks": cam.motion_masks,
        "ptz_can_pan_tilt": cam.ptz_can_pan_tilt if cam.ptz_can_pan_tilt is not None else True,
        "ptz_can_zoom": cam.ptz_can_zoom if cam.ptz_can_zoom is not None else True,
        "rtsp_transport": cam.rtsp_transport or "tcp",
        "sub_rtsp_transport": cam.sub_rtsp_transport or "tcp",
        "live_view_mode": cam.live_view_mode or "auto",
        "audio_enabled": cam.audio_enabled if cam.audio_enabled is not None else False,
        "enable_audio": cam.enable_audio if cam.enable_audio is not None else False,
        "storage_path": cam.storage_profile.path if cam.storage_profile else "/var/lib/vibe/recordings",
        # AI & Tracking
        "ai_enabled": cam.ai_enabled if cam.ai_enabled is not None else False,
        "ai_object_types": _parse_ai_object_types(cam.ai_object_types),
        "ai_threshold": cam.ai_threshold if cam.ai_threshold is not None else 0.5,
        "ai_tracking_enabled": cam.ai_tracking_enabled if cam.ai_tracking_enabled is not None else False
    }
    
    # Inject Global Optimizations
    # These keys must match what engine/camera_thread.py expects
    config.update(opt_settings)
    
    return config

def generate_motion_config(db: Session):
    """
    Syncs all active cameras to VibeEngine.
    Renamed from 'generate' to keep compatibility with existing calls.
    Should be called on startup or global changes.
    """
    print("Syncing cameras to VibeEngine...", flush=True)
    cameras = db.query(Camera).filter(Camera.is_active == True).all()
    
    # Check for engine availability
    import time
    retry_count = 0
    while True:
        try:
            # Check if engine is alive first
            requests.get(f"{ENGINE_BASE_URL}/", timeout=2)
            break
        except:
            retry_count += 1
            print(f"Waiting for VibeEngine... (Attempt {retry_count})", flush=True)
            time.sleep(5)

    # Sync global config first
    sync_global_config(db)

    # Fetch global optimizations once
    opt_settings = get_optimization_settings(db)
    print(f"Applying optimizations: {opt_settings}", flush=True)

    # 1. Start/Update all active cameras
    active_ids = []
    for cam in cameras:
        active_ids.append(cam.id)
        config = camera_to_config(cam, opt_settings)
        try:
            resp = requests.post(f"{ENGINE_BASE_URL}/cameras/{cam.id}/start", json=config, timeout=5)
            if resp.status_code == 200:
                print(f"Synced camera {cam.id}", flush=True)
            else:
                print(f"Failed to sync camera {cam.id}: {resp.text}", flush=True)
        except Exception as e:
            print(f"Error syncing camera {cam.id}: {e}", flush=True)

    # 2. Stop inactive cameras that might still be running in the engine
    # Fetch ALL cameras to find those that are i-active
    all_cams = db.query(Camera).all()
    print(f"Sync check: Found {len(all_cams)} total cameras in DB", flush=True)
    for cam in all_cams:
        print(f"Sync check: Camera {cam.id} ({cam.name}) is_active={cam.is_active}", flush=True)
        if not cam.is_active:
             # Try to stop it just in case
             stop_camera(cam.id)

def sync_global_config(db: Session):
    """Sync global optimization and MQTT settings to VibeEngine config endpoint"""
    opt_settings = get_optimization_settings(db)
    
    # Fetch MQTT Settings
    mqtt_keys = ["mqtt_enabled", "mqtt_host", "mqtt_port", "mqtt_username", "mqtt_password", "mqtt_topic_prefix"]
    mqtt_config = {}
    for key in mqtt_keys:
        setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        if setting:
            if key == "mqtt_enabled":
                mqtt_config[key] = setting.value.lower() == "true"
            elif key == "mqtt_port":
                try: mqtt_config[key] = int(setting.value)
                except: mqtt_config[key] = 1883
            else:
                mqtt_config[key] = setting.value
        else:
            # Fallback to defaults
            if key == "mqtt_enabled": mqtt_config[key] = False
            elif key == "mqtt_port": mqtt_config[key] = 1883
            elif key == "mqtt_topic_prefix": mqtt_config[key] = "vibenvr"
            else: mqtt_config[key] = ""

    payload = {
        "opt_verbose_engine_logs": opt_settings.get("opt_verbose_engine_logs", False),
        "ai_model": opt_settings.get("ai_model", "mobilenet_ssd_v2"),
        "ai_hardware": opt_settings.get("ai_hardware", "auto"),
        "mqtt": mqtt_config
    }
    try:
        resp = requests.post(f"{ENGINE_BASE_URL}/config", json=payload, timeout=5)
        if resp.status_code == 200:
            print("Successfully synced global config to VibeEngine", flush=True)
            return True
        else:
            print(f"Failed to sync global config: {resp.text}", flush=True)
            return False
    except Exception as e:
        print(f"Error syncing global config: {e}", flush=True)
        return False

def stop_all_engines():
    """Stop all running camera threads in the engine"""
    try:
        requests.post(f"{ENGINE_BASE_URL}/cameras/stop-all", timeout=5)
        return True
    except Exception as e:
        print(f"Failed to stop all cameras: {e}")
        return False

def update_camera_runtime(camera: Camera):
    """
    Updates configuration for a single camera.
    Uses /start endpoint which handles update if camera is already running.
    """
    opt_settings = {}
    try:
        db = object_session(camera)
        if db:
            opt_settings = get_optimization_settings(db)
    except Exception:
        pass # Fallback to defaults or nothing
        
    config = camera_to_config(camera, opt_settings)
    try:
        resp = requests.post(f"{ENGINE_BASE_URL}/cameras/{camera.id}/start", json=config, timeout=5)
        if resp.status_code == 200:
            print(f"Updated camera {camera.id} config", flush=True)
            return True
        else:
            print(f"Failed to update camera {camera.id}: {resp.text}", flush=True)
            return False
    except Exception as e:
        print(f"Error updating camera {camera.id}: {e}", flush=True)
        return False

def toggle_recording_mode(camera_id: int, camera: Camera):
    """
    Update recording mode via config update.
    """
    return update_camera_runtime(camera)

def trigger_snapshot(camera_id: int):
    """Trigger a snapshot in VibeEngine"""
    try:
        url = f"{ENGINE_BASE_URL}/cameras/{camera_id}/snapshot"
        resp = requests.post(url, timeout=5)
        if resp.status_code == 200:
            return True
        return False
    except Exception as e:
        print(f"Failed to trigger snapshot for camera {camera_id}: {e}")
        return False

def stop_camera(camera_id: int):
    """Stop a camera in VibeEngine"""
    try:
        url = f"{ENGINE_BASE_URL}/cameras/{camera_id}/stop"
        requests.post(url, timeout=5)
        print(f"Stopped camera {camera_id}", flush=True)
        return True
    except Exception as e:
        print(f"Error stopping camera {camera_id}: {e}", flush=True)
        return False

def start_check_loop():
    """
    Background loop to check backend/engine health or other periodic tasks.
    Currently just a placeholder for future monitoring features if needed.
    """
    def _loop():
        # placeholder loop
        while True:
            time.sleep(60)

    t = threading.Thread(target=_loop, daemon=True, name="MotionCheckThread")
    t.start()
