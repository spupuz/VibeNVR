import cv2
import time
import threading
import queue
import subprocess
import os
import numpy as np
import logging
from datetime import datetime
from collections import deque
import re

logger = logging.getLogger(__name__)

class StreamReader(threading.Thread):
    """
    Dedicated thread for reading frames from RTSP stream.
    This ensures the buffer is constantly drained and we always 
    have the latest frame, preventing "video lag".
    """
    def __init__(self, camera_id, url, camera_name="Unknown", event_callback=None):
        super().__init__(daemon=True)
        self.camera_id = camera_id
        self.camera_id = camera_id
        # Sanitize URL: replace // with / in path, but preserve rtsp://
        # Split by protocol to be safe
        if "://" in url:
            proto, rest = url.split("://", 1)
            self.url = f"{proto}://{rest.replace('//', '/')}"
        else:
            self.url = url.replace("//", "/")
        self.camera_name = camera_name
        self.event_callback = event_callback
        self.latest_frame = None
        self.last_read_time = 0
        self.lock = threading.Lock()
        self.running = False
        self.connected = False
        self.health_status = "STARTING" # STARTING, CONNECTED, UNREACHABLE, UNAUTHORIZED
        # Limit reconnection log spam
        self.last_error_log = 0
        self.last_status_check = 0
        self.consecutive_failures = 0

    def get_health(self):
        with self.lock:
            return self.health_status
        
    def run(self):
        self.running = True
        cap = None
        current_url = self.url
        
        # Suppress OpenCV videoio debug
        os.environ["OPENCV_VIDEOIO_DEBUG"] = "0"
        
        # ... HW acceleration setup ...
        # (keeping existing HW acceleration logic)
        hw_accel_enabled = os.environ.get('HW_ACCEL', 'false').lower() == 'true'
        hw_accel_type = os.environ.get('HW_ACCEL_TYPE', 'auto').lower()
        
        if hw_accel_enabled:
            if hw_accel_type == 'auto':
                try:
                    import shutil
                    if shutil.which('nvidia-smi'):
                        hw_accel_type = 'nvidia'
                    elif os.path.exists('/dev/dri'):
                        hw_accel_type = 'vaapi'
                except:
                    pass

            if hw_accel_type == 'nvidia':
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|hwaccel;cuda"
            elif hw_accel_type == 'intel':
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|hwaccel;qsv"
            elif hw_accel_type in ['amd', 'vaapi']:
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|hwaccel;vaapi"
            else:
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|hwaccel;auto"
            logger.info(f"StreamReader ({self.camera_name}): HW acceleration configured ({hw_accel_type})")
        else:
            logger.info(f"StreamReader ({self.camera_name}): HW acceleration DISABLED")
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

        while self.running:
            try:
                # 1. Connection Phase
                with self.lock:
                    target_url = self.url
                
                # STOP if Authorized Failed (Prevent IP Ban)
                if self.health_status == "UNAUTHORIZED":
                     # Wait for user to update URL/Credentials
                     time.sleep(1.0)
                     continue

                if cap is None or not cap.isOpened() or self.health_status == "STARTING":
                    current_url = target_url
                    self.connected = False
                    
                    cap = cv2.VideoCapture(current_url, cv2.CAP_FFMPEG)
                                        
                    if not cap.isOpened():
                        self.consecutive_failures += 1
                        
                        # Immediate Diagnosis (No 30s delay)
                        try:
                            # Use ffprobe for a quick probe to check status
                            cmd = ["ffprobe", "-v", "error", "-rtsp_transport", "tcp", current_url]
                            res = subprocess.run(cmd, stderr=subprocess.PIPE, text=True, timeout=5)
                            
                            err_out = res.stderr.lower()
                            logger.info(f"[DEBUG] ffprobe stderr repr: {repr(err_out)}") # Use repr to see hidden chars
                            
                            auth_failed = False
                            if "401" in err_out: auth_failed = True
                            elif "unauthorized" in err_out: auth_failed = True
                            elif "403" in err_out: auth_failed = True
                            elif "forbidden" in err_out: auth_failed = True
                            
                            if auth_failed:
                                with self.lock: 
                                    self.health_status = "UNAUTHORIZED"
                                    self.latest_frame = None 
                                logger.warning(f"StreamReader ({self.camera_name}): Authentication failed (401/403). Invoking callback...")
                                
                                try:
                                    if self.event_callback:
                                        try:
                                            # Sanitize error output to remove credentials (rtsp://user:pass@)
                                            safe_err_out = re.sub(r'://[^@]+@', '://***:***@', err_out)
                                            event_data = {
                                                "camera_id": self.camera_id,
                                                "camera_name": self.camera_name,
                                                "status": "UNAUTHORIZED",
                                                "timestamp": int(time.time()),
                                                "message": "We detected an authentication error. Please check your camera username and password.",
                                                "title": "Camera Authentication Failed"
                                            }
                                            self.event_callback(self.camera_id, 'health_status_changed', event_data)
                                            logger.info(f"StreamReader ({self.camera_name}): Callback invoked for UNAUTHORIZED.")
                                        except Exception as cb_inner_e:
                                            logger.error(f"StreamReader ({self.camera_name}): Inner callback error: {cb_inner_e}")
                                    else:
                                        logger.error(f"StreamReader ({self.camera_name}): Callback is None!")
                                except Exception as e:
                                    logger.error(f"StreamReader ({self.camera_name}): Failed to prepare/call callback: {e}")
                                
                                time.sleep(10)
                                continue

                            # FALLBACK: Try CURL if ffprobe didn't catch it (ffprobe sometimes masks 401 as generic IO error)
                            # Curl is often more explicit about RTSP handshake status
                            try:
                                logger.info(f"StreamReader ({self.camera_name}): ffprobe inconclusive, trying curl for auth check...")
                                # -I (HEAD) might not work for RTSP, use -v to see headers. --fail to return non-zero?
                                # We parse the stderr/stdout for "401 Unauthorized"
                                cmd_curl = ["curl", "-v", "--connect-timeout", "5", current_url]
                                res_curl = subprocess.run(cmd_curl, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=6)
                                curl_out = (res_curl.stdout + res_curl.stderr).lower()
                                
                                if "401 unauthorized" in curl_out or "return code: 401" in curl_out:
                                     with self.lock:
                                         self.health_status = "UNAUTHORIZED"
                                         self.latest_frame = None
                                     logger.warning(f"StreamReader ({self.camera_name}): Authentication failed (401) via CURL. Stopping retries.")
                                     
                                     # IMMEDIATE NOTIFICATION 
                                     if self.event_callback:
                                        event_data = {
                                            "camera_id": self.camera_id,
                                            "camera_name": self.camera_name,
                                            "status": "UNAUTHORIZED",
                                            "timestamp": int(time.time()),
                                            "message": "We detected an authentication error. Please check your camera username and password.",
                                            "title": "Camera Authentication Failed"
                                        }
                                        try:
                                            self.event_callback(self.camera_id, 'health_status_changed', event_data)
                                        except Exception as e:
                                            logger.error(f"Failed to callback event: {e}")
                                     continue

                            except Exception as e:
                                # Curl failed or not found, proceed to generic unreachable
                                logger.warning(f"StreamReader ({self.camera_name}): Curl auth check failed or timed out: {e}")
                                pass

                            # Generic Unreachable
                            with self.lock: 
                                self.health_status = "UNREACHABLE"
                                self.latest_frame = None
                            logger.warning(f"StreamReader ({self.camera_name}): Network unreachable. Error: {err_out[:50]}")

                            # IMMEDIATE NOTIFICATION for Unreachable
                            if self.last_health_report_status != "UNREACHABLE":
                                self.last_health_report_status = "UNREACHABLE"
                                if self.event_callback:
                                    event_data = {
                                        "camera_id": self.camera_id,
                                        "camera_name": self.config.get('name', str(self.camera_id)),
                                        "status": "UNREACHABLE",
                                        "timestamp": int(time.time()),
                                        "message": "Camera is unreachable. Check network or power.",
                                        "title": "Camera Offline"
                                    }
                                    try:
                                        self.event_callback(self.camera_id, 'health_status_changed', event_data)
                                    except Exception as e:
                                        logger.error(f"Failed to callback event: {e}")
                        except Exception as e:
                            with self.lock: 
                                self.health_status = "UNREACHABLE"
                                self.latest_frame = None
                        
                        # Exponential Backoff for generic failures
                        # 10s, 20s, 40s, 60s... max 120s
                        retry_delay = min(120, 10 * (2 ** (self.consecutive_failures - 1)))
                        logger.info(f"StreamReader ({self.camera_name}): Retrying in {retry_delay}s...")
                        time.sleep(retry_delay)
                        continue
                        
                    logger.info(f"StreamReader ({self.camera_name}): Connected!")
                    with self.lock: self.health_status = "CONNECTED"
                    self.connected = True
                    self.consecutive_failures = 0
                
                # 2. URL Change Check
                with self.lock:
                    target_url = self.url

                if target_url != current_url:
                    cap.release()
                    cap = None
                    self.connected = False
                    continue

                # 3. Read Frame
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"StreamReader ({self.camera_name}): Stream ended. Reconnecting...")
                    cap.release()
                    cap = None
                    continue
                
                # 4. Update Latest
                with self.lock:
                    self.latest_frame = frame
                    self.last_read_time = time.time()
                    self.health_status = "CONNECTED"
                    
            except Exception as e:
                logger.error(f"StreamReader ({self.camera_name}): Error: {e}")
                if cap: cap.release()
                cap = None
                time.sleep(2)
                
        if cap: cap.release()
        logger.info(f"StreamReader ({self.camera_name}): Stopped")

    def get_latest(self):
        with self.lock:
            return self.latest_frame, self.last_read_time
            
    def stop(self):
        self.running = False

    def update_url(self, new_url):
        with self.lock:
            # Sanitize URL: replace // with / in path
            if "://" in new_url:
                proto, rest = new_url.split("://", 1)
                new_url = f"{proto}://{rest.replace('//', '/')}"
            else:
                new_url = new_url.replace("//", "/")

            if self.url != new_url:
                logger.info(f"StreamReader ({self.camera_name}): URL changed, resetting health status and forcing reconnect")
                self.url = new_url
                self.health_status = "STARTING"  # Force fresh connection attempt
                self.last_status_check = 0  # Reset ffprobe throttle
                self.latest_frame = None  # Clear any stale frame
                self.connected = False # Ensure connected flag is reset
            else:
                 # Even if URL is same, if we are in error state, force a retry?
                 # Useful if user just hits 'Save' to trigger a retry
                 if self.health_status in ["UNAUTHORIZED", "UNREACHABLE"]:
                     logger.info(f"StreamReader ({self.camera_name}): URL unchanged but in error state, forcing retry")
                     self.health_status = "STARTING"
                     self.last_status_check = 0

    def force_reconnect(self):
        with self.lock:
            # Setting health to STARTING forces the loop to re-evaluate connection
            self.connected = False
            self.health_status = "STARTING"


