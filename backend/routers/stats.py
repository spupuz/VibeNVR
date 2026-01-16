from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import shutil
import time
import os
from datetime import datetime, timedelta
from sqlalchemy import func
import crud, database, schemas, models

router = APIRouter(
    prefix="/stats",
    tags=["stats"],
)

START_TIME = time.time()

@router.get("/")
def get_stats(db: Session = Depends(database.get_db)):
    from sqlalchemy import func
    
    # 1. Active Cameras
    cameras = crud.get_cameras(db, skip=0, limit=1000)
    active_cameras_count = len([c for c in cameras if c.is_active])

    # 2. Detailed Storage Stats
    # Global counts and sizes
    global_movies = db.query(func.count(models.Event.id), func.sum(models.Event.file_size)).filter(models.Event.type == "video").first()
    global_pics = db.query(func.count(models.Event.id), func.sum(models.Event.file_size)).filter(models.Event.type == "snapshot").first()
    
    global_stats = {
        "movies": {"count": global_movies[0] or 0, "size_gb": round((global_movies[1] or 0) / (1024**3), 2)},
        "images": {"count": global_pics[0] or 0, "size_gb": round((global_pics[1] or 0) / (1024**3), 2)}
    }

    # Per-camera stats
    camera_stats = {}
    for cam in cameras:
        cam_movies = db.query(func.count(models.Event.id), func.sum(models.Event.file_size)).filter(models.Event.camera_id == cam.id, models.Event.type == "video").first()
        cam_pics = db.query(func.count(models.Event.id), func.sum(models.Event.file_size)).filter(models.Event.camera_id == cam.id, models.Event.type == "snapshot").first()
        
        camera_stats[cam.id] = {
            "movies": {"count": cam_movies[0] or 0, "size_gb": round((cam_movies[1] or 0) / (1024**3), 2)},
            "images": {"count": cam_pics[0] or 0, "size_gb": round((cam_pics[1] or 0) / (1024**3), 2)}
        }

    # 3. Storage Usage (Global Disk + Vibe Media)
    storage_path = "/data"
    try:
        # Physical disk stats
        total, used_physical, free = shutil.disk_usage(storage_path)
        storage_total_gb = round(total / (2**30), 1)
        storage_free_gb = round(free / (2**30), 1)
        
        # Vibe Application Usage (Movies + Images)
        vibe_used_bytes = (global_movies[1] or 0) + (global_pics[1] or 0)
        storage_used_gb = round(vibe_used_bytes / (1024**3), 2)
        
        # Percent is Vibe Usage / Total Disk (though frontend might compare against quota)
        storage_percent = round((vibe_used_bytes / total) * 100) if total > 0 else 0
        
    except Exception as e:
        print(f"Error getting disk usage: {e}")
        storage_total_gb = storage_used_gb = storage_free_gb = storage_percent = 0

    # 4. System Uptime
    uptime_seconds = int(time.time() - START_TIME)
    uptime_str = f"{uptime_seconds // 86400}d {(uptime_seconds % 86400) // 3600}h {(uptime_seconds % 3600) // 60}m"

    return {
        "active_cameras": active_cameras_count,
        "total_events": (global_movies[0] or 0) + (global_pics[0] or 0),
        "video_count": global_movies[0] or 0,
        "picture_count": global_pics[0] or 0,
        "storage": {
            "total_gb": storage_total_gb,
            "used_gb": storage_used_gb,
            "free_gb": storage_free_gb,
            "percent": storage_percent
        },
        "details": {
            "global": global_stats,
            "cameras": camera_stats
        },
        "system_status": "Healthy",
        "uptime": uptime_str
    }

@router.get("/history")
def get_stats_history(db: Session = Depends(database.get_db)):
    """
    Returns hourly event counts for the last 24 hours.
    """
    now = datetime.now()
    twenty_four_hours_ago = now - timedelta(hours=24)
    
    # Query for events in the last 24h
    try:
        # Group by hour
        # Postgres: date_trunc('hour', timestamp)
        # SQLite: strftime('%Y-%m-%d %H:00:00', timestamp)
        # To be safe/simple with ORM without worrying about dialect specifics too much,
        # we can fetch the events (id, type, timestamp) and aggregate in Python.
        # Given this is NVR, 24h events could be 10k+. Python agg is fine for 10k items.
        
        events = db.query(models.Event.timestamp_start, models.Event.type)\
            .filter(models.Event.timestamp_start >= twenty_four_hours_ago)\
            .all()
            
        # Initialize buckets for last 24h
        history = {}
        # Pre-fill with 0
        for i in range(25):
            t = now - timedelta(hours=i)
            key = t.strftime("%H:00")
            history[key] = {"events": 0, "videos": 0}
            
        for evt in events:
            if not evt.timestamp_start:
                continue
            key = evt.timestamp_start.strftime("%H:00")
            # We might need to handle timezone if DB is UTC and local is not
            # But usually naive datetimes in DB match logic.
            # If the key isn't in history (slightly out of bounds due to minute diff), skip or find nearest.
            if key in history:
                history[key]["events"] += 1
                if evt.type == 'video':
                    history[key]["videos"] += 1
        
        # Convert to list sorted by time
        data = []
        # sort keys by time?
        # Construct list from 24h ago to now
        for i in range(24, -1, -1):
            t = now - timedelta(hours=i)
            key = t.strftime("%H:00")
            if key in history:
                data.append({
                    "time": key,
                    "events": history[key]["events"],
                    "videos": history[key]["videos"]
                })
        
        return data

    except Exception as e:
        print(f"Error generating history stats: {e}")
        return []
