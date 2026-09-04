import subprocess
import os
import time
import logging
import threading
import queue
import cv2
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
    def __init__(self, camera_id, camera_name, config, stream_reader=None):
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.config = config
        self.stream_reader = stream_reader
        self.recording_process = None
        self.is_recording = False
        self.recording_filename = None
        self.recording_start_time = 0.0
        self.passthrough_active = False
        self.last_event_callback = None
        self.current_ai_detections = [] # Track unique labels found during this event

    def check_segment_rotation(self, stop_recording_cb):
        max_len = self.config.get('max_movie_length', 0)
        if self.is_recording and max_len > 0:
            if time.time() - self.recording_start_time > max_len:
                logger.info(f"Camera {self.camera_name} (ID: {self.camera_id}): Max movie length reached, splitting file")
                stop_recording_cb()
                return True
        return False

    def handle_recording(self, frame, motion_detected, last_motion_time, stop_recording_cb, trigger_source=None, ai_results=None, pre_buffer_frames=None, override_should_record=None, override_reason=None):
        if override_should_record is not None and override_reason is not None:
            should_record = override_should_record
            reason = override_reason
        else:
            mode = self.config.get('recording_mode', 'Off')
            should_record = False
            reason = "continuous" if mode in ['Always', 'Continuous'] else ("motion" if mode == 'Motion Triggered' and motion_detected else None)
            if reason:
                should_record = True

        if self.is_recording and motion_detected:
            self.motion_during_current_recording = True

        
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
            return "STARTED"
        elif not should_record and self.is_recording:
            post_cap = self.config.get('post_capture', 5)
            if not motion_detected and (time.time() - last_motion_time > post_cap):
                 stop_recording_cb()

        if self.is_recording and self.passthrough_active and hasattr(self, 'writer_thread'):
             if not self.writer_thread.is_alive():
                 logger.error(f"Camera {self.camera_name}: Passthrough PyAV writer thread died unexpectedly. Falling back to transcoded recording.")
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

    def _async_pyav_passthrough_writer(self, full_path, q, cam_name, width, height, event_callback):
        import av
        out_container = None
        out_vid = None
        out_aud = None
        resampler = None
        
        start_dts = None
        start_pts_vid = None
        start_pts_aud = None
        last_muxed_dts = -1
        
        waiting_for_keyframe = True
        
        try:
            while not out_container:
                if not self.is_recording:
                    return
                if self.stream_reader and self.stream_reader.video_stream:
                    # Use standard MP4 with faststart so the browser can seek properly.
                    # PyAV will automatically move the moov atom to the beginning when out_container.close() is called.
                    out_container = av.open(full_path, mode='w', format='mp4', 
                                            options={'movflags': '+faststart'})
                    out_vid = out_container.add_stream(template=self.stream_reader.video_stream)
                    
                    if self.stream_reader.audio_stream and self.config.get('record_audio'):
                        in_aud = self.stream_reader.audio_stream
                        if in_aud.name == 'aac':
                            out_aud = out_container.add_stream(template=in_aud)
                        else:
                            out_aud = out_container.add_stream('aac', rate=max(in_aud.rate or 8000, 8000))
                            resampler = av.AudioResampler(
                                format=out_aud.format, layout=out_aud.layout, rate=out_aud.rate
                            )
                else:
                    time.sleep(0.1)
                    
            if event_callback:
                event_callback(self.camera_id, 'recording_start', {"file_path": full_path, "width": width, "height": height})
                
            while True:
                if not self.is_recording and q.empty():
                    break
                try:
                    original_packet = q.get(timeout=1.0)
                    if original_packet is None:
                        break
                        
                    # Deep copy the packet to avoid modifying the shared instance across threads
                    packet = av.Packet(bytes(original_packet))
                    packet.pts = original_packet.pts
                    packet.dts = original_packet.dts
                    if original_packet.time_base is not None:
                        packet.time_base = original_packet.time_base
                        
                    packet_stream_type = original_packet.stream.type
                    
                    is_keyframe = getattr(original_packet, 'is_keyframe', False)
                    if waiting_for_keyframe:
                        if packet_stream_type == 'video' and is_keyframe:
                            waiting_for_keyframe = False
                            start_dts = packet.dts
                            start_pts_vid = packet.pts
                        else:
                            continue
                            
                    if packet_stream_type == 'video':
                        packet.stream = out_vid
                        
                        if start_dts is not None:
                            if packet.dts is not None:
                                raw_dts = packet.dts - start_dts
                                if raw_dts <= last_muxed_dts:
                                    offset = (last_muxed_dts - raw_dts) + 3000
                                    start_dts -= offset
                                    if start_pts_vid is not None:
                                        start_pts_vid -= offset
                                    raw_dts = packet.dts - start_dts
                                packet.dts = raw_dts
                            else:
                                packet.dts = last_muxed_dts + 3000
                                
                            last_muxed_dts = packet.dts
                            
                        if start_pts_vid is not None and packet.pts is not None:
                            packet.pts -= start_pts_vid
                            
                        if packet.dts is not None and packet.pts is not None and packet.dts > packet.pts:
                            packet.pts = packet.dts
                        elif packet.pts is None and packet.dts is not None:
                            packet.pts = packet.dts

                        out_container.mux(packet)
                        
                    elif packet_stream_type == 'audio' and out_aud:
                        if resampler:
                            if start_pts_aud is None and packet.pts is not None:
                                start_pts_aud = packet.pts
                            try:
                                # Use original_packet for decoding to access its internal codec context
                                # MUST lock decoding because libavcodec codec context is NOT thread-safe
                                decoded_frames = []
                                with self.stream_reader.audio_decode_lock:
                                    decoded_frames = original_packet.decode()
                                    
                                for frame in decoded_frames:
                                    frame.pts = None
                                    for r_frame in resampler.resample(frame):
                                        for enc_packet in out_aud.encode(r_frame):
                                            out_container.mux(enc_packet)
                            except Exception:
                                pass
                        else:
                            packet.stream = out_aud
                            if start_dts is not None and packet.dts is not None:
                                packet.dts -= start_dts
                            if start_dts is not None and packet.pts is not None:
                                packet.pts -= start_dts
                            out_container.mux(packet)
                except queue.Empty:
                    continue
                    
            if out_aud and resampler:
                for enc_packet in out_aud.encode(None):
                    out_container.mux(enc_packet)
                    
        except Exception as e:
            logger.error(f"Camera {cam_name}: Async PyAV passthrough writer died: {e}")
        finally:
            if out_container:
                try:
                    out_container.close()
                except Exception:
                    pass
            if self.stream_reader:
                self.stream_reader.unsubscribe_packets(q)

    def _start_passthrough_recording(self, full_path, width, height, event_callback):
        try:
            self.passthrough_queue = queue.Queue(maxsize=1500)
            self.is_recording = True
            self.recording_filename = full_path
            self.recording_start_time = time.time()
            
            # Subscribe to the stream reader to get the pre-buffer and live packets
            if self.stream_reader:
                reason = getattr(self, 'current_recording_reason', 'unknown').lower()
                # Continuous segments shouldn't get the pre-buffer again, only motion events
                include_prebuf = (reason != 'continuous')
                self.stream_reader.subscribe_packets(self.passthrough_queue, include_prebuffer=include_prebuf)
                
            self.writer_thread = threading.Thread(
                target=self._async_pyav_passthrough_writer, 
                args=(full_path, self.passthrough_queue, self.camera_name, width, height, event_callback), 
                daemon=True
            )
            self.writer_thread.start()
            
            logger.info(f"Camera {self.camera_name}: Started Passthrough Recording (PyAV Direct Muxing)")
            return True
        except Exception as e:
            logger.error(f"Camera {self.camera_name}: Failed to start Passthrough PyAV writer: {e}")
            self.passthrough_active = False
            self.is_recording = False
            return False

    def _async_ffmpeg_writer(self, proc, q, cam_name, w, h, do_resize):
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

    def _launch_transcoded_ffmpeg(self, full_path, width, height, event_callback):
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

            self.writer_thread = threading.Thread(target=self._async_ffmpeg_writer, args=(self.recording_process, self.frame_queue, self.camera_name, target_w, target_h, needs_resize), daemon=True)
            self.writer_thread.start()

            if event_callback:
                event_callback(self.camera_id, 'recording_start', {"file_path": full_path, "width": width, "height": height})
        except Exception as e:
            logger.error(f"Camera {self.camera_name} (ID: {self.camera_id}): Failed to start ffmpeg: {e}")
            self.is_recording = False
            self.recording_process = None

    def _start_transcoded_recording(self, full_path, width, height, pre_buffer_frames, event_callback):
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

        threading.Thread(target=self._launch_transcoded_ffmpeg, args=(full_path, width, height, event_callback), daemon=True).start()
        return True

    def start_recording(self, width, height, pre_buffer_frames, event_callback=None, reason="Manual", trigger_source=None):
        self.current_ai_detections = [] # Reset for new event
        
        is_fallback_or_restart = (reason in ["Fallback", "Restart"])
        if not is_fallback_or_restart:
            self.current_recording_reason = reason
            
        actual_reason = getattr(self, 'current_recording_reason', reason)
        self.motion_during_current_recording = (actual_reason == "Motion" or actual_reason == "motion")
        
        if event_callback is not None:
            self.last_event_callback = event_callback
        format_str = self.config.get('movie_file_name', '%Y-%m-%d/%H-%M-%S').replace('%q', '00')
        timestamp_path = datetime.now().strftime(format_str)
        
        # Determine output directory based on tiered storage configuration
        base_dir = self.config.get('storage_path', '/var/lib/vibe/recordings')
        if actual_reason == "Motion" or actual_reason == "motion":
            base_dir = self.config.get('motion_storage_path') or base_dir
        elif actual_reason == "Continuous" or actual_reason == "continuous":
            base_dir = self.config.get('continuous_storage_path') or base_dir
            
        output_dir = os.path.join(base_dir, str(self.camera_id))
        full_path = os.path.join(output_dir, f"{timestamp_path}.mp4")
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        trigger_info = f" (Trigger: {trigger_source})" if trigger_source else ""
        logger.info(f"[RECORDING] Camera {self.camera_name} (ID: {self.camera_id}): Start Recording (Reason: {actual_reason}, Mode: {reason}) to {full_path}{trigger_info}")
        
        if reason == "Fallback":
            self.passthrough_active = False
            self.current_recording_method = "transcoded (fallback)"
        elif reason == "Restart":
            self.passthrough_active = self.config.get('movie_passthrough', False)
            self.current_recording_method = "passthrough (restart)" if self.passthrough_active else "transcoded (restart)"
        else:
            self.passthrough_active = self.config.get('movie_passthrough', False)
            self.current_recording_method = "passthrough" if self.passthrough_active else "transcoded"
        
        if self.passthrough_active:
            return self._start_passthrough_recording(full_path, width, height, event_callback)

        return self._start_transcoded_recording(full_path, width, height, pre_buffer_frames, event_callback)

    def stop_recording(self, event_callback=None, width=0, height=0):
        if not self.is_recording: return
        logger.info(f"[RECORDING] Camera {self.camera_name} (ID: {self.camera_id}): Stop Recording")
        
        self.is_recording = False
        
        if self.passthrough_active:
            if hasattr(self, 'passthrough_queue'):
                try:
                    self.passthrough_queue.put_nowait(None)
                except queue.Full:
                    pass
            if hasattr(self, 'writer_thread') and self.writer_thread:
                self.writer_thread.join(timeout=10.0)
        elif self.recording_process:
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
        
        time.sleep(0.5)
        
        valid_recording = False
        if self.recording_filename and os.path.exists(self.recording_filename):
            try:
                duration = time.time() - self.recording_start_time
                if duration < 2.0 or os.path.getsize(self.recording_filename) < 1024:
                    os.remove(self.recording_filename)
                    logger.info(f"Camera {self.camera_name} (ID: {self.camera_id}): Discarded short/empty recording ({duration:.1f}s)")
                else:
                    valid_recording = True
            except OSError as e:
                logger.warning(f"Camera {self.camera_name} (ID: {self.camera_id}): Error validating or removing recording {self.recording_filename}: {e}")

        ai_meta_str = None
        if self.current_ai_detections:
            ai_meta_str = ",".join(self.current_ai_detections)

        if valid_recording and event_callback:
             reason = getattr(self, 'current_recording_reason', 'unknown')
             method = getattr(self, 'current_recording_method', 'unknown')

             event_callback(self.camera_id, 'recording_end', {
                 "file_path": self.recording_filename, 
                 "width": width, 
                 "height": height,
                 "ai_metadata": ai_meta_str,
                 "reason": reason,
                 "method": method
             })
