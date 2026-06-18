from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
import asyncio
from pydantic import BaseModel, field_validator
from typing import Optional, List, Any
import logging
import psutil
import os
import time
from utils import mask_url

# 1. IMMEDIATE LOGGING CONFIGURATION
def setup_initial_logging():
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    
    # Configure Root Logger
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)
    else:
        for handler in root_logger.handlers:
            handler.setFormatter(formatter)
    root_logger.setLevel(logging.INFO)

    # Configure Uvicorn Loggers
    for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        u_logger = logging.getLogger(logger_name)
        u_logger.propagate = False
        if not u_logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(formatter)
            u_logger.addHandler(handler)
        else:
            for handler in u_logger.handlers:
                handler.setFormatter(formatter)

setup_initial_logging()

# Setup Logger custom level
VERBOSE_LEVEL = 5
logging.addLevelName(VERBOSE_LEVEL, "VERBOSE")
def verbose_log(self, message, *args, **kws):
    if self.isEnabledFor(VERBOSE_LEVEL):
        self._log(VERBOSE_LEVEL, message, args, **kws)
logging.Logger.verbose = verbose_log

class PollingSamplingFilter(logging.Filter):
    def __init__(self, name: str = "", sample_rate: int = 10):
        super().__init__(name)
        self.sample_rate = sample_rate
        self.counters = {}

    def filter(self, record):
        if hasattr(record, "args") and len(record.args) >= 5:
            method = record.args[1]
            path = record.args[2]
            status = record.args[4]
            if method == "GET" and status == 200 and (path == "/" or any(p in path for p in ["/stats", "/health", "/frame"])):
                count = self.counters.get(path, 0)
                self.counters[path] = (count + 1) % self.sample_rate
                return count == 0
        return True

class TokenRedactingFilter(logging.Filter):
    def filter(self, record):
        if isinstance(record.msg, str):
            record.msg = mask_url(record.msg)
        
        if hasattr(record, "args") and record.args:
            new_args = list(record.args)
            for i, arg in enumerate(new_args):
                if isinstance(arg, str):
                    new_args[i] = mask_url(arg)
            record.args = tuple(new_args)
        return True

def apply_logging_filters():
    redact_filter = TokenRedactingFilter()
    sampling_filter = PollingSamplingFilter()
    
    # Target loggers: root, uvicorn, and its sub-loggers
    target_loggers = ["", "uvicorn", "uvicorn.access", "uvicorn.error", "VibeEngine", "core", "camera_thread", "StreamReader"]
    
    for name in target_loggers:
        logger_obj = logging.getLogger(name)
        # 1. Add Filters to logger
        if not any(isinstance(f, TokenRedactingFilter) for f in logger_obj.filters):
            logger_obj.addFilter(redact_filter)
        if name == "uvicorn.access" and not any(isinstance(f, PollingSamplingFilter) for f in logger_obj.filters):
            logger_obj.addFilter(sampling_filter)
        
        # 2. Add to all existing handlers
        for handler in logger_obj.handlers:
            if not any(isinstance(f, TokenRedactingFilter) for f in handler.filters):
                handler.addFilter(redact_filter)
            if name == "uvicorn.access" and not any(isinstance(f, PollingSamplingFilter) for f in handler.filters):
                handler.addFilter(sampling_filter)

# Initial application
apply_logging_filters()

logger = logging.getLogger("VibeEngine")

# Global Engine Config (Synced from Backend)
GLOBAL_CONFIG = {
    "opt_verbose_engine_logs": False,
    "ai_enabled": False,
    "ai_model": "mobilenet_ssd_v2",
    "ai_hardware": "auto"
}

