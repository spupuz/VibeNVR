import asyncio
import logging
import threading
import time
import requests
import traceback
from typing import Dict, Optional
from onvif import ONVIFCamera
import zeep
import requests.exceptions
import onvif.exceptions

from database import SessionLocal
import models
import schemas
import onvif_service

logger = logging.getLogger("uvicorn.error")

ENGINE_BASE_URL = "http://engine:8000"

class OnvifEventManager:
    def __init__(self):
        self._subscriptions: Dict[int, asyncio.Task] = {}
        self._running = False
        self._loop = None
        self._thread = None
        self._last_motion_state: Dict[int, bool] = {} # camera_id -> bool
        self._http_session = requests.Session()

    def start(self):
        """Start the background event manager thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()
        logger.info("ONVIF Event Manager started")

    def stop(self):
        """Stop all subscriptions and the event loop."""
        self._running = False
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("ONVIF Event Manager stopped")

    def _run_event_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        
        # Initial bootstrap
        self._loop.create_task(self._bootstrap_subscriptions())
        
        self._loop.run_forever()

    async def _bootstrap_subscriptions(self):
        """Load all cameras with ONVIF Edge enabled and start subscriptions."""
        await asyncio.sleep(2) # Give some time for DB/Engine to be ready
        db = SessionLocal()
        try:
            cameras = db.query(models.Camera).filter(
                models.Camera.is_active == True,
                models.Camera.detect_engine == "ONVIF Edge",
                models.Camera.onvif_host != None
            ).all()
            
            for camera in cameras:
                if camera.onvif_can_events:
                    self.update_subscription(camera.id)
        finally:
            db.close()

    def update_subscription(self, camera_id: int):
        """Start or restart a subscription for a specific camera."""
        if not self._loop:
            return
            
        self._loop.call_soon_threadsafe(
            lambda: asyncio.create_task(self._manage_subscription(camera_id))
        )

    async def _manage_subscription(self, camera_id: int):
        """Background task to manage a single camera subscription."""
        # Cancel existing task if any
        if camera_id in self._subscriptions:
            old_task = self._subscriptions[camera_id]
            logger.info(f"Camera {camera_id}: Cancelling existing ONVIF subscription task...")
            old_task.cancel()
            try:
                # Wait for the old task to truly finish to avoid SOAP session conflicts on the camera
                await old_task
            except (asyncio.CancelledError, Exception):
                pass
            del self._subscriptions[camera_id]

        # Check if we should still be subscribed
        db = SessionLocal()
        camera = db.query(models.Camera).get(camera_id)
        db.close()

        if not camera or not camera.is_active or camera.detect_engine != "ONVIF Edge":
            logger.info(f"Camera {camera_id}: ONVIF Edge not active, skipping subscription")
            return

        task = asyncio.current_task()
        self._subscriptions[camera_id] = task
        
        retry_delay = 10
        while True:
            try:
                await self._run_polling_loop(camera)
            except asyncio.CancelledError:
                logger.info(f"Subscription task for camera {camera_id} cancelled")
                break
            except Exception as e:
                # Check if this was a transient error already warned about
                err_str = str(e).lower()
                is_handled = any(msg in err_str for msg in ["unknown error", "connection aborted", "remotedisconnected", "subscription expired"])
                
                if is_handled:
                    # Just log a concise info/warning if not already warned (usually already warned in _run_polling_loop)
                    # We skip the traceback to keep logs clean
                    pass 
                else:
                    logger.error(f"Critical error in ONVIF polling loop for camera {camera_id}: {e}")
                    logger.error(traceback.format_exc())
                
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 300) # Exp backoff

    async def _run_polling_loop(self, camera: models.Camera):
        """The actual SOAP polling loop."""
        host = camera.onvif_host
        port = camera.onvif_port or 80
        user = camera.onvif_username
        password = camera.onvif_password
        
        logger.info(f"Camera {camera.name} ({camera.id}): Initializing ONVIF PullPoint...")
        
        transport = onvif_service.get_onvif_transport(timeout=10.0)
        # Add a secondary fail-safe timeout for the constructor itself
        async with asyncio.timeout(30.0):
            device = await asyncio.to_thread(ONVIFCamera, host, port, user or "", password or "", adjust_time=True, transport=transport)
        events_service = await asyncio.to_thread(device.create_events_service)
        
        logger.info(f"Camera {camera.name}: Requesting PullPoint subscription...")
        try:
            # Diagnostic: Get supported topics
            try:
                props = await asyncio.to_thread(events_service.GetEventProperties)
                topics = getattr(props, 'TopicSet', 'Unknown')
                logger.debug(f"Camera {camera.name} Supported Topics: {topics}")
                
                # Check for ws:PullPointSubscription support explicitly
                fixed_topic = getattr(props, 'FixedTopicSet', True)
                logger.debug(f"Camera {camera.name} FixedTopicSet: {fixed_topic}")
            except Exception as e:
                logger.warning(f"Camera {camera.name}: Could not fetch EventProperties: {e}")

            # PT5M = 5 minute initial termination time (better for recovering from crashes)
            pull_point = await asyncio.to_thread(events_service.CreatePullPointSubscription, 
                                               {'InitialTerminationTime': 'PT5M'})
            subscription_reference = pull_point.SubscriptionReference
            address = subscription_reference.Address._value_1
            logger.info(f"Camera {camera.name}: PullPoint Address: {address}")
            
            # Create specialized PullPoint service (binds the events wsdl to the pullpoint address)
            pullpoint_service = await asyncio.to_thread(device.create_onvif_service, 'pullpoint', address)
        except zeep.exceptions.Fault as f:
            if "error" in str(f).lower() or "limit" in str(f).lower() or "capacity" in str(f).lower():
                logger.warning(f"Camera {camera.name}: Camera rejected subscription. It has likely reached its max ONVIF subscriptions limit. Please check camera settings or reboot the camera. Retrying in 1 minute...")
            else:
                logger.error(f"Camera {camera.name}: SOAP Fault during subscription: {f}")
            raise f
        except Exception as e:
            if "error" in str(e).lower() and "unknown" in str(e).lower():
                logger.warning(f"Camera {camera.name}: Camera rejected subscription (Unknown error). The camera's subscription limit is likely full. Auto-recovering in 1 minute...")
            elif "RemoteDisconnected" in str(e) or "Connection aborted" in str(e):
                logger.warning(f"Camera {camera.name}: Connection lost during subscription setup. Retrying...")
            else:
                logger.error(f"Camera {camera.name}: Failed to create PullPoint: {e}")
            raise e
        
        try:
            # Polling Loop with hardening
            consecutive_errors = 0
            max_consecutive_errors = 3
            last_renewal = time.time()
            
            while True:
                try:
                    # After 4 minutes, we break the loop to perform a fresh subscripiton.
                    # This is more robust than 'Renew' which is not supported by all cameras.
                    current_time = time.time()
                    if current_time - last_renewal > 240:
                        logger.info(f"Camera {camera.name}: 4-minute lease reached, rebinding subscription for stability...")
                        break # Break to trigger Unsubscribe (finally) and Resubscribe (outer loop)
                    
                    logger.info(f"Camera {camera.name}: Pulling ONVIF messages...")
                    # Use raw dict to bypass zeep wsdl inheritance bug for rw-2 elements
                    response = await asyncio.to_thread(
                        pullpoint_service.PullMessages,
                        {'Timeout': 'PT5S', 'MessageLimit': 10}
                    )
                    
                    # Process notifications
                    if hasattr(response, 'NotificationMessage'):
                        for msg in response.NotificationMessage:
                            self._handle_notification(camera.id, msg)
                    
                    # Reset error counter on success
                    if consecutive_errors > 0:
                        logger.info(f"Camera {camera.name}: ONVIF polling connection restored.")
                    consecutive_errors = 0
                    
                    # Small sleep to yield to other tasks
                    await asyncio.sleep(0.1)
                    
                except (requests.exceptions.RequestException, onvif.exceptions.ONVIFError) as e:
                    err_str = str(e)
                    is_transient = any(msg in err_str for msg in ["Connection aborted", "RemoteDisconnected", "EOF occurred"])
                    
                    if is_transient:
                        consecutive_errors += 1
                        if consecutive_errors < max_consecutive_errors:
                            logger.warning(f"Camera {camera.name}: Transient ONVIF disconnection (attempt {consecutive_errors}/{max_consecutive_errors}). Retrying in 2s...")
                            await asyncio.sleep(2)
                            continue
                        else:
                            logger.error(f"Camera {camera.name}: Max consecutive ONVIF disconnections reached. Renewing subscription...")
                            break # Break inner loop to renew subscription
                    else:
                        # Not a transient/handled error
                        logger.error(f"Camera {camera.name}: Non-transient ONVIF error in polling: {e}")
                        raise e

                except zeep.exceptions.Fault as fault:
                    # Often happens if subscription expires
                    if "NoSubscription" in str(fault) or "Subscription" in str(fault) or "InvalidReference" in str(fault):
                        logger.warning(f"Camera {camera.name}: Subscription expired or invalid, renewing...")
                    else:
                        logger.error(f"Camera {camera.name}: SOAP Fault in polling: {fault}")
                    break # Break to renew subscription
        
        except asyncio.CancelledError:
            raise
        except Exception as e:
            # This catches errors from the subscription setup or persistent loop issues
            raise e
        finally:
            # Graceful cleanup: Try to Unsubscribe to free up the camera slot immediately
            try:
                # Use locals().get() to safely check for pullpoint_service without name errors
                ps = locals().get('pullpoint_service')
                if ps:
                    logger.info(f"Camera {camera.name}: Closing ONVIF subscription gracefully...")
                    await asyncio.to_thread(ps.Unsubscribe)
            except Exception as e:
                # Silence errors during unsubscribe if the session is already dead
                logger.debug(f"Camera {camera.name}: Unsubscribe failed (expected if session already closed): {e}")

    def _parse_boolean(self, value: str) -> Optional[bool]:
        """Helper to parse various boolean-like strings from cameras."""
        if not value:
            return None
        v = str(value).lower().strip()
        if v in ["true", "1", "on", "active", "yes", "enabled", "triggered"]:
            return True
        if v in ["false", "0", "off", "inactive", "no", "disabled", "idle"]:
            return False
        return None

    def _handle_notification(self, camera_id: int, msg):
        """Parse XML notification and trigger engine if motion is detected."""
        try:
            from zeep import helpers
            import xml.etree.ElementTree as ET

            # 1. Extract Topic
            topic = ""
            try:
                if hasattr(msg, 'Topic'):
                    topic = str(msg.Topic._value_1) if hasattr(msg.Topic, '_value_1') else str(msg.Topic)
            except: pass
            
            topic_l = topic.lower()
            is_motion_topic = any(kw in topic_l for kw in ["motion", "cellmotion", "ruleengine", "motionalarm"])
            
            # Use DEBUG for topics to keep logs clean, unless it's a motion topic
            if is_motion_topic:
                logger.debug(f"Camera {camera_id} ONVIF Motion Event | Topic: {topic}")
            else:
                # Log non-motion topics only in debug to reduce noise
                pass

            # 2. Extract and Parse Payload
            is_motion = False
            found_match = False
            
            # We look for SimpleItems in the message. 
            # Zeep often delivers them as a dict with '_value_1' holding the raw XML elements 
            # or as a structured object if the WSDL was parsed correctly.
            
            items_to_check = []
            
            # Try to get raw XML elements first (most reliable for mixed-namespace messages)
            data_element = None
            if hasattr(msg, 'Message') and msg.Message is not None:
                if hasattr(msg.Message, '_value_1'):
                    data_element = msg.Message._value_1
                elif isinstance(msg.Message, dict) and '_value_1' in msg.Message:
                    data_element = msg.Message['_value_1']

            if data_element is not None and hasattr(data_element, 'iter'):
                for item in data_element.iter():
                    if 'SimpleItem' in item.tag:
                        items_to_check.append({
                            'name': item.get('Name', ''),
                            'value': item.get('Value', '')
                        })

            # If no items found via raw XML, try Zeep's structured Data
            if not items_to_check and hasattr(msg, 'Message') and msg.Message is not None:
                data = getattr(msg.Message, 'Data', None)
                if data and hasattr(data, 'SimpleItem'):
                    raw_items = data.SimpleItem if isinstance(data.SimpleItem, list) else [data.SimpleItem]
                    for ri in raw_items:
                        items_to_check.append({
                            'name': getattr(ri, 'Name', '') if hasattr(ri, 'Name') else ri.get('Name', ''),
                            'value': getattr(ri, 'Value', '') if hasattr(ri, 'Value') else ri.get('Value', '')
                        })

            # 3. Analyze Items
            potential_matches = []
            for item in items_to_check:
                name = str(item['name']).lower()
                value = str(item['value']).lower()
                
                # Keywords for fields that indicate a state change
                field_match = any(kw in name for kw in ["motion", "ismotion", "state", "active", "alarm", "detected", "logicalstate"])
                
                if field_match:
                    parsed_val = self._parse_boolean(value)
                    if parsed_val is not None:
                        # Only log match at debug level to prevent flooding
                        logger.debug(f"Camera {camera_id} ONVIF Match Found: {name}={value} (Parsed: {parsed_val})")
                        is_motion = parsed_val
                        found_match = True
                        break # Take the first definitive match
                    else:
                        potential_matches.append(item)

            # 4. Fallback Logic
            if not found_match:
                if is_motion_topic:
                    if items_to_check:
                        logger.debug(f"Camera {camera_id}: Unparsed items in motion topic: {items_to_check}")
                    else:
                        logger.info(f"Camera {camera_id}: Motion topic received with no payload. Treating as trigger.")
                        is_motion = True

            # 5. Trigger Engine only on state change (Rising Edge)
            last_state = self._last_motion_state.get(camera_id, False)
            if is_motion:
                if not last_state:
                    # Rising edge: Start of motion
                    logger.info(f"🏃 [ONVIF] Motion START detected for camera {camera_id}")
                    self._last_motion_state[camera_id] = True
                    self._trigger_engine(camera_id)
                else:
                    # Still active: No need to re-trigger engine
                    pass
            else:
                if last_state:
                    # Falling edge: End of motion
                    logger.info(f"🛑 [ONVIF] Motion END detected for camera {camera_id}")
                    self._last_motion_state[camera_id] = False
                else:
                    # Still inactive
                    pass
                
        except Exception as e:
            logger.error(f"Error parsing ONVIF message for camera {camera_id}: {e}")
            logger.debug(traceback.format_exc())

    def _trigger_engine(self, camera_id: int):
        """Call the Engine API to trigger an external event."""
        def do_post():
            try:
                url = f"{ENGINE_BASE_URL}/cameras/{camera_id}/trigger_event"
                self._http_session.post(url, json={"event_type": "motion", "source": "ONVIF PullPoint"}, timeout=3)
            except Exception as e:
                logger.error(f"Failed to trigger engine for camera {camera_id}: {e}")
        
        # Still using a thread to avoid blocking the asyncio loop, 
        # but now we trigger much less frequently (only on rising edge)
        threading.Thread(target=do_post, daemon=True).start()

# Global Manager Instance
event_manager = OnvifEventManager()
