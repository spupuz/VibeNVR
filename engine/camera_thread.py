import time
import threading
import os
import logging
from datetime import datetime
from collections import deque
import cv2

from utils import mask_url
from stream_reader import StreamReader
from motion_detector import MotionDetector
from recording_manager import RecordingManager
from mask_handler import parse_polygons, apply_masks
from overlay_handler import draw_overlay

logger = logging.getLogger(__name__)

class CameraThread(threading.Thread):
    def __init__(self, camera_id, config, event_callback=None):
        super().__init__()
        self.camera_id = camera_id
        self.config = config
        self.event_callback = event_callback
        self.running = False
        
        # Modular Components
        self.stream_reader = StreamReader(
            self.camera_id, 
            self.config['rtsp_url'], 
            self.config.get('name', str(camera_id)), 
            event_callback=self.event_callback,
            rtsp_transport=self.config.get('rtsp_transport', 'tcp')
        )

        sub_url = self.config.get('sub_rtsp_url')
        self.sub_stream_reader = None
        if sub_url and isinstance(sub_url, str) and sub_url.strip():
            logger.info(f"Camera {self.camera_id}: Initializing Sub-Stream Reader")
            self.sub_stream_reader = StreamReader(
                f"{self.camera_id}_sub", 
                sub_url, 
                f"{self.config.get('name', str(camera_id))} (Sub)", 
                event_callback=self.event_callback,
                rtsp_transport=self.config.get('sub_rtsp_transport', 'tcp')
            )
        self.motion_detector = MotionDetector(self.camera_id, self.config.get('name', str(camera_id)), self.config)
        self.recording_manager = RecordingManager(self.camera_id, self.config.get('name', str(camera_id)), self.config)
        
        # Buffered results for UI
        self.latest_frame_jpeg = None
        self.latest_raw_frame_jpeg = None
        self.last_frame_update_time = 0.0
        self.lock = threading.Lock()
        
        # Shared processing state
        self.pre_buffer_counter = 0
        self.recording_start_time = 0.0
        self.fps = 0
        self.frame_count = 0
        self.last_fps_time = time.time()
        self.live_view_counter = 0
        self.last_processed_read_time = 0
        
        self.height = 0
        self.width = 0
        self.pre_buffer = deque(maxlen=self.config.get('pre_capture', 0) or 1)
        self.last_health_report_status = "STARTING"
        self.last_health_check_time = 0.0
        
        # Privacy & Motion Masks
        self.privacy_polygons = []
        self.motion_polygons = []
        self._update_masks()

    def _update_masks(self):
        self.privacy_polygons = parse_polygons(self.config.get('privacy_masks'), self.config.get('name'))
        self.motion_polygons = parse_polygons(self.config.get('motion_masks'), self.config.get('name'))
        if self.privacy_polygons and self.config.get('movie_passthrough'):
            logger.warning(f"Camera {self.config.get('name')}: Disabling passthrough (Privacy Masks Active)")
            self.config['movie_passthrough'] = False

    def _mask_url(self, text):
        """Compatibility wrapper for mask_url utility"""
        return mask_url(text)

    @property
    def motion_detected(self):
        return self.motion_detector.motion_detected

    @property
    def is_recording(self):
        return self.recording_manager.is_recording

    @property
    def passthrough_active(self):
        return self.recording_manager.passthrough_active

    def get_health(self):
        return self.stream_reader.get_health()

    def run(self):
        self.running = True
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Starting loop")
        self.stream_reader.start()
        if self.sub_stream_reader:
            self.sub_stream_reader.start()
        
        while self.running:
            loop_start_time = time.time()
            try:
                frame, read_time = self.stream_reader.get_latest()
                if frame is None or read_time == self.last_processed_read_time:
                    time.sleep(0.01)
                    continue
                
                self.last_processed_read_time = read_time
                frame = frame.copy()
                
                # Pre-processing (Resize/Rotate)
                target_w, target_h = self.config.get('width'), self.config.get('height')
                if target_w and target_h and (frame.shape[1] != target_w or frame.shape[0] != target_h):
                    frame = cv2.resize(frame, (target_w, target_h))

                rotation = self.config.get('rotation', 0)
                if rotation == 90: frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                elif rotation == 180: frame = cv2.rotate(frame, cv2.ROTATE_180)
                elif rotation == 270: frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)

                self.height, self.width = frame.shape[:2]
                self.live_view_counter += 1
                lv_throttle = max(1, self.config.get('opt_live_view_fps_throttle', 2))
                
                # Update Raw frames for UI Mask Editor
                if self.live_view_counter % lv_throttle == 0:
                    self._update_ui_frame(frame, is_raw=True)

                # Masking -> Motion -> Overlay
                apply_masks(frame, self.privacy_polygons, alpha=1.0, color=(0, 0, 0), camera_name=self.config.get('name'))
                motion_active = self.motion_detector.detect(
                    frame, self.event_callback, self.save_snapshot, 
                    self.privacy_polygons, self.motion_polygons, apply_masks
                )
                
                draw_overlay(frame, self.config)
                
                # Recording Management
                self.recording_manager.handle_recording(
                    frame, motion_active, self.motion_detector.last_motion_time, self.stop_recording
                )
                
                # Pre-capture buffer
                self._update_pre_buffer(frame)

                # Update Processed frames for UI Live View
                if self.live_view_counter % lv_throttle == 0:
                    self._update_ui_frame(frame)
                    # Sync health
                    if self.stream_reader.health_status != "CONNECTED":
                        with self.stream_reader.lock: self.stream_reader.health_status = "CONNECTED"
                
                # Metrics & Health
                self._update_metrics(loop_start_time)
                self._check_health()

            except Exception as e:
                logger.error(f"Loop error for {self.camera_id}: {e}")
                time.sleep(1)
                
        self.stream_reader.stop()
        self.stream_reader.join(timeout=1.0)
        if self.sub_stream_reader:
            self.sub_stream_reader.stop()
            self.sub_stream_reader.join(timeout=1.0)
        self.stop_recording()
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Stopped")

    def _update_ui_frame(self, frame, is_raw=False):
        try:
            target_frame = frame
            # Use Sub-Stream frame for the non-raw UI grid if available
            if not is_raw and self.sub_stream_reader:
                sub_frame, _ = self.sub_stream_reader.get_latest()
                if sub_frame is not None:
                    target_frame = sub_frame.copy()

            lv_max_h = self.config.get('opt_live_view_height_limit', 720)
            if target_frame.shape[0] > lv_max_h:
                scale = lv_max_h / target_frame.shape[0]
                target_frame = cv2.resize(target_frame, (int(target_frame.shape[1] * scale), lv_max_h), interpolation=cv2.INTER_NEAREST)
            
            lv_qual = self.config.get('opt_live_view_quality', 60)
            ret, jpeg = cv2.imencode('.jpg', target_frame, [int(cv2.IMWRITE_JPEG_QUALITY), lv_qual])
            if ret:
                with self.lock:
                    if is_raw: self.latest_raw_frame_jpeg = jpeg.tobytes()
                    else:
                        self.latest_frame_jpeg = jpeg.tobytes()
                        self.last_frame_update_time = time.time()
        except Exception as e:
            logger.error(f"UI Frame error: {e}")

    def _update_pre_buffer(self, frame):
        pre_cap_count = self.config.get('pre_capture', 0)
        throttle = max(1, int(self.config.get('opt_pre_capture_fps_throttle', 1)))
        
        effective_maxlen = pre_cap_count // throttle if pre_cap_count > 0 else 0
        if effective_maxlen > 0:
            if self.pre_buffer.maxlen != effective_maxlen:
                self.pre_buffer = deque(self.pre_buffer, maxlen=effective_maxlen)
            
            self.pre_buffer_counter += 1
            if self.pre_buffer_counter % throttle == 0:
                self.pre_buffer.append(frame.copy())

    def _update_metrics(self, loop_start_time):
        self.frame_count += 1
        if time.time() - self.last_fps_time >= 1.0:
            self.fps = self.frame_count
            self.frame_count = 0
            self.last_fps_time = time.time()
        
        target_fps = self.config.get('framerate', 30)
        if target_fps > 0:
            elapsed = time.time() - loop_start_time
            target_time = 1.0 / target_fps
            if elapsed < target_time: time.sleep(target_time - elapsed)

    def _check_health(self):
        if time.time() - self.last_health_check_time > 60.0:
            self.last_health_check_time = time.time()
            current_health = self.stream_reader.get_health()
            if current_health != self.last_health_report_status:
                self.last_health_report_status = current_health
                logger.info(f"Camera {self.config.get('name')}: Health -> {current_health}")
                # Health event logic could be moved to its own service, but keeping here for now as it's thin
                event_map = {
                    "UNAUTHORIZED": ("🚫 Camera Auth Failure", "Wrong Password"),
                    "UNREACHABLE": ("📡 Camera Offline", "Unreachable"),
                    "CONNECTED": ("✅ Camera Online", "Connection restored")
                }
                if current_health in event_map:
                    title, msg = event_map[current_health]
                    if self.event_callback:
                        self.event_callback(self.camera_id, 'health_status_changed', {"title": title, "message": msg, "new_status": current_health})

    def start_recording(self, width, height):
        # Delegate to manager, providing pre-buffer
        self.recording_manager.start_recording(width, height, list(self.pre_buffer), self.event_callback)
        self.pre_buffer.clear()

    def stop_recording(self):
        self.recording_manager.stop_recording(self.event_callback, self.width, self.height)

    def update_config(self, new_config):
        old_passthrough = self.config.get('movie_passthrough', False)
        old_masks = (self.config.get('privacy_masks', '[]'), self.config.get('motion_masks', '[]'))
        
        self.config.update(new_config)
        self.motion_detector.config = self.config
        self.recording_manager.config = self.config
        
        if old_masks != (self.config.get('privacy_masks', '[]'), self.config.get('motion_masks', '[]')):
            self._update_masks()
        
        if 'movie_passthrough' in new_config and old_passthrough != new_config['movie_passthrough']:
            self.recording_manager.passthrough_error_count = 0
            if self.recording_manager.is_recording and self.recording_manager.passthrough_active:
                self.stop_recording()
            self.recording_manager.passthrough_active = new_config['movie_passthrough']
            self.stream_reader.force_reconnect()
        
        if 'rtsp_url' in new_config:
            self.stream_reader.update_url(new_config['rtsp_url'])
            
        sub_url_changed = 'sub_rtsp_url' in new_config and self.config.get('sub_rtsp_url') != new_config.get('sub_rtsp_url')
        if sub_url_changed:
            sub_url = new_config.get('sub_rtsp_url')
            if self.sub_stream_reader:
                if not sub_url:
                    self.sub_stream_reader.stop()
                    self.sub_stream_reader = None
                else:
                    self.sub_stream_reader.update_url(sub_url)
            elif sub_url:
                self.sub_stream_reader = StreamReader(
                    f"{self.camera_id}_sub", 
                    sub_url, 
                    f"{self.config.get('name', str(self.camera_id))} (Sub)", 
                    event_callback=self.event_callback,
                    rtsp_transport=self.config.get('sub_rtsp_transport', 'tcp')
                )
                self.sub_stream_reader.start()

        pre_cap = self.config.get('pre_capture', 0)
        if pre_cap > 0 and self.pre_buffer.maxlen != pre_cap:
            self.pre_buffer = deque(self.pre_buffer, maxlen=pre_cap)
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Config updated")

    def stop(self):
        self.running = False
        self.join(timeout=2.0)

    def get_frame_bytes(self):
        with self.lock:
            if self.latest_frame_jpeg is None or time.time() - self.last_frame_update_time > 10:
                return None
            return self.latest_frame_jpeg

    def get_raw_frame_bytes(self):
        with self.lock: return self.latest_raw_frame_jpeg

    def save_snapshot(self, frame=None, is_temp=False):
        try:
            if frame is not None:
                snap_qual = self.config.get('opt_snapshot_quality', 90)
                ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), snap_qual])
                if not ret: return False
                jpeg_bytes = jpeg.tobytes()
            else:
                with self.lock:
                    if self.latest_frame_jpeg is None: return False
                    jpeg_bytes = self.latest_frame_jpeg

            format_str = self.config.get('picture_file_name', '%Y-%m-%d/%H-%M-%S-%q').replace('%q', '00')
            timestamp_path = datetime.now().strftime(format_str)
            
            output_dir = f"/var/lib/vibe/recordings/{'temp_snaps/' if is_temp else ''}{self.camera_id}"
            filepath = os.path.join(output_dir, f"{timestamp_path}.jpg")
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            
            with open(filepath, "wb") as f: f.write(jpeg_bytes)
            
            if not is_temp:
                logger.info(f"Camera {self.config.get('name')}: Snapshot saved to {filepath}")
                if self.event_callback:
                    self.event_callback(self.camera_id, "snapshot_save", {"file_path": filepath, "width": self.width, "height": self.height})
            return filepath
        except Exception as e:
            logger.error(f"Snapshot error for {self.camera_id}: {e}")
            return False
