import subprocess
import os
import time
import logging
import threading
import queue
from datetime import datetime
from utils import mask_url

logger = logging.getLogger(__name__)

_VAAPI_INIT_CACHE = None

def _probe_vaapi_init():
    global _VAAPI_INIT_CACHE
    if _VAAPI_INIT_CACHE is not None:
        return _VAAPI_INIT_CACHE
    try:
        cmd = [
            'ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=128x128',
            '-vframes', '1', '-vaapi_device', '/dev/dri/renderD128',
            '-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi',
            '-f', 'null', '-'
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3)
        _VAAPI_INIT_CACHE = (result.returncode == 0)
        if not _VAAPI_INIT_CACHE:
            logger.warning("VAAPI hardware encode probe failed. Host may lack support. Falling back to SW.")
    except Exception:
        _VAAPI_INIT_CACHE = False
    return _VAAPI_INIT_CACHE

# Pre-warm VAAPI probe at module load in a background thread so the result is cached
# before the first recording starts. This avoids a 3-second blocking subprocess.run
# in the first recording's critical path (_launch_ffmpeg thread).
import threading as _threading
_threading.Thread(target=_probe_vaapi_init, daemon=True).start()

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
        self.last_event_callback = None
        self.current_ai_detections = [] # Track unique labels found during this event

    def handle_recording(self, frame, motion_detected, last_motion_time, stop_recording_cb, trigger_source=None, ai_results=None, pre_buffer_frames=None):
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
            pre_buf = pre_buffer_frames or []
            pre_buf.append(frame.copy())
            self.start_recording(frame.shape[1], frame.shape[0], pre_buf, reason=reason, trigger_source=trigger_source)
            return True
        elif not should_record and self.is_recording:
            post_cap = self.config.get('post_capture', 5)
            if not motion_detected and (time.time() - last_motion_time > post_cap):
                 stop_recording_cb()

        if self.is_recording and self.passthrough_active and self.recording_process:
             if self.recording_process.poll() is not None:
                 logger.error(f"Camera {self.camera_name}: Passthrough recording process died unexpectedly. Falling back to transcoded recording.")
                 self.stop_recording(None, frame.shape[1], frame.shape[0])
                 self.start_recording(frame.shape[1], frame.shape[0], None, event_callback=self.last_event_callback, reason="Fallback", trigger_source=trigger_source)
                 return True

        if self.is_recording and self.recording_process and not self.passthrough_active:
            if self.recording_process.poll() is not None:
                 logger.error(f"Camera {self.camera_name}: Transcoded recording process died unexpectedly. Attempting to restart recording.")
                 self.stop_recording(None, frame.shape[1], frame.shape[0])
                 self.start_recording(frame.shape[1], frame.shape[0], None, event_callback=self.last_event_callback, reason="Restart", trigger_source=trigger_source)
                 return True

            if hasattr(self, 'frame_queue'):
                try:
                    # Pass the numpy array reference instead of converting to bytes immediately
                    self.frame_queue.put_nowait(frame)
                except queue.Full:
                    logger.warning(f"Camera {self.camera_name}: FFmpeg queue full, dropping frame")
        
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
        if event_callback is not None:
            self.last_event_callback = event_callback
        format_str = self.config.get('movie_file_name', '%Y-%m-%d/%H-%M-%S').replace('%q', '00')
        timestamp_path = datetime.now().strftime(format_str)
        output_dir = f"/var/lib/vibe/recordings/{self.camera_id}"
        full_path = os.path.join(output_dir, f"{timestamp_path}.mp4")
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        trigger_info = f" (Trigger: {trigger_source})" if trigger_source else ""
        logger.info(f"[RECORDING] Camera {self.camera_name} (ID: {self.camera_id}): Start Recording (Reason: {reason}) to {full_path}{trigger_info}")
        
        if reason == "Fallback":
            self.passthrough_active = False
        else:
            self.passthrough_active = self.config.get('movie_passthrough', False)
        
        if self.passthrough_active:
            audio_args = ['-c:a', 'aac', '-b:a', '128k'] if self.config.get('record_audio') else ['-an']
            # Use frag_keyframe+empty_moov+default_base_moof so the moov atom is written at
            # the START of the file (empty_moov) and a new fragment is flushed at each keyframe.
            # This ensures the MP4 is always valid and playable even if FFmpeg is terminated
            # mid-recording (unlike +faststart which requires a final mux pass at the end).
            command = [
                'ffmpeg', '-y', '-rtsp_transport', self.config.get('rtsp_transport', 'tcp'), '-hide_banner', '-loglevel', 'error',
                '-i', self.config['rtsp_url'], '-c:v', 'copy', *audio_args, '-f', 'mp4',
                '-movflags', '+frag_keyframe+empty_moov+default_base_moof', full_path
            ]
            try:
                from ai_detector import AIDetector
                ai_lock = AIDetector().inference_lock
                with ai_lock:
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
                return

        # Setup Async Writer Queue synchronously so CameraThread can push to it immediately
        self.frame_queue = queue.Queue(maxsize=1500)
        self.is_recording = True
        self.recording_filename = full_path
        self.recording_start_time = time.time()
        
        # Flush pre-buffer synchronously
        if pre_buffer_frames:
            for pref in pre_buffer_frames:
                try:
                    self.frame_queue.put_nowait(pref)
                except queue.Full:
                    pass

        def _launch_ffmpeg():
            quality = self.config.get('movie_quality', 75)
            crf = max(18, min(51, int(51 - (quality * 0.33))))
            hw_accel_enabled = os.environ.get('HW_ACCEL', 'false').lower() == 'true'
            hw_accel_type = os.environ.get('HW_ACCEL_TYPE', 'auto').lower()
            video_codec = 'libx264'
            # Limit CPU threads to prevent system starvation during fallback SW encoding
            codec_specific_args = ['-preset', self.config.get('opt_ffmpeg_preset', 'ultrafast'), '-crf', str(crf), '-threads', '2']
            
            try:
                from main import GLOBAL_CONFIG
                ffmpeg_loglevel = 'debug' if GLOBAL_CONFIG.get('opt_verbose_engine_logs') else 'error'
            except ImportError:
                ffmpeg_loglevel = 'error'
            
            if hw_accel_enabled:
                if hw_accel_type in ['vaapi', 'intel', 'amd', 'auto'] and os.path.exists('/dev/dri'):
                    if _probe_vaapi_init():
                        video_codec = 'h264_vaapi'
                        codec_specific_args = ['-vaapi_device', '/dev/dri/renderD128', '-vf', 'format=nv12,hwupload', '-qp', str(int(crf * 0.7))]
                elif hw_accel_type == 'nvidia':
                    video_codec = 'h264_nvenc'
                    codec_specific_args = ['-preset', 'fast', '-cq', str(crf)]
            
            target_w, target_h = width, height
            needs_resize = False
            if not hw_accel_enabled and height > 720:
                needs_resize = True
                scale = 720 / height
                target_h = 720
                target_w = int(width * scale)
                target_w -= target_w % 2  # Must be even for yuv420p

            command = [
                'ffmpeg', '-y', '-loglevel', ffmpeg_loglevel, '-f', 'rawvideo', '-vcodec', 'rawvideo',
                '-s', f'{target_w}x{target_h}', '-pix_fmt', 'bgr24', '-r', str(self.config.get('framerate', 15)),
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

            # -shortest is CRITICAL: it forces FFmpeg to stop recording the RTSP audio stream when stdin (video) closes.
            command += ['-c:v', video_codec, *codec_specific_args, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-shortest', full_path]
            
            # Apply nice -n 19 to lower FFmpeg's CPU scheduling priority
            command = ['nice', '-n', '19'] + command

            try:
                self.recording_process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
                
                threading.Thread(target=self._monitor_ffmpeg_logs, args=(self.recording_process,), daemon=True).start()
                
                def _async_ffmpeg_writer(proc, q, cam_name, w, h, do_resize):
                    try:
                        while True:
                            if proc.poll() is not None:
                                break
                            try:
                                frame_data = q.get(timeout=1.0)
                                if frame_data is None:
                                    break
                                if do_resize:
                                    frame_data = cv2.resize(frame_data, (w, h), interpolation=cv2.INTER_LINEAR)
                                proc.stdin.write(frame_data.tobytes())
                                time.sleep(0.033)
                            except queue.Empty:
                                continue
                            except Exception as e:
                                logger.error(f"Camera {cam_name}: Async FFmpeg writer died: {e}")
                                break
                    finally:
                        if proc.stdin:
                            try:
                                proc.stdin.close()
                            except Exception:
                                pass

                self.writer_thread = threading.Thread(target=_async_ffmpeg_writer, args=(self.recording_process, self.frame_queue, self.camera_name, target_w, target_h, needs_resize), daemon=True)
                self.writer_thread.start()
                
                if event_callback:
                    event_callback(self.camera_id, 'recording_start', {"file_path": full_path, "width": width, "height": height})
            except Exception as e:
                logger.error(f"Camera {self.camera_name} (ID: {self.camera_id}): Failed to start ffmpeg: {e}")
                self.is_recording = False
                self.recording_process = None


        threading.Thread(target=_launch_ffmpeg, daemon=True).start()
        return True


    def stop_recording(self, event_callback=None, width=0, height=0):
        if not self.is_recording: return
        logger.info(f"[RECORDING] Camera {self.camera_name} (ID: {self.camera_id}): Stop Recording")
        if self.recording_process:
            if self.passthrough_active:
                # Send SIGTERM first — for fragmented MP4 (frag_keyframe+empty_moov) FFmpeg
                # does NOT need to rewrite the moov; all fragments are already flushed.
                # A short timeout is sufficient.
                self.recording_process.terminate()
                try: self.recording_process.wait(timeout=5)
                except subprocess.TimeoutExpired: self.recording_process.kill()
            else:
                # Signal writer thread to stop and wait for it to flush
                if hasattr(self, 'frame_queue'):
                    try:
                        self.frame_queue.put_nowait(None)
                    except queue.Full:
                        pass
                if hasattr(self, 'writer_thread') and self.writer_thread:
                    self.writer_thread.join(timeout=30.0)
                    
                # The writer thread automatically closes stdin when it finishes processing the queue.
                # Now we just wait for FFmpeg to finalize the moov atom (+faststart index).

                try: self.recording_process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    logger.warning(f"Camera {self.camera_name}: FFmpeg did not finish in 15s, killing process")
                    self.recording_process.kill()
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
