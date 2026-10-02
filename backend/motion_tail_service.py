"""Conservatively trim quiet footage from finalized camera-native motion clips."""
import logging
import math
import os
from pathlib import Path
import stat
import subprocess
import tempfile

logger = logging.getLogger(__name__)

SAMPLE_FPS = 2
FRAME_BYTES = 320 * 144
MAX_SCAN_SECONDS = 30
MAX_TRIM_SECONDS = 15
MIN_TRIM_SECONDS = 2
MOVING_FRACTION = 0.006
QUIET_FRACTION = 0.0015


def should_trim_event(event_type, reason, source, enabled):
    return (
        event_type == 'movie_end'
        and reason == 'motion'
        and source == 'hikvision_isapi'
        and enabled is not False
    )


def _probe_duration(path):
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(path)
    ], capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        raise ValueError('Invalid recording')
    duration = float(result.stdout.strip())
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid recording duration')
    return duration


def analyze_quiet_tail(path, duration, captured_after):
    """Return a safe end point or None when footage is ambiguous."""
    if duration <= captured_after + MIN_TRIM_SECONDS + 2:
        return None
    start = max(0, duration - MAX_SCAN_SECONDS)
    frame_limit = int((duration - start) * SAMPLE_FPS) + 2
    result = subprocess.run([
        'ffmpeg', '-nostdin', '-v', 'error', '-ss', f'{start:.3f}', '-i', str(path),
        '-an', '-vf', 'fps=2,scale=320:180,crop=320:144:0:18,format=gray',
        '-frames:v', str(frame_limit), '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'
    ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20)
    data = result.stdout
    if result.returncode != 0 or len(data) % FRAME_BYTES or len(data) < FRAME_BYTES * 6:
        return None

    scores = []
    previous = memoryview(data)[:FRAME_BYTES]
    for offset in range(FRAME_BYTES, len(data), FRAME_BYTES):
        current = memoryview(data)[offset:offset + FRAME_BYTES]
        changed = sum(abs(a - b) >= 24 for a, b in zip(previous, current))
        scores.append(changed / FRAME_BYTES)
        previous = current

    moving = [index for index, score in enumerate(scores, start=1) if score >= MOVING_FRACTION]
    if len(moving) < 2:
        return None
    cutoff = min(duration, start + moving[-1] / SAMPLE_FPS + captured_after)
    if not MIN_TRIM_SECONDS <= duration - cutoff <= MAX_TRIM_SECONDS:
        return None
    # Any uncertain change in the portion to be removed preserves the original.
    for index, score in enumerate(scores, start=1):
        sample_time = start + index / SAMPLE_FPS
        if sample_time > cutoff and score > QUIET_FRACTION:
            return None
    return cutoff


def _remux(source, destination, cutoff):
    result = subprocess.run([
        'ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source),
        '-t', f'{cutoff:.3f}', '-map', '0', '-c', 'copy',
        '-movflags', '+faststart', str(destination)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    if result.returncode != 0:
        raise ValueError('Cannot trim recording')


def trim_quiet_tail(path, captured_after):
    """Atomically replace a verified clip; return seconds removed, or zero."""
    path = Path(path)
    temporary = None
    try:
        if not path.is_file() or path.is_symlink() or captured_after < 0:
            return 0
        original_size = path.stat().st_size
        duration = _probe_duration(path)
        cutoff = analyze_quiet_tail(path, duration, captured_after)
        if cutoff is None:
            return 0
        disk = os.statvfs(path.parent)
        if disk.f_bavail * disk.f_frsize < original_size + 64 * 1024 * 1024:
            return 0

        fd, filename = tempfile.mkstemp(prefix='.vibenvr-tail-', suffix='.mp4', dir=path.parent)
        os.close(fd)
        temporary = Path(filename)
        _remux(path, temporary, cutoff)
        new_duration = _probe_duration(temporary)
        if abs(new_duration - cutoff) > 0.75 or duration - new_duration < MIN_TRIM_SECONDS - 0.25:
            return 0
        playable = subprocess.run([
            'ffmpeg', '-nostdin', '-v', 'error', '-ss', f'{max(0, new_duration - 1):.3f}',
            '-i', str(temporary), '-t', '1', '-map', '0:v:0', '-f', 'null', '-'
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if playable.returncode != 0 or temporary.stat().st_size < 1024:
            return 0
        os.chmod(temporary, stat.S_IMODE(path.stat().st_mode))
        os.replace(temporary, path)
        temporary = None
        return duration - new_duration
    except Exception:
        logger.warning('ISAPI quiet-tail trim skipped; original recording preserved')
        return 0
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                logger.warning('ISAPI quiet-tail temporary file cleanup failed')
