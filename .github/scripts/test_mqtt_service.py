import pytest
from unittest.mock import patch, MagicMock

import paho.mqtt.client as mqtt
from engine.mqtt_service import MQTTService

def test_connect_v2_api():
    """Test that the MQTTService uses the V2 API if available."""
    service = MQTTService()
    service.config = {"mqtt_host": "localhost", "mqtt_port": 1883}

    with patch("engine.mqtt_service.mqtt.Client") as mock_client:
        service._connect()

        if hasattr(mqtt, "CallbackAPIVersion"):
            mock_client.assert_called_with(mqtt.CallbackAPIVersion.VERSION2)
        else:
            mock_client.assert_called_with()


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
            # The fallback block should instantiate Client without any arguments
            mock_client_class.assert_called_with()
        finally:
            if original_has_attr:
                mqtt_service_module.mqtt.CallbackAPIVersion = original_attr
