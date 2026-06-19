import requests
import threading
import time
import json
from typing import Any
from sqlalchemy.orm import Session, object_session
from models import Camera, SystemSettings

import logging

# VibeEngine Control URL
ENGINE_BASE_URL = "http://engine:8000"

# go2rtc stream gateway. It runs inside the engine container (started by
# engine/start.sh) and listens only on the internal docker network — no exposed
# ports. When the global 'go2rtc_enabled' setting is on, the engine reads each
# camera through go2rtc instead of talking to the camera directly. go2rtc
# absorbs flaky-camera quirks (broken bitstreams, slow handshakes, session
# limits). The engine consumes the restream over localhost within its own
# container.
GO2RTC_API_URL = "http://engine:1984"
GO2RTC_RTSP_HOST = "127.0.0.1:8554"

logger = logging.getLogger(__name__)


def go2rtc_stream_name(camera_id) -> str:
    """Stable go2rtc stream name for a camera (survives renames)."""
    return f"cam_{camera_id}"


def go2rtc_substream_name(camera_id) -> str:
    """Stable go2rtc stream name for a camera's low-res sub-stream.
    Registered separately so the engine can read it for AI inference while
    recording/live still use the full-resolution main stream."""
    return f"cam_{camera_id}_sub"

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
        # Handle PostgreSQL array syntax '{item1,item2}'
        if v_sanitized.startswith('{') and v_sanitized.endswith('}'):
            v_sanitized = v_sanitized[1:-1]
            
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
        "ai_enabled": False,
        "ai_model": "mobilenet_ssd_v2",
        "ai_hardware": "auto",
        "go2rtc_enabled": False
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
        
        # Also fetch ai_enabled, ai_model, ai_hardware and go2rtc_enabled separately (not opt_ keys)
        for key in ["ai_enabled", "ai_model", "ai_hardware", "go2rtc_enabled"]:
            setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
            if setting:
                if key in ("ai_enabled", "go2rtc_enabled"):
                    defaults[key] = setting.value.lower() == "true"
                else:
                    defaults[key] = setting.value
    except Exception as e:
        logger.error(f"Error reading optimization settings: {e}")
        
    return defaults

def _apply_go2rtc_routing(config: dict, cam: Camera, opt_settings: dict) -> None:
    """
    Applies go2rtc routing to the config if enabled.
    When enabled, the engine reads the camera through the internal go2rtc gateway
    instead of the camera directly. The real camera URL stays untouched.
    """
    if opt_settings.get("go2rtc_enabled"):
        stream = go2rtc_stream_name(cam.id)
        config["rtsp_url"] = f"rtsp://{GO2RTC_RTSP_HOST}/{stream}"
        # go2rtc republishes over TCP RTSP; force tcp for the engine hop.
        config["rtsp_transport"] = "tcp"
        # If the camera has a sub-stream, route it through go2rtc too (as a
        # separate proxied stream) so the engine keeps reading the low-res
        # sub-stream for AI inference instead of the camera directly. The
        # engine never reaches the camera — both hops stay inside go2rtc.
        # Without a sub-stream there is nothing to proxy, so drop it.
        if cam.sub_rtsp_url and cam.sub_rtsp_url.strip():
            sub_stream = go2rtc_substream_name(cam.id)
            config["sub_rtsp_url"] = f"rtsp://{GO2RTC_RTSP_HOST}/{sub_stream}"
            config["sub_rtsp_transport"] = "tcp"
        else:
            config["sub_rtsp_url"] = None


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

    _apply_go2rtc_routing(config, cam, opt_settings)

    return config

def generate_motion_config(db: Session):
    """
    Syncs all active cameras to VibeEngine.
    Renamed from 'generate' to keep compatibility with existing calls.
    Should be called on startup or global changes.
    """
    logger.info("Syncing cameras to VibeEngine...")
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
            logger.info(f"Waiting for VibeEngine... (Attempt {retry_count})")
            time.sleep(5)

    # Sync global config first
    sync_global_config(db)

    # Register camera streams in go2rtc (real URLs) before the engine connects
    # to the proxied streams. No-op when go2rtc is disabled.
    generate_go2rtc_config(db)

    # Fetch global optimizations once
    opt_settings = get_optimization_settings(db)
    logger.info(f"Applying optimizations: {opt_settings}")

    # 1. Start/Update all active cameras
    active_ids = []
    for cam in cameras:
        active_ids.append(cam.id)
        config = camera_to_config(cam, opt_settings)
        try:
            resp = requests.post(f"{ENGINE_BASE_URL}/cameras/{cam.id}/start", json=config, timeout=20)
            if resp.status_code == 200:
                logger.info(f"Synced camera {cam.id}")
            else:
                logger.error(f"Failed to sync camera {cam.id}: {resp.text}")
        except Exception as e:
            logger.error(f"Error syncing camera {cam.id}: {e}")

    # 2. Stop inactive cameras that might still be running in the engine
    # Fetch ALL cameras to find those that are i-active
    all_cams = db.query(Camera).all()
    logger.debug(f"Sync check: Found {len(all_cams)} total cameras in DB")
    for cam in all_cams:
        logger.debug(f"Sync check: Camera {cam.id} ({cam.name}) is_active={cam.is_active}")
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
        "ai_enabled": opt_settings.get("ai_enabled", False),
        "ai_model": opt_settings.get("ai_model", "mobilenet_ssd_v2"),
        "ai_hardware": opt_settings.get("ai_hardware", "auto"),
        "mqtt": mqtt_config
    }
    try:
        resp = requests.post(f"{ENGINE_BASE_URL}/config", json=payload, timeout=20)
        if resp.status_code == 200:
            logger.info("Successfully synced global config to VibeEngine")
            return True
        else:
            logger.error(f"Failed to sync global config: {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Error syncing global config: {e}")
        return False