class CameraThread(threading.Thread):
    def __init__(self, camera_id, config, event_callback=None):
        super().__init__()
        self.camera_id = camera_id
        self.config = config # Dict containing rtsp_url, name, text settings, etc.
        self.event_callback = event_callback # Function to call on events
        
        self.running = False
        
        # Reader Thread
        self.stream_reader = StreamReader(self.camera_id, self.config['rtsp_url'], self.config.get('name', str(camera_id)), event_callback=self.event_callback)
        
        # Frame Storage
        self.latest_frame_jpeg = None
        self.last_frame_update_time = 0
        self.lock = threading.Lock()
        
        # Throttling counters
        self.pre_buffer_counter = 0
        
        # Motion Detection (lazy init - only create when needed)
        self.fgbg = None  # Will be created on first use if motion detection enabled
        self.motion_detected = False
        self.last_motion_time = 0
        self.recording_start_time = 0
        self.consecutive_motion_frames = 0
        self.consecutive_still_frames = 0
        self.motion_frame_counter = 0  # For frame skipping optimization
        
        # Recording
        self.recording_process = None
        self.is_recording = False
        self.recording_filename = None
        self.passthrough_active = False
        self.passthrough_error_count = 0 # Track consecutive failures
        
        # Metrics
        self.fps = 0
        self.frame_count = 0
        self.last_fps_time = time.time()
        self.live_view_counter = 0  # For live view frame skipping
        self.last_processed_read_time = 0  # To skip duplicate frames
        
        self.output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Dimensions
        self.width = 0
        self.height = 0

        # Pre-capture buffer
        self.pre_buffer = deque(maxlen=self.config.get('pre_capture', 0) or 1)

        # Health Monitoring (Restored)
        self.last_health_report_status = "STARTING"
        self.last_health_check_time = 0
    
    def get_health(self):
        return self.stream_reader.get_health()

    def _mask_url(self, url):
        import re
        if not url: return ""
        return re.sub(r'://([^:]+):([^@]+)@', r'://\1:*****@', url)

    def run(self):
        self.running = True
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Starting processing thread")
        
        # Start the reader (producer)
        self.stream_reader.start()
        
        while self.running:
            loop_start_time = time.time()
            try:
                # 1. Get Frame from Reader
                frame, read_time = self.stream_reader.get_latest()
                
                if frame is None:
                    # No frame yet, wait a bit
                    time.sleep(0.1)
                    continue
                
                # Skip if this is the same frame we already processed
                if read_time == self.last_processed_read_time:
                    time.sleep(0.01)  # Brief sleep to avoid busy loop
                    continue
                self.last_processed_read_time = read_time
                    
                # 2. Process dimensions & Resize if needed
                # Note: StreamReader gives raw frames. We might want to resize.
                target_w = self.config.get('width')
                target_h = self.config.get('height')
                if target_w and target_h:
                    if frame.shape[1] != target_w or frame.shape[0] != target_h:
                        frame = cv2.resize(frame, (target_w, target_h))

                # Rotation
                rotation = self.config.get('rotation', 0)
                if rotation == 90:
                    frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                elif rotation == 180:
                    frame = cv2.rotate(frame, cv2.ROTATE_180)
                elif rotation == 270:
                    frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)

                self.height, self.width = frame.shape[:2]

                # 3. Motion Detection
                self.detect_motion(frame)

                # 4. Text Overlay
                self.draw_overlay(frame)
                
                # 5. Handle Recording (Video)
                self.handle_recording(frame)
                
                # 6. Pre-capture Buffer
                # OPTIMIZATION: Throttle pre-capture buffer to save RAM
                pre_cap_count = self.config.get('pre_capture', 0)
                throttle = int(self.config.get('opt_pre_capture_fps_throttle', 1))
                if throttle < 1: throttle = 1
                
                # Calculate effective buffer size
                effective_maxlen = pre_cap_count // throttle if pre_cap_count > 0 else 0
                
                if effective_maxlen > 0:
                    if self.pre_buffer.maxlen != effective_maxlen:
                        # Resize if needed (e.g. settings changed)
                        self.pre_buffer = deque(self.pre_buffer, maxlen=effective_maxlen)
                    
                    self.pre_buffer_counter += 1
                    if self.pre_buffer_counter % throttle == 0:
                        # Store YUV420 frame (from previous optimization) or copy
                        try:
                            # Frame is already YUV if we did the optimization earlier?
                            # Wait, previous task converted to YUV "frame_yuv" but we didn't inject that variable in this scope in this view?
                            # Ah, I must check if 'frame_yuv' exists or if I need to recreate it.
                            # The previous tool call MIGHT have failed or I might be editing a file that doesn't have it yet?
                            # Let's check the context from Step 167... It seems I did edit it.
                            # But looking at the current view_file output (Step 235), I DON'T SEE frame_yuv!
                            # It seems my previous edit was on 'migrate_captured_before.py' or failed?
                            # No, Step 167 viewed 'camera_thread.py'. Step 168 applied changes.
                            # But Step 235 shows 'engine/camera_thread.py' WITHOUT the YUV changes I thought I made.
                            # Did I revert them? Or did I fail to apply them?
                            # Step 168 applied changes to `camera_thread.py`.
                            # Let's look at lines 235-236 in the current view.
                            # Line 235: self.handle_recording(frame)
                            # Line 236: # 6. Pre-capture Buffer
                            # It seems the YUV optimization was NOT applied or lost?
                            # Wait, Step 235 shows:
                            # 235:                 # 5. Handle Recording (Video)
                            # 236:                 self.handle_recording(frame)
                            # 237:                 
                            # 238:                 # 6. Pre-capture Buffer
                            # The YUV optimization from Step 168 (Task 166) WAS SUPPOSED to be there.
                            # Use `frame.copy()` as fallback for now to be safe, or implement YUV here too if I want YUV + Throttle.
                            # I will just stick to Throttling for now as requested by user.
                            self.pre_buffer.append(frame.copy())
                        except Exception:
                             pass


                # 7. Update Live View Buffer (Broadcast)
                # OPTIMIZATION: Only update live view every N frames (reduces JPEG encoding CPU)
                self.live_view_counter += 1
                lv_throttle = self.config.get('opt_live_view_fps_throttle', 2)
                if self.live_view_counter % lv_throttle == 0:
                    # Resize to limit height before JPEG encoding (less CPU, less memory)
                    live_frame = frame
                    lv_max_h = self.config.get('opt_live_view_height_limit', 720)
                    
                    if frame.shape[0] > lv_max_h:
                        scale = lv_max_h / frame.shape[0]
                        new_width = int(frame.shape[1] * scale)
                        live_frame = cv2.resize(frame, (new_width, lv_max_h), interpolation=cv2.INTER_NEAREST)
                    
                    lv_qual = self.config.get('opt_live_view_quality', 60)
                    ret, jpeg = cv2.imencode('.jpg', live_frame, [int(cv2.IMWRITE_JPEG_QUALITY), lv_qual])
                    if ret:
                        with self.lock:
                            self.latest_frame_jpeg = jpeg.tobytes()
                            self.last_frame_update_time = time.time()
                        # Sync health_status when frames are successfully generated
                        # This overrides any stale UNAUTHORIZED from ffprobe checks
                        with self.stream_reader.lock:
                            if self.stream_reader.health_status != "CONNECTED":
                                self.stream_reader.health_status = "CONNECTED"
                
                # FPS Calculation
                self.frame_count += 1
                if time.time() - self.last_fps_time >= 1.0:
                    self.fps = self.frame_count
                    self.frame_count = 0
                    self.last_fps_time = time.time()
                
                # Health Monitoring & Notification (Check every 60s)
                if time.time() - self.last_health_check_time > 60.0:
                    self.last_health_check_time = time.time()
                    current_health = self.stream_reader.get_health()
                    
                    if current_health != self.last_health_report_status:
                        prev_health = self.last_health_report_status
                        self.last_health_report_status = current_health
                        
                        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Health changed {prev_health} -> {current_health}")
                        
                        event_title = None
                        event_msg = None
                        
                        if current_health == "UNAUTHORIZED":
                            event_title = f"Camera Auth Failure: {self.config.get('name')}"
                            event_msg = "Camera reported 401 Unauthorized (Wrong Password). Please check credentials."
                        elif current_health == "UNREACHABLE":
                            event_title = f"Camera Offline: {self.config.get('name')}"
                            event_msg = "Camera is unreachable. Check network or power."
                        elif current_health == "CONNECTED" and prev_health in ["UNAUTHORIZED", "UNREACHABLE"]:
                            event_title = f"Camera Online: {self.config.get('name')}"
                            event_msg = "Camera connection restored."
                            
                        # Trigger Event
                        if event_title:
                            event_data = {
                                "camera_id": self.camera_id,
                                "camera_name": self.camera_name,
                                "status": current_health,
                                "timestamp": int(time.time()),
                                "message": event_msg,
                                "title": event_title
                            }
                            self.event_queue.put(("health_status_changed", event_data))
                            
                            if self.event_callback:
                                self.event_callback(self.camera_id, 'health_status_changed', {
                                    "title": event_title,
                                    "message": event_msg,
                                    "new_status": current_health
                                })
                

                    


                # Framerate throttle (Processing FPS)
                target_fps = self.config.get('framerate', 30)
                if target_fps > 0:
                     elapsed = time.time() - loop_start_time
                     target_time = 1.0 / target_fps
                     if elapsed < target_time:
                         time.sleep(target_time - elapsed)

            except Exception as e:
                logger.error(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Error in processing loop: {e}")
                time.sleep(1)
                
        # Cleanup
        self.stream_reader.stop()
        self.stream_reader.join(timeout=1.0)
        self.stop_recording()
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Thread stopped")

    def detect_motion(self, frame):
        # Skip motion detection if disabled
        detect_mode = self.config.get('detect_motion_mode', 'Always')
        recording_mode = self.config.get('recording_mode', 'Motion Triggered')
        if detect_mode == 'Off' or recording_mode == 'Off':
            # If motion was active, end it
            if self.motion_detected:
                self.motion_detected = False
                logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Motion END (detection disabled)")
                if self.event_callback:
                    self.event_callback(self.camera_id, 'motion_end')
            return
        
        # OPTIMIZATION: Skip frames for motion detection
        motion_throttle = self.config.get('opt_motion_fps_throttle', 3)
        self.motion_frame_counter += 1
        if self.motion_frame_counter % motion_throttle != 0:
            return  # Skip frames
        
        # Resize for faster processing (optimized: smaller resolution + fastest interpolation)
        # Calculate width based on target height to maintain aspect ratio
        motion_h = self.config.get('opt_motion_analysis_height', 180)
        scale = motion_h / frame.shape[0]
        motion_w = int(frame.shape[1] * scale)
        small_frame = cv2.resize(frame, (motion_w, motion_h), interpolation=cv2.INTER_NEAREST)
        
        # Lazy init MOG2 on first use (saves RAM if motion detection disabled)
        if self.fgbg is None:
            self.fgbg = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=25, detectShadows=False)
            logger.info(f"Camera {self.config.get('name')}: MOG2 background subtractor initialized")
        
        fgmask = self.fgbg.apply(small_frame)
        
        # Threshold to remove shadows
        _, fgmask = cv2.threshold(fgmask, 200, 255, cv2.THRESH_BINARY)

        # Despeckle (if enabled) - simple erosion/dilation
        if self.config.get('despeckle_filter', False):
            kernel = np.ones((3,3), np.uint8)
            fgmask = cv2.erode(fgmask, kernel, iterations=1)
            fgmask = cv2.dilate(fgmask, kernel, iterations=1)
        
        # Calculate motion ratio
        motion_ratio = (np.count_nonzero(fgmask) / fgmask.size) * 100
        
        threshold_percent = self.config.get('threshold_percent', 1.0)
        # Compatibility with 'Motion' project 'threshold' (pixels)
        if 'threshold' in self.config:
            # threshold is pixels, e.g. 1500
            # small_frame is 320x180 = 57600 pixels (optimized)
            thresh_pixels = int(self.config['threshold'])
            threshold_percent = (thresh_pixels / (320 * 180)) * 100
        
        if motion_ratio > threshold_percent:
            self.consecutive_motion_frames += 1
            self.consecutive_still_frames = 0
            
            min_frames = self.config.get('min_motion_frames', 2)
            
            if self.consecutive_motion_frames >= min_frames:
                self.last_motion_time = time.time()
                if not self.motion_detected:
                    self.motion_detected = True
                    logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Motion START")
                    snap_path = None
                    
                    snap_path = None
                    
                    # Take snapshot logic
                    pic_mode = self.config.get('picture_recording_mode', 'Manual')
                    vid_mode = self.config.get('recording_mode', 'Off')
                    
                    if pic_mode == 'Motion Triggered':
                        # Permanent save (DB event)
                        snap_path = self.save_snapshot(frame, is_temp=False)
                    elif vid_mode != 'Off':
                        # Temporary save for notification only (No DB event)
                        snap_path = self.save_snapshot(frame, is_temp=True)

                    if self.event_callback:
                        payload = {}
                        if snap_path:
                            payload['file_path'] = snap_path
                        self.event_callback(self.camera_id, 'motion_start', payload)
        else:
            self.consecutive_still_frames += 1
            self.consecutive_motion_frames = 0
            
            motion_gap = self.config.get('motion_gap', 10)
            if self.motion_detected and (time.time() - self.last_motion_time > motion_gap):
                self.motion_detected = False
                self.consecutive_motion_frames = 0
                logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Motion END")
                if self.event_callback:
                    self.event_callback(self.camera_id, 'motion_end')

    def draw_overlay(self, frame):
        try:
            h, w = frame.shape[:2]
            
            # Resilient Scaling Logic
            # user_scale_param is typically 1.0 (default) to 10.0 from UI slider? 
            # Actually frontend slider might save raw 1.0. Let's assume standard is around 1.0
            user_preference = self.config.get('text_scale', 1.0)
            
            # Base logic: Scale strictly by width. 
            # 1920px -> scale 1.0 * user_pref
            # 640px  -> scale 0.33 * user_pref
            # This keeps text relative size constant across resolutions
            
            # Use 1200 as base width reference (middle ground)
            base_font_scale = 1.0
            
            # Calculate dynamic scale based on WIDTH ratio
            font_scale = (w / 1200.0) * user_preference * base_font_scale
            
            # Safety floor: never go below 0.4 or it becomes unreadable artifacts
            font_scale = max(0.4, font_scale)
            
            # Thickness scales with font size for visibility
            thickness = max(1, int(font_scale * 2.0))
            
            cam_name = self.config.get('name', 'Camera')

            def process_text(text):
                if not text: return ""
                # Handle Motion-style camera name token (%$) and custom %N
                text = text.replace('%$', cam_name).replace('%N', cam_name)
                
                # DateTime formatting (only if % is present to avoid overhead)
                if '%' in text: 
                    try:
                        text = datetime.now().strftime(text)
                    except:
                        pass # Ignore formatting errors
                return text

            # Text Right (Bottom Right)
            text_right = self.config.get('text_right', '')
            text_right = process_text(text_right)
                
            if text_right:
                (ts_w, ts_h), _ = cv2.getTextSize(text_right, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                cv2.rectangle(frame, (w - ts_w - 20, h - ts_h - 20), (w, h), (0, 0, 0), -1)
                cv2.putText(frame, text_right, (w - ts_w - 10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)

            # Text Left (Top Left)
            text_left = self.config.get('text_left', '')
            text_left = process_text(text_left)
            
            if text_left:
                (nm_w, nm_h), _ = cv2.getTextSize(text_left, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                cv2.rectangle(frame, (0, 0), (nm_w + 20, nm_h + 20), (0, 0, 0), -1)
                cv2.putText(frame, text_left, (10, nm_h + 10), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)
        except Exception as e:
            logger.error(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Overlay error: {e}")
            
        # Motion Debug Box - Forcefully disabled to prioritize UI reactive borders 
        # and keep the recorded video stream clean for storage.
        # if self.motion_detected and self.config.get('show_motion_box', False):
        #    cv2.rectangle(frame, (10, 10), (w-10, h-10), (0, 0, 255), 4)

    def handle_recording(self, frame):
        mode = self.config.get('recording_mode', 'Off')
        should_record = False
        
        if mode == 'Always' or mode == 'Continuous':
            should_record = True
        elif mode == 'Motion Triggered' and self.motion_detected:
            should_record = True
            
        # Check max movie length for splitting
        max_len = self.config.get('max_movie_length', 0)
        if self.is_recording and max_len > 0:
            if time.time() - self.recording_start_time > max_len:
                logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Max movie length reached, splitting file")
                self.stop_recording()
                # next loop will restart it if should_record is still True

        if should_record and not self.is_recording:
            self.start_recording(frame.shape[1], frame.shape[0])
        elif not should_record and self.is_recording:
            # Post-capture buffer
            post_cap = self.config.get('post_capture', 5)
            if not self.motion_detected and (time.time() - self.last_motion_time > post_cap):
                 self.stop_recording()

        # Check for Passthrough crash
        if self.is_recording and self.passthrough_active and self.recording_process:
             if self.recording_process.poll() is not None:
                 logger.error(f"Camera {self.config.get('name')}: Passthrough recording process died unexpectedly (code {self.recording_process.poll()}). Aborting motion event.")
                 self.stop_recording()
                 self.motion_detected = False # Prevent immediate restart loop
                 self.passthrough_error_count += 1
                 return

        if self.is_recording and self.recording_process and not self.passthrough_active:
            try:
                self.recording_process.stdin.write(frame.tobytes())
            except Exception as e:
                logger.error(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Error writing to ffmpeg: {e}")
                self.stop_recording()

    def _monitor_ffmpeg_logs(self, process):
        """Read stderr from ffmpeg, mask credentials, and log"""
        try:
            # Iterate lines until stderr is closed
            for line in iter(process.stderr.readline, b''):
                if not line: break
                
                msg = line.decode('utf-8', errors='replace').strip()
                if not msg: continue
                
                masked_msg = self._mask_url(msg)
                
                # If using -loglevel error, practically everything here is important
                logger.error(f"FFmpeg [{self.config.get('name')}]: {masked_msg}")
        except Exception as e:
            # Process probably died
            pass

    def start_recording(self, width, height):
        format_str = self.config.get('movie_file_name', '%Y-%m-%d/%H-%M-%S')
        format_str = format_str.replace('%q', '00') 
        
        timestamp_path = datetime.now().strftime(format_str)
        output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
        
        full_path = os.path.join(output_dir, f"{timestamp_path}.mp4")
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Start Recording to {full_path}")
        
        # Passthrough Logic with Fallback
        if self.passthrough_error_count > 1:
             if self.passthrough_error_count == 2:
                 logger.warning(f"Camera {self.config.get('name')}: Passthrough failed too many times ({self.passthrough_error_count}). Falling back to Encoding.")
             self.passthrough_active = False
        else:
             self.passthrough_active = self.config.get('movie_passthrough', False)
        
        if self.passthrough_active:
             # PASSTHROUGH MODE: Direct Stream Copy
            # Note: No overlays, no resize, no pre-capture buffer
            command = [
                'ffmpeg',
                '-y',
                '-rtsp_transport', 'tcp',
                '-hide_banner',      # Hide build/version info
                '-loglevel', 'error', # Suppress info logs that show input URL (credentials)
                '-i', self.config['rtsp_url'],
                '-c:v', 'copy',
                '-an',  # Disable audio to prevent MP4 container errors with PCM codecs
                '-f', 'mp4',
                '-movflags', '+faststart', # Enable fast start for web playback
                full_path
            ]
            
            try:
                # Use PIPE for stderr to trap and mask logs
                self.recording_process = subprocess.Popen(command, stdin=None, stderr=subprocess.PIPE)
                
                # Start background thread to monitor logs and mask credentials
                log_thread = threading.Thread(target=self._monitor_ffmpeg_logs, args=(self.recording_process,), daemon=True)
                log_thread.start()
                
                self.is_recording = True
                self.recording_filename = full_path
                self.recording_start_time = time.time()
                
                if self.event_callback:
                     self.event_callback(self.camera_id, 'recording_start', {
                         "file_path": full_path,
                         "width": width, # Note: Actual width might differ if stream changes
                         "height": height
                     })
                logger.info(f"Camera {self.config.get('name')}: Started Passthrough Recording")
                return 
                
            except Exception as e:
                logger.error(f"Camera {self.config.get('name')}: Failed to start Passthrough ffmpeg: {e}")
                self.passthrough_active = False # Fallback? No, just fail
                self.is_recording = False
                self.passthrough_error_count += 1
                return

        # ENCODING MODE with Hardware Acceleration Support
        # Map quality (0-100) to CRF (51-18)
        # 100 = CRF 18 (Visually Lossless)
        # 75  = CRF 26 (Good Compromise)
        # 50  = CRF 34 (Low Quality)
        quality = self.config.get('movie_quality', 75)
        crf = int(51 - (quality * 0.33))
        crf = max(18, min(51, crf))
        
        # Check if HW encoding is available
        hw_accel_enabled = os.environ.get('HW_ACCEL', 'false').lower() == 'true'
        hw_accel_type = os.environ.get('HW_ACCEL_TYPE', 'auto').lower()
        
        # Select encoder based on HW accel settings
        video_codec = 'libx264'  # Software fallback
        codec_specific_args = ['-preset', self.config.get('opt_ffmpeg_preset', 'ultrafast'), '-crf', str(crf)]
        
        # Log level based on global config
        from main import GLOBAL_CONFIG
        ffmpeg_loglevel = 'debug' if GLOBAL_CONFIG.get('opt_verbose_engine_logs') else 'error'
        
        if hw_accel_enabled:
            if hw_accel_type in ['vaapi', 'intel', 'amd', 'auto']:
                # Try VAAPI encoding
                if os.path.exists('/dev/dri'):
                    video_codec = 'h264_vaapi'
                    # VAAPI uses different quality control (qp instead of crf)  
                    qp = int(crf * 0.7)  # Approximate CRF to QP mapping
                    codec_specific_args = [
                        '-vaapi_device', '/dev/dri/renderD128',
                        '-vf', 'format=nv12,hwupload',
                        '-qp', str(qp)
                    ]
                    logger.info(f"Camera {self.config.get('name')}: Using VAAPI hardware encoding")
            
            elif hw_accel_type == 'nvidia':
                # NVIDIA NVENC
                video_codec = 'h264_nvenc'
                codec_specific_args = ['-preset', 'fast', '-cq', str(crf)]
                logger.info(f"Camera {self.config.get('name')}: Using NVENC hardware encoding")
        
        command = [
            'ffmpeg',
            '-y',
            '-loglevel', ffmpeg_loglevel,
            '-f', 'rawvideo',
            '-vcodec', 'rawvideo',
            '-s', f'{width}x{height}',
            '-pix_fmt', 'bgr24',
            '-r', str(self.config.get('framerate', 15)),
            '-i', '-',
            '-c:v', video_codec,
            *codec_specific_args,
            '-pix_fmt', 'yuv420p',
            full_path
        ]
        
        # Log encoder being used
        cmd_str = ' '.join([c for c in command if 'rtsp' not in c.lower()])
        logger.info(f"Camera {self.config.get('name')}: FFmpeg encoding command: {cmd_str}")
        
        try:
            self.recording_process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
            self.is_recording = True
            self.recording_filename = full_path
            self.recording_start_time = time.time()
            
            # Write pre-capture buffer
            if len(self.pre_buffer) > 0:
                try:
                    throttle = int(self.config.get('opt_pre_capture_fps_throttle', 1))
                    if throttle < 1: throttle = 1
                    
                    for f in self.pre_buffer:
                        # Duplicate frame 'throttle' times to restore FPS
                        for _ in range(throttle):
                            self.recording_process.stdin.write(f.tobytes())
                    self.pre_buffer.clear()
                except Exception as e:
                    logger.error(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Error writing pre-buffer: {e}")
            
            if self.event_callback:
                 self.event_callback(self.camera_id, 'recording_start', {
                     "file_path": full_path,
                     "width": width,
                     "height": height
                 })
                 
        except Exception as e:
            logger.error(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Failed to start ffmpeg: {e}")

    def stop_recording(self):
        if self.is_recording:
            logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Stop Recording")
            if self.recording_process:
                if self.passthrough_active:
                    # Passthrough: Terminate safely
                    self.recording_process.terminate()
                    try:
                        self.recording_process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        self.recording_process.kill()
                else:
                    # Encoding: Close stdin to finish stream
                    if self.recording_process.stdin:
                        self.recording_process.stdin.close()
                    self.recording_process.wait()
                self.recording_process = None
            self.is_recording = False
            
            # Verify file size prevents saving empty/broken files
            valid_recording = False
            if self.recording_filename and os.path.exists(self.recording_filename):
                try:
                    size = os.path.getsize(self.recording_filename)
                    if size < 1024:
                        logger.warning(f"Recording {self.recording_filename} is too small ({size} bytes). Discarding.")
                        os.remove(self.recording_filename)
                    else:
                        valid_recording = True
                except Exception as e:
                    logger.error(f"Error checking file size: {e}")

            if valid_recording and self.event_callback:
                 self.event_callback(self.camera_id, 'recording_end', {
                     "file_path": self.recording_filename,
                     "width": self.width,
                     "height": self.height
                 })

    def update_config(self, new_config):
        """ Update config dynamically without stopping thread """
        old_passthrough = self.config.get('movie_passthrough', False)
        new_passthrough = new_config.get('movie_passthrough', old_passthrough)
        
        self.config.update(new_config)
        
        # Handle passthrough mode change
        if 'movie_passthrough' in new_config and old_passthrough != new_passthrough:
            logger.info(f"Camera {self.config.get('name')}: Passthrough mode changed from {old_passthrough} to {new_passthrough}")
            
            # Reset error count to give passthrough a fresh start
            self.passthrough_error_count = 0
            
            # If we have an active passthrough recording, stop it so it can restart with new settings
            # This also releases the RTSP connection that might block the liveview StreamReader
            if self.is_recording and self.passthrough_active:
                logger.info(f"Camera {self.config.get('name')}: Stopping active passthrough recording due to config change")
                self.stop_recording()
                # (moved after if block)
            
            # Update passthrough_active regardless of recording state
            self.passthrough_active = new_passthrough
            
            # Force StreamReader to reconnect after passthrough change
            # This fixes the black screen issue when toggling passthrough
            self.stream_reader.force_reconnect()
        
        # Update StreamReader URL if changed
        if 'rtsp_url' in new_config:
            new_url = new_config['rtsp_url']
            # Mask for logging
            masked_new = self._mask_url(new_url)
            masked_old = self._mask_url(self.config.get('rtsp_url'))
            
            if new_url != self.config.get('rtsp_url'):
                logger.info(f"Camera {self.config.get('name')}: RTSP URL update: {masked_old} -> {masked_new}")
                
            self.stream_reader.update_url(new_url)

        # Update pre-buffer length
        pre_cap = self.config.get('pre_capture', 0)
        if pre_cap > 0 and self.pre_buffer.maxlen != pre_cap:
            self.pre_buffer = deque(self.pre_buffer, maxlen=pre_cap)
            
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Config updated")
        
    def stop(self):
        self.running = False
        # Don't join with timeout here, let the manager handle it if needed
        # or just set running to false and let the loop finish.
        # But we want to be able to wait a bit.
        self.join(timeout=2.0)

    def get_frame_bytes(self):
        with self.lock:
            # Prevent serving stale frames (older than 10 seconds)
            if time.time() - self.last_frame_update_time > 10:
                return None
            return self.latest_frame_jpeg

    def save_snapshot(self, frame=None, is_temp=False):
        """Save a single snapshot. is_temp=True means for notification only (no DB event)"""
        try:
            if frame is not None:
                snap_qual = self.config.get('opt_snapshot_quality', 90)
                ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), snap_qual])
                if not ret:
                    return False
                jpeg_bytes = jpeg.tobytes()
            else:
                with self.lock:
                    if self.latest_frame_jpeg is None:
                        return False
                    jpeg_bytes = self.latest_frame_jpeg

            format_str = self.config.get('picture_file_name', '%Y-%m-%d/%H-%M-%S-%q')
            format_str = format_str.replace('%q', '00') 
            
            timestamp_path = datetime.now().strftime(format_str)
            
            if is_temp:
                # Save to shared volume temp directory so backend can access it
                output_dir = f"/var/lib/vibe/recordings/temp_snaps/{self.camera_id}"
                filepath = os.path.join(output_dir, f"{timestamp_path}.jpg")
            else:
                # Save to persistent storage
                output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
                filepath = os.path.join(output_dir, f"{timestamp_path}.jpg")
            
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            
            with open(filepath, "wb") as f:
                f.write(jpeg_bytes)
            
            if not is_temp:
                logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Snapshot saved to {filepath}")
                if self.event_callback:
                    self.event_callback(self.camera_id, "snapshot_save", {
                        "file_path": filepath,
                        "width": self.width,
                        "height": self.height
                    })
            return filepath
        except Exception as e:
            logger.error(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Failed to save snapshot: {e}")
            return False
