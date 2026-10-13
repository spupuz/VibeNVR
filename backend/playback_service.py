import os
import subprocess
import json
import logging
import threading
import time
from typing import Optional, Dict

logger = logging.getLogger(__name__)

CACHE_DIR = "/data/cache/playback"
_PLAYBACK_LOCK = threading.Lock()
_ACTIVE_OPERATIONS: Dict[str, threading.Event] = {}


def ensure_cache_dir():
    """Ensure playback cache directory exists."""
    os.makedirs(CACHE_DIR, exist_ok=True)


def probe_media(file_path: str) -> dict:
    """
    Probe a media file for its video codec, container format, and duration.
    """
    info = {
        "codec": "unknown",
        "container": "unknown",
        "is_hevc": False,
        "is_mkv": False,
        "duration": 0.0,
    }
    if not file_path or not os.path.exists(file_path):
        return info

    if file_path.lower().endswith(".mkv"):
        info["is_mkv"] = True

    try:
        safe_path = os.path.abspath(file_path)
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name:format=format_name,duration",
            "-of", "json",
            safe_path,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        if res.returncode == 0:
            data = json.loads(res.stdout)
            streams = data.get("streams", [])
            fmt = data.get("format", {})
            if streams:
                codec = streams[0].get("codec_name", "unknown").lower()
                info["codec"] = codec
                info["is_hevc"] = ("hevc" in codec or "h265" in codec)
            format_name = fmt.get("format_name", "").lower()
            info["container"] = format_name
            if "matroska" in format_name:
                info["is_mkv"] = True
            try:
                info["duration"] = float(fmt.get("duration", 0.0))
            except (ValueError, TypeError):
                pass
    except Exception as e:
        logger.warning(f"Error probing media {file_path}: {e}")
        if file_path.lower().endswith(".mkv"):
            info["is_mkv"] = True

    return info


def _probe_vaapi() -> bool:
    """Check if VAAPI hardware encoding is supported on host."""
    try:
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=128x128",
            "-vframes", "1", "-vaapi_device", "/dev/dri/renderD128",
            "-vf", "format=nv12,hwupload", "-c:v", "h264_vaapi",
            "-f", "null", "-",
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=2)
        return res.returncode == 0
    except Exception:
        return False


def remux_to_mp4(source_path: str, target_path: str) -> bool:
    """
    Remux MKV container to MP4 with zero CPU re-encoding (-c copy).
    Provides instant browser-playable MP4 with faststart atom.
    """
    ensure_cache_dir()
    tmp_target = f"{target_path}.tmp_{int(time.time())}.mp4"
    try:
        safe_src = os.path.abspath(source_path)
        cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-i", safe_src,
            "-c", "copy",
            "-movflags", "+faststart",
            tmp_target,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
        if res.returncode == 0 and os.path.exists(tmp_target) and os.path.getsize(tmp_target) > 1024:
            os.replace(tmp_target, target_path)
            logger.info(f"[PLAYBACK] Remuxed {safe_src} -> {target_path} ({os.path.getsize(target_path)} bytes)")
            return True
        else:
            logger.error(f"[PLAYBACK] Remux failed for {safe_src}: {res.stderr}")
            if os.path.exists(tmp_target):
                os.remove(tmp_target)
            return False
    except Exception as e:
        logger.error(f"[PLAYBACK] Remux exception for {source_path}: {e}")
        if os.path.exists(tmp_target):
            try:
                os.remove(tmp_target)
            except Exception:
                pass
        return False


