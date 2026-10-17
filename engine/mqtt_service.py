import paho.mqtt.client as mqtt
import json
import logging
import threading

logger = logging.getLogger("MQTTService")

class MQTTService:
    def __init__(self):
        self.client = None
        self.config = {}
        self.connected = False
        self._lock = threading.Lock()
        self.cameras_discovered = set()
        self._watchdog_thread = None
        self._stop_event = threading.Event()

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
                    self._stop_event.set()
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
                config.get("mqtt_password") != old_config.get("mqtt_password") or
                config.get("mqtt_topic_prefix") != old_config.get("mqtt_topic_prefix")
            )

            if needs_reconnect:
                logger.info(f"MQTT connecting to {host}:{port} (reason: {'first connect' if not self.client else 'disconnected' if not self.connected else 'config change'})...")
                self._disconnect()
                self._connect()
            else:
                logger.debug("MQTT configuration unchanged and connected.")

        self._ensure_watchdog()

    def _ensure_watchdog(self):
        """Start watchdog thread if not running"""
        if self._watchdog_thread is None or not self._watchdog_thread.is_alive():
            self._stop_event.clear()
            self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True, name="MQTTWatchdog")
            self._watchdog_thread.start()

    def _watchdog_loop(self):
        """Background watchdog to verify connection and periodically publish camera availability heartbeat"""
        while not self._stop_event.is_set():
            if self._stop_event.wait(30.0):
                break

            with self._lock:
                if not self.config.get("mqtt_enabled", False):
                    continue
                host = self.config.get("mqtt_host")
                if not host:
                    continue

                if not self.connected or not self.client:
                    logger.info("MQTT Watchdog: Connection lost or not established, attempting reconnect...")
                    try:
                        self._disconnect()
                        self._connect()
                    except Exception as e:
                        logger.error(f"MQTT Watchdog reconnect error: {e}")
                    continue

            # Heartbeat: periodically refresh status & discovery for all active cameras
            try:
                if self.connected and self.client:
                    from core import manager
                    prefix = self.config.get("mqtt_topic_prefix", "vibenvr")
                    self.client.publish(f"{prefix}/status", "online", retain=True)
                    for camera_id, thread in list(manager.cameras.items()):
                        if camera_id not in self.cameras_discovered:
                            self.publish_discovery(camera_id, thread.config.get("name", f"Camera {camera_id}"))
                        self.publish_status(camera_id, thread.get_health())
            except Exception as e:
                logger.debug(f"MQTT Watchdog heartbeat error: {e}")

    def _connect(self):
        try:
            # Generate a stable client_id for this instance to prevent Paho v2 reconnect bugs
            import uuid
            if not hasattr(self, '_client_id'):
                self._client_id = f"vibenvr_engine_{uuid.uuid4().hex[:8]}"

            # Paho MQTT v2.x requires CallbackAPIVersion
            try:
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=self._client_id)
            except AttributeError:
                # Fallback for older paho-mqtt versions
                self.client = mqtt.Client(client_id=self._client_id)
                
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            
            username = self.config.get("mqtt_username")
            password = self.config.get("mqtt_password")
            if username:
                self.client.username_pw_set(username, password)

            # Last Will and Testament: mark system status as offline if client drops
            prefix = self.config.get("mqtt_topic_prefix", "vibenvr")
            try:
                self.client.will_set(f"{prefix}/status", "offline", qos=1, retain=True)
            except Exception as e:
                logger.debug(f"Failed to set MQTT LWT: {e}")
            
            self.client.connect_async(self.config["mqtt_host"], self.config["mqtt_port"], 60)
            self.client.loop_start()
        except Exception as e:
            logger.error(f"Failed to initialize MQTT client: {e}")

    def _disconnect(self):
        if self.client:
            try:
                prefix = self.config.get("mqtt_topic_prefix", "vibenvr")
                self.client.publish(f"{prefix}/status", "offline", retain=True)
            except Exception:
                pass
            self.client.loop_stop()
            self.client.disconnect()
            self.client = None
            self.connected = False
            self.cameras_discovered.clear()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            logger.info("MQTT Connected successfully.")
            self.connected = True
            
            # Send system online status and discovery for all cameras immediately on connection
            try:
                prefix = self.config.get("mqtt_topic_prefix", "vibenvr")
                if self.client:
                    self.client.publish(f"{prefix}/status", "online", retain=True)
                from core import manager
                for camera_id, thread in manager.cameras.items():
                    self.publish_discovery(camera_id, thread.config.get("name", f"Camera {camera_id}"))
                    self.publish_status(camera_id, thread.get_health())
            except Exception as e:
                logger.error(f"Failed to send initial discovery: {e}")
        else:
            logger.error(f"MQTT Connection failed with code {reason_code}")
            self.connected = False

    def _on_disconnect(self, client, userdata, *args):
        # In Paho v1, args = (rc,)
        # In Paho v2, args = (flags, reason_code, properties)
        reason_code = args[1] if len(args) >= 2 else args[0] if args else "unknown"
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
        
        logger.debug(f"Published discovery for camera {camera_id} ({camera_name})")
        self.cameras_discovered.add(camera_id)

    def publish_event(self, camera_id, event_type, payload=None):
        """Publish real-time events to MQTT"""
        if not self.client:
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
                status = (payload.get("status") or payload.get("new_status") or "unknown").lower()
                # Map to online/offline for HA availability
                availability = "online" if status == "connected" else "offline"
                self.client.publish(f"{base_topic}/status", availability, retain=True)

    def publish_status(self, camera_id, status):
        """Publish camera connectivity status"""
        if not self.client:
            return
        prefix = self.config.get("mqtt_topic_prefix", "vibenvr")
        availability = "online" if str(status).lower() == "connected" else "offline"
        self.client.publish(f"{prefix}/{camera_id}/status", availability, retain=True)

mqtt_service = MQTTService()
