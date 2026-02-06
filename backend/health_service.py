import asyncio
import httpx
import logging
import crud
import database
from sqlalchemy.orm import Session
from routers.events import send_notifications
import os

logger = logging.getLogger(__name__)

# Cache for camera health status to detect changes
# camera_id -> last_status
HEALTH_CACHE = {}

async def _fetch_and_update_health(db: Session, camera_id: int, engine_status: dict):
    """Helper to update a single camera's health status in cache"""
    from models import Camera
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera or not camera.is_active:
        return

    # Get status from engine (key is string camera_id)
    cid_str = str(camera.id)
    status = engine_status.get(cid_str)
    
    if not status:
        current_health = "OFFLINE"
    else:
        current_health = status.get("health", "UNKNOWN")
    
    # Compare with previous status
    previous_health = HEALTH_CACHE.get(camera.id)
    
    if previous_health is not None and previous_health != current_health:
        logger.info(f"Camera {camera.name} (ID: {camera.id}) health changed: {previous_health} -> {current_health}")
        
        # Trigger notifications if it became unhealthy
        if current_health in ("UNREACHABLE", "UNAUTHORIZED", "OFFLINE"):
            await trigger_health_notification(db, camera, current_health)
        elif previous_health in ("UNREACHABLE", "UNAUTHORIZED", "OFFLINE") and current_health == "CONNECTED":
            await trigger_health_notification(db, camera, "RECOVERED")

    # Update cache
    HEALTH_CACHE[camera.id] = current_health

async def check_camera_health():
    """Periodic background task to check camera health from Engine"""
    engine_url = "http://engine:8000"
    
    while True:
        try:
            # wait 30 seconds between checks
            await asyncio.sleep(30)
            
            async with httpx.AsyncClient(timeout=5.0) as client:
                try:
                    response = await client.get(f"{engine_url}/debug/status")
                    if response.status_code != 200:
                        logger.warning(f"Health check: Engine status returned {response.status_code}")
                        continue
                        
                    engine_status = response.json()
                except Exception as e:
                    logger.error(f"Health check: Failed to connect to Engine: {e}")
                    continue

                with database.get_db_ctx() as db:
                    # Process each camera reported by engine
                    # Note: We only care about cameras that are supposed to be active
                    cameras = crud.get_cameras(db)
                    
                    for camera in cameras:
                        await _fetch_and_update_health(db, camera.id, engine_status)
                        
        except Exception as e:
            logger.error(f"Error in health check loop: {e}")

async def trigger_health_notification(db: Session, camera, status):
    """Dispatcher for health-related notifications"""
    
    # Check if health notifications are enabled for this camera
    if not (camera.notify_health_email or camera.notify_health_telegram or camera.notify_health_webhook):
        return

    # Prepare message
    if status == "UNREACHABLE":
        title = "🔴 Camera Error: Unreachable"
        msg = f"Camera '{camera.name}' is unreachable. Please check network connection and power."
    elif status == "UNAUTHORIZED":
        title = "🔴 Camera Error: Unauthorized"
        msg = f"Camera '{camera.name}' returned an authentication error. Please check RTSP credentials."
    elif status == "OFFLINE":
        title = "🔴 Camera Error: Offline"
        msg = f"Camera '{camera.name}' is offline (Engine thread not found)."
    elif status == "RECOVERED":
        title = "🟢 Camera Recovered"
        msg = f"Camera '{camera.name}' is back online."
    else:
        title = f"🟡 Camera Status Update: {status}"
        msg = f"Camera '{camera.name}' reported status: {status}"

    # Use existing notification logic
    # We fake a details dict that send_notifications understands partially
    details = {
        "title": title,
        "message": msg,
        "camera_name": camera.name,
        "is_system_alert": True
    }
    
    # We call send_notifications. Since it's usually synchronous, we might need a wrapper 
    # but routers/events.py seems to handle email/telegram synchronously.
    try:
        # Note: send_notifications expects (camera, type, details, db)
        # We use a special type 'camera_health'
        from routers.events import send_notifications
        
        # Override camera notification flags temporarily or adjust send_notifications?
        # Let's adjust send_notifications to handle 'camera_health' type specifically.
        send_notifications(camera.id, "camera_health", details)
        
    except Exception as e:
        logger.error(f"Failed to send health notification for {camera.name}: {e}")

def start_health_service():
    """Start the health check background task"""
    loop = asyncio.get_event_loop()
    loop.create_task(check_camera_health())
    logger.info("Camera Health Service started.")

async def refresh_camera_health(camera_id: int):
    """Force an immediate health check for a specific camera"""
    engine_url = "http://engine:8000"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{engine_url}/debug/status")
            if response.status_code == 200:
                engine_status = response.json()
                with database.get_db_ctx() as db:
                    await _fetch_and_update_health(db, camera_id, engine_status)
    except Exception as e:
        logger.error(f"Failed to refresh health for camera {camera_id}: {e}")
