import subprocess
import json
import logging
from utils import mask_url

logger = logging.getLogger(__name__)

def _parse_probe_output(stdout: str):
    """
    Parses the JSON output from ffprobe to extract stream resolution.
    """
    data = json.loads(stdout)
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

def probe_stream(rtsp_url: str, rtsp_transport: str = "tcp"):
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
        "-rtsp_transport", rtsp_transport,  # Use configured transport
        "-i", rtsp_url
    ]

    # Secure RTSP (RSTSPS/RTSPS) - Skip verification (common for self-signed NVRs)
    if rtsp_url.lower().startswith(('rstsps://', 'rtsps://')):
        # Insert before the -i and URL
        cmd.insert(-2, "-tls_verify")
        cmd.insert(-2, "0")
        logger.info(f"Probing secure stream, skipping TLS verification for {mask_url(rtsp_url)}")

    try:
        # Run ffprobe with a timeout to prevent hanging
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            masked_stderr = mask_url(result.stderr or "")
            logger.error(f"ffprobe failed: {masked_stderr}")
            return None

        return _parse_probe_output(result.stdout)

    except subprocess.TimeoutExpired:
        logger.error("ffprobe timed out")
        return None
    except Exception as e:
        logger.error(f"Error proving stream: {mask_url(str(e))}")
        return None
