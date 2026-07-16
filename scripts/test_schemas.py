import pytest
from pydantic import ValidationError
from backend.schemas import TestNotificationConfig

def test_webhook_validation_missing_scheme_netloc():
    with pytest.raises(ValidationError, match="Invalid URL format"):
        TestNotificationConfig(
            channel="webhook",
            settings={"notify_webhook_url": "example.com"}
        )
    with pytest.raises(ValidationError, match="Invalid URL format"):
        TestNotificationConfig(
            channel="webhook",
            settings={"notify_webhook_url": "http://"}
        )

def test_webhook_validation_missing_host():
    with pytest.raises(ValidationError, match="Invalid URL format: missing host"):
        TestNotificationConfig(
            channel="webhook",
            settings={"notify_webhook_url": "http://:80"}
        )

def test_webhook_validation_happy_path():
    config = TestNotificationConfig(
        channel="webhook",
        settings={"notify_webhook_url": "http://example.com"}
    )
    assert config.settings["notify_webhook_url"] == "http://example.com"

def test_webhook_validation_non_webhook_channel():
    # Should not trigger webhook validation
    config = TestNotificationConfig(
        channel="email",
        settings={"notify_webhook_url": "invalid-url"}
    )
    assert config.channel == "email"

def test_webhook_validation_ssrf_allowed_ips():
    # Test that local, loopback, private IPs are intentionally allowed per VibeNVR design
    local_urls = [
        "http://127.0.0.1",
        "http://192.168.1.100",
        "http://10.0.0.1",
        "http://[::1]"
    ]
    for url in local_urls:
        config = TestNotificationConfig(
            channel="webhook",
            settings={"notify_webhook_url": url}
        )
        assert config.settings["notify_webhook_url"] == url

def test_webhook_validation_unreachable_host(mocker):
    # If the host is unreachable (gethostbyname raises an exception),
    # the code catches the exception and returns self (skips blocking).
    mocker.patch("socket.gethostbyname", side_effect=Exception("Unreachable"))
    config = TestNotificationConfig(
        channel="webhook",
        settings={"notify_webhook_url": "http://unreachable-host.local"}
    )
    assert config.settings["notify_webhook_url"] == "http://unreachable-host.local"

def test_webhook_validation_outer_exception_handling(mocker):
    # Force a non-ValueError exception to hit the final `except Exception as e:` block
    # and be raised as `ValueError(f'Invalid or unreachable URL: ...')`
    mocker.patch("urllib.parse.urlparse", side_effect=TypeError("Mocked TypeError"))
    with pytest.raises(ValidationError, match="Invalid or unreachable URL: Mocked TypeError"):
        TestNotificationConfig(
            channel="webhook",
            settings={"notify_webhook_url": "http://example.com"}
        )
