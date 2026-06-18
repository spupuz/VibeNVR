import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import copy

# We will need to set PYTHONPATH=engine when running this test
from main import app, GLOBAL_CONFIG

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_global_config():
    """Ensure GLOBAL_CONFIG is restored to its original state after every test."""
    original_config = copy.deepcopy(GLOBAL_CONFIG)
    yield
    GLOBAL_CONFIG.clear()
    GLOBAL_CONFIG.update(original_config)

def test_update_config_empty():
    """Test updating with empty config returns success and does not break."""
    response = client.post("/config", json={})
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert "config" in response.json()

@patch("main.mqtt_service")
@patch("main.set_engine_log_level")
@patch("main.AIDetector", autospec=True)
def test_update_config_values(mock_ai_detector_cls, mock_set_engine_log_level, mock_mqtt_service):
    """Test that modifying standard GLOBAL_CONFIG values works and updates globals."""
    mock_ai = MagicMock()
    mock_ai_detector_cls.return_value = mock_ai

    test_config = {
        "opt_verbose_engine_logs": True,
        "new_key_not_in_global_config_is_ignored": True
    }

    response = client.post("/config", json=test_config)

    assert response.status_code == 200
    assert response.json()["status"] == "success"

    assert GLOBAL_CONFIG["opt_verbose_engine_logs"] is True
    mock_set_engine_log_level.assert_called_once_with(True)

@patch("main.mqtt_service")
@patch("main.AIDetector", autospec=True)
def test_update_config_mqtt(mock_ai_detector_cls, mock_mqtt_service):
    """Test that providing an mqtt config triggers mqtt_service.update_config."""
    mock_ai = MagicMock()
    mock_ai_detector_cls.return_value = mock_ai

    test_config = {
        "mqtt": {"host": "localhost", "port": 1883}
    }

    response = client.post("/config", json=test_config)
    assert response.status_code == 200

    mock_mqtt_service.update_config.assert_called_once_with({"host": "localhost", "port": 1883})


@patch("ai_detector.AIDetector.set_enabled")
def test_update_config_ai_enabled_toggle_actual(mock_set_enabled):
    """Test toggling ai_enabled triggers ai.set_enabled."""
    # We must patch `ai_detector` directly as it's imported in `main.py`

    GLOBAL_CONFIG["ai_enabled"] = False

    def fake_init(self, *args, **kwargs):
        self._enabled = False
        self.model_type = "mobilenet_ssd_v2"
        self.interpreter = None
        self.inference_lock = MagicMock()
        self.inference_lock.__enter__ = MagicMock()
        self.inference_lock.__exit__ = MagicMock()

    with patch("ai_detector.AIDetector.__init__", new=fake_init):
        # Toggle ON
        response = client.post("/config", json={"ai_enabled": True})
        assert response.status_code == 200
        assert GLOBAL_CONFIG["ai_enabled"] is True

        mock_set_enabled.assert_called_once_with(True)
        mock_set_enabled.reset_mock()

        # Toggle OFF
        response = client.post("/config", json={"ai_enabled": False})
        assert response.status_code == 200
        assert GLOBAL_CONFIG["ai_enabled"] is False

        mock_set_enabled.assert_called_once_with(False)


@patch("ai_detector.AIDetector.update_model")
@patch("ai_detector.AIDetector.update_hardware")
@patch("ai_detector.AIDetector.set_enabled")
def test_update_config_ai_model_and_hardware_update_actual(mock_set_enabled, mock_update_hardware, mock_update_model):
    """Test modifying ai_model and ai_hardware triggers updates when AI is ALREADY enabled."""
    GLOBAL_CONFIG["ai_enabled"] = True

    def fake_init(self, *args, **kwargs):
        self._enabled = True
        self.model_type = "mobilenet_ssd_v2"
        self.interpreter = None
        self.inference_lock = MagicMock()
        self.inference_lock.__enter__ = MagicMock()
        self.inference_lock.__exit__ = MagicMock()

    with patch("ai_detector.AIDetector.__init__", new=fake_init):

        test_config = {
            "ai_model": "yolov8n",
            "ai_hardware": "cpu"
        }

        response = client.post("/config", json=test_config)
        assert response.status_code == 200

        assert GLOBAL_CONFIG["ai_model"] == "yolov8n"
        assert GLOBAL_CONFIG["ai_hardware"] == "cpu"

        mock_update_model.assert_called_once_with("yolov8n")
        mock_update_hardware.assert_called_once_with("cpu")
        mock_set_enabled.assert_not_called()
