import pytest
from unittest.mock import patch
from fastapi import HTTPException
from backend.settings_service import validate_setting, VALID_FFMPEG_PRESETS, _validate_webhook_url

def test_validate_setting_valid():
    """Test valid setting values (happy paths)."""
    # opt_ffmpeg_preset
    for preset in VALID_FFMPEG_PRESETS:
        validate_setting("opt_ffmpeg_preset", preset)

    # throttles
    validate_setting("opt_live_view_fps_throttle", "1")
    validate_setting("opt_live_view_fps_throttle", "30")
    validate_setting("opt_motion_fps_throttle", "5")

    # height limits
    validate_setting("opt_live_view_height_limit", "144")
    validate_setting("opt_live_view_height_limit", "1080")

    # motion analysis height
    validate_setting("opt_motion_analysis_height", "64")
    validate_setting("opt_motion_analysis_height", "720")

    # quality
    validate_setting("opt_live_view_quality", "1")
    validate_setting("opt_live_view_quality", "100")
    validate_setting("opt_snapshot_quality", "50")

    # mode
    validate_setting("default_live_view_mode", "auto")
    validate_setting("default_live_view_mode", "webcodecs")
    validate_setting("default_live_view_mode", "mjpeg")

    # booleans
    for key in ["opt_verbose_engine_logs", "telemetry_enabled", "mqtt_enabled", "cleanup_enabled"]:
        validate_setting(key, "true")
        validate_setting(key, "false")
        validate_setting(key, "TRUE")
        validate_setting(key, "FALSE")

    # mqtt_port
    validate_setting("mqtt_port", "1")
    validate_setting("mqtt_port", "1883")
    validate_setting("mqtt_port", "65535")

    # notify_webhook_url
    validate_setting("notify_webhook_url", "http://localhost:8080/webhook")
    validate_setting("notify_webhook_url", "https://example.com/api")
    validate_setting("notify_webhook_url", "")  # empty value is allowed for clearing

def test_validate_setting_invalid_ffmpeg_preset():
    with pytest.raises(HTTPException) as excinfo:
        validate_setting("opt_ffmpeg_preset", "invalid_preset")
    assert excinfo.value.status_code == 400
    assert "Invalid preset" in str(excinfo.value.detail)

def test_validate_setting_invalid_throttle():
    with pytest.raises(HTTPException) as excinfo:
        validate_setting("opt_live_view_fps_throttle", "0")
    assert excinfo.value.status_code == 400
    assert "Throttle must be >= 1" in str(excinfo.value.detail)

    with pytest.raises(HTTPException) as excinfo:
        validate_setting("opt_motion_fps_throttle", "-5")
    assert excinfo.value.status_code == 400
    assert "Throttle must be >= 1" in str(excinfo.value.detail)

    with pytest.raises(HTTPException) as excinfo:
        validate_setting("opt_live_view_fps_throttle", "not_an_int")
    assert excinfo.value.status_code == 400

def test_validate_setting_invalid_height_limit():
    with pytest.raises(HTTPException) as excinfo:
        validate_setting("opt_live_view_height_limit", "143")
    assert excinfo.value.status_code == 400
    assert "Height limit must be >= 144" in str(excinfo.value.detail)

def test_validate_setting_invalid_motion_analysis_height():
    with pytest.raises(HTTPException) as excinfo:
        validate_setting("opt_motion_analysis_height", "63")
    assert excinfo.value.status_code == 400
    assert "Motion analysis height must be >= 64" in str(excinfo.value.detail)

def test_validate_setting_invalid_quality():
    with pytest.raises(HTTPException) as excinfo:
        validate_setting("opt_live_view_quality", "0")
    assert excinfo.value.status_code == 400
    assert "Quality must be between 1 and 100" in str(excinfo.value.detail)

    with pytest.raises(HTTPException) as excinfo:
        validate_setting("opt_snapshot_quality", "101")
    assert excinfo.value.status_code == 400
    assert "Quality must be between 1 and 100" in str(excinfo.value.detail)

def test_validate_setting_invalid_mode():
    with pytest.raises(HTTPException) as excinfo:
        validate_setting("default_live_view_mode", "h264")
    assert excinfo.value.status_code == 400
    assert "Invalid mode. Must be 'auto', 'webcodecs', or 'mjpeg'" in str(excinfo.value.detail)

def test_validate_setting_invalid_boolean():
    for key in ["opt_verbose_engine_logs", "telemetry_enabled", "mqtt_enabled", "cleanup_enabled"]:
        with pytest.raises(HTTPException) as excinfo:
            validate_setting(key, "1")
        assert excinfo.value.status_code == 400
        assert "Must be 'true' or 'false'" in str(excinfo.value.detail)

def test_validate_setting_invalid_mqtt_port():
    with pytest.raises(HTTPException) as excinfo:
        validate_setting("mqtt_port", "0")
    assert excinfo.value.status_code == 400
    assert "Port must be between 1 and 65535" in str(excinfo.value.detail)

    with pytest.raises(HTTPException) as excinfo:
        validate_setting("mqtt_port", "65536")
    assert excinfo.value.status_code == 400
    assert "Port must be between 1 and 65535" in str(excinfo.value.detail)

def test_validate_webhook_url_valid_ip():
    """Test valid IP address in URL."""
    # Should not raise any exception
    _validate_webhook_url("http://192.168.1.100")
    _validate_webhook_url("https://8.8.8.8:8080/webhook")
    _validate_webhook_url("http://127.0.0.1")

def test_validate_webhook_url_invalid_format():
    """Test invalid URL format."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        _validate_webhook_url("not a url")

@patch("socket.gethostbyname")
def test_validate_webhook_url_valid_hostname(mock_gethostbyname):
    """Test valid hostname that resolves to IP."""
    mock_gethostbyname.return_value = "8.8.8.8"
    # Should not raise exception
    _validate_webhook_url("http://example.com/api/webhook")
    mock_gethostbyname.assert_called_once_with("example.com")

@patch("socket.gethostbyname")
def test_validate_webhook_url_unresolvable_hostname(mock_gethostbyname):
    """Test hostname that cannot be resolved."""
    mock_gethostbyname.side_effect = Exception("DNS lookup failed")
    # The code catches Exception from socket.gethostbyname and simply returns
    _validate_webhook_url("http://unresolvable.local")
    mock_gethostbyname.assert_called_once_with("unresolvable.local")

def test_validate_setting_invalid_webhook_url():
    # Test invalid URL format
    with pytest.raises(HTTPException) as excinfo:
        validate_setting("notify_webhook_url", "not a url")
    assert excinfo.value.status_code == 400
    assert "Invalid value for notify_webhook_url" in str(excinfo.value.detail)
