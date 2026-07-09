import pytest
import sys
import os
from unittest.mock import patch

sys.path.append(os.path.join(os.path.dirname(__file__), '../../backend'))
from routers.events import is_safe_webhook_url

@patch('socket.gethostbyname')
def test_safe_urls(mock_gethostbyname):
    # Mock successful resolution of api.example.com to a safe public IP
    def mock_resolve(hostname):
        if hostname == 'api.example.com':
            return '93.184.216.34'
        elif hostname == 'localhost':
            return '127.0.0.1'
        return hostname # If it's already an IP string
    mock_gethostbyname.side_effect = mock_resolve

    assert is_safe_webhook_url('http://127.0.0.1/webhook') == True
    assert is_safe_webhook_url('http://localhost:8080/events') == True
    assert is_safe_webhook_url('http://192.168.1.100/notify') == True
    assert is_safe_webhook_url('https://api.example.com/webhook') == True

def test_unsafe_urls():
    # Link local / metadata
    assert is_safe_webhook_url('http://169.254.169.254/latest/meta-data/') == False

    # Invalid schemes
    assert is_safe_webhook_url('file:///etc/passwd') == False
    assert is_safe_webhook_url('ftp://192.168.1.1') == False

    # Invalid URL structures
    assert is_safe_webhook_url('not a url') == False
    assert is_safe_webhook_url('') == False

if __name__ == '__main__':
    pytest.main([__file__])
