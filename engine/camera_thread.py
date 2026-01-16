import cv2
import time
import threading
import queue
import subprocess
import os
import numpy as np
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class CameraThread(threading.Thread):
    def __init__(self, camera_id, config, event_callback=None):
        super().__init__()
        self.camera_id = camera_id
        self.config = config # Dict containing rtsp_url, name, text settings, etc.
        self.event_callback = event_callback # Function to call on events (start/stop recording, motion)
        
        self.running = False
        self.cap = None
        # Queue replaced with atomic storage for broadcasting
        self.latest_frame_jpeg = None
        self.lock = threading.Lock()
        
        # Motion Detection
        self.fgbg = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=25, detectShadows=True)
        self.motion_detected = False
        self.last_motion_time = 0
        self.recording_start_time = 0
        
        # Recording
        self.recording_process = None
        self.is_recording = False
        self.recording_filename = None
        
        # Metrics
        self.fps = 0
        self.frame_count = 0
        self.frame_count = 0
        self.last_fps_time = time.time()
        
        self.output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Dimensions
        self.width = 0
        self.height = 0

        # Pre-capture buffer
        from collections import deque
        self.pre_buffer = deque(maxlen=self.config.get('pre_capture', 0) or 1)
    
    def _mask_url(self, url):
        import re
        if not url: return ""
        return re.sub(r'://([^:]+):([^@]+)@', r'://\1:*****@', url)

    def run(self):
        self.running = True
        logger.info(f"Camera {self.camera_id}: Starting thread")
        
        # Suppress OpenCV videoio debug
        os.environ["OPENCV_VIDEOIO_DEBUG"] = "0"
        
        while self.running:
            loop_start_time = time.time()
            try:
                if self.cap is None or not self.cap.isOpened():
                    logger.info(f"Camera {self.camera_id}: Connecting to {self._mask_url(self.config['rtsp_url'])}...")
                    self.cap = cv2.VideoCapture(self.config['rtsp_url'])
                    if not self.cap.isOpened():
                        # Use debug level for retries to avoid spamming info/error logs
                        logger.warning(f"Camera {self.camera_id}: Failed to connect. Retrying in 2s...")
                        time.sleep(2)
                        continue
                    logger.info(f"Camera {self.camera_id}: Connected successfully!")
                
                ret, frame = self.cap.read()
                if not ret:
                    logger.warning(f"Camera {self.camera_id}: Failed to read frame. Reconnecting...")
                    self.cap.release()
                    self.cap = None
                    time.sleep(1)
                    continue
                
                # Resize if needed
                target_w = self.config.get('resolution_width')
                target_h = self.config.get('resolution_height')
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

                # 1. Motion Detection
                self.detect_motion(frame)

                # 2. Text Overlay
                self.draw_overlay(frame)
                
                # 4. Handle Recording
                self.handle_recording(frame)
                
                # Buffer for pre-capture (even if not recording)
                pre_cap_count = self.config.get('pre_capture', 0)
                if pre_cap_count > 0:
                    if self.pre_buffer.maxlen != pre_cap_count:
                        from collections import deque
                        self.pre_buffer = deque(self.pre_buffer, maxlen=pre_cap_count)
                    self.pre_buffer.append(frame.copy())

                # 5. Update Stream Buffer (Broadcast)
                ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                if ret:
                    with self.lock:
                        self.latest_frame_jpeg = jpeg.tobytes()
                
                # FPS Calculation
                self.frame_count += 1
                if time.time() - self.last_fps_time >= 1.0:
                    self.fps = self.frame_count
                    self.frame_count = 0
                    self.last_fps_time = time.time()

                # Framerate throttle
                # If we processed faster than target FPS, sleep
                target_fps = self.config.get('framerate', 30)
                if target_fps > 0:
                     elapsed = time.time() - loop_start_time
                     target_time = 1.0 / target_fps
                     if elapsed < target_time:
                         time.sleep(target_time - elapsed)

            except Exception as e:
                logger.error(f"Camera {self.camera_id}: Error in loop: {e}")
                time.sleep(1)
                
        # Cleanup
        if self.cap:
            self.cap.release()
        self.stop_recording()
        logger.info(f"Camera {self.camera_id}: Thread stopped")

    def detect_motion(self, frame):
        # Resize for faster processing
        small_frame = cv2.resize(frame, (640, 360))
        fgmask = self.fgbg.apply(small_frame)
        
        # Threshold to remove shadows
        _, fgmask = cv2.threshold(fgmask, 200, 255, cv2.THRESH_BINARY)
        
        # Calculate motion ratio
        motion_ratio = (np.count_nonzero(fgmask) / fgmask.size) * 100
        
        threshold_percent = self.config.get('threshold_percent', 1.0)
        # Compatibility with 'Motion' project 'threshold' (pixels)
        if 'threshold' in self.config:
            # threshold is pixels, e.g. 1500
            # small_frame is 640x360 = 230400 pixels
            thresh_pixels = int(self.config['threshold'])
            threshold_percent = (thresh_pixels / (640 * 360)) * 100
        
        if motion_ratio > threshold_percent:
            self.last_motion_time = time.time()
            if not self.motion_detected:
                self.motion_detected = True
                logger.info(f"Camera {self.camera_id}: Motion START")
                if self.event_callback:
                    self.event_callback(self.camera_id, 'motion_start')
                
                # Take snapshot if mode is Motion Triggered
                if self.config.get('picture_recording_mode') == 'Motion Triggered':
                    self.save_snapshot(frame)
        else:
            motion_gap = self.config.get('motion_gap', 10)
            if self.motion_detected and (time.time() - self.last_motion_time > motion_gap):
                self.motion_detected = False
                logger.info(f"Camera {self.camera_id}: Motion END")
                if self.event_callback:
                    self.event_callback(self.camera_id, 'motion_end')

    def draw_overlay(self, frame):
        try:
            h, w = frame.shape[:2]
            
            # Scale: 1.0 at 1080p roughly
            base_scale = self.config.get('text_scale', 1.0) # User input 1-50
            # Normalize the user input (10 -> 1.0 roughly)
            font_scale = (base_scale / 10.0) * (w / 1920.0) * 2.5
            thickness = max(1, int(font_scale * 2))
            
            # Text Right (Timestamp often) -- now bottom right
            text_right = self.config.get('text_right', '')
            if '%Y' in text_right or '%m' in text_right: # Simple strftime check
                text_right = datetime.now().strftime(text_right)
                
            if text_right:
                (ts_w, ts_h), _ = cv2.getTextSize(text_right, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                # Draw black background
                cv2.rectangle(frame, (w - ts_w - 20, h - ts_h - 20), (w, h), (0, 0, 0), -1)
                cv2.putText(frame, text_right, (w - ts_w - 10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)

            # Text Left (Camera Name)
            text_left = self.config.get('text_left', '')
            cam_name = self.config.get('name', 'Camera')
            
            # 1. Clean up legacy motion symbols ($) and whitespace
            text_left = text_left.replace('$', '').strip()
            
            # 2. If it is only a placeholder or empty, use the actual camera name
            if text_left == '%' or text_left == '%N' or not text_left:
                text_left = cam_name
            else:
                # 3. Replace placeholders if they are part of a longer string
                text_left = text_left.replace('%N', cam_name)
            
            # Support datetime in left text
            if '%Y' in text_left or '%m' in text_left or '%d' in text_left:
                 text_left = datetime.now().strftime(text_left)
                 
            if text_left:
                (nm_w, nm_h), _ = cv2.getTextSize(text_left, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                cv2.rectangle(frame, (0, 0), (nm_w + 20, nm_h + 20), (0, 0, 0), -1)
                cv2.putText(frame, text_left, (10, nm_h + 10), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)
        except Exception as e:
            logger.error(f"Camera {self.camera_id}: Overlay error: {e}")
            
        # Motion Debug Box
        if self.motion_detected and self.config.get('show_motion_box', False):
            cv2.rectangle(frame, (10, 10), (w-10, h-10), (0, 0, 255), 4)

        # REC Indicator Overlay
        # (Removed as requested by user)
        pass

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
                logger.info(f"Camera {self.camera_id}: Max movie length reached, splitting file")
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
                logger.error(f"Camera {self.camera_id}: Error writing to ffmpeg: {e}")
                self.stop_recording()

    def start_recording(self, width, height):
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
        os.makedirs(output_dir, exist_ok=True)
        filename = f"{output_dir}/{timestamp}.mp4"
        
        logger.info(f"Camera {self.camera_id}: Start Recording to {filename}")
        
        # Use movie_quality (10-100) to map to CRF (51-0)
        # Typical good quality is CRF 23.
        quality = self.config.get('movie_quality', 75)
        crf = max(0, min(51, int(51 - (quality * 51 / 100))))

        # FFmpeg command to read raw video from stdin and encode to MP4
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
            filename
        ]
        
        try:
            self.recording_process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
            self.is_recording = True
            self.recording_filename = filename
            self.recording_start_time = time.time()
            
            # Write pre-capture buffer
            if len(self.pre_buffer) > 0:
                try:
                    for f in self.pre_buffer:
                        self.recording_process.stdin.write(f.tobytes())
                    self.pre_buffer.clear()
                except Exception as e:
                    logger.error(f"Camera {self.camera_id}: Error writing pre-buffer: {e}")
            
            if self.event_callback:
                 self.event_callback(self.camera_id, 'recording_start', {
                     "file_path": filename,
                     "width": width,
                     "height": height
                 })
                 
        except Exception as e:
            logger.error(f"Camera {self.camera_id}: Failed to start ffmpeg: {e}")

    def stop_recording(self):
        if self.is_recording:
            logger.info(f"Camera {self.camera_id}: Stop Recording")
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
        
        # Update pre-buffer length if pre_capture changed
        pre_cap = self.config.get('pre_capture', 0)
        if pre_cap > 0 and self.pre_buffer.maxlen != pre_cap:
            from collections import deque
            self.pre_buffer = deque(self.pre_buffer, maxlen=pre_cap)
            
        logger.info(f"Camera {self.camera_id}: Config updated")
        
    def stop(self):
        self.running = False
        self.join()

    def get_frame_bytes(self):
        with self.lock:
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

            # Save to disk
            timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
            filename = f"{timestamp}.jpg"
            filepath = os.path.join(self.output_dir, filename)
            
            with open(filepath, "wb") as f:
                f.write(jpeg_bytes)
            
            logger.info(f"Camera {self.camera_id}: Snapshot saved to {filepath}")

            if self.event_callback:
                self.event_callback(self.camera_id, "snapshot_save", {
                    "file_path": filepath,
                    "width": self.width,
                    "height": self.height
                })
            return filepath
        except Exception as e:
            logger.error(f"Camera {self.camera_id}: Failed to save snapshot: {e}")
            return False
