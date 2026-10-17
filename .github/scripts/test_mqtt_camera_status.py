import unittest
from unittest.mock import MagicMock, patch
import json
import sys
import os

# Ensure repo and engine paths are available
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../engine')))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from engine.mqtt_service import MQTTService

class TestMQTTCameraStatusCI(unittest.TestCase):
    def setUp(self):
        self.service = MQTTService()
        self.service.client = MagicMock()
        self.service.connected = True
        self.service.config = {
            "mqtt_enabled": True,
            "mqtt_host": "localhost",
            "mqtt_port": 1883,
            "mqtt_topic_prefix": "vibenvr"
        }

    def tearDown(self):
        self.service._stop_event.set()

    def test_camera_health_new_status_key_online(self):
        """Test Issue #430 regression: new_status key from CameraThread._check_health must publish online."""
        payload = {"title": "Camera Online", "message": "Connection restored", "new_status": "CONNECTED"}
        self.service.publish_event(10, "camera_health", payload)
        self.service.client.publish.assert_called_with("vibenvr/10/status", "online", retain=True)

    def test_camera_health_unreachable_offline(self):
        """Test that UNREACHABLE camera status publishes offline."""
        payload = {"title": "Camera Offline", "message": "Unreachable", "new_status": "UNREACHABLE"}
        self.service.publish_event(10, "camera_health", payload)
        self.service.client.publish.assert_called_with("vibenvr/10/status", "offline", retain=True)

    def test_topic_prefix_change_causes_reconnect(self):
        """Test that changing topic prefix causes reconnect so new discovery is published."""
        with patch.object(self.service, '_disconnect') as mock_disc, \
             patch.object(self.service, '_connect') as mock_conn:
            new_conf = dict(self.service.config)
            new_conf["mqtt_topic_prefix"] = "vibenvr_new"
            self.service.update_config(new_conf)
            mock_disc.assert_called_once()
            mock_conn.assert_called_once()

if __name__ == '__main__':
    unittest.main()