def set_engine_log_level(verbose: bool):
    """Dynamically adjust OpenCV and FFmpeg log levels"""
    level = "DEBUG" if verbose else "ERROR"
    os.environ["OPENCV_LOG_LEVEL"] = level
    os.environ["OPENCV_VIDEOIO_DEBUG"] = "1" if verbose else "0"
    os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "40" if verbose else "0" # 40 = Verbose in OpenCV FFmpeg
    
    # Also adjust our own logger and all related loggers
    target_level = logging.DEBUG if verbose else logging.INFO
    logger.setLevel(target_level)
    logging.getLogger("core").setLevel(target_level)
    logging.getLogger("camera_thread").setLevel(target_level)
    logging.getLogger("StreamReader").setLevel(target_level)
    
    # Try OpenCV dynamic log level if available
    try:
        import cv2
        # OpenCV levels: 0=SILENT, 1=FATAL, 2=ERROR, 3=WARNING, 4=INFO, 5=DEBUG, 6=VERBOSE
        cv_level = 6 if verbose else 2 
        cv2.setLogLevel(cv_level)
    except Exception:
        pass
    
    logger.info(f"Engine Log Level set to: {'VERBOSE' if verbose else 'NORMAL'}")

# Initialize default level
set_engine_log_level(False)

from core import manager
manager.global_config = GLOBAL_CONFIG
from ai_detector import AIDetector
AIDetector(config=GLOBAL_CONFIG)
from mqtt_service import mqtt_service

app = FastAPI(title="VibeEngine")

