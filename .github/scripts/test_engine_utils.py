import pytest
from engine.utils import mask_url

def test_mask_url_empty_input():
    assert mask_url(None) == ""
    assert mask_url("") == ""

def test_mask_url_credentials_in_url():
    # RTSP url
    assert mask_url("rtsp://admin:secret123@example.com/stream") == "rtsp://admin:***@example.com/stream"

    # HTTP url
    assert mask_url("http://user:mypassword@example.com/api") == "http://user:***@example.com/api"

    # Multiple URLs
    text = "Connection 1: rtsp://user:pass1@example.org, Connection 2: https://user:pass2@example.com"
    expected = "Connection 1: rtsp://user:***@example.org, Connection 2: https://user:***@example.com"
    assert mask_url(text) == expected

def test_mask_url_bearer_tokens():
    assert mask_url("Authorization: Bearer my_secret_token_123") == "Authorization: Bearer REDACTED"
    assert mask_url("Bearer some.jwt.token here") == "Bearer REDACTED here"

def test_mask_url_quoted_formats():
    # JSON style
    assert mask_url('{"password": "my_super_secret", "other": "value"}') == '{"password": "***", "other": "value"}'
    assert mask_url("{'access_token': 'abc123xyz'}") == "{'access_token': '***'}"

    # YAML style
    assert mask_url("client_secret: 'secret_key_value'") == "client_secret: '***'"

    # Case insensitive key matching
    assert mask_url('"AUTHORIZATION": "token123"') == '"AUTHORIZATION": "***"'

def test_mask_url_unquoted_formats():
    # key=value
    assert mask_url("password=secret_password123") == "password=REDACTED"
    assert mask_url("token=abc123xyz") == "token=REDACTED"

    # key=value with other parameter
    assert mask_url("X-API-Key=my_api_key_here") == "X-API-Key=REDACTED"

def test_mask_url_ips():
    # Standard IP
    assert mask_url("Connecting to 192.168.1.50") == "Connecting to XXX.XXX.XXX.XXX"

    # Localhost IP
    assert mask_url("Connecting to 127.0.0.1") == "Connecting to 127.0.0.1"

    # Loopback IP range
    assert mask_url("Connecting to 127.0.1.1") == "Connecting to 127.0.1.1"

    # Mixed
    assert mask_url("From 10.0.0.1 to 127.0.0.1") == "From XXX.XXX.XXX.XXX to 127.0.0.1"
