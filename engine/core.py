import logging
import requests
import os
from datetime import datetime
from camera_thread import CameraThread

logger = logging.getLogger(__name__)

# Backend URL for webhooks
BACKEND_URL = os.environ.get("BACKEND_URL", "http://vibenvr-backend:5000")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET")

def mask_config(config):
    """Hide sensitive data in camera config for logging"""
    if not isinstance(config, dict):
        return config
    masked = config.copy()
    if 'rtsp_url' in masked:
        import re
        # Mask rtsp://user:pass@host
        masked['rtsp_url'] = re.sub(r'(rtsp://)([^:]+):([^@]+)(@)', r'\1\2:****\4', masked['rtsp_url'])
    return masked

class CameraManager:
    def __init__(self):
        self.cameras = {} # id -> CameraThread

    def start_camera(self, camera_id: int, config: dict):
        if camera_id in self.cameras:
            name = config.get('name', 'Unknown')
            logger.info(f"Camera {name} (ID: {camera_id}) already running, updating config...")
            self.cameras[camera_id].update_config(config)
            return

        name = config.get('name', 'Unknown')
        logger.info(f"Starting camera {name} (ID: {camera_id}) with config: {mask_config(config)}")
        thread = CameraThread(camera_id, config, event_callback=self.handle_event)
        thread.start()
        self.cameras[camera_id] = thread

    def stop_camera(self, camera_id: int):
        if camera_id in self.cameras:
            name = self.cameras[camera_id].config.get('name', 'Unknown')
            logger.info(f"Stopping camera {name} (ID: {camera_id})")
            self.cameras[camera_id].stop()
            del self.cameras[camera_id]

    def update_camera(self, camera_id: int, config: dict):
        if camera_id in self.cameras:
            self.cameras[camera_id].update_config(config)
        else:
            self.start_camera(camera_id, config)

    def get_frame(self, camera_id: int):
        if camera_id in self.cameras:
            return self.cameras[camera_id].get_frame_bytes()
        return None

    def take_snapshot(self, camera_id: int):
        if camera_id in self.cameras:
            return self.cameras[camera_id].save_snapshot()
        return None

    def handle_event(self, camera_id, event_type, payload=None):
        """ Call backend webhooks """
        name = self.cameras[camera_id].config.get('name', 'Unknown') if camera_id in self.cameras else "Unknown"
        logger.info(f"Event {event_type} for camera {name} (ID: {camera_id})")
        
        # Map VibeEngine internal events to Backend Webhook types
        # backend/routers/events.py expects: "event_start", "movie_end", "picture_save"
        
        webhook_type = None
        data = {
            "camera_id": camera_id,
            "timestamp": datetime.now().astimezone().isoformat()
        }

        if event_type == "motion_start":
            # Map to specialized webhook types for reactive UI feedback
            webhook_type = "motion_on"
            if payload:
                if isinstance(payload, dict):
                    data["file_path"] = payload.get("file_path")
                else:
                    data["file_path"] = payload
            # Compatibility: Also trigger the legacy event_start for notifications
            self.handle_event(camera_id, "legacy_motion_start", payload)
        
        elif event_type == "legacy_motion_start":
            webhook_type = "event_start"
            if payload:
                if isinstance(payload, dict):
                    data["file_path"] = payload.get("file_path")
                else:
                    data["file_path"] = payload

        elif event_type == "motion_end":
            webhook_type = "motion_off"

        elif event_type == "recording_end":
            webhook_type = "movie_end"
            if payload:
                if isinstance(payload, dict):
                    data["file_path"] = payload.get("file_path")
                    data["width"] = payload.get("width")
                    data["height"] = payload.get("height")
                else:
                    data["file_path"] = payload # legacy string payload
        elif event_type == "snapshot_save":
            webhook_type = "picture_save"
            if payload:
                if isinstance(payload, dict):
                    data["file_path"] = payload.get("file_path")
                    data["width"] = payload.get("width")
                    data["height"] = payload.get("height")
                else:
                    data["file_path"] = payload # legacy string payload
        
        if not webhook_type:
            return

        data["type"] = webhook_type
        
        def send_webhook():
            try:
                url = f"{BACKEND_URL}/events/webhook"
                headers = {}
                if WEBHOOK_SECRET:
                    headers['X-Webhook-Secret'] = WEBHOOK_SECRET
                
                requests.post(url, json=data, timeout=5, headers=headers)
                logger.info(f"Sent webhook {webhook_type} to {url}")
            except Exception as e:
                logger.error(f"Failed to send webhook: {e}")

        # Send in background to avoid blocking camera thread
        import threading
        threading.Thread(target=send_webhook, daemon=True).start()

    def get_status(self):
        """Debug status of all cameras"""
        status = {}
        for cid, thread in self.cameras.items():
            cam_status = {
                "running": thread.is_alive(),
                "connected": thread.cap is not None and thread.cap.isOpened(),
                "rtsp_url": thread._mask_url(thread.config.get("rtsp_url")),
                "fps": thread.fps,
                "motion": thread.motion_detected,
                "recording": thread.is_recording,
                "last_frame_bytes": len(thread.latest_frame_jpeg) if thread.latest_frame_jpeg else 0
            }
            status[cid] = cam_status
        return status

manager = CameraManager()
