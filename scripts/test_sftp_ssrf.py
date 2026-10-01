import pytest
from unittest.mock import patch

import os
import sys

# Ensure backend modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

import sftp_client

class MockProfile:
    def __init__(self, host, port, user, pwd, path):
        self.sftp_host = host
        self.sftp_port = port
        self.sftp_username = user
        self.sftp_password = pwd
        self.sftp_remote_path = path

@patch("sftp_client.socket.getaddrinfo")
def test_sftp_client_ssrf_protection(mock_getaddrinfo):
    mock_getaddrinfo.return_value = [(2, 1, 6, '', ('169.254.169.254', 0))]
    profile = MockProfile("169.254.169.254", 22, "user", "pass", "/")

    assert sftp_client.upload_file(profile, "src", "dst") is None

@patch("sftp_client.socket.getaddrinfo")
def test_sftp_client_ssrf_protection_download(mock_getaddrinfo):
    mock_getaddrinfo.return_value = [(2, 1, 6, '', ('127.0.0.1', 0))]
    profile = MockProfile("127.0.0.1", 22, "user", "pass", "/")

    assert sftp_client.download_file(profile, "src", "dst") is False

@patch("sftp_client.socket.getaddrinfo")
def test_sftp_client_ssrf_protection_test_connection(mock_getaddrinfo):
    mock_getaddrinfo.return_value = [(2, 1, 6, '', ('127.0.0.1', 0))]
    result = sftp_client.test_connection("127.0.0.1", 22, "user", "pass", "/")

    assert not result["success"]
    assert "Unsafe host" in result["message"]
