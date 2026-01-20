import subprocess
import json
import logging

logger = logging.getLogger(__name__)

def probe_stream(rtsp_url: str):
    """
    Probes the RTSP stream using ffprobe to detect resolution.
    Returns a dict with 'width' and 'height', or None if failed.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-select_streams", "v:0",  # Select first video stream
        "-rtsp_transport", "tcp",  # Force TCP for stability
        rtsp_url
    ]

    # Security: Ensure URL doesn't start with - to prevent flag injection
    if rtsp_url.strip().startswith("-"):
         logger.error("Invalid RTSP URL: Cannot start with -")
         return None

    try:
        # Run ffprobe with a timeout to prevent hanging
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            logger.error(f"ffprobe failed: {result.stderr}")
            return None

        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        if not streams:
            logger.error("No streams found in ffprobe output")
            return None

        stream = streams[0]
        width = stream.get("width")
        height = stream.get("height")

        if width and height:
            return {"width": int(width), "height": int(height)}
        else:
            logger.error(f"Could not find width/height in stream info: {stream}")
            return None

    except subprocess.TimeoutExpired:
        logger.error("ffprobe timed out")
        return None
    except Exception as e:
        logger.error(f"Error proving stream: {e}")
        return None
