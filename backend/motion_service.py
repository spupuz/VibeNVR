import os
import requests
import threading
import time
import threading
import time
from sqlalchemy.orm import Session
from models import Camera

# VibeEngine Control URL
ENGINE_BASE_URL = "http://engine:8000"

def camera_to_config(cam: Camera) -> dict:
    """ Convert DB Camera model to VibeEngine config dict """
    return {
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
        "pre_capture": cam.captured_before or 0,
        "post_capture": cam.captured_after or 0,
        "movie_quality": cam.movie_quality or 75,
        "movie_passthrough": cam.movie_passthrough if cam.movie_passthrough is not None else False,
        "max_movie_length": cam.max_movie_length or 0,
        "movie_file_name": cam.movie_file_name or "%Y-%m-%d/%H-%M-%S",
        "picture_quality": cam.picture_quality or 75,
        "picture_recording_mode": cam.picture_recording_mode or "Manual",
        "picture_file_name": cam.picture_file_name or "%Y-%m-%d/%H-%M-%S-%q",
        "show_motion_box": cam.show_frame_changes if cam.show_frame_changes is not None else True,
        "min_motion_frames": cam.min_motion_frames or 2,
        "despeckle_filter": cam.despeckle_filter if cam.despeckle_filter is not None else False,
        "detect_motion_mode": cam.detect_motion_mode or "Always"
    }

def generate_motion_config(db: Session):
    """
    Syncs all active cameras to VibeEngine.
    Renamed from 'generate' to keep compatibility with existing calls.
    Should be called on startup or global changes.
    """
    print("Syncing cameras to VibeEngine...", flush=True)
    cameras = db.query(Camera).filter(Camera.is_active == True).all()
    
    import time
    max_retries = 5
    for i in range(max_retries):
        try:
            # Check if engine is alive first
            requests.get(f"{ENGINE_BASE_URL}/", timeout=2)
            break
        except:
            if i == max_retries - 1:
                print("VibeEngine not reachable after multiple retries. Cameras will not start automatically.")
                return
            print(f"Waiting for VibeEngine... (Retry {i+1}/{max_retries})")
            time.sleep(5)

    # 1. Start/Update all active cameras
    active_ids = []
    for cam in cameras:
        active_ids.append(cam.id)
        config = camera_to_config(cam)
        try:
            resp = requests.post(f"{ENGINE_BASE_URL}/cameras/{cam.id}/start", json=config, timeout=5)
            if resp.status_code == 200:
                print(f"Synced camera {cam.id}", flush=True)
            else:
                print(f"Failed to sync camera {cam.id}: {resp.text}", flush=True)
        except Exception as e:
            print(f"Error syncing camera {cam.id}: {e}", flush=True)

    # 2. Stop cameras that shouldn't be running?
    # TODO: We might need a 'list_cameras' endpoint on Engine to know what to stop.
    # For now, we assume this is mostly called on startup.

def update_camera_runtime(camera: Camera):
    """
    Updates configuration for a single camera.
    Uses /start endpoint which handles update if camera is already running.
    """
    config = camera_to_config(camera)
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
