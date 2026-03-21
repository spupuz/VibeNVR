import re

def mask_url(text: str) -> str:
    """Mask credentials in RTSP/HTTP URLs for safe logging."""
    if not text: return ""
    # Redact credentials in URLs (rtsp://user:pass@host)
    return re.sub(r'([a-z0-9]+://[^:]+):([^@]+)(@)', r'\1*****\3', text, flags=re.IGNORECASE)
