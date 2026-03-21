import re

def mask_url(text: str) -> str:
    """Mask credentials in RTSP/HTTP URLs for safe logging."""
    if not text: return ""
    # Redact credentials in URLs (rtsp://user:pass@host)
    # Supports both standard and those with special characters in the login/password
    return re.sub(r'([a-z0-9]+://[^:]+:)([^@]+)(@)', r'\1*****\3', text, flags=re.IGNORECASE)
