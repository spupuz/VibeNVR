import re
import socket
import ipaddress
from urllib.parse import urlparse


def is_safe_host(hostname: str) -> bool:
    """Check if a hostname is safe from SSRF attacks."""
    if not hostname:
        return False

    # Resolve hostname to all associated IPs (IPv4 and IPv6) to prevent SSRF via DNS rebinding
    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False

    for res in addr_info:
        ip = res[4][0]
        ip_obj = ipaddress.ip_address(ip)

        # Block link-local (169.254.x.x) and multicast to prevent SSRF against cloud metadata and sensitive internal addresses.
        # Note: We intentionally allow private IPs (like 192.168.x.x) because users of this NVR system
        # rely on webhooks to trigger local home automation services (e.g. Home Assistant).
        # We also block loopback (127.0.0.1, ::1) and unspecified (0.0.0.0, ::) to prevent internal service SSRF.
        if (
            ip_obj.is_link_local
            or ip_obj.is_multicast
            or ip_obj.is_loopback
            or ip_obj.is_unspecified
        ):
            return False

    return True

def is_safe_webhook_url(url: str) -> bool:
    """Check if a webhook URL is safe from SSRF attacks."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False

        return is_safe_host(parsed.hostname)
    except Exception:
        return False


def mask_url(text: str) -> str:
    """Mask credentials in RTSP/HTTP URLs for safe logging."""
    if not text:
        return ""
    # Redact credentials in URLs (rtsp://user:pass@host)
    # Supports both standard and those with special characters in the login/password
    return re.sub(
        r"([a-z0-9]+://[^:]+:)([^@]+)(@)", r"\1*****\3", text, flags=re.IGNORECASE
    )

import os
from cryptography.fernet import Fernet

def get_encryption_key():
    key_path = "/data/sftp_encryption.key"
    # Fallback for local testing if /data doesn't exist
    if not os.path.exists("/data"):
        key_path = "sftp_encryption.key"
        
    if os.path.exists(key_path):
        with open(key_path, "rb") as f:
            return f.read()
    else:
        key = Fernet.generate_key()
        with open(key_path, "wb") as f:
            f.write(key)
        return key

def encrypt_password(password: str) -> str:
    if not password:
        return password
    f = Fernet(get_encryption_key())
    return f.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    if not encrypted_password:
        return encrypted_password
    f = Fernet(get_encryption_key())
    try:
        return f.decrypt(encrypted_password.encode()).decode()
    except Exception:
        return encrypted_password # Fallback if it was plain text or corrupted
