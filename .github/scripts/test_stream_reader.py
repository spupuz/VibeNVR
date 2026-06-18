import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../engine')))

from unittest.mock import patch, MagicMock
from stream_reader import StreamReader

@pytest.fixture
def stream_reader():
    reader = StreamReader(camera_id="1", url="rtsp://test", camera_name="TestCamera")
    # Add a mock event_callback to track health callbacks
    reader.event_callback = MagicMock()
    return reader

def test_exception_handler_unauthorized(stream_reader):
    stream_reader.running = True

    with patch('av.open') as mock_av_open:
        mock_av_open.side_effect = Exception("401 Unauthorized")

        def mock_sleep(seconds):
            stream_reader.running = False

        with patch('time.sleep', side_effect=mock_sleep):
            with patch('stream_reader.logger'):
                stream_reader.run()

    assert stream_reader.consecutive_failures == 1
    assert stream_reader.health_status == "UNAUTHORIZED"
    stream_reader.event_callback.assert_called_once()
    args, kwargs = stream_reader.event_callback.call_args
    assert args[1] == 'health_status_changed'
    assert args[2]['status'] == "UNAUTHORIZED"

def test_exception_handler_refused(stream_reader):
    stream_reader.running = True

    with patch('av.open') as mock_av_open:
        mock_av_open.side_effect = Exception("Connection refused")

        def mock_sleep(seconds):
            stream_reader.running = False

        with patch('time.sleep', side_effect=mock_sleep):
            with patch('stream_reader.logger'):
                stream_reader.run()

    assert stream_reader.consecutive_failures == 1
    assert stream_reader.health_status == "UNREACHABLE"
    stream_reader.event_callback.assert_called_once()
    args, kwargs = stream_reader.event_callback.call_args
    assert args[1] == 'health_status_changed'
    assert args[2]['status'] == "UNREACHABLE"

def test_exception_handler_general_error(stream_reader):
    stream_reader.running = True

    with patch('av.open') as mock_av_open:
        mock_av_open.side_effect = Exception("Some random error")

        def mock_sleep(seconds):
            stream_reader.running = False

        with patch('time.sleep', side_effect=mock_sleep):
            with patch('stream_reader.logger'):
                stream_reader.run()

    assert stream_reader.consecutive_failures == 1
    assert stream_reader.health_status == "UNREACHABLE"
    stream_reader.event_callback.assert_called_once()
    args, kwargs = stream_reader.event_callback.call_args
    assert args[1] == 'health_status_changed'
    assert args[2]['status'] == "UNREACHABLE"

def test_exception_handler_closes_container(stream_reader):
    stream_reader.running = True

    mock_container = MagicMock()
    # Mock container stream checks to raise error
    type(mock_container).streams = MagicMock()
    mock_container.streams.video = []  # Triggers "No video stream found"

    with patch('av.open', return_value=mock_container):
        def mock_sleep(seconds):
            stream_reader.running = False

        with patch('time.sleep', side_effect=mock_sleep):
            with patch('stream_reader.logger'):
                stream_reader.run()

    # container.close() should be called in the exception handler
    mock_container.close.assert_called_once()
