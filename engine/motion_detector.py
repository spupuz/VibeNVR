import cv2
import numpy as np
import logging
import time

logger = logging.getLogger(__name__)

class MotionDetector:
    def __init__(self, camera_id, camera_name, config):
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.config = config
        self.fgbg = None
        self.motion_detected = False
        self.last_motion_time = 0.0
        self.consecutive_motion_frames = 0
        self.consecutive_still_frames = 0
        self.motion_frame_counter = 0
        self.last_trigger_source = None

    def detect(self, frame, event_callback, save_snapshot_cb, privacy_polygons, motion_polygons, apply_masks_fn, external_motion_time=0, source="external"):
        detect_mode = self.config.get('detect_motion_mode', 'Always')
        recording_mode = self.config.get('recording_mode', 'Motion Triggered')
        detect_engine = self.config.get('detect_engine', 'OpenCV')
        
        self.motion_frame_counter += 1
        
        # Periodic diagnostic log
        if self.motion_frame_counter % 1000 == 0:
            logger.info(f"Camera {self.camera_name} (ID: {self.camera_id}): Active Detect Engine: {detect_engine}")

        
        # Check for external motion (e.g. ONVIF Edge)
        ext_motion_active = (time.time() - external_motion_time) < 2.0
        
        if detect_mode == 'Off' or recording_mode == 'Off':
            if self.motion_detected:
                self.motion_detected = False
                logger.info(f"Camera {self.camera_name} (ID: {self.camera_id}): Motion END (detection disabled)")
                if event_callback:
                    event_callback(self.camera_id, 'motion_end')
            return False

        if detect_engine == 'ONVIF Edge':
            if ext_motion_active:
                self.last_motion_time = time.time()
                if not self.motion_detected:
                    self.motion_detected = True
                    self.last_trigger_source = source or "ONVIF Edge"
                    logger.info(f"[DETECTION] Camera {self.camera_name} (ID: {self.camera_id}): Motion START (Source: {self.last_trigger_source})")
                    vid_mode = self.config.get('recording_mode', 'Off')
                    snap_path = None
                    if vid_mode != 'Off':
                        snap_path = save_snapshot_cb(frame, is_temp=True)
                    if event_callback:
                        payload = {'file_path': snap_path, 'source': self.last_trigger_source} if snap_path else {'source': self.last_trigger_source}

                        event_callback(self.camera_id, 'motion_start', payload)
            else:
                motion_gap = self.config.get('motion_gap', 10)
                if self.motion_detected and (time.time() - self.last_motion_time > motion_gap):
                    self.motion_detected = False
                    logger.info(f"Camera {self.camera_name} (ID: {self.camera_id}): Motion END (ONVIF Edge)")
                    if event_callback:
                        event_callback(self.camera_id, 'motion_end')
            return self.motion_detected

        motion_throttle = self.config.get('opt_motion_fps_throttle', 3)

        if self.motion_frame_counter % motion_throttle != 0:
            return self.motion_detected

        motion_h = self.config.get('opt_motion_analysis_height', 180)
        scale = motion_h / frame.shape[0]
        motion_w = int(frame.shape[1] * scale)
        small_frame = cv2.resize(frame, (motion_w, motion_h), interpolation=cv2.INTER_NEAREST)

        apply_masks_fn(small_frame, privacy_polygons, alpha=1.0, color=(0, 0, 0))
        apply_masks_fn(small_frame, motion_polygons, alpha=1.0, color=(0, 0, 0))

        if self.fgbg is None:
            self.fgbg = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=25, detectShadows=False)
            logger.info(f"Camera {self.camera_name}: MOG2 background subtractor initialized")

        fgmask = self.fgbg.apply(small_frame)
        _, fgmask = cv2.threshold(fgmask, 200, 255, cv2.THRESH_BINARY)

        if self.config.get('despeckle_filter', False):
            kernel = np.ones((3,3), np.uint8)
            fgmask = cv2.erode(fgmask, kernel, iterations=1)
            fgmask = cv2.dilate(fgmask, kernel, iterations=1)

        motion_ratio = (np.count_nonzero(fgmask) / fgmask.size) * 100
        threshold_percent = self.config.get('threshold_percent', 1.0)
        
        if 'threshold' in self.config:
            thresh_pixels = int(self.config['threshold'])
            threshold_percent = (thresh_pixels / (small_frame.shape[0] * small_frame.shape[1])) * 100

        if motion_ratio > threshold_percent:
            self.consecutive_motion_frames += 1
            self.consecutive_still_frames = 0
            min_frames = self.config.get('min_motion_frames', 2)
            if self.consecutive_motion_frames >= min_frames:
                self.last_motion_time = time.time()
                if not self.motion_detected:
                    self.motion_detected = True
                    self.last_trigger_source = "OpenCV"
                    logger.info(f"[DETECTION] Camera {self.camera_name} (ID: {self.camera_id}): Motion START (Source: {self.last_trigger_source})")
                    pic_mode = self.config.get('picture_recording_mode', 'Manual')
                    vid_mode = self.config.get('recording_mode', 'Off')
                    snap_path = None
                    if pic_mode == 'Motion Triggered':
                        snap_path = save_snapshot_cb(frame, is_temp=False)
                    elif vid_mode != 'Off':
                        snap_path = save_snapshot_cb(frame, is_temp=True)
                    if event_callback:
                        payload = {'file_path': snap_path, 'source': 'Standard'} if snap_path else {'source': 'Standard'}

                        event_callback(self.camera_id, 'motion_start', payload)
        else:
            self.consecutive_still_frames += 1
            self.consecutive_motion_frames = 0
            motion_gap = self.config.get('motion_gap', 10)
            if self.motion_detected and (time.time() - self.last_motion_time > motion_gap):
                self.motion_detected = False
                logger.info(f"Camera {self.camera_name} (ID: {self.camera_id}): Motion END")
                if event_callback:
                    event_callback(self.camera_id, 'motion_end')
        
        return self.motion_detected
