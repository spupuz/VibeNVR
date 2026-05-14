import re

def mask_url(text: str) -> str:
    """Mask credentials, tokens, and sensitive keys in strings for safe logging."""
    if not text: return ""
    
    # 1. Redact credentials in URLs (rtsp://user:pass@host)
    text = re.sub(r'([a-z]+://[^:]+:)([^@]+)(@)', r'\1***\3', text, flags=re.IGNORECASE)
    
    # 2. Sensitive keys list
    sensitive_keys = r'password|pwd|secret|token|access_token|Authorization|X-API-Key|client_secret|totp_secret|media_token'
    
    # 3. Handle Bearer tokens specifically
    text = re.sub(r'(?i)Bearer\s+[\w\-\.]+', r'Bearer REDACTED', text)
    
    # 4. Handle JSON/YAML/Quoted formats: "key": "value" or 'key': 'value'
    text = re.sub(rf'(?i)(["\']?({sensitive_keys})["\']?\s*[:=]\s*["\'])([^"\']+)(["\'])', r'\1***\4', text)
    
    # 5. Handle unquoted key-value pairs: key=value or key: value
    text = re.sub(rf'(?i)\b({sensitive_keys})\b\s*[:=]\s*(?!Bearer )[\w\-\.!@#$%^&*()]+', r'\1=REDACTED', text)
    
    # 6. Redact IPs (preserve localhost 127.0.0.1)
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    def mask_ip(match):
        ip = match.group(0)
        if ip.startswith("127."):
            return ip
        return "XXX.XXX.XXX.XXX"
    text = re.sub(ip_pattern, mask_ip, text)
    
    return text
