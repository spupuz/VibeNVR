import pytest
from unittest.mock import patch, MagicMock
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../engine')))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import paho.mqtt.client as mqtt
from engine.mqtt_service import MQTTService

def test_connect_v2_api():
    """Test that the MQTTService uses the V2 API if available."""
    service = MQTTService()
    service.config = {"mqtt_host": "localhost", "mqtt_port": 1883}

    with patch("engine.mqtt_service.mqtt.Client") as mock_client:
        service._connect()

        from unittest.mock import ANY
        if hasattr(mqtt, "CallbackAPIVersion"):
            mock_client.assert_called_with(mqtt.CallbackAPIVersion.VERSION2, client_id=ANY)
        else:
            mock_client.assert_called_with(client_id=ANY)


def test_connect_fallback():
    """Test that the MQTTService falls back to the old API if V2 is not available."""
    service = MQTTService()
    service.config = {"mqtt_host": "localhost", "mqtt_port": 1883}

    # Patch the Client class
    with patch("engine.mqtt_service.mqtt.Client") as mock_client_class:
        # Patch mqtt so that accessing CallbackAPIVersion raises AttributeError
        import engine.mqtt_service as mqtt_service_module

        # Deleting CallbackAPIVersion from the module (if it exists)
        # and replacing it with a PropertyMock that raises AttributeError
        # is one way. Let's use patch to completely remove the attribute.

        # We can just mock the entire paho.mqtt.client module temporarily
        # inside mqtt_service, or patch specifically the attribute.

        # Let's delete it temporarily from the actual mqtt module
        original_has_attr = hasattr(mqtt_service_module.mqtt, "CallbackAPIVersion")
        if original_has_attr:
            original_attr = mqtt_service_module.mqtt.CallbackAPIVersion
            del mqtt_service_module.mqtt.CallbackAPIVersion

        try:
            service._connect()
            from unittest.mock import ANY
            # The fallback block should instantiate Client with client_id
            mock_client_class.assert_called_with(client_id=ANY)
        finally:
            if original_has_attr:
                mqtt_service_module.mqtt.CallbackAPIVersion = original_attr


@pytest.mark.parametrize("health, availability", [
    ("CONNECTED", "online"),
    ("UNREACHABLE", "offline"),
    ("UNAUTHORIZED", "offline"),
])
def test_camera_health_check_mqtt_availability(health, availability):
    """Periodic camera health must reach MQTT using the same payload as stream health."""
    from camera_thread import CameraThread
    from core import CameraManager

    service = MQTTService()
    service.client = MagicMock()
    service.cameras_discovered.add(1)
    manager = CameraManager()
    camera = MagicMock()
    camera.camera_id = 1
    camera.config = {"name": "Test Camera"}
    camera.last_health_check_time = 0.0
    camera.last_health_report_status = "STARTING"
    camera.stream_reader.get_health.return_value = health
    camera.event_callback = manager.handle_event
    manager.cameras[1] = camera

    with patch("core.mqtt_service", service), patch("threading.Thread"):
        CameraThread._check_health(camera)

    service.client.publish.assert_called_once_with(
        "vibenvr/1/status", availability, retain=True
    )


@pytest.mark.parametrize("health, availability", [
    ("STARTING", "offline"),
    ("CONNECTED", "online"),
    ("UNREACHABLE", "offline"),
])
def test_camera_start_publishes_actual_health(health, availability):
    """Starting a camera must not advertise connectivity before it is established."""
    from core import CameraManager

    service = MQTTService()
    service.client = MagicMock()
    manager = CameraManager()

    with patch("core.CameraThread") as mock_camera, patch("core.mqtt_service", service):
        mock_camera.return_value.get_health.return_value = health
        manager.start_camera(1, {"name": "Test Camera"})

    service.client.publish.assert_called_once_with(
        "vibenvr/1/status", availability, retain=True
    )


@pytest.mark.parametrize("event_type, state", [("motion_on", "ON"), ("motion_off", "OFF")])
def test_motion_events_preserve_binary_state(event_type, state):
    service = MQTTService()
    service.client = MagicMock()

    service.publish_event(1, event_type)

    service.client.publish.assert_called_once_with("vibenvr/1/motion", state, retain=True)
