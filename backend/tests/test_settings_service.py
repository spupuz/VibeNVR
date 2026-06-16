import pytest
from fastapi import HTTPException
from settings_service import validate_setting, VALID_FFMPEG_PRESETS
from unittest.mock import patch
import socket

def test_validate_setting_opt_ffmpeg_preset_valid():
    for preset in VALID_FFMPEG_PRESETS:
        # Should not raise any exception
        validate_setting("opt_ffmpeg_preset", preset)

def test_validate_setting_opt_ffmpeg_preset_invalid():
    with pytest.raises(HTTPException) as exc_info:
        validate_setting("opt_ffmpeg_preset", "invalid_preset")
    assert exc_info.value.status_code == 400
    assert "Invalid preset" in exc_info.value.detail

@pytest.mark.parametrize("key", ["opt_live_view_fps_throttle", "opt_motion_fps_throttle"])
def test_validate_setting_throttle_valid(key):
    validate_setting(key, "1")
    validate_setting(key, "30")

@pytest.mark.parametrize("key", ["opt_live_view_fps_throttle", "opt_motion_fps_throttle"])
def test_validate_setting_throttle_invalid(key):
    with pytest.raises(HTTPException) as exc_info:
        validate_setting(key, "0")
    assert exc_info.value.status_code == 400
    assert "Throttle must be >= 1" in exc_info.value.detail

    with pytest.raises(HTTPException) as exc_info:
        validate_setting(key, "not_a_number")
    assert exc_info.value.status_code == 400

def test_validate_setting_opt_live_view_height_limit_valid():
    validate_setting("opt_live_view_height_limit", "144")
    validate_setting("opt_live_view_height_limit", "1080")

def test_validate_setting_opt_live_view_height_limit_invalid():
    with pytest.raises(HTTPException) as exc_info:
        validate_setting("opt_live_view_height_limit", "143")
    assert exc_info.value.status_code == 400
    assert "Height limit must be >= 144" in exc_info.value.detail

    with pytest.raises(HTTPException) as exc_info:
        validate_setting("opt_live_view_height_limit", "abc")
    assert exc_info.value.status_code == 400

def test_validate_setting_opt_motion_analysis_height_valid():
    validate_setting("opt_motion_analysis_height", "64")
    validate_setting("opt_motion_analysis_height", "360")

def test_validate_setting_opt_motion_analysis_height_invalid():
    with pytest.raises(HTTPException) as exc_info:
        validate_setting("opt_motion_analysis_height", "63")
    assert exc_info.value.status_code == 400
    assert "Motion analysis height must be >= 64" in exc_info.value.detail

@pytest.mark.parametrize("key", ["opt_live_view_quality", "opt_snapshot_quality"])
def test_validate_setting_quality_valid(key):
    validate_setting(key, "1")
    validate_setting(key, "50")
    validate_setting(key, "100")

@pytest.mark.parametrize("key", ["opt_live_view_quality", "opt_snapshot_quality"])
def test_validate_setting_quality_invalid(key):
    with pytest.raises(HTTPException) as exc_info:
        validate_setting(key, "0")
    assert exc_info.value.status_code == 400
    assert "Quality must be between 1 and 100" in exc_info.value.detail

    with pytest.raises(HTTPException) as exc_info:
        validate_setting(key, "101")
    assert exc_info.value.status_code == 400
    assert "Quality must be between 1 and 100" in exc_info.value.detail

def test_validate_setting_default_live_view_mode_valid():
    validate_setting("default_live_view_mode", "auto")
    validate_setting("default_live_view_mode", "webcodecs")
    validate_setting("default_live_view_mode", "mjpeg")

def test_validate_setting_default_live_view_mode_invalid():
    with pytest.raises(HTTPException) as exc_info:
        validate_setting("default_live_view_mode", "invalid_mode")
    assert exc_info.value.status_code == 400
    assert "Invalid mode" in exc_info.value.detail

@pytest.mark.parametrize("key", ["opt_verbose_engine_logs", "telemetry_enabled", "mqtt_enabled", "cleanup_enabled"])
def test_validate_setting_boolean_valid(key):
    validate_setting(key, "true")
    validate_setting(key, "True")
    validate_setting(key, "false")
    validate_setting(key, "False")

@pytest.mark.parametrize("key", ["opt_verbose_engine_logs", "telemetry_enabled", "mqtt_enabled", "cleanup_enabled"])
def test_validate_setting_boolean_invalid(key):
    with pytest.raises(HTTPException) as exc_info:
        validate_setting(key, "yes")
    assert exc_info.value.status_code == 400
    assert "Must be 'true' or 'false'" in exc_info.value.detail

def test_validate_setting_mqtt_port_valid():
    validate_setting("mqtt_port", "1")
    validate_setting("mqtt_port", "1883")
    validate_setting("mqtt_port", "65535")

def test_validate_setting_mqtt_port_invalid():
    with pytest.raises(HTTPException) as exc_info:
        validate_setting("mqtt_port", "0")
    assert exc_info.value.status_code == 400
    assert "Port must be between 1 and 65535" in exc_info.value.detail

    with pytest.raises(HTTPException) as exc_info:
        validate_setting("mqtt_port", "65536")
    assert exc_info.value.status_code == 400
    assert "Port must be between 1 and 65535" in exc_info.value.detail

@patch("socket.gethostbyname")
def test_validate_setting_notify_webhook_url_valid_ip(mock_gethostbyname):
    # If the netloc is just an IP
    validate_setting("notify_webhook_url", "http://192.168.1.100/webhook")
    mock_gethostbyname.assert_not_called()

@patch("socket.gethostbyname")
def test_validate_setting_notify_webhook_url_valid_hostname(mock_gethostbyname):
    mock_gethostbyname.return_value = "8.8.8.8"
    validate_setting("notify_webhook_url", "https://example.com/webhook")
    mock_gethostbyname.assert_called_once_with("example.com")

@patch("socket.gethostbyname")
def test_validate_setting_notify_webhook_url_invalid_format(mock_gethostbyname):
    with pytest.raises(HTTPException) as exc_info:
        validate_setting("notify_webhook_url", "not_a_url")
    assert exc_info.value.status_code == 400
    assert "Invalid URL format" in exc_info.value.detail

@patch("socket.gethostbyname")
def test_validate_setting_notify_webhook_url_unresolvable_hostname(mock_gethostbyname):
    mock_gethostbyname.side_effect = socket.gaierror("Name or service not known")
    # Actually the code catches this and returns without raising an error... Let's see:
    # try:
    #     ip_addr = ipaddress.ip_address(socket.gethostbyname(host))
    # except Exception:
    #     return
    validate_setting("notify_webhook_url", "http://unresolvable.local/webhook")
    # No exception should be raised because it catches Exception and returns.
