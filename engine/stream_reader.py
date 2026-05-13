import av
import time
import threading
import logging
import os
import struct
import typing as t
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
        self.latest_frame = None
        self.last_read_time = 0.0
        self.lock = threading.Lock()
        self.running = False
        self.connected = False
        self.health_status: str = "STARTING"
        self.consecutive_failures: int = 0
        self.last_health_report_status = None
        self.ws_clients = set()
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
            'stimeout': '8000000', # Increased to 8s for flaky cameras like Wyze
            'flags': 'low_delay',
            'allowed_media_types': 'video', # We mostly care about video for motion/UI
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

                safe_url = mask_url(target_url)
                logger.info(f"StreamReader ({self.camera_name}): Connecting → {safe_url}")

                try:
                    container = av.open(
                        target_url,
                        options=self._build_av_options(),
                        timeout=10.0 # Increased timeout
                    )
                    if container.streams.video is None or len(container.streams.video) == 0:
                        raise Exception("No video stream found in container")

                except Exception as e:
                    self.consecutive_failures += 1
                    err_str = str(e).lower()
                    if container is not None:
                        try:
                            container.close()
                        except Exception:
                            pass
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
                            f"StreamReader ({self.camera_name}): Connection refused/reset/timeout ({e}). "
                            f"Retrying shortly..."
                        )
                        self._maybe_send_health_callback(
                            "UNREACHABLE",
                            "📡 Camera Offline",
                            f"Camera connection failed: {e}. Check network, power, or RTSP firmware status."
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
                    logger.warning(f"StreamReader ({self.camera_name}): Connection failed: {e}")
                    self._maybe_send_health_callback(
                        "UNREACHABLE",
                        "📡 Camera Offline",
                        f"Camera is unreachable: {e}"
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

                    raw_data = bytes(packet)
                    
                    # Video specific NAL parsing for keyframe headers (SPS/PPS)
                    # OPTIMIZED: Use find() instead of byte-by-byte scan
                    if stream_type == 'video' and len(raw_data) > 4:
                        # Only scan if it's a keyframe or if we haven't found headers yet
                        is_kf = getattr(packet, 'is_keyframe', False)
                        if is_kf or not self.last_headers:
                            pos = 0
                            while True:
                                pos = raw_data.find(b'\x00\x00\x01', pos)
                                if pos == -1 or pos > len(raw_data) - 4:
                                    break
                                
                                nal_header = raw_data[pos + 3]
                                nal_type = nal_header & 0x1F
                                
                                # SPS (7) or PPS (8)
                                if nal_type == 7 or nal_type == 8:
                                    next_pos = raw_data.find(b'\x00\x00\x01', pos + 3)
                                    if next_pos == -1: next_pos = len(raw_data)
                                    nalu: bytes = raw_data[pos:next_pos]
                                    with self.lock:
                                        if nalu not in self.last_headers:
                                            # Limit header size to prevent memory leaks from malformed streams
                                            if len(self.last_headers) < 1024:
                                                self.last_headers += nalu
                                    pos = next_pos
                                else:
                                    pos += 3

                    if clients and len(raw_data) > 0:
                        try:
                            pts = getattr(packet, 'pts', None)
                            time_base = getattr(packet, 'time_base', None)
                            time_sec = float(pts * time_base) if pts is not None and time_base is not None else 0.0
                            is_keyframe = 1 if getattr(packet, 'is_keyframe', False) else 0
                            
                            # Packet Type: 0 = Video, 1 = Audio
                            p_type = 0 if stream_type == 'video' else 1
                            
                            # New 10-byte header: Type (1b) + Keyframe (1b) + Timestamp (8b)
                            header: bytes = struct.pack('<BBd', p_type, is_keyframe, time_sec)
                            
                            if stream_type == 'video':
                                if is_keyframe:
                                    with self.lock:
                                        lh: bytes = self.last_headers or b''
                                        self.last_keyframe = header + lh + raw_data
                                
                                broadcast_payload = header + raw_data
                                if is_keyframe and self.last_headers:
                                    broadcast_payload = header + self.last_headers + raw_data
                            else:
                                # Audio packet
                                broadcast_payload = header + raw_data
                                
                            for q, loop in clients:
                                if not q.full():
                                    loop.call_soon_threadsafe(q.put_nowait, broadcast_payload)
                        except Exception as e:
                            logger.error(f"StreamReader ({self.camera_name}): WS Broadcast error: {e}")

                    if stream_type == 'video':
                        for frame in packet.decode():
                            img = frame.to_ndarray(format='bgr24')
                            with self.lock:
                                self.latest_frame = img
                                self.last_read_time = time.time()
                                self.health_status = "CONNECTED"

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
                    logger.error(f"StreamReader ({self.camera_name}): Unexpected error: {e}")
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
