from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from sqlalchemy import func
import database, models, schemas, auth_service
import shutil
import time
from routers import events # Import for ACTIVE_CAMERAS
from routers import stats # Import for START_TIME

router = APIRouter(
    prefix="/homepage",
    tags=["homepage"],
)

@router.get("/stats", response_model=schemas.HomepageStats)
def get_homepage_stats(
    api_token: models.ApiToken = Depends(auth_service.verify_api_token),
    db: Session = Depends(database.get_db)
):
    """
    Public endpoint for Homepage dashboard.
    Requires authentication via API token (X-API-Key header).
    """
    # Camera Stats
    cameras = db.query(models.Camera).all()
    cameras_total = len(cameras)
    cameras_online = len([c for c in cameras if c.is_active])
    
    # Active Recording Cameras (using LIVE_MOTION / ACTIVE_CAMERAS from events router)
    # ACTIVE_CAMERAS tracks ongoing motion events
    cameras_recording = len(events.ACTIVE_CAMERAS)
    
    # Event Stats
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)
    
    events_today = db.query(func.count(models.Event.id))\
        .filter(models.Event.timestamp_start >= today_start).scalar() or 0
    
    events_this_week = db.query(func.count(models.Event.id))\
        .filter(models.Event.timestamp_start >= week_start).scalar() or 0
    
    events_this_month = db.query(func.count(models.Event.id))\
        .filter(models.Event.timestamp_start >= month_start).scalar() or 0
    
    # Last Event
    last_event = db.query(models.Event)\
        .order_by(models.Event.timestamp_start.desc()).first()
    
    last_event_time = None
    last_event_camera = None
    if last_event:
        last_event_time = last_event.timestamp_start.strftime("%Y-%m-%d %H:%M:%S")
        if last_event.camera:
            last_event_camera = last_event.camera.name
    
    # Storage Stats
    storage_path = "/data"
    
    try:
        total, used_physical, free = shutil.disk_usage(storage_path)
    except:
        total = used_physical = free = 0

    # Vibe Usage
    vibe_usage = db.query(func.sum(models.Event.file_size)).scalar() or 0
    
    storage_used_gb = round(vibe_usage / (1024**3), 2)
    storage_total_gb = round(total / (1024**3), 1)
    storage_percent = round((vibe_usage / total) * 100) if total > 0 else 0

    # Uptime
    uptime_seconds = int(time.time() - stats.START_TIME)
    days = uptime_seconds // 86400
    hours = (uptime_seconds % 86400) // 3600
    minutes = (uptime_seconds % 3600) // 60
    
    if days > 0:
        uptime_str = f"{days}d {hours}h"
    elif hours > 0:
        uptime_str = f"{hours}h {minutes}m"
    else:
        uptime_str = f"{minutes}m"
    
    return schemas.HomepageStats(
        cameras_total=cameras_total,
        cameras_online=cameras_online,
        cameras_recording=cameras_recording,
        events_today=events_today,
        events_this_week=events_this_week,
        events_this_month=events_this_month,
        last_event_time=last_event_time,
        last_event_camera=last_event_camera,
        storage_used_gb=storage_used_gb,
        storage_total_gb=storage_total_gb,
        storage_percent=storage_percent,
        uptime=uptime_str
    )
