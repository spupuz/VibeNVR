from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from sqlalchemy import func, case
import database
import models
import schemas
import auth_service
import shutil
import time
import events_state
from routers import stats  # Import for START_TIME

router = APIRouter(
    prefix="/homepage",
    tags=["homepage"],
)


@router.get("/stats", response_model=schemas.HomepageStats)
def get_homepage_stats(
    api_token: models.ApiToken = Depends(auth_service.verify_api_token),
    db: Session = Depends(database.get_db),
):
    """
    Public endpoint for Homepage dashboard.
    Requires authentication via API token (X-API-Key header).
    """
    # Camera Stats
    cameras_total = db.query(func.count(models.Camera.id)).scalar() or 0
    cameras_online = (
        db.query(func.count(models.Camera.id))
        .filter(models.Camera.is_active.is_(True))
        .scalar()
        or 0
    )

    # Active Recording Cameras (using LIVE_MOTION / ACTIVE_CAMERAS from events router)
    # ACTIVE_CAMERAS tracks ongoing motion events
    cameras_recording = len(events_state.ACTIVE_CAMERAS)

    # Event Stats
    from datetime import timezone
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)

    events_stats = (
        db.query(
            func.sum(case((models.Event.timestamp_start >= today_start, 1), else_=0)),
            func.sum(case((models.Event.timestamp_start >= week_start, 1), else_=0)),
            func.sum(case((models.Event.timestamp_start >= month_start, 1), else_=0)),
        )
        .filter(models.Event.timestamp_start >= month_start)
        .first()
    )

    if events_stats:
        events_today = int(events_stats[0] or 0)
        events_this_week = int(events_stats[1] or 0)
        events_this_month = int(events_stats[2] or 0)
    else:
        events_today = events_this_week = events_this_month = 0

    # Last Event
    last_event = (
        db.query(models.Event).order_by(models.Event.timestamp_start.desc()).first()
    )

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
        uptime=uptime_str,
    )
