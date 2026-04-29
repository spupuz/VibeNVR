import paho.mqtt.client as mqtt
import json
import logging
import threading
import time

logger = logging.getLogger("MQTTService")

class MQTTService:
    def __init__(self):
        self.client = None
        self.config = {}
        self.connected = False
        self.reconnect_timer = None
        self._lock = threading.Lock()
        self.cameras_discovered = set()

    def update_config(self, config):
        """Update configuration and (re)connect if necessary"""
        with self._lock:
            old_config = self.config
            self.config = config
            
            enabled = config.get("mqtt_enabled", False)
            host = config.get("mqtt_host", "")
            port = config.get("mqtt_port", 1883)
            
            if not enabled:
                if self.client:
                    logger.info("MQTT Service disabled, disconnecting...")
                    self._disconnect()
                return

            if not host:
                logger.warning("MQTT enabled but no host provided.")
                return

            # Check if connection parameters changed or we are disconnected
            needs_reconnect = (
                not self.client or
                not self.connected or
                host != old_config.get("mqtt_host") or
                port != old_config.get("mqtt_port") or
                config.get("mqtt_username") != old_config.get("mqtt_username") or
                config.get("mqtt_password") != old_config.get("mqtt_password")
            )

            if needs_reconnect:
                logger.info(f"MQTT connecting to {host}:{port} (reason: {'first connect' if not self.client else 'disconnected' if not self.connected else 'config change'})...")
                self._disconnect()
                self._connect()
            else:
                logger.debug("MQTT configuration unchanged and connected.")

    def _connect(self):
        try:
            # Paho MQTT v2.x requires CallbackAPIVersion
            try:
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            except AttributeError:
                # Fallback for older paho-mqtt versions
                self.client = mqtt.Client()
                
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            
            username = self.config.get("mqtt_username")
            password = self.config.get("mqtt_password")
            if username:
                self.client.username_pw_set(username, password)
            
            self.client.connect_async(self.config["mqtt_host"], self.config["mqtt_port"], 60)
            self.client.loop_start()
        except Exception as e:
            logger.error(f"Failed to initialize MQTT client: {e}")

    def _disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.client = None
            self.connected = False
            self.cameras_discovered.clear()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            logger.info("MQTT Connected successfully.")
            self.connected = True
            
            # Send discovery for all cameras immediately on connection
            try:
                from core import manager
                for camera_id, thread in manager.cameras.items():
                    self.publish_discovery(camera_id, thread.config.get("name", f"Camera {camera_id}"))
            except Exception as e:
                logger.error(f"Failed to send initial discovery: {e}")
        else:
            logger.error(f"MQTT Connection failed with code {reason_code}")
            self.connected = False

    def _on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        logger.warning(f"MQTT Disconnected (rc={reason_code}).")
        self.connected = False

    def publish_discovery(self, camera_id, camera_name):
        """Publish Home Assistant Discovery messages"""
        if not self.connected:
            return

        prefix = self.config.get("mqtt_topic_prefix", "vibenvr")
        base_topic = f"{prefix}/{camera_id}"
        
        # 1. Motion Binary Sensor
        discovery_topic = f"homeassistant/binary_sensor/{prefix}_{camera_id}_motion/config"
        payload = {
            "name": f"{camera_name} Motion",
            "state_topic": f"{base_topic}/motion",
            "availability_topic": f"{base_topic}/status",
            "payload_on": "ON",
            "payload_off": "OFF",
            "device_class": "motion",
            "unique_id": f"{prefix}_{camera_id}_motion",
            "device": {
                "identifiers": [f"{prefix}_camera_{camera_id}"],
                "name": camera_name,
                "model": "VibeNVR Camera",
                "manufacturer": "VibeNVR"
            }
        }
        self.client.publish(discovery_topic, json.dumps(payload), retain=True)
        
        # 2. Status/Health (as a separate diagnostic entity if wanted, but availability covers it)
        
        logger.debug(f"Published discovery for camera {camera_id} ({camera_name})")
        self.cameras_discovered.add(camera_id)

    def publish_event(self, camera_id, event_type, payload=None):
        """Publish real-time events to MQTT"""
        if not self.connected:
            return

        prefix = self.config.get("mqtt_topic_prefix", "vibenvr")
        base_topic = f"{prefix}/{camera_id}"

        if event_type == "motion_on":
            self.client.publish(f"{base_topic}/motion", "ON", retain=True)
            if payload and isinstance(payload, dict):
                ai_metadata = payload.get("ai_metadata")
                if ai_metadata:
                    self.client.publish(f"{base_topic}/attributes", json.dumps({"ai_metadata": ai_metadata}), retain=False)
        
        elif event_type == "motion_off":
            self.client.publish(f"{base_topic}/motion", "OFF", retain=True)
            
        elif event_type == "camera_health":
            if payload:
                status = payload.get("status", "unknown").lower()
                # Map to online/offline for HA availability
                availability = "online" if status == "connected" else "offline"
                self.client.publish(f"{base_topic}/status", availability, retain=True)

    def publish_status(self, camera_id, status):
        """Publish camera connectivity status"""
        if not self.connected:
            return
        prefix = self.config.get("mqtt_topic_prefix", "vibenvr")
        availability = "online" if status.lower() == "connected" else "offline"
        self.client.publish(f"{prefix}/{camera_id}/status", availability, retain=True)

mqtt_service = MQTTService()