def _go2rtc_put_one(name: str, src: str) -> bool:
    """Register/update a single named go2rtc stream from a source URL.
    Idempotent — go2rtc replaces the source if the stream name already exists."""
    # #timeout=15 makes go2rtc auto-reconnect if the source stops sending data.
    src_with_opts = f"{src}#timeout=15"
    try:
        # go2rtc's PUT /api/streams ADDS a source; calling it again for an
        # existing (especially actively-consumed) stream returns 400 and leaves
        # the old source in place. So we DELETE first (best-effort) to guarantee
        # the source is replaced when a camera's URL is edited. DELETE on a
        # non-existent stream is harmless (we ignore its result).
        # Note: go2rtc also validates the source on PUT and returns 400 if the
        # camera is unreachable at that moment — that's expected and just logged.
        try:
            requests.delete(f"{GO2RTC_API_URL}/api/streams", params={"name": name}, timeout=10)
        except Exception:
            pass
        resp = requests.put(
            f"{GO2RTC_API_URL}/api/streams",
            params={"name": name, "src": src_with_opts},
            timeout=10,
        )
        if resp.status_code in (200, 201):
            return True
        logger.error(f"go2rtc: failed to register stream {name}: {resp.status_code} {resp.text}")
        return False
    except Exception as e:
        logger.error(f"go2rtc: error registering stream {name}: {e}")
        return False


def _go2rtc_put_stream(camera) -> bool:
    """Register a camera's main stream — and its sub-stream, if any — in go2rtc.
    The sub-stream is published under a separate name so the engine can consume
    it for AI inference while the main stream serves recording and live view."""
    if not camera.rtsp_url:
        return False
    ok = _go2rtc_put_one(go2rtc_stream_name(camera.id), camera.rtsp_url)
    if camera.sub_rtsp_url and camera.sub_rtsp_url.strip():
        _go2rtc_put_one(go2rtc_substream_name(camera.id), camera.sub_rtsp_url.strip())
    return ok


def generate_go2rtc_config(db: Session):
    """Push all active cameras' real RTSP URLs into go2rtc as named streams.
    Called before syncing cameras to the engine so the proxied streams exist
    before the engine connects to them. No-op if go2rtc is disabled."""
    opt_settings = get_optimization_settings(db)
    if not opt_settings.get("go2rtc_enabled"):
        return

    # Wait for go2rtc to be reachable (it may still be starting).
    import time
    for attempt in range(1, 7):
        try:
            requests.get(f"{GO2RTC_API_URL}/api/streams", timeout=3)
            break
        except Exception:
            logger.info(f"Waiting for go2rtc gateway... (attempt {attempt})")
            time.sleep(5)

    cameras = db.query(Camera).filter(Camera.is_active == True).all()
    ok = 0
    for cam in cameras:
        if _go2rtc_put_stream(cam):
            ok += 1
    logger.info(f"go2rtc: registered {ok}/{len(cameras)} camera streams")


def stop_all_engines():
    """Stop all running camera threads in the engine"""
    try:
        requests.post(f"{ENGINE_BASE_URL}/cameras/stop-all", timeout=20)
        return True
    except Exception as e:
        logger.error(f"Failed to stop all cameras: {e}")
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

    # Keep go2rtc's stream for this camera in sync with the (possibly edited) real URL.
    # go2rtc won't replace a stream's source while it has an active consumer, so we
    # stop the engine camera first (releases the consumer), re-register the source,
    # then let the /start below reconnect. Brief recording gap on edit is acceptable.
    if opt_settings.get("go2rtc_enabled"):
        stop_camera(camera.id)
        _go2rtc_put_stream(camera)

    config = camera_to_config(camera, opt_settings)
    try:
        resp = requests.post(f"{ENGINE_BASE_URL}/cameras/{camera.id}/start", json=config, timeout=20)
        if resp.status_code == 200:
            logger.info(f"Updated camera {camera.id} config")
            return True
        else:
            logger.error(f"Failed to update camera {camera.id}: {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Error updating camera {camera.id}: {e}")
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
        resp = requests.post(url, timeout=20)
        if resp.status_code == 200:
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to trigger snapshot for camera {camera_id}: {e}")
        return False

def stop_camera(camera_id: int):
    """Stop a camera in VibeEngine and clear its motion state"""
    try:
        url = f"{ENGINE_BASE_URL}/cameras/{camera_id}/stop"
        requests.post(url, timeout=20)
        logger.info(f"Stopped camera {camera_id}")
        
        # Instantly clear stale motion and health state in backend
        try:
            from routers.events import LIVE_MOTION
            from health_service import HEALTH_CACHE
            LIVE_MOTION.pop(camera_id, None)
            HEALTH_CACHE.pop(camera_id, None)
        except Exception:
            pass
            
        return True
    except Exception as e:
        logger.error(f"Error stopping camera {camera_id}: {e}")
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
