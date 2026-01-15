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
