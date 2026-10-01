"""Hikvision ISAPI alertStream provider. Never logs camera payloads or credentials."""
import logging
import threading
import time
from xml.etree import ElementTree as ET

import requests
from requests.auth import HTTPDigestAuth

from camera_event_provider import CameraEvent, EventLifecycle, selected_provider
from database import SessionLocal
import models

logger = logging.getLogger(__name__)
ENGINE_BASE_URL = "http://engine:8000"
MAX_PART = 256 * 1024


def http_port(camera):
    """ONVIF and ISAPI commonly use different ports; ISAPI is plain HTTP."""
    return camera.isapi_port or 80


def connection_error(error):
    """Return only a fixed diagnostic category, never exception text or URLs."""
    if isinstance(error, requests.exceptions.HTTPError):
        response = error.response
        status = response.status_code if response is not None else None
        if status in (401, 403):
            return "unauthorized"
        if status == 404:
            return "not_found"
        return "http_error"
    if isinstance(error, requests.exceptions.Timeout):
        return "timeout"
    if isinstance(error, requests.exceptions.ConnectionError):
        return "connection_error"
    return "unexpected_response"


def reconnect_delay(reason, delay):
    # Hikvision cameras may lock accounts after repeated HTTP 401/403 attempts.
    return 300 if reason == "unauthorized" else delay


class MultipartEvents:
    """Bounded streaming MIME parser; skip non-XML and oversized parts."""

    def __init__(self, boundary: bytes, max_part: int = MAX_PART):
        if not boundary or len(boundary) > 200 or b"\r" in boundary or b"\n" in boundary:
            raise ValueError("Invalid multipart boundary")
        self.delimiter = b"--" + boundary
        self.buffer = bytearray()
        self.max_part = max_part
        self.started = False
        self.discard = False

    def feed(self, data: bytes):
        self.buffer.extend(data)
        events = []
        marker = b"\r\n" + self.delimiter
        if not self.started:
            pos = self.buffer.find(self.delimiter)
            if pos < 0:
                del self.buffer[:-len(self.delimiter)]
                return events
            del self.buffer[:pos + len(self.delimiter)]
            self.started = True
        while True:
            pos = self.buffer.find(marker)
            if pos < 0:
                if len(self.buffer) > self.max_part + len(marker):
                    self.discard = True
                    del self.buffer[:-len(marker)]
                break
            part = bytes(self.buffer[:pos])
            del self.buffer[:pos + len(marker)]
            if not self.discard and len(part) <= self.max_part:
                header, sep, body = part.partition(b"\r\n\r\n")
                if sep and len(header) < 4096 and (b"application/xml" in header.lower() or b"text/xml" in header.lower()):
                    events.append(body)
            self.discard = False
        return events


def _text(root, name):
    for node in root.iter():
        if isinstance(node.tag, str) and node.tag.rsplit('}', 1)[-1].lower() == name.lower():
            return (node.text or "").strip()[:128]
    return None


def parse_notification(payload: bytes, camera_id: int):
    if len(payload) > MAX_PART or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise ValueError("Unsafe XML notification")
    root = ET.fromstring(payload)  # nosec B314: guarded by DOCTYPE/ENTITY check above
    event_name = (_text(root, "eventType") or "").lower()
    event_type = {
        "vmd": "motion", "linedetection": "line_crossing",
        "fielddetection": "intrusion", "regionentrance": "region_entrance",
        "regionexiting": "region_exit", "videoloss": "video_loss",
        "tamper": "tampering",
    }.get(event_name, "unknown")
    state = (_text(root, "eventState") or "").lower()
    if state not in ("active", "inactive"):
        state = "unknown"
    labels = set()
    for node in root.iter():
        if isinstance(node.tag, str) and node.tag.rsplit('}', 1)[-1].lower() in ("targettype", "detectiontarget"):
            label = {"human": "person", "person": "person", "pedestrian": "person",
                     "vehicle": "vehicle", "car": "vehicle"}.get((node.text or "").strip().lower())
            if label:
                labels.add(label)
    return CameraEvent(camera_id, event_type, state, "hikvision_isapi", tuple(sorted(labels)),
                       _text(root, "dateTime"), _text(root, "channelID"),
                       _text(root, "ruleID"), _text(root, "regionID"), event_name)


