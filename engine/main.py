from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, field_validator
import logging
import sys
import psutil
import os
from core import manager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', stream=sys.stdout)
logger = logging.getLogger("VibeEngine")

app = FastAPI(title="VibeEngine")

class CameraConfig(BaseModel):
    rtsp_url: str
    name: str = "Camera"
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
    create_debug_media: bool = False

@app.get("/")
def health_check():
    return {"status": "running", "engine": "VibeEngine"}

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

    return {
        "cpu_percent": round(cpu_percent, 1),
        "memory_mb": round(mem_mb, 1),
        "active_cameras": active_cameras,
        "network_recv": net_io.bytes_recv,
        "network_sent": net_io.bytes_sent
    }

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
def update_config(camera_id: int, config: CameraConfig):
    manager.update_camera(camera_id, config.model_dump())
    return {"status": "updated", "camera_id": camera_id}
    
@app.post("/cameras/{camera_id}/snapshot")
def take_snapshot(camera_id: int):
    path = manager.take_snapshot(camera_id)
    if not path:
        return {"status": "error", "message": "Snapshot failed or camera not running"}
    return {"status": "success", "path": path}

@app.get("/debug/status")
def debug_status():
    return manager.get_status()

@app.get("/cameras/{camera_id}/frame")
def get_single_frame(camera_id: int):
    """Return a single JPEG frame (for polling mode, avoids MJPEG connection issues)"""
    from fastapi.responses import Response
    frame_bytes = manager.get_frame(camera_id)
    if frame_bytes:
        return Response(content=frame_bytes, media_type="image/jpeg")
    else:
        # Return 1x1 black pixel if no frame available
        placeholder = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x03\x02\x02\x03\x02\x02\x03\x03\x03\x03\x04\x06\x0b\x07\x06\x06\x06\x06\r\x0b\x0b\x08\x0b\x0c\r\x0f\x0e\x0e\x0c\x0c\x0c\r\x0f\x10\x12\x17\x15\x15\x15\x17\x11\x13\x19\x1b\x18\x15\x1a\x14\x11\x11\x14\x1b\x15\x18\x1a\x1d\x1d\x1e\x1e\x1e\x13\x17 !\x1f\x1d!\x19\x1e\x1e\x1d\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x03\x01"\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00?\x00\xbf\x00\xff\xd9'
        return Response(content=placeholder, media_type="image/jpeg")

@app.get("/cameras/{camera_id}/stream")
def get_stream(camera_id: int):
    def frame_generator():
        import time
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
    # Listen on all interfaces
    uvicorn.run(app, host="0.0.0.0", port=8000)
