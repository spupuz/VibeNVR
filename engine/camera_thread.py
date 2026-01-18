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

logger = logging.getLogger(__name__)

class StreamReader(threading.Thread):
    """
    Dedicated thread for reading frames from RTSP stream.
    This ensures the buffer is constantly drained and we always 
    have the latest frame, preventing "video lag".
    """
    def __init__(self, url, camera_name="Unknown"):
        super().__init__(daemon=True)
        self.url = url
        self.camera_name = camera_name
        self.latest_frame = None
        self.last_read_time = 0
        self.lock = threading.Lock()
        self.running = False
        self.connected = False
        # Limit reconnection log spam
        self.last_error_log = 0
        
    def update_url(self, new_url):
        if self.url != new_url:
            logger.info(f"StreamReader ({self.camera_name}): URL updated, triggering reconnect")
            self.url = new_url
            # Trigger reconnect by modifying state handled in run loop
            # We don't have direct access to 'cap' here, but the loop checks self.url
        
    def run(self):
        self.running = True
        cap = None
        current_url = self.url
        
        # Suppress OpenCV videoio debug
        os.environ["OPENCV_VIDEOIO_DEBUG"] = "0"
        
        # Check for hardware acceleration setting
        hw_accel_enabled = os.environ.get('HW_ACCEL', 'false').lower() == 'true'
        hw_accel_type = os.environ.get('HW_ACCEL_TYPE', 'auto').lower()
        
        # Configure FFMPEG backend for hardware acceleration
        if hw_accel_enabled:
            if hw_accel_type == 'nvidia':
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|hwaccel;cuda"
            elif hw_accel_type == 'intel':
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|hwaccel;qsv"
            elif hw_accel_type == 'amd':
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|hwaccel;vaapi"
            else:  # auto
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|hwaccel;auto"
            logger.info(f"StreamReader ({self.camera_name}): HW acceleration enabled ({hw_accel_type})")
        else:
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        
        while self.running:
            try:
                # 1. Connection Phase
                if cap is None or not cap.isOpened():
                    current_url = self.url # Update current target
                    logger.info(f"StreamReader ({self.camera_name}): Connecting to stream...")
                    cap = cv2.VideoCapture(current_url, cv2.CAP_FFMPEG)
                    
                    # Try to minimize buffer if backend supports it
                    try:
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    except:
                        pass
                        
                    if not cap.isOpened():
                        if time.time() - self.last_error_log > 10:
                            logger.warning(f"StreamReader ({self.camera_name}): Failed to connect. Retrying...")
                            self.last_error_log = time.time()
                        time.sleep(2)
                        continue
                        
                    logger.info(f"StreamReader ({self.camera_name}): Connected!")
                    self.connected = True
                
                # 2. URL Change Check
                if self.url != current_url:
                    logger.info(f"StreamReader ({self.camera_name}): Switching stream URL...")
                    cap.release()
                    cap = None
                    self.connected = False
                    continue

                # 3. Read Frame
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"StreamReader ({self.camera_name}): Stream ended or failed. Reconnecting...")
                    cap.release()
                    cap = None
                    self.connected = False
                    time.sleep(1)
                    continue
                
                # 4. Update Latest
                with self.lock:
                    self.latest_frame = frame
                    self.last_read_time = time.time()
                    
            except Exception as e:
                logger.error(f"StreamReader ({self.camera_name}): Error in loop: {e}")
                if cap:
                    cap.release()
                cap = None
                self.connected = False
                time.sleep(1)
                
        if cap: cap.release()
        logger.info(f"StreamReader ({self.camera_name}): Stopped")

    def get_latest(self):
        with self.lock:
            return self.latest_frame, self.last_read_time
            
    def stop(self):
        self.running = False