def transcode_to_h264(source_path: str, target_path: str) -> bool:
    """
    Transcode H.265/HEVC (or unsupported codecs) to H.264 MP4 for web playback.
    Uses hardware acceleration (VAAPI or NVENC) if available, falling back to ultrafast CPU.
    """
    ensure_cache_dir()
    tmp_target = f"{target_path}.tmp_{int(time.time())}.mp4"
    try:
        safe_src = os.path.abspath(source_path)
        hw_accel_enabled = os.environ.get("HW_ACCEL", "false").lower() == "true"
        hw_accel_type = os.environ.get("HW_ACCEL_TYPE", "auto").lower()

        video_codec = "libx264"
        codec_args = ["-preset", "ultrafast", "-crf", "23", "-threads", "2"]

        if hw_accel_enabled and os.path.exists("/dev/dri") and _probe_vaapi():
            video_codec = "h264_vaapi"
            codec_args = ["-vaapi_device", "/dev/dri/renderD128", "-vf", "format=nv12,hwupload", "-qp", "22"]
        elif hw_accel_enabled and hw_accel_type == "nvidia":
            video_codec = "h264_nvenc"
            codec_args = ["-preset", "fast", "-cq", "23"]

        cmd = [
            "nice", "-n", "19",
            "ffmpeg", "-y", "-v", "error",
            "-i", safe_src,
            "-c:v", video_codec,
            *codec_args,
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            tmp_target,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if res.returncode == 0 and os.path.exists(tmp_target) and os.path.getsize(tmp_target) > 1024:
            os.replace(tmp_target, target_path)
            logger.info(f"[PLAYBACK] Transcoded {safe_src} -> {target_path} ({os.path.getsize(target_path)} bytes)")
            return True

        # Fallback to software encoding if HW acceleration failed
        if video_codec != "libx264":
            logger.warning(f"[PLAYBACK] HW transcode failed, attempting libx264 fallback for {safe_src}")
            cmd_sw = [
                "nice", "-n", "19",
                "ffmpeg", "-y", "-v", "error",
                "-i", safe_src,
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-threads", "2",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                tmp_target,
            ]
            res_sw = subprocess.run(cmd_sw, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
            if res_sw.returncode == 0 and os.path.exists(tmp_target) and os.path.getsize(tmp_target) > 1024:
                os.replace(tmp_target, target_path)
                logger.info(f"[PLAYBACK] SW Transcoded {safe_src} -> {target_path}")
                return True

        logger.error(f"[PLAYBACK] Transcode failed for {safe_src}: {res.stderr}")
        if os.path.exists(tmp_target):
            os.remove(tmp_target)
        return False
    except Exception as e:
        logger.error(f"[PLAYBACK] Transcode exception for {source_path}: {e}")
        if os.path.exists(tmp_target):
            try:
                os.remove(tmp_target)
            except Exception:
                pass
        return False


def get_or_create_playback_file(event_id: int, source_path: str, transcode: bool = False) -> str:
    """
    Returns path to a browser-compatible MP4 file.
    - If transcode=True: returns H.264 transcoded file.
    - If source is MKV: returns remuxed MP4.
    - If source is already MP4 and transcode=False: returns source_path directly.
    """
    ensure_cache_dir()
    probe_info = probe_media(source_path)

    if transcode:
        target_path = os.path.join(CACHE_DIR, f"transcode_{event_id}.mp4")
        if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
            return target_path

        # Coordination for concurrent requests for the same event
        lock_key = f"transcode_{event_id}"
        with _PLAYBACK_LOCK:
            if lock_key not in _ACTIVE_OPERATIONS:
                _ACTIVE_OPERATIONS[lock_key] = threading.Event()
                is_leader = True
            else:
                is_leader = False
                wait_event = _ACTIVE_OPERATIONS[lock_key]

        if is_leader:
            try:
                success = transcode_to_h264(source_path, target_path)
                if success:
                    cleanup_cache()
                    return target_path
            finally:
                with _PLAYBACK_LOCK:
                    ev = _ACTIVE_OPERATIONS.pop(lock_key, None)
                    if ev:
                        ev.set()
        else:
            wait_event.wait(timeout=120)
            if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
                return target_path

        return source_path

    # If file is an MKV container, remux to MP4
    if probe_info["is_mkv"] or source_path.lower().endswith(".mkv"):
        target_path = os.path.join(CACHE_DIR, f"remux_{event_id}.mp4")
        if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
            return target_path

        lock_key = f"remux_{event_id}"
        with _PLAYBACK_LOCK:
            if lock_key not in _ACTIVE_OPERATIONS:
                _ACTIVE_OPERATIONS[lock_key] = threading.Event()
                is_leader = True
            else:
                is_leader = False
                wait_event = _ACTIVE_OPERATIONS[lock_key]

        if is_leader:
            try:
                success = remux_to_mp4(source_path, target_path)
                if success:
                    cleanup_cache()
                    return target_path
            finally:
                with _PLAYBACK_LOCK:
                    ev = _ACTIVE_OPERATIONS.pop(lock_key, None)
                    if ev:
                        ev.set()
        else:
            wait_event.wait(timeout=30)
            if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
                return target_path

    # Source is already MP4 and not requesting transcode
    return source_path


def cleanup_cache(max_size_mb: int = 2048, max_age_hours: int = 24):
    """Keep playback cache within size and age limits."""
    try:
        now = time.time()
        files = []
        total_size = 0
        if not os.path.exists(CACHE_DIR):
            return
        for fname in os.listdir(CACHE_DIR):
            fpath = os.path.join(CACHE_DIR, fname)
            if os.path.isfile(fpath):
                stat = os.stat(fpath)
                total_size += stat.st_size
                if now - stat.st_mtime > max_age_hours * 3600:
                    try:
                        os.remove(fpath)
                    except OSError:
                        pass
                else:
                    files.append((stat.st_mtime, stat.st_size, fpath))

        if total_size > max_size_mb * 1024 * 1024:
            files.sort(key=lambda x: x[0])
            for _, size, fpath in files:
                if total_size <= int(max_size_mb * 0.75) * 1024 * 1024:
                    break
                try:
                    os.remove(fpath)
                    total_size -= size
                except OSError:
                    pass
    except Exception as e:
        logger.debug(f"Playback cache cleanup error: {e}")


def cleanup_event_cache(event_id: int):
    """Delete any cached remux or transcode files for a deleted event."""
    try:
        for prefix in ["remux_", "transcode_"]:
            p = os.path.join(CACHE_DIR, f"{prefix}{event_id}.mp4")
            if os.path.exists(p):
                os.remove(p)
    except Exception:
        pass

