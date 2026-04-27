import subprocess
import os
import time
import logging
import threading
from datetime import datetime
from utils import mask_url

logger = logging.getLogger(__name__)

class RecordingManager:
    def __init__(self, camera_id, camera_name, config):
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.config = config
        self.recording_process = None
        self.is_recording = False
        self.recording_filename = None
        self.recording_start_time = 0.0
        self.passthrough_active = False
        self.passthrough_error_count = 0
        self.current_ai_detections = [] # Track unique labels found during this event

    def handle_recording(self, frame, motion_detected, last_motion_time, stop_recording_cb, trigger_source=None, ai_results=None):
        mode = self.config.get('recording_mode', 'Off')
        should_record = False
        reason = "Continuous" if mode in ['Always', 'Continuous'] else ("Motion" if mode == 'Motion Triggered' and motion_detected else None)
        if reason:
            should_record = True
            
        max_len = self.config.get('max_movie_length', 0)
        if self.is_recording and max_len > 0:
            if time.time() - self.recording_start_time > max_len:
                logger.info(f"Camera {self.camera_name} (ID: {self.camera_id}): Max movie length reached, splitting file")
                stop_recording_cb()
        
        # Accumulate AI results if recording
        if self.is_recording and ai_results:
            for res in ai_results:
                label = res.get('label')
                if label and label not in self.current_ai_detections:
                    self.current_ai_detections.append(label)

        if should_record and not self.is_recording:
            self.start_recording(frame.shape[1], frame.shape[0], None, reason=reason, trigger_source=trigger_source) # pre_buffer handled by CameraThread
            return True
        elif not should_record and self.is_recording:
            post_cap = self.config.get('post_capture', 5)
            if not motion_detected and (time.time() - last_motion_time > post_cap):
                 stop_recording_cb()

        if self.is_recording and self.passthrough_active and self.recording_process:
             if self.recording_process.poll() is not None:
                 logger.error(f"Camera {self.camera_name}: Passthrough recording process died unexpectedly. Aborting motion event.")
                 stop_recording_cb()
                 self.passthrough_error_count += 1
                 return False

        if self.is_recording and self.recording_process and not self.passthrough_active:
            try:
                self.recording_process.stdin.write(frame.tobytes())
            except Exception as e:
                logger.error(f"Camera {self.camera_name} (ID: {self.camera_id}): Error writing to ffmpeg: {e}")
                stop_recording_cb()
        
        return True

    def _monitor_ffmpeg_logs(self, process):
        try:
            for line in iter(process.stderr.readline, b''):
                if not line: break
                msg = line.decode('utf-8', errors='replace').strip()
                if not msg: continue
                masked_msg = mask_url(msg)
                logger.error(f"FFmpeg [{self.camera_name}]: {masked_msg}")
        except Exception:
            pass

    def start_recording(self, width, height, pre_buffer_frames, event_callback=None, reason="Manual", trigger_source=None):
        self.current_ai_detections = [] # Reset for new event
        format_str = self.config.get('movie_file_name', '%Y-%m-%d/%H-%M-%S').replace('%q', '00')
        timestamp_path = datetime.now().strftime(format_str)
        output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
        full_path = os.path.join(output_dir, f"{timestamp_path}.mp4")
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        trigger_info = f" (Trigger: {trigger_source})" if trigger_source else ""
        logger.info(f"[RECORDING] Camera {self.camera_name} (ID: {self.camera_id}): Start Recording (Reason: {reason}) to {full_path}{trigger_info}")
        
        if self.passthrough_error_count > 1:
            self.passthrough_active = False
        else:
            self.passthrough_active = self.config.get('movie_passthrough', False)
        
        if self.passthrough_active:
            audio_args = ['-c:a', 'aac', '-b:a', '128k'] if self.config.get('record_audio') else ['-an']
            command = [
                'ffmpeg', '-y', '-rtsp_transport', 'tcp', '-hide_banner', '-loglevel', 'error',
                '-i', self.config['rtsp_url'], '-c:v', 'copy', *audio_args, '-f', 'mp4',
                '-movflags', '+faststart', full_path
            ]
            try:
                self.recording_process = subprocess.Popen(command, stderr=subprocess.PIPE)
                threading.Thread(target=self._monitor_ffmpeg_logs, args=(self.recording_process,), daemon=True).start()
                self.is_recording = True
                self.recording_filename = full_path
                self.recording_start_time = time.time()
                if event_callback:
                    event_callback(self.camera_id, 'recording_start', {"file_path": full_path, "width": width, "height": height})
                logger.info(f"Camera {self.camera_name}: Started Passthrough Recording")
                return 
            except Exception as e:
                logger.error(f"Camera {self.camera_name}: Failed to start Passthrough ffmpeg: {e}")
                self.passthrough_active = False
                self.is_recording = False
                self.passthrough_error_count += 1
                return

        quality = self.config.get('movie_quality', 75)
        crf = max(18, min(51, int(51 - (quality * 0.33))))
        hw_accel_enabled = os.environ.get('HW_ACCEL', 'false').lower() == 'true'
        hw_accel_type = os.environ.get('HW_ACCEL_TYPE', 'auto').lower()
        video_codec = 'libx264'
        codec_specific_args = ['-preset', self.config.get('opt_ffmpeg_preset', 'ultrafast'), '-crf', str(crf)]
        
        try:
            from main import GLOBAL_CONFIG
            ffmpeg_loglevel = 'debug' if GLOBAL_CONFIG.get('opt_verbose_engine_logs') else 'error'
        except ImportError:
            ffmpeg_loglevel = 'error'
        
        if hw_accel_enabled:
            if hw_accel_type in ['vaapi', 'intel', 'amd', 'auto'] and os.path.exists('/dev/dri'):
                video_codec = 'h264_vaapi'
                codec_specific_args = ['-vaapi_device', '/dev/dri/renderD128', '-vf', 'format=nv12,hwupload', '-qp', str(int(crf * 0.7))]
            elif hw_accel_type == 'nvidia':
                video_codec = 'h264_nvenc'
                codec_specific_args = ['-preset', 'fast', '-cq', str(crf)]
        
        command = [
            'ffmpeg', '-y', '-loglevel', ffmpeg_loglevel, '-f', 'rawvideo', '-vcodec', 'rawvideo',
            '-s', f'{width}x{height}', '-pix_fmt', 'bgr24', '-r', str(self.config.get('framerate', 15)),
            '-i', '-'
        ]
        
        if self.config.get('record_audio'):
            # Fetch audio from RTSP as a second input
            command += [
                '-rtsp_transport', self.config.get('rtsp_transport', 'tcp'),
                '-i', self.config['rtsp_url'],
                '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '128k'
            ]
        else:
            command += ['-an']

        command += ['-c:v', video_codec, *codec_specific_args, '-pix_fmt', 'yuv420p', full_path]
        
        try:
            self.recording_process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            threading.Thread(target=self._monitor_ffmpeg_logs, args=(self.recording_process,), daemon=True).start()
            self.is_recording = True
            self.recording_filename = full_path
            self.recording_start_time = time.time()
            
            if pre_buffer_frames:
                try:
                    throttle = int(self.config.get('opt_pre_capture_fps_throttle', 1))
                    for f in pre_buffer_frames:
                        for _ in range(max(1, throttle)):
                            self.recording_process.stdin.write(f.tobytes())
                except Exception as e:
                    logger.error(f"Camera {self.camera_name} (ID: {self.camera_id}): Error writing pre-buffer: {e}")
            
            if event_callback:
                event_callback(self.camera_id, 'recording_start', {"file_path": full_path, "width": width, "height": height})
        except Exception as e:
            logger.error(f"Camera {self.camera_name} (ID: {self.camera_id}): Failed to start ffmpeg: {e}")
            self.is_recording = False
            self.recording_process = None


    def stop_recording(self, event_callback=None, width=0, height=0):
        if not self.is_recording: return
        logger.info(f"[RECORDING] Camera {self.camera_name} (ID: {self.camera_id}): Stop Recording")
        if self.recording_process:
            if self.passthrough_active:
                self.recording_process.terminate()
                try: self.recording_process.wait(timeout=5)
                except subprocess.TimeoutExpired: self.recording_process.kill()
            else:
                if self.recording_process.stdin: self.recording_process.stdin.close()
                self.recording_process.wait()
            self.recording_process = None
        self.is_recording = False
        
        time.sleep(0.5)
        
        valid_recording = False
        if self.recording_filename and os.path.exists(self.recording_filename):
            try:
                if os.path.getsize(self.recording_filename) < 1024:
                    os.remove(self.recording_filename)
                else:
                    valid_recording = True
            except Exception: pass

        if valid_recording and event_callback:
             event_callback(self.camera_id, 'recording_end', {
                 "file_path": self.recording_filename, 
                 "width": width, 
                 "height": height,
                 "ai_metadata": ",".join(self.current_ai_detections) if self.current_ai_detections else None
             })
