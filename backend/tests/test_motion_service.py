from unittest.mock import patch, MagicMock
from requests.exceptions import Timeout

from backend.motion_service import _go2rtc_put_one, GO2RTC_API_URL


def test_go2rtc_put_one_delete_timeout():
    """Test that a timeout during requests.delete does not prevent the PUT request."""
    with (
        patch("backend.motion_service.requests.delete") as mock_delete,
        patch("backend.motion_service.requests.put") as mock_put,
    ):
        mock_delete.side_effect = Timeout("Connection timed out")

        mock_put.return_value = MagicMock(status_code=200)

        result = _go2rtc_put_one("test_cam", "rtsp://test/stream")

        # Verify result is True (success)
        assert result is True

        # Verify delete was called
        mock_delete.assert_called_once_with(
            f"{GO2RTC_API_URL}/api/streams", params={"name": "test_cam"}, timeout=10
        )

        # Verify put was still called despite the timeout in delete
        mock_put.assert_called_once_with(
            f"{GO2RTC_API_URL}/api/streams",
            params={"name": "test_cam", "src": "rtsp://test/stream#timeout=15"},
            timeout=10,
        )


def test_go2rtc_put_one_delete_exception():
    """Test that a general exception during requests.delete does not prevent the PUT request."""
    with (
        patch("backend.motion_service.requests.delete") as mock_delete,
        patch("backend.motion_service.requests.put") as mock_put,
    ):
        mock_delete.side_effect = Exception("General exception")

        mock_put.return_value = MagicMock(status_code=200)

        result = _go2rtc_put_one("test_cam", "rtsp://test/stream")

        # Verify result is True (success)
        assert result is True

        # Verify delete was called
        mock_delete.assert_called_once_with(
            f"{GO2RTC_API_URL}/api/streams", params={"name": "test_cam"}, timeout=10
        )

        # Verify put was still called despite the exception in delete
        mock_put.assert_called_once_with(
            f"{GO2RTC_API_URL}/api/streams",
            params={"name": "test_cam", "src": "rtsp://test/stream#timeout=15"},
            timeout=10,
        )


def test_go2rtc_put_one_success():
    """Test the happy path where both delete and put succeed."""
    with (
        patch("backend.motion_service.requests.delete") as mock_delete,
        patch("backend.motion_service.requests.put") as mock_put,
    ):
        mock_delete.return_value = MagicMock(status_code=200)
        mock_put.return_value = MagicMock(status_code=200)

        result = _go2rtc_put_one("test_cam", "rtsp://test/stream")

        assert result is True
        mock_delete.assert_called_once()
        mock_put.assert_called_once()