class CameraThread(threading.Thread):
    def __init__(self, camera_id, config, event_callback=None):
        super().__init__()
        self.camera_id = camera_id
        self.config = config # Dict containing rtsp_url, name, text settings, etc.
        self.event_callback = event_callback # Function to call on events
        
        self.running = False
        
        # Reader Thread
        self.stream_reader = StreamReader(self.config['rtsp_url'], self.config.get('name', str(camera_id)))
        
        # Frame Storage
        self.latest_frame_jpeg = None
        self.last_frame_update_time = 0
        self.lock = threading.Lock()
        
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
                pre_cap_count = self.config.get('pre_capture', 0)
                if pre_cap_count > 0:
                    if self.pre_buffer.maxlen != pre_cap_count:
                        self.pre_buffer = deque(self.pre_buffer, maxlen=pre_cap_count)
                    self.pre_buffer.append(frame.copy())

                # 7. Update Live View Buffer (Broadcast)
                # OPTIMIZATION: Only update live view every 2nd frame (reduces JPEG encoding CPU)
                self.live_view_counter += 1
                if self.live_view_counter % 2 == 0:
                    # Resize to 720p before JPEG encoding (less CPU, less memory)
                    live_frame = frame
                    if frame.shape[0] > 720:  # If height > 720p
                        scale = 720 / frame.shape[0]
                        new_width = int(frame.shape[1] * scale)
                        live_frame = cv2.resize(frame, (new_width, 720), interpolation=cv2.INTER_NEAREST)
                    
                    ret, jpeg = cv2.imencode('.jpg', live_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
                    if ret:
                        with self.lock:
                            self.latest_frame_jpeg = jpeg.tobytes()
                            self.last_frame_update_time = time.time()
                
                # FPS Calculation
                self.frame_count += 1
                if time.time() - self.last_fps_time >= 1.0:
                    self.fps = self.frame_count
                    self.frame_count = 0
                    self.last_fps_time = time.time()

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
        self.stream_reader.join()
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
        
        # OPTIMIZATION: Skip frames for motion detection (process every 3rd frame)
        self.motion_frame_counter += 1
        if self.motion_frame_counter % 3 != 0:
            return  # Skip frames, process every 3rd
        
        # Resize for faster processing (optimized: smaller resolution + fastest interpolation)
        small_frame = cv2.resize(frame, (320, 180), interpolation=cv2.INTER_NEAREST)
        
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
                    if self.event_callback:
                        self.event_callback(self.camera_id, 'motion_start')
                    
                    # Take snapshot if mode is Motion Triggered
                    if self.config.get('picture_recording_mode') == 'Motion Triggered':
                        self.save_snapshot(frame)
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
            
            # Scale: 1.0 at 1080p roughly
            base_scale = self.config.get('text_scale', 1.0)
            font_scale = (base_scale / 10.0) * (w / 1920.0) * 2.5
            thickness = max(1, int(font_scale * 2))
            
            # Text Right (Timestamp)
            text_right = self.config.get('text_right', '')
            if '%Y' in text_right or '%m' in text_right: 
                text_right = datetime.now().strftime(text_right)
                
            if text_right:
                (ts_w, ts_h), _ = cv2.getTextSize(text_right, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                cv2.rectangle(frame, (w - ts_w - 20, h - ts_h - 20), (w, h), (0, 0, 0), -1)
                cv2.putText(frame, text_right, (w - ts_w - 10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)

            # Text Left (Camera Name)
            text_left = self.config.get('text_left', '')
            cam_name = self.config.get('name', 'Camera')
            
            text_left = text_left.replace('$', '').strip()
            if text_left == '%' or text_left == '%N' or not text_left:
                text_left = cam_name
            else:
                text_left = text_left.replace('%N', cam_name)
            
            if '%Y' in text_left or '%m' in text_left or '%d' in text_left:
                 text_left = datetime.now().strftime(text_left)
                 
            if text_left:
                (nm_w, nm_h), _ = cv2.getTextSize(text_left, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                cv2.rectangle(frame, (0, 0), (nm_w + 20, nm_h + 20), (0, 0, 0), -1)
                cv2.putText(frame, text_left, (10, nm_h + 10), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)
        except Exception as e:
            logger.error(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Overlay error: {e}")
            
        # Motion Debug Box
        if self.motion_detected and self.config.get('show_motion_box', False):
            cv2.rectangle(frame, (10, 10), (w-10, h-10), (0, 0, 255), 4)

    def handle_recording(self, frame):
        mode = self.config.get('recording_mode', 'Off')
        should_record = False
        
        if mode == 'Always':
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

        if self.is_recording and self.recording_process:
            try:
                self.recording_process.stdin.write(frame.tobytes())
            except Exception as e:
                logger.error(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Error writing to ffmpeg: {e}")
                self.stop_recording()

    def start_recording(self, width, height):
        format_str = self.config.get('movie_file_name', '%Y-%m-%d/%H-%M-%S')
        format_str = format_str.replace('%q', '00') 
        
        timestamp_path = datetime.now().strftime(format_str)
        output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
        
        full_path = os.path.join(output_dir, f"{timestamp_path}.mp4")
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Start Recording to {full_path}")
        
        # Map quality (0-100) to CRF (51-18)
        # 100 = CRF 18 (Visually Lossless)
        # 75  = CRF 26 (Good Compromise)
        # 50  = CRF 34 (Low Quality)
        quality = self.config.get('movie_quality', 75)
        crf = int(51 - (quality * 0.33))
        crf = max(18, min(51, crf))

        command = [
            'ffmpeg',
            '-y',
            '-f', 'rawvideo',
            '-vcodec', 'rawvideo',
            '-s', f'{width}x{height}',
            '-pix_fmt', 'bgr24',
            '-r', str(self.config.get('framerate', 15)),
            '-i', '-',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', str(crf),
            '-pix_fmt', 'yuv420p',
            full_path
        ]
        
        try:
            self.recording_process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
            self.is_recording = True
            self.recording_filename = full_path
            self.recording_start_time = time.time()
            
            # Write pre-capture buffer
            if len(self.pre_buffer) > 0:
                try:
                    for f in self.pre_buffer:
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
                self.recording_process.stdin.close()
                self.recording_process.wait()
                self.recording_process = None
            self.is_recording = False
            
            if self.event_callback:
                 self.event_callback(self.camera_id, 'recording_end', {
                     "file_path": self.recording_filename,
                     "width": self.width,
                     "height": self.height
                 })

    def update_config(self, new_config):
        """ Update config dynamically without stopping thread """
        self.config.update(new_config)
        
        # Update StreamReader URL if changed
        if 'rtsp_url' in new_config:
            self.stream_reader.update_url(new_config['rtsp_url'])

        # Update pre-buffer length
        pre_cap = self.config.get('pre_capture', 0)
        if pre_cap > 0 and self.pre_buffer.maxlen != pre_cap:
            self.pre_buffer = deque(self.pre_buffer, maxlen=pre_cap)
            
        logger.info(f"Camera {self.config.get('name')} (ID: {self.camera_id}): Config updated")
        
    def stop(self):
        self.running = False
        self.join()

    def get_frame_bytes(self):
        with self.lock:
            # Prevent serving stale frames (older than 10 seconds)
            if time.time() - self.last_frame_update_time > 10:
                return None
            return self.latest_frame_jpeg

    def save_snapshot(self, frame=None):
        """Save a single snapshot"""
        try:
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
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
            output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
            
            filepath = os.path.join(output_dir, f"{timestamp_path}.jpg")
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            
            with open(filepath, "wb") as f:
                f.write(jpeg_bytes)
            
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
