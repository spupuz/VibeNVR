import pytest
from unittest.mock import patch, MagicMock

# We need to import the engine module. We also need to patch subprocess in the right place.
# Because subprocess is imported locally in _check_vaapi_capabilities, we should patch subprocess.run globally.
from engine import main as engine_main

@pytest.fixture(autouse=True)
def reset_vaapi_cache():
    # Store original cache
    old_cache = engine_main._VAAPI_CACHE
    engine_main._VAAPI_CACHE = None
    yield
    # Restore original cache
    engine_main._VAAPI_CACHE = old_cache

@patch('subprocess.run')
def test_check_vaapi_capabilities_happy_path_h264(mock_run):
    """Test successful capability check with h264_vaapi present"""
    # Mock successful subprocess result
    mock_result = MagicMock()
    mock_result.stdout = "some_output h264_vaapi other_output"
    mock_run.return_value = mock_result

    # Needs to mock AIDetector to avoid actual locking and instantiation issues during test
    with patch('engine.main.AIDetector') as mock_ai_detector:
        # We need the context manager for `with ai_lock:` to work
        mock_lock = MagicMock()
        mock_lock.__enter__.return_value = None
        mock_lock.__exit__.return_value = None
        mock_ai_detector.return_value.inference_lock = mock_lock

        result = engine_main._check_vaapi_capabilities()

        assert result is True
        assert engine_main._VAAPI_CACHE is True
        mock_run.assert_called_once_with(
            ['ffmpeg', '-hide_banner', '-encoders'],
            capture_output=True,
            text=True,
            timeout=2
        )

@patch('subprocess.run')
def test_check_vaapi_capabilities_happy_path_hevc(mock_run):
    """Test successful capability check with hevc_vaapi present"""
    mock_result = MagicMock()
    mock_result.stdout = "hevc_vaapi"
    mock_run.return_value = mock_result

    with patch('engine.main.AIDetector') as mock_ai_detector:
        mock_lock = MagicMock()
        mock_lock.__enter__.return_value = None
        mock_lock.__exit__.return_value = None
        mock_ai_detector.return_value.inference_lock = mock_lock

        result = engine_main._check_vaapi_capabilities()

        assert result is True

@patch('subprocess.run')
def test_check_vaapi_capabilities_none_present(mock_run):
    """Test successful check but no vaapi encoders present"""
    mock_result = MagicMock()
    mock_result.stdout = "libx264 libx265"
    mock_run.return_value = mock_result

    with patch('engine.main.AIDetector') as mock_ai_detector:
        mock_lock = MagicMock()
        mock_lock.__enter__.return_value = None
        mock_lock.__exit__.return_value = None
        mock_ai_detector.return_value.inference_lock = mock_lock

        result = engine_main._check_vaapi_capabilities()

        assert result is False
        assert engine_main._VAAPI_CACHE is False

@patch('subprocess.run')
def test_check_vaapi_capabilities_error_path(mock_run):
    """Test error handling when subprocess fails"""
    import subprocess
    mock_run.side_effect = subprocess.TimeoutExpired(cmd="ffmpeg", timeout=2)

    with patch('engine.main.AIDetector') as mock_ai_detector:
        mock_lock = MagicMock()
        mock_lock.__enter__.return_value = None
        mock_lock.__exit__.return_value = None
        mock_ai_detector.return_value.inference_lock = mock_lock

        with patch('engine.main.logger') as mock_logger:
            result = engine_main._check_vaapi_capabilities()

            assert result is False
            # Check that error was logged
            mock_logger.error.assert_called_once()
            assert "Failed to check VAAPI capabilities" in mock_logger.error.call_args[0][0]

def test_check_vaapi_capabilities_uses_cache():
    """Test that cache is used if already populated"""
    engine_main._VAAPI_CACHE = True

    # Should not call subprocess.run
    with patch('subprocess.run') as mock_run:
        result = engine_main._check_vaapi_capabilities()
        assert result is True
        mock_run.assert_not_called()
