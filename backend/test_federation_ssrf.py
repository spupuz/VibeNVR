import pytest
from fastapi import HTTPException
from routers.federation import _verify_remote_node
from unittest.mock import patch

def test_verify_remote_node_ssrf_protection():
    unsafe_urls = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://[::1]:8000",
        "http://169.254.169.254"
    ]

    for url in unsafe_urls:
        with pytest.raises(HTTPException) as exc_info:
            _verify_remote_node(url, "dummy_token")
        assert exc_info.value.status_code == 400
        assert "Invalid or unsafe Node URL." in str(exc_info.value.detail)

@patch("routers.federation.requests.get")
@patch("utils.socket.getaddrinfo")
def test_verify_remote_node_valid(mock_getaddrinfo, mock_get):
    mock_get.return_value.status_code = 200
    mock_getaddrinfo.return_value = [(2, 1, 6, '', ('192.168.1.100', 0))]

    safe_urls = [
        "http://192.168.1.100:8000",
        "https://valid-node.example.com"
    ]

    for url in safe_urls:
        _verify_remote_node(url, "dummy_token")
