import re
import socket
import ipaddress
from urllib.parse import urlparse

def is_safe_webhook_url(url: str) -> bool:
    """Check if a webhook URL is safe from SSRF attacks."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        # Resolve hostname to IP
        ip = socket.gethostbyname(hostname)
        ip_obj = ipaddress.ip_address(ip)

        # Block link-local (169.254.x.x) and multicast to prevent SSRF against cloud metadata and sensitive internal addresses.
        # Note: We intentionally allow private IPs (like 192.168.x.x) because users of this NVR system
        # rely on webhooks to trigger local home automation services (e.g. Home Assistant).
        if ip_obj.is_link_local or ip_obj.is_multicast:
            return False

        return True
    except Exception:
        return False

def mask_url(text: str) -> str:
    """Mask credentials in RTSP/HTTP URLs for safe logging."""
    if not text: return ""
    # Redact credentials in URLs (rtsp://user:pass@host)
    # Supports both standard and those with special characters in the login/password
    return re.sub(r'([a-z0-9]+://[^:]+:)([^@]+)(@)', r'\1*****\3', text, flags=re.IGNORECASE)
