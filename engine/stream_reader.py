import av
import time
import threading
import logging
import os
import struct
import typing as t
from collections import deque
import queue
from utils import mask_url

logger = logging.getLogger(__name__)

class StreamReader(threading.Thread):
    """
    Dedicated thread for reading frames from RTSP stream using PyAV.
    """
    def __init__(self, camera_id, url, camera_name="Unknown", event_callback=None, rtsp_transport="tcp"):
        super().__init__(daemon=True)
        self.camera_id = camera_id
        self.url = url
        self.camera_name = camera_name
        self.event_callback = event_callback
        self.rtsp_transport = rtsp_transport
        self.pre_buffer_duration = 10.0 # Will store up to 10s of packets
        self.latest_frame = None
        self.last_read_time = 0.0
        self.lock = threading.Lock()
        self.audio_decode_lock = threading.Lock()
        self.running = False
        self.connected = False
        self.health_status: str = "STARTING"
        self.consecutive_failures: int = 0
        self.last_health_report_status = None
        self.ws_clients = set()
        self.packet_subscribers = set()
        self.packet_ring_buffer = deque() # Stores tuples: (packet, is_keyframe, time_sec)
        self.video_stream = None
        self.audio_stream = None
        self.last_keyframe: t.Optional[bytes] = None
        self.last_headers: bytes = b''

    def add_ws_client(self, q, loop):
        with self.lock:
            self.ws_clients.add((q, loop))
            if self.last_keyframe:
                loop.call_soon_threadsafe(q.put_nowait, self.last_keyframe)

    def remove_ws_client(self, q):
        with self.lock:
            to_remove = [c for c in self.ws_clients if c[0] == q]
            for c in to_remove:
                self.ws_clients.remove(c)

    def subscribe_packets(self, q: queue.Queue, include_prebuffer: bool = True):
        with self.lock:
            self.packet_subscribers.add(q)
            if include_prebuffer:
                # Push pre-buffer contents immediately to the new subscriber
                for item in list(self.packet_ring_buffer):
                    try:
                        q.put_nowait(item[0]) # Put the av.Packet
                    except queue.Full:
                        pass

    def unsubscribe_packets(self, q: queue.Queue):
        with self.lock:
            if q in self.packet_subscribers:
                self.packet_subscribers.remove(q)

    def get_health(self):
        with self.lock:
            return self.health_status

    def _maybe_send_health_callback(self, status, title, message):
        if self.last_health_report_status == status:
            return
        self.last_health_report_status = status
        if self.event_callback:
            try:
                self.event_callback(self.camera_id, 'health_status_changed', {
                    "camera_id": self.camera_id,
                    "camera_name": self.camera_name,
                    "status": status,
                    "timestamp": int(time.time()),
                    "title": title,
                    "message": message,
                })
            except Exception as cb_e:
                logger.error(f"StreamReader ({self.camera_name}): Callback error: {cb_e}")

    def _build_av_options(self):
        opts = {
            'rtsp_transport': self.rtsp_transport,
            'stimeout': '30000000', # Increased to 30s for flaky cameras or VPN links
            'flags': 'low_delay',
            'buffer_size': '1024000', # 1MB buffer to handle I-frame spikes
        }

        # Only prefer TCP if not explicitly using UDP
        if self.rtsp_transport != 'udp':
            opts['rtsp_flags'] = 'prefer_tcp'
        
        # Secure RTSP (RSTSPS/RTSPS) - Skip TLS certificate verification
        if self.url.lower().startswith(('rstsps://', 'rtsps://')):
            opts['tls_verify'] = '0'
            logger.info(f"StreamReader ({self.camera_name}): Secure RTSP detected, skipping TLS verification")
            
        hw_accel_enabled = os.environ.get('HW_ACCEL', 'false').lower() == 'true'
        hw_accel_type = os.environ.get('HW_ACCEL_TYPE', 'auto').lower()
        if hw_accel_enabled:
            accel_map = {
                'nvidia': 'cuda', 'intel': 'qsv',
                'amd': 'vaapi', 'vaapi': 'vaapi', 'auto': 'auto'
            }
            accel = accel_map.get(hw_accel_type, 'auto')
            opts['hwaccel'] = accel
            logger.info(f"StreamReader ({self.camera_name}): HW acceleration configured ({accel}) via {self.rtsp_transport}")
        else:
            logger.info(f"StreamReader ({self.camera_name}): HW acceleration DISABLED, using {self.rtsp_transport}")
        return opts

    def run(self):
        self.running = True
        container = None

        while self.running:
            try:
                with self.lock:
                    target_url = self.url

                if self.health_status == "UNAUTHORIZED":
                    time.sleep(2.0)
                    continue

                connection_mode = "(via go2rtc proxy)" if "127.0.0.1" in target_url or "localhost" in target_url else "(Direct connection)"
                safe_url = mask_url(target_url)
                logger.info(f"StreamReader ({self.camera_name}): Connecting {connection_mode} → {safe_url}")

                try:
                    container = av.open(
                        target_url,
                        options=self._build_av_options(),
                        timeout=32.0 # Allow slightly more than stimeout
                    )
                    if container.streams.video is None or len(container.streams.video) == 0:
                        raise Exception("No video stream found in container")
                    with self.lock:
                        self.video_stream = container.streams.video[0]
                        self.audio_stream = container.streams.audio[0] if container.streams.audio else None

                        ed = self.video_stream.codec_context.extradata
                        if ed and (ed.startswith(b'\x00\x00\x01') or ed.startswith(b'\x00\x00\x00\x01')):
                            self.last_headers = ed

                        codec_name = self.video_stream.codec_context.name
                        if codec_name == 'h264':
                            try:
                                self.bsf = av.BitStreamFilterContext('h264_mp4toannexb', self.video_stream)
                            except Exception as e:
                                logger.warning(f"Failed to create h264_mp4toannexb BSF: {e}")
                                self.bsf = None
                        elif codec_name == 'hevc':
                            try:
                                self.bsf = av.BitStreamFilterContext('hevc_mp4toannexb', self.video_stream)
                            except Exception as e:
                                logger.warning(f"Failed to create hevc_mp4toannexb BSF: {e}")
                                self.bsf = None
                        else:
                            self.bsf = None

                except Exception as e:
                    self.consecutive_failures += 1
                    err_str = str(e).lower()
                    masked_e = mask_url(str(e))
                    if container is not None:
                        try:
                            container.close()
                        except Exception as e:
                            import logging
                            logging.getLogger(__name__).error(f'Decode error: {e}')
                        
                        import logging
                        if self.latest_frame is not None:
                            # just log once every 100 frames
                            if not hasattr(self, 'frame_count'): self.frame_count = 0
                            self.frame_count += 1
                            if self.frame_count % 100 == 0:
                                logging.getLogger(__name__).warning(f'Frames are successfully decoding for {self.camera_name}')
                        else:
                            logging.getLogger(__name__).warning(f'No frame decoded for {self.camera_name}')
                        container = None

                    auth_keywords = ['401', '403', 'unauthorized', 'forbidden', 'permission denied',
                                     'authentication', 'wrong username']
                    refused_keywords = ['connection refused', 'connection reset', 'timed out',
                                        'no route to host', 'network unreachable', 'i/o error']

                    if any(k in err_str for k in auth_keywords):
                        with self.lock:
                            self.health_status = "UNAUTHORIZED"
                            self.latest_frame = None
                        logger.warning(
                            f"StreamReader ({self.camera_name}): Authentication failed (401/403). "
                            f"Waiting 300s before retry to prevent IP ban."
                        )
                        self._maybe_send_health_callback(
                            "UNAUTHORIZED",
                            "🚫 Camera Authentication Failed",
                            "Authentication failed — wrong username or password. "
                            "Fix credentials in VibeNVR (Settings → Cameras → Edit). "
                            "Retrying in 5 minutes..."
                        )
                        for _ in range(300):
                            if not self.running or self.health_status == "STARTING":
                                break
                            time.sleep(1)
                        continue

                    if any(k in err_str for k in refused_keywords):
                        with self.lock:
                            self.health_status = "UNREACHABLE"
                            self.latest_frame = None
                        logger.warning(
                            f"StreamReader ({self.camera_name}): Connection refused/reset/timeout ({masked_e}). "
                            f"Retrying shortly..."
                        )
                        self._maybe_send_health_callback(
                            "UNREACHABLE",
                            "📡 Camera Offline",
                            f"Camera connection failed: {masked_e}. Check network, power, or RTSP firmware status."
                        )
                        retry_delay = min(60, 10 * self.consecutive_failures)
                        for _ in range(retry_delay):
                            if not self.running or self.health_status == "STARTING":
                                break
                            time.sleep(1)
                        continue

                    with self.lock:
                        self.health_status = "UNREACHABLE"
                        self.latest_frame = None
                    logger.warning(f"StreamReader ({self.camera_name}): Connection failed: {masked_e}")
                    self._maybe_send_health_callback(
                        "UNREACHABLE",
                        "📡 Camera Offline",
                        f"Camera is unreachable: {masked_e}"
                    )
                    retry_delay = min(60, 5 * (2 ** max(0, self.consecutive_failures - 1)))
                    for _ in range(retry_delay):
                        if not self.running or self.health_status == "STARTING":
                            break
                        time.sleep(1)
                    continue

                logger.info(f"StreamReader ({self.camera_name}): Connected!")
                self._maybe_send_health_callback(
                    "CONNECTED",
                    "✅ Camera Recovered",
                    "Camera is back online. Connection established."
                )
                with self.lock:
                    self.health_status = "CONNECTED"
                    self.connected = True
                    self.connection_time = time.time()
                self.consecutive_failures = 0

                for packet in container.demux():
                    if not self.running:
                        break

                    with self.lock:
                        current_url = self.url
                        current_health = self.health_status
                        clients = list(self.ws_clients)
                        
                    if current_url != target_url:
                        break
                    if current_health == "STARTING":
                        break

                    stream_type = packet.stream.type
                    if stream_type not in ('video', 'audio'):
                        continue
                        
                    if stream_type == 'video' and getattr(self, 'bsf', None):
                        try:
                            p_copy = av.Packet(packet)
                            filtered = self.bsf.filter(p_copy)
                        except Exception as e:
                            logger.debug(f"StreamReader ({self.camera_name}): BSF error: {e}")
                            filtered = [packet]
                    else:
                        filtered = [packet]

                    # 1. Prepare WebSocket Broadcast Data (Annex-B)
                    broadcast_payloads = []
                    is_kf = getattr(packet, 'is_keyframe', False)
                    
                    for p in filtered:
                        raw_data = bytes(p)
                        if stream_type == 'video' and len(raw_data) > 4:
                            pos = 0
                            while True:
                                pos = raw_data.find(b'\x00\x00\x01', pos)
                                if pos == -1 or pos > len(raw_data) - 4:
                                    break
                                
                                nal_header = raw_data[pos + 3]
                                nal_type = nal_header & 0x1F
                                
                                if nal_type == 5 or nal_type == 7:
                                    is_kf = True
                                    
                                if nal_type == 7 or nal_type == 8:
                                    next_pos = raw_data.find(b'\x00\x00\x01', pos + 3)
                                    if next_pos == -1: next_pos = len(raw_data)
                                    nalu: bytes = raw_data[pos:next_pos]
                                    with self.lock:
                                        if nalu not in self.last_headers:
                                            if len(self.last_headers) < 1024:
                                                self.last_headers += nalu
                                    pos = next_pos
                                else:
                                    pos += 3
                        
                        if len(raw_data) > 0:
                            p_type = 0 if stream_type == 'video' else 1
                            broadcast_payloads.append((p_type, raw_data))

                    # 2. Update Ring Buffer and local subscribers with ORIGINAL pristine packet
                    pts = getattr(packet, 'pts', None)
                    time_base = getattr(packet, 'time_base', None)
                    real_time = time.time()
                    time_sec = float(pts * time_base) if pts is not None and time_base is not None else real_time
                    is_keyframe = 1 if is_kf else 0

                    with self.lock:
                        self.packet_ring_buffer.append((packet, is_keyframe, time_sec, real_time))
                        # Pop old packets (keep self.pre_buffer_duration seconds of history)
                        while self.packet_ring_buffer and (real_time - self.packet_ring_buffer[0][3] > self.pre_buffer_duration):
                            self.packet_ring_buffer.popleft()
                            
                        subscribers = list(self.packet_subscribers)
                        
                    for q in subscribers:
                        try:
                            q.put_nowait(packet)
                        except:
                            try:
                                q.put_nowait(packet)
                            except queue.Full:
                                pass

                    # 3. Broadcast Annex-B payloads to WebSockets
                    for p_type, raw_data in broadcast_payloads:
                        header: bytes = struct.pack('<BBd', p_type, is_keyframe, time_sec)
                        
                        if stream_type == 'video':
                            if is_keyframe:
                                with self.lock:
                                    lh: bytes = self.last_headers or b''
                                    self.last_keyframe = header + lh + raw_data
                            
                            payload = header + raw_data
                            if is_keyframe and self.last_headers:
                                payload = header + self.last_headers + raw_data
                        else:
                            payload = header + raw_data
                            
                        with self.lock:
                            clients = list(self.ws_clients)
                        for q, loop in clients:
                            try:
                                if not q.full():
                                    loop.call_soon_threadsafe(q.put_nowait, payload)
                            except Exception as e:
                                    logger.error(f"StreamReader ({self.camera_name}): WS Broadcast error: {e}")

                    if stream_type == 'video':
                        try:
                            if packet.size and packet.size > 0:
                                for frame in packet.decode():
                                    img = frame.to_ndarray(format='bgr24')
                                    with self.lock:
                                        self.latest_frame = img
                                        self.last_read_time = time.time()
                                        self.health_status = "CONNECTED"
                        except Exception as e:
                            import logging
                            logging.getLogger(__name__).error(f'Decode error: {e}')
                        
                        import logging
                        if self.latest_frame is not None:
                            # just log once every 100 frames
                            if not hasattr(self, 'frame_count'): self.frame_count = 0
                            self.frame_count += 1
                            if self.frame_count % 100 == 0:
                                logging.getLogger(__name__).warning(f'Frames are successfully decoding for {self.camera_name}')
                        else:
                            logging.getLogger(__name__).warning(f'No frame decoded for {self.camera_name}')
                        
                        # YIELD CPU: Prevent PyAV from starving the EdgeTPU USB driver during RTSP burst/I-frame decoding.
                        # This fixes the TPU freezing at the "first check" when passthrough is disabled.
                        time.sleep(0.002)

            except Exception as e:
                if isinstance(e, av.error.FFmpegError) or "av.error" in str(type(e)):
                    masked_err = mask_url(str(e))
                    logger.warning(f"StreamReader ({self.camera_name}): Stream error: {masked_err}")
                    self.consecutive_failures += 1
                    with self.lock:
                        self.health_status = "UNREACHABLE"
                        self.latest_frame = None
                        self.connected = False
                else:
                    masked_e = mask_url(str(e))
                    logger.error(f"StreamReader ({self.camera_name}): Unexpected error: {masked_e}")
                    with self.lock:
                        self.latest_frame = None
                        self.connected = False
            finally:
                if container is not None:
                    try:
                        container.close()
                    except Exception:
                        pass
                    container = None
                if self.running:
                    # Adaptive sleep to prevent spinning on errors
                    time.sleep(2 if self.consecutive_failures < 5 else 5)

        logger.info(f"StreamReader ({self.camera_name}): Stopped")

    def broadcast_metadata(self, data: t.Union[dict, list]):
        """Send JSON metadata to all connected WebSocket clients (p_type=2)"""
        try:
            import json
            with self.lock:
                clients = list(self.ws_clients)
            
            if not clients:
                return

            # Header: Type=2 (Metadata), Keyframe=0, Timestamp=now
            header = struct.pack('<BBd', 2, 0, time.time())
            payload = header + json.dumps(data).encode('utf-8')

            for q, loop in clients:
                if not q.full():
                    loop.call_soon_threadsafe(q.put_nowait, payload)
        except Exception as e:
            logger.error(f"StreamReader ({self.camera_name}): Metadata broadcast error: {e}")

    def get_latest(self):
        with self.lock:
            return self.latest_frame, self.last_read_time

    def stop(self):
        self.running = False

    def update_url(self, new_url):
        with self.lock:
            if self.url != new_url:
                logger.info(f"StreamReader ({self.camera_name}): URL changed, resetting health status and forcing reconnect")
                self.url = new_url
                self.health_status = "STARTING"
                self.latest_frame = None
                self.connected = False
            else:
                if self.health_status in ["UNAUTHORIZED", "UNREACHABLE"]:
                    logger.info(f"StreamReader ({self.camera_name}): URL unchanged but in error state, forcing retry")
                    self.health_status = "STARTING"

    def force_reconnect(self):
        with self.lock:
            self.connected = False
            self.consecutive_failures = 0
            self.health_status = "STARTING"