class CameraConfig(BaseModel):
    id: int
    name: str
    rtsp_url: str
    width: int = 1920
    height: int = 1080
    framerate: int = 15
    text_left: str = ""
    text_right: str = ""
    text_scale: float = 1.0
    rotation: int = 0
    recording_mode: str = "Off" # Off, Always, Motion Triggered
    picture_recording_mode: str = "Manual" # Manual, Motion Triggered
    threshold: int = 1500
    threshold_percent: float = 1.0
    motion_gap: int = 10
    pre_capture: int = 0
    post_capture: int = 0
    movie_quality: int = 75
    movie_passthrough: bool = True
    max_movie_length: int = 120  # Default 2 minutes (60-300 range)
    record_audio: bool = False
    movie_file_name: str = "%Y-%m-%d/%H-%M-%S"
    picture_quality: int = 75
    picture_file_name: str = "%Y-%m-%d/%H-%M-%S-%q"

    @field_validator('movie_file_name', 'picture_file_name')
    @classmethod
    def prevent_path_traversal(cls, v: str) -> str:
        if v and ('..' in v or v.strip().startswith('/') or v.strip().startswith('\\')):
             raise ValueError('Path traversal in filename is not allowed')
        return v
        
    @field_validator('rtsp_url')
    @classmethod
    def validate_url(cls, v: str) -> str:
        if v and v.strip().lower().startswith('file://'):
            raise ValueError('Local file access via file:// is not allowed')
        return v
    show_motion_box: bool = False
    min_motion_frames: int = 2
    auto_threshold_tuning: bool = True
    auto_noise_detection: bool = True
    light_switch_detection: int = 0
    despeckle_filter: bool = False
    mask: bool = False
    privacy_masks: Optional[str] = None
    motion_masks: Optional[str] = None
    create_debug_media: bool = False
    
    # PTZ Capabilities (Synced from Backend)
    ptz_can_pan_tilt: bool = True
    ptz_can_zoom: bool = True
    detect_motion_mode: str = "Always"
    detect_engine: str = "OpenCV"
    rtsp_transport: str = "tcp"
    sub_rtsp_url: Optional[str] = None
    sub_rtsp_transport: str = "tcp"
    live_view_mode: str = "auto"
    audio_enabled: bool = False
    enable_audio: bool = False
    # AI & Tracking
    ai_enabled: bool = False
    ai_object_types: List[str] = ["person", "vehicle"]
    ai_threshold: float = 0.5
    ai_tracking_enabled: bool = False
    
    @field_validator('ai_object_types', mode='before')
    @classmethod
    def validate_ai_object_types(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            import json
            try:
                data = json.loads(v)
                if isinstance(data, list):
                    return [str(item) for item in data]
            except:
                pass
        if isinstance(v, list):
            return [str(item) for item in v]
        return ["person", "vehicle"]


class EventTrigger(BaseModel):
    event_type: str = "motion"
    source: str = "external"

@app.get("/")
def health_check():
    return {"status": "running", "engine": "VibeEngine"}

@app.post("/config")
def update_config(config: dict):
    """Update global engine configuration from backend"""
    logger.info(f"Updating global config: {config}")
    
    # Track what changed for AI
    ai_enabled_changed = "ai_enabled" in config and config["ai_enabled"] != GLOBAL_CONFIG.get("ai_enabled")
    ai_model_changed = "ai_model" in config and config["ai_model"] != GLOBAL_CONFIG.get("ai_model")
    ai_hardware_changed = "ai_hardware" in config and config["ai_hardware"] != GLOBAL_CONFIG.get("ai_hardware")
    
    # 1. Update all dictionary values first
    for key, value in config.items():
        if key in GLOBAL_CONFIG:
            GLOBAL_CONFIG[key] = value
            manager.global_config[key] = value
            
            # Actionable settings that don't depend on other keys
            if key == "opt_verbose_engine_logs":
                set_engine_log_level(value)
        
        # Handle specialized config keys
        if "mqtt" in config:
            mqtt_service.update_config(config["mqtt"])

    # 2. Now apply AI changes with the fully updated config
    from ai_detector import AIDetector
    ai = AIDetector()
    
    # If it was just enabled/disabled, set_enabled will handle loading with the new model/hardware
    if ai_enabled_changed and hasattr(ai, 'set_enabled'):
        ai.set_enabled(GLOBAL_CONFIG["ai_enabled"])
    # If it was already enabled and stays enabled, but model or hardware changed, update them
    elif GLOBAL_CONFIG.get("ai_enabled"):
        if ai_model_changed and hasattr(ai, 'update_model'):
            ai.update_model(GLOBAL_CONFIG["ai_model"])
        if ai_hardware_changed and hasattr(ai, 'update_hardware'):
            ai.update_hardware(GLOBAL_CONFIG["ai_hardware"])
                
    return {"status": "success", "config": GLOBAL_CONFIG}

@app.get("/stats")
def get_stats():
    """Return CPU and memory usage for the engine process"""
    process = psutil.Process(os.getpid())
    
    # CPU percent (since last call or over interval)
    cpu_percent = process.cpu_percent(interval=0.1)
    
    # Memory info
    mem_info = process.memory_info()
    mem_mb = mem_info.rss / (1024 * 1024)
    
    # Count active camera threads
    active_cameras = len(manager.cameras)
    
    # Network stats (Global for container)
    net_io = psutil.net_io_counters()

    # AI status
    from ai_detector import AIDetector
    ai = AIDetector()

    return {
        "cpu_percent": round(cpu_percent, 1),
        "memory_mb": round(mem_mb, 1),
        "active_cameras": active_cameras,
        "network_recv": net_io.bytes_recv,
        "network_sent": net_io.bytes_sent,
        "hw_accel": os.environ.get("HW_ACCEL", "false").lower() == "true",
        "hw_accel_type": os.environ.get("HW_ACCEL_TYPE", "unknown"),
        "hw_accel_status": _get_hw_accel_status(os.environ.get("HW_ACCEL_TYPE", "unknown")),
        "mqtt_connected": mqtt_service.connected,
        "ai_status": {
            "initialized": ai._initialized,
            "hardware": ai.hardware,
            "model_type": ai.model_type,
            "last_inference_time": getattr(ai, "last_inference_time", 0),
            "inference_count": getattr(ai, "inference_count", 0),
            "last_inference_attempt": getattr(ai, "last_inference_attempt", 0)
        }
    }

_VAAPI_CACHE = None
def _check_vaapi_capabilities():
    """Check if VAAPI encoders are available via FFmpeg (cached)"""
    global _VAAPI_CACHE
    if _VAAPI_CACHE is not None:
        return _VAAPI_CACHE
        
    try:
        import subprocess
        from ai_detector import AIDetector
        ai_lock = AIDetector().inference_lock
        with ai_lock:
            result = subprocess.run(
                ['ffmpeg', '-hide_banner', '-encoders'],
                capture_output=True,
                text=True,
                timeout=2
            )
        output = result.stdout
        has_h264_vaapi = 'h264_vaapi' in output
        has_hevc_vaapi = 'hevc_vaapi' in output
        
        _VAAPI_CACHE = has_h264_vaapi or has_hevc_vaapi
        return _VAAPI_CACHE
    except Exception as e:
        logger.error(f"Failed to check VAAPI capabilities: {e}")
        return False

_PYAV_VAAPI_CACHE = None
def _pyav_supports_vaapi():
    global _PYAV_VAAPI_CACHE
    if _PYAV_VAAPI_CACHE is not None:
        return _PYAV_VAAPI_CACHE
    try:
        import av
        codec = av.codec.codec.Codec('h264', 'r')
        if hasattr(codec, 'hardware_configs'):
            _PYAV_VAAPI_CACHE = any('vaapi' in str(h.device_type).lower() for h in codec.hardware_configs)
        else:
            _PYAV_VAAPI_CACHE = 'h264_vaapi' in av.codecs_available or 'hevc_vaapi' in av.codecs_available
        return _PYAV_VAAPI_CACHE
    except Exception:
        return False

_PYAV_CUDA_CACHE = None
def _pyav_supports_cuda():
    global _PYAV_CUDA_CACHE
    if _PYAV_CUDA_CACHE is not None:
        return _PYAV_CUDA_CACHE
    try:
        import av
        codec = av.codec.codec.Codec('h264', 'r')
        if hasattr(codec, 'hardware_configs'):
            _PYAV_CUDA_CACHE = any('cuda' in str(h.device_type).lower() for h in codec.hardware_configs)
        else:
            _PYAV_CUDA_CACHE = 'h264_cuvid' in av.codecs_available or 'hevc_cuvid' in av.codecs_available
        return _PYAV_CUDA_CACHE
    except Exception:
        return False

def _check_nvidia_usage():
    """Helper to check NVIDIA GPU usage"""
    try:
        import subprocess
        from ai_detector import AIDetector
        ai_lock = AIDetector().inference_lock
        with ai_lock:
            res = subprocess.run(
                ["nvidia-smi", "--query-compute-apps=pid", "--format=csv,noheader"], 
                stdout=subprocess.PIPE, 
                stderr=subprocess.DEVNULL, # Suppress stderr (usually 'command not found')
                text=True
            )
        if res.returncode == 0:
            my_pid = str(os.getpid())
            # Check if our PID is in the list of processes using GPU
            pid_list = [p.strip() for p in res.stdout.split('\n') if p.strip()]
            if my_pid in pid_list:
                return True
    except Exception:
        pass
    return False

def _check_dri_usage():
    """Helper to check DRI (Intel/AMD) usage"""
    if not os.path.exists("/dev/dri"):
        # logger.info("HW Check: /dev/dri does not exist")
        return False
        
    try:
        # Check ALL open FDs for this process
        fds = os.listdir('/proc/self/fd')
        debug_fds = []
        for fd in fds:
            try:
                target = os.readlink(f'/proc/self/fd/{fd}')
                if target.startswith("/dev/"):
                    debug_fds.append(target)
                # Match any render node (renderD128, renderD129, etc) used by VAAPI/QSV
                if "render" in target and "/dev/dri" in target:
                    return True
            except:
                continue
        
        if debug_fds:
            logger.verbose(f"HW Check: No active DRI sessions. Current /dev FDs: {debug_fds}")
    except Exception as e:
        logger.error(f"HW Check DRI Error: {e}")
        pass
    return False

def _check_device_exists(accel_type):
    """Check if the hardware acceleration device exists and is supported.
    Returns: 'ok', 'error', or 'unsupported_backend'.
    """
    device_exists = False
    
    if accel_type in ["intel", "amd", "vaapi", "auto"]:
        device_exists = os.path.exists("/dev/dri")
        if device_exists:
            # Additional check: verify VAAPI encoders are available
            if not _check_vaapi_capabilities():
                logger.warning("HW Accel: /dev/dri exists but VAAPI encoders not available in FFmpeg")
                return "error"
            if not _pyav_supports_vaapi():
                logger.warning("HW Accel: /dev/dri exists but PyAV was built without VAAPI support")
                return "unsupported_backend"
    elif accel_type == "nvidia":
        try:
            import subprocess
            from ai_detector import AIDetector
            ai_lock = AIDetector().inference_lock
            with ai_lock:
                result = subprocess.run(["nvidia-smi"], capture_output=True, timeout=1)
            device_exists = result.returncode == 0
            if device_exists and not _pyav_supports_cuda():
                logger.warning("HW Accel: nvidia-smi succeeded but PyAV was built without CUDA/NVDEC support")
                return "unsupported_backend"
        except:
            device_exists = False
    
    if not device_exists:
        logger.warning(f"HW Accel: Device not found for type '{accel_type}'")
        return "error"

    return "ok"

def _get_hw_accel_status(accel_type):
    """Return HW accel status: 'disabled', 'ready', 'active', 'error', or 'unsupported_backend'"""
    if not os.environ.get("HW_ACCEL", "false").lower() == "true":
        return "disabled"

    accel_type = accel_type.lower()

    # 1. Check if device/driver exists
    status = _check_device_exists(accel_type)
    if status != "ok":
        return status
    
    # 2. Check if actively in use (file descriptors)
    actively_used = False
    
    if accel_type in ["intel", "amd", "vaapi", "auto"]:
        actively_used = _check_dri_usage()  # Existing FD check
    elif accel_type == "nvidia":
        actively_used = _check_nvidia_usage()
    
    if actively_used:
        logger.verbose("HW Accel Status: Active (GPU sessions detected)")
        return "active"
    else:
        logger.verbose("HW Accel Status: Ready (Idle, no active GPU sessions)")
        return "ready"

@app.post("/cameras/{camera_id}/start")
def start_camera(camera_id: int, config: CameraConfig):
    manager.start_camera(camera_id, config.model_dump())
    return {"status": "started", "camera_id": camera_id}

@app.post("/cameras/{camera_id}/stop")
def stop_camera(camera_id: int):
    manager.stop_camera(camera_id)
    return {"status": "stopped", "camera_id": camera_id}

@app.post("/cameras/stop-all")
def stop_all_cameras():
    manager.stop_all()
    return {"status": "all_stopped"}

@app.put("/cameras/{camera_id}/config")
def update_camera_config(camera_id: int, config: CameraConfig):
    manager.update_camera(camera_id, config.model_dump())
    return {"status": "updated", "camera_id": camera_id}

@app.post("/cameras/{camera_id}/trigger_event")
def trigger_event(camera_id: int, trigger: EventTrigger):
    """Inject an external event (e.g., from ONVIF) into the camera's processing pipeline."""
    success = manager.trigger_external_event(camera_id, trigger.event_type, trigger.source)
    if not success:
        raise HTTPException(status_code=404, detail="Camera not found or not active")
    return {"status": "triggered", "camera_id": camera_id, "type": trigger.event_type, "source": trigger.source}
    
@app.post("/cameras/{camera_id}/snapshot")
def take_snapshot(camera_id: int):
    path = manager.take_snapshot(camera_id)
    if not path:
        return {"status": "error", "message": "Snapshot failed or camera not running"}
    return {"status": "success", "path": path}

@app.get("/debug/status")
def debug_status():
    return manager.get_status()

@app.websocket("/cameras/{camera_id}/ws")
async def camera_ws_endpoint(websocket: WebSocket, camera_id: int):
    await websocket.accept()
    
    if camera_id not in manager.cameras:
        logger.warning(f"WS client connected for camera {camera_id} but it is not running.")
        await websocket.close()
        return

    cam_thread = manager.cameras[camera_id]
    
    if not hasattr(cam_thread, 'stream_reader') or not hasattr(cam_thread.stream_reader, 'add_ws_client'):
        logger.warning(f"WS client connected for camera {camera_id} but StreamReader doesn't support WebSockets.")
        await websocket.close()
        return

    # Buffer 120 packets (approx. 8 seconds at 15fps) before dropping
    q = asyncio.Queue(maxsize=120)
    loop = asyncio.get_running_loop()
    # Need to pass queue and loop to thread-safe set
    cam_thread.stream_reader.add_ws_client(q, loop)
    logger.info(f"WS client attached to camera {camera_id} stream.")

    try:
        while True:
            packet_bytes = await q.get()
            await websocket.send_bytes(packet_bytes)
    except WebSocketDisconnect:
        logger.info(f"WS client disconnected from camera {camera_id} stream.")
    except Exception as e:
        if "close" not in str(type(e)).lower():
            logger.error(f"WS connection error for camera {camera_id}: {e}")
    finally:
        cam_thread.stream_reader.remove_ws_client(q)

@app.get("/cameras/{camera_id}/frame")
def get_single_frame(camera_id: int, raw: bool = False):
    """Return a single JPEG frame (for polling mode, avoids MJPEG connection issues)"""
    from fastapi.responses import Response
    if raw:
        frame_bytes = manager.get_raw_frame(camera_id)
    else:
        frame_bytes = manager.get_frame(camera_id)
        
    if frame_bytes:
        return Response(content=frame_bytes, media_type="image/jpeg")
    else:
        # Check health status to return precise error
        # Access the camera thread directly from manager
        if hasattr(manager, 'cameras') and camera_id in manager.cameras:
            cam = manager.cameras[camera_id]
            # Use get_health() on stream_reader where the actual PyAV health lives
            if hasattr(cam, 'stream_reader') and hasattr(cam.stream_reader, 'get_health'):
                health = cam.stream_reader.get_health()
            elif hasattr(cam, 'get_health'):
                health = cam.get_health()
            else:
                health = "UNKNOWN"
            
            if health == "UNAUTHORIZED":
                raise HTTPException(status_code=401, detail="Unauthorized camera credentials")
                
        raise HTTPException(status_code=503, detail="Frame unavailable")

@app.get("/cameras/{camera_id}/stream")
def get_stream(camera_id: int):
    def frame_generator():
        wait_time = 0
        sleep_time = 0.05 # Default start value
        
        while True:
            t0 = time.time()
            frame_bytes = manager.get_frame(camera_id)
            
            if frame_bytes:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                wait_time = 0 # Reset wait on valid frame
            else:
                # If no frame (camera connecting), yield a placeholder (1x1 black pixel) 
                # to keep connection alive every 0.2s - Fast cleanup of zombie sockets
                wait_time += sleep_time
                if wait_time > 0.2:
                    # 1x1 black JPEG
                    placeholder = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x03\x02\x02\x03\x02\x02\x03\x03\x03\x03\x04\x06\x0b\x07\x06\x06\x06\x06\r\x0b\x0b\x08\x0b\x0c\r\x0f\x0e\x0e\x0c\x0c\x0c\r\x0f\x10\x12\x17\x15\x15\x15\x17\x11\x13\x19\x1b\x18\x15\x1a\x14\x11\x11\x14\x1b\x15\x18\x1a\x1d\x1d\x1e\x1e\x1e\x13\x17\x20!\x1f\x1d!\x19\x1e\x1e\x1d\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x03\x01\x22\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00?\x00\xbf\x00\xff\xd9'
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + placeholder + b'\r\n')
                    wait_time = 0
            
            # Simple throttle to max ~20 FPS...
            process_time = time.time() - t0
            sleep_time = max(0.01, 0.05 - process_time) 
            time.sleep(sleep_time)
                
    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

if __name__ == "__main__":
    import uvicorn
    
    # Custom log config to ensure uvicorn uses our date format
    log_config = uvicorn.config.LOGGING_CONFIG
    log_format = "%(asctime)s - %(levelname)s - %(message)s"
    log_config["formatters"]["access"]["fmt"] = log_format
    log_config["formatters"]["default"]["fmt"] = log_format
    log_config["formatters"]["access"]["datefmt"] = "%Y-%m-%d %H:%M:%S"
    log_config["formatters"]["default"]["datefmt"] = "%Y-%m-%d %H:%M:%S"

    # Listen on all interfaces
    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=log_config)  # nosec
