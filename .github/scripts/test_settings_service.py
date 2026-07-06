import pytest
from unittest.mock import patch
from fastapi import HTTPException
from backend.settings_service import _validate_webhook_url, validate_setting

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

def test_validate_setting_webhook():
    """Test the validate_setting wrapper for notify_webhook_url."""
    # Should not raise exception
    validate_setting("notify_webhook_url", "http://192.168.1.100")

    # Should raise HTTPException for invalid URL
    with pytest.raises(HTTPException) as exc_info:
        validate_setting("notify_webhook_url", "not a url")
    assert exc_info.value.status_code == 400
    assert "Invalid value for notify_webhook_url" in str(exc_info.value.detail)

def test_validate_setting_empty_webhook():
    """Test that empty webhook URL is ignored."""
    # Should not raise exception
    validate_setting("notify_webhook_url", "")
