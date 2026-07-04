import pytest
from backend.utils import mask_url

@pytest.mark.parametrize(
    "url, expected",
    [
        ("rtsp://user:pass@host", "rtsp://user:*****@host"),
        ("http://admin:123456@192.168.1.1", "http://admin:*****@192.168.1.1"),
        ("rtsp://host:554/stream", "rtsp://host:554/stream"),
        ("rtsp://user:pass!word@host", "rtsp://user:*****@host"),
        ("https://some_user:some_pass@domain.com:8080/path", "https://some_user:*****@domain.com:8080/path"),
        ("", ""),
        (None, ""),
        ("just_a_string", "just_a_string"),
    ]
)
def test_mask_url(url, expected):
    """Test that mask_url redacts credentials in URLs appropriately."""
    assert mask_url(url) == expected
