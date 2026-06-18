import sys
import pytest
from unittest.mock import patch, MagicMock

# Let PYTHONPATH handle backend import
from motion_service import stop_camera

@patch('motion_service.requests.post')
@patch('motion_service.logger')
def test_stop_camera_success(mock_logger, mock_post):
    """Test stopping camera successfully and clearing cache"""
    # Setup mock for cache
    mock_live_motion = {1: {'status': 'motion'}}
    mock_health_cache = {1: 'ok'}

    with patch.dict('sys.modules', {
        'routers.events': MagicMock(LIVE_MOTION=mock_live_motion),
        'health_service': MagicMock(HEALTH_CACHE=mock_health_cache)
    }):
        # Mock requests.post
        mock_post.return_value.status_code = 200

        result = stop_camera(1)

        assert result is True
        mock_post.assert_called_once()
        assert 1 not in mock_live_motion
        assert 1 not in mock_health_cache
        mock_logger.info.assert_called_with("Stopped camera 1")

@patch('motion_service.requests.post')
@patch('motion_service.logger')
def test_stop_camera_cache_cleanup_exception(mock_logger, mock_post):
    """Test stopping camera successfully even if cache cleanup fails"""
    # Mock requests.post
    mock_post.return_value.status_code = 200

    # We force the inner try block to fail by throwing an ImportError
    # By mocking a side effect on importing routers.events

    # Save original __import__
    orig_import = __import__

    def mock_import(name, *args):
        if name == 'routers.events':
            raise Exception("Simulated import error")
        return orig_import(name, *args)

    with patch('builtins.__import__', side_effect=mock_import):
        result = stop_camera(1)

        assert result is True
        mock_post.assert_called_once()
        mock_logger.info.assert_called_with("Stopped camera 1")

@patch('motion_service.requests.post')
@patch('motion_service.logger')
def test_stop_camera_request_exception(mock_logger, mock_post):
    """Test stop camera failing due to request error"""
    # Mock requests.post to raise an Exception
    mock_post.side_effect = Exception("Connection error")

    result = stop_camera(1)

    assert result is False
    mock_post.assert_called_once()
    mock_logger.error.assert_called_with("Error stopping camera 1: Connection error")