class HikvisionEventManager:
    def __init__(self):
        self.workers = {}
        self.status = {}
        self.responses = {}
        self.lock = threading.Lock()

    def update_subscription(self, camera_id):
        self.stop_camera(camera_id)
        db = SessionLocal()
        try:
            camera = db.get(models.Camera, camera_id)
            enabled = camera and camera.is_active and selected_provider(camera) == "hikvision_isapi" and camera.onvif_host
        finally:
            db.close()
        if enabled:
            stop = threading.Event()
            thread = threading.Thread(target=self._run, args=(camera_id, stop), daemon=True)
            with self.lock:
                self.workers[camera_id] = (stop, thread)
            thread.start()

    def stop_camera(self, camera_id):
        with self.lock:
            worker = self.workers.pop(camera_id, None)
            response = self.responses.pop(camera_id, None)
            self.status.pop(camera_id, None)
        if worker:
            worker[0].set()
            if response is not None:
                response.close()
            if worker[1] is not threading.current_thread():
                worker[1].join(timeout=6)

    def stop(self):
        with self.lock:
            ids = list(self.workers)
        for camera_id in ids:
            self.stop_camera(camera_id)

    def bootstrap(self):
        db = SessionLocal()
        try:
            ids = [camera.id for camera in db.query(models.Camera).filter(
                models.Camera.is_active.is_(True), models.Camera.event_provider == "hikvision_isapi").all()]
        finally:
            db.close()
        for camera_id in ids:
            self.update_subscription(camera_id)

    def diagnostics(self, camera_id):
        with self.lock:
            return dict(self.status.get(camera_id, {"state": "disconnected", "observed_labels": []}))

    def _set_status(self, camera_id, **changes):
        with self.lock:
            self.status.setdefault(camera_id, {"state": "disconnected", "observed_labels": []}).update(changes)

    def _send(self, event):
        try:
            response = requests.post(f"{ENGINE_BASE_URL}/cameras/{event.camera_id}/trigger_event",
                                     json=event.engine_payload(), timeout=3)
            response.raise_for_status()
        except requests.RequestException:
            logger.warning("Camera %s: unable to deliver provider event to engine", event.camera_id)

    def _run(self, camera_id, stop):
        delay = 2
        while not stop.is_set():
            db = SessionLocal()
            try:
                camera = db.get(models.Camera, camera_id)
                if not camera or not camera.is_active or selected_provider(camera) != "hikvision_isapi":
                    break
                host, port = camera.onvif_host, http_port(camera)
                user = camera.isapi_username or camera.onvif_username or ""
                password = camera.isapi_password or camera.onvif_password or ""
            finally:
                db.close()
            session = requests.Session()
            response = None
            lifecycle = EventLifecycle()
            failure_reason = None
            try:
                # Host is the validated ONVIF hostname, never a user-supplied URL/path.
                url = f"http://{host}:{port}/ISAPI/Event/notification/alertStream"
                response = session.get(url, auth=HTTPDigestAuth(user, password), stream=True,
                                       timeout=(5, 35), allow_redirects=False)
                response.raise_for_status()
                with self.lock:
                    if stop.is_set():
                        break
                    self.responses[camera_id] = response
                content_type = response.headers.get("Content-Type", "")
                import re
                match = re.search(r'boundary=(?:"([A-Za-z0-9_.-]+)"|([A-Za-z0-9_.-]+))', content_type, re.I)
                if not match:
                    raise ValueError("Missing multipart boundary")
                parser = MultipartEvents((match.group(1) or match.group(2)).encode())
                self._set_status(camera_id, state="connected", last_error=None)
                delay = 2
                # urllib3 waits for a full read; small XML notifications must not sit
                # buffered until 4 KiB of camera data arrives.
                for chunk in response.iter_content(chunk_size=1):
                    if stop.is_set():
                        break
                    if lifecycle.expired(time.monotonic()):
                        self._send(CameraEvent(camera_id, "motion", "inactive", "hikvision_isapi"))
                    for part in parser.feed(chunk):
                        try:
                            event = parse_notification(part, camera_id)
                        except (ValueError, ET.ParseError):
                            continue
                        if event.event_type == "unknown":
                            continue
                        if event.triggers_motion:
                            transition = lifecycle.accept(event, time.monotonic())
                            if transition:
                                self._send(event)
                        self._set_status(camera_id, last_event=event.event_type,
                                         last_event_at=event.timestamp,
                                         observed_labels=sorted(set(self.diagnostics(camera_id)["observed_labels"]) | set(event.labels)))
            except (requests.RequestException, ValueError) as error:
                reason = connection_error(error)
                failure_reason = reason
                self._set_status(camera_id, last_error=reason)
                logger.warning("Camera %s: ISAPI event stream %s; reconnecting after backoff", camera_id, reason)
            finally:
                with self.lock:
                    if self.responses.get(camera_id) is response:
                        self.responses.pop(camera_id, None)
                if response is not None:
                    response.close()
                session.close()
                if lifecycle.active:
                    self._send(CameraEvent(camera_id, "motion", "inactive", "hikvision_isapi"))
                self._set_status(camera_id, state="unauthorized" if failure_reason == "unauthorized" else "disconnected")
            stop.wait(reconnect_delay(failure_reason, delay))
            delay = min(delay * 2, 300)


event_manager = HikvisionEventManager()
