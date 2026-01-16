import os
import requests
from sqlalchemy.orm import Session
from models import Camera

MOTION_CONFIG_DIR = "/etc/motion/conf.d"
MOTION_CONTROL_URL = "http://vibenvr-motion:8080/0/action/restart"

def generate_motion_config(db: Session):
    cameras = db.query(Camera).filter(Camera.is_active == True).all()
    
    # clear existing configs ?? maybe dangerous if manual files exist.
    # checking if dir exists
    if not os.path.exists(MOTION_CONFIG_DIR):
        os.makedirs(MOTION_CONFIG_DIR)

    # Clean old configs? 
    # For now, let's just write over them. Ideally we should clean up deleted cameras.
    # Simple strategy: Delete all .conf files in that dir that match our pattern before writing.
    for f in os.listdir(MOTION_CONFIG_DIR):
        if f.endswith(".conf"):
            os.remove(os.path.join(MOTION_CONFIG_DIR, f))

    for cam in cameras:
        config_content = f"""
# Camera {cam.id}: {cam.name}
camera_id {cam.id}
camera_name {cam.name}
netcam_url {cam.rtsp_url}
rtsp_uses_tcp on
netcam_tolerant_check on

# Video Settings
width {cam.resolution_width}
height {cam.resolution_height}
framerate {cam.framerate}
rotate {cam.rotation}

# Text Overlay
text_left {cam.text_left}
text_right {cam.text_right}
text_scale {cam.text_scale}

# Storage
target_dir /var/lib/motion/Camera{cam.id}
movie_filename {cam.movie_file_name if cam.movie_file_name else '%Y-%m-%d/%H-%M-%S'}
picture_filename {cam.picture_file_name if cam.picture_file_name else '%Y-%m-%d/%H-%M-%S-%q'}

# Recording Configuration
movie_output {'on' if cam.recording_mode != 'Off' else 'off'}
movie_passthrough off
movie_codec mp4
movie_ext .mp4
movie_quality {cam.movie_quality if cam.movie_quality else 75}
picture_quality {cam.picture_quality if cam.picture_quality else 75}
movie_max_time {(cam.max_movie_length if cam.max_movie_length > 0 else 600) if cam.recording_mode in ['Continuous', 'Always'] else (cam.max_movie_length if cam.max_movie_length else 0)}
picture_output {'on' if cam.picture_recording_mode == 'Motion Triggered' else 'off'}
emulate_motion {'on' if cam.recording_mode in ['Continuous', 'Always'] else 'off'}

# Motion Detection
threshold {cam.threshold if cam.threshold else 1500}
threshold_tune {'on' if cam.auto_threshold_tuning else 'off'}
noise_tune {'on' if cam.auto_noise_detection else 'off'}
lightswitch_percent {cam.light_switch_detection}
{'despeckle_filter EedDl' if cam.despeckle_filter else '# despeckle_filter off'}
minimum_motion_frames {cam.min_motion_frames}
pre_capture {cam.captured_before}
post_capture {cam.captured_after}
event_gap {cam.motion_gap}

# Debug/Development
{'locate_motion_mode on' if cam.show_frame_changes else 'locate_motion_mode off'}

# Streaming
stream_port {cam.stream_port if cam.stream_port else 8100 + cam.id}
stream_quality {cam.stream_quality}
stream_maxrate {cam.stream_max_rate}
stream_localhost off

# Events & Webhooks (Calling Backend)
on_event_start /etc/motion/webhook.sh {cam.id} event_start "" "%Y-%m-%dT%H:%M:%S"
on_movie_end /etc/motion/webhook.sh {cam.id} movie_end %f "%Y-%m-%dT%H:%M:%S"
on_picture_save /etc/motion/webhook.sh {cam.id} picture_save %f "%Y-%m-%dT%H:%M:%S"


"""
        # Save to file
        file_path = os.path.join(MOTION_CONFIG_DIR, f"camera_{cam.id}.conf")
        with open(file_path, "w") as f:
            f.write(config_content)
    
    # Reload Motion
    try:
        requests.get(MOTION_CONTROL_URL, timeout=2)
        print("Motion reloaded successfully.")

    except Exception as e:
        print(f"Failed to reload Motion: {e}")

def trigger_snapshot(camera_id: int):
    """
    Triggers a snapshot for the specific camera via Motion's WebControl port.
    """
    url = f"http://vibenvr-motion:8080/{camera_id}/action/snapshot"
    try:
        resp = requests.get(url, timeout=2)
        if resp.status_code == 200:
            print(f"Snapshot triggered for camera {camera_id}")
            return True
        else:
            print(f"Failed to trigger snapshot for camera {camera_id}: {resp.status_code}")
            return False
    except Exception as e:
        print(f"Error triggering snapshot for camera {camera_id}: {e}")
        return False

def toggle_recording_mode(camera_id: int, camera: Camera):
    """
    Toggle recording mode for a specific camera.
    For 'Always' mode: Uses eventstart to trigger immediate recording.
    For 'Motion Triggered': Uses eventend to stop forced recording.
    This avoids full Motion restart by using runtime API instead of config changes.
    """
    if camera.recording_mode in ['Continuous', 'Always']:
        # Start an event to trigger recording
        url = f"http://vibenvr-motion:8080/{camera_id}/action/eventstart"
        action = "eventstart (start continuous recording)"
    else:
        # End the forced event, return to motion-triggered
        url = f"http://vibenvr-motion:8080/{camera_id}/action/eventend"
        action = "eventend (return to motion triggered)"
    
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            print(f"Camera {camera_id}: {action} successful", flush=True)
            return True
        else:
            print(f"Camera {camera_id}: {action} failed - {resp.status_code}", flush=True)
            return False
    except Exception as e:
        print(f"Camera {camera_id}: {action} error - {e}", flush=True)
        return False


