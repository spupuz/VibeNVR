import pytest
import numpy as np
from unittest.mock import MagicMock, patch
import time

from engine.motion_detector import MotionDetector

@pytest.fixture
def base_config():
    return {
        'detect_motion_mode': 'Always',
        'recording_mode': 'Motion Triggered',
        'detect_engine': 'OpenCV',
        'motion_gap': 10,
        'min_motion_frames': 1,
        'threshold_percent': 1.0,
        'opt_motion_fps_throttle': 1
    }

@pytest.fixture
def dummy_frame():
    # 200x200 dummy frame
    return np.zeros((200, 200, 3), dtype=np.uint8)

@pytest.fixture
def mock_callbacks():
    event_cb = MagicMock()
    save_snapshot_cb = MagicMock(return_value="/tmp/snap.jpg")
    apply_masks_fn = MagicMock()
    return event_cb, save_snapshot_cb, apply_masks_fn

def test_detect_off_mode(base_config, dummy_frame, mock_callbacks):
    base_config['detect_motion_mode'] = 'Off'
    md = MotionDetector(1, "test_cam", base_config)
    event_cb, save_snapshot_cb, apply_masks_fn = mock_callbacks

    # Pre-condition: simulate it was detecting motion
    md.motion_detected = True

    result = md.detect(dummy_frame, event_cb, save_snapshot_cb, [], [], apply_masks_fn)
    assert result is False
    assert md.motion_detected is False
    event_cb.assert_called_once_with(1, 'motion_end')

def test_onvif_edge_start_motion(base_config, dummy_frame, mock_callbacks):
    base_config['detect_engine'] = 'ONVIF Edge'
    md = MotionDetector(1, "test_cam", base_config)
    event_cb, save_snapshot_cb, apply_masks_fn = mock_callbacks

    # Active external motion
    ext_time = time.time()

    result = md.detect(dummy_frame, event_cb, save_snapshot_cb, [], [], apply_masks_fn, external_motion_time=ext_time)

    assert result is True
    assert md.motion_detected is True
    assert md.last_trigger_source == "external"
    event_cb.assert_called_once_with(1, 'motion_start', {'file_path': '/tmp/snap.jpg', 'source': 'external'})

def test_onvif_edge_end_motion(base_config, dummy_frame, mock_callbacks):
    base_config['detect_engine'] = 'ONVIF Edge'
    base_config['motion_gap'] = 1
    md = MotionDetector(1, "test_cam", base_config)
    event_cb, save_snapshot_cb, apply_masks_fn = mock_callbacks

    # Pre-condition: was detecting motion
    md.motion_detected = True
    md.last_motion_time = time.time() - 2.0  # past the motion gap

    # Inactive external motion
    ext_time = time.time() - 10.0

    result = md.detect(dummy_frame, event_cb, save_snapshot_cb, [], [], apply_masks_fn, external_motion_time=ext_time)

    assert result is False
    assert md.motion_detected is False
    event_cb.assert_called_once_with(1, 'motion_end')

@patch('cv2.createBackgroundSubtractorMOG2')
@patch('cv2.resize')
@patch('cv2.threshold')
def test_opencv_start_motion(mock_threshold, mock_resize, mock_mog2, base_config, dummy_frame, mock_callbacks):
    md = MotionDetector(1, "test_cam", base_config)
    event_cb, save_snapshot_cb, apply_masks_fn = mock_callbacks

    # Setup mocks
    mock_resize.return_value = dummy_frame
    mock_fgbg = MagicMock()
    # High motion mask
    fgmask_high = np.ones((200, 200), dtype=np.uint8) * 255
    mock_fgbg.apply.return_value = fgmask_high
    mock_mog2.return_value = mock_fgbg
    mock_threshold.return_value = (0, fgmask_high)

    result = md.detect(dummy_frame, event_cb, save_snapshot_cb, [], [], apply_masks_fn)

    assert result is True
    assert md.motion_detected is True
    event_cb.assert_called_once_with(1, 'motion_start', {'file_path': '/tmp/snap.jpg', 'source': 'Standard'})

@patch('cv2.createBackgroundSubtractorMOG2')
@patch('cv2.resize')
@patch('cv2.threshold')
def test_opencv_end_motion(mock_threshold, mock_resize, mock_mog2, base_config, dummy_frame, mock_callbacks):
    base_config['motion_gap'] = 1
    md = MotionDetector(1, "test_cam", base_config)
    event_cb, save_snapshot_cb, apply_masks_fn = mock_callbacks

    # Pre-condition: was detecting motion
    md.motion_detected = True
    md.last_motion_time = time.time() - 2.0  # past motion gap

    # Setup mocks for low motion
    mock_resize.return_value = dummy_frame
    mock_fgbg = MagicMock()
    fgmask_low = np.zeros((200, 200), dtype=np.uint8)
    mock_fgbg.apply.return_value = fgmask_low
    mock_mog2.return_value = mock_fgbg
    mock_threshold.return_value = (0, fgmask_low)

    result = md.detect(dummy_frame, event_cb, save_snapshot_cb, [], [], apply_masks_fn)

    assert result is False
    assert md.motion_detected is False
    event_cb.assert_called_once_with(1, 'motion_end')
