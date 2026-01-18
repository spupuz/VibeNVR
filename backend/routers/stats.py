from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import shutil
import time
import os
import psutil
import requests
import threading
from datetime import datetime, timedelta
from collections import deque
from sqlalchemy import func
import crud, database, schemas, models

router = APIRouter(
    prefix="/stats",
    tags=["stats"],
)

START_TIME = time.time()

# In-memory storage for resource history (last 60 minutes)
RESOURCE_HISTORY = deque(maxlen=60)
RESOURCE_HISTORY_LOCK = threading.Lock()

def collect_resource_stats():
    """Collect CPU/RAM stats and store in history. Called every minute."""
    try:
        # Backend stats
        backend_process = psutil.Process(os.getpid())
        backend_cpu = backend_process.cpu_percent(interval=0.1)
        backend_mem_mb = backend_process.memory_info().rss / (1024 * 1024)
        
        # Engine stats
        engine_cpu = 0
        engine_mem_mb = 0
        try:
            engine_resp = requests.get("http://engine:8000/stats", timeout=2)
            if engine_resp.status_code == 200:
                engine_data = engine_resp.json()
                engine_cpu = engine_data.get("cpu_percent", 0)
                engine_mem_mb = engine_data.get("memory_mb", 0)
        except:
            pass
        
        data_point = {
            "timestamp": datetime.now().isoformat(),
            "cpu_percent": round(backend_cpu + engine_cpu, 1),
            "memory_mb": round(backend_mem_mb + engine_mem_mb, 1),
            "backend_cpu": round(backend_cpu, 1),
            "engine_cpu": engine_cpu,
            "backend_mem_mb": round(backend_mem_mb, 1),
            "engine_mem_mb": engine_mem_mb
        }
        
        with RESOURCE_HISTORY_LOCK:
            RESOURCE_HISTORY.append(data_point)
    except Exception as e:
        print(f"Error collecting resource stats: {e}")

def start_resource_collector():
    """Background thread to collect stats every minute"""
    def collector_loop():
        while True:
            collect_resource_stats()
            time.sleep(60)  # Collect every minute
    
    thread = threading.Thread(target=collector_loop, daemon=True)
    thread.start()

# Start the collector on module load
start_resource_collector()

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

    # ----------------------------------------------------
    # Retention Estimation Logic
    # ----------------------------------------------------
    now = datetime.now()
    one_day_ago = now - timedelta(days=1)
    
    # Calculate Daily "Burn Rate" (GB/day) based on last 24h of recordings
    # Group by camera to be precise
    daily_stats_query = db.query(models.Event.camera_id, func.sum(models.Event.file_size))\
        .filter(models.Event.timestamp_start >= one_day_ago, models.Event.type == 'video')\
        .group_by(models.Event.camera_id).all()
    
    daily_usage_map = {cam_id: (float(size) if size is not None else 0.0) for cam_id, size in daily_stats_query}
    global_daily_bytes = sum(daily_usage_map.values())
    global_daily_gb = global_daily_bytes / (1024**3)

    # Get Global Limit setting
    global_limit_row = db.query(models.SystemSettings).filter(models.SystemSettings.key == "max_global_storage_gb").first()
    max_global_gb = float(global_limit_row.value) if global_limit_row and global_limit_row.value else 0

    # Global Estimation
    global_retention_days = None
    if global_daily_gb > 0.1: # Threshold to avoid div by zero/noise
        # If global limit is set, use it. Otherwise use physical free space + used by vibe (Total available to app)
        available_gb = max_global_gb if max_global_gb > 0 else storage_total_gb
        global_retention_days = round(available_gb / global_daily_gb, 1)

    # Enhance Camera Stats with specific estimates
    for cam in cameras:
        d_bytes = daily_usage_map.get(cam.id, 0)
        d_gb = d_bytes / (1024**3)
        est_days = None
        
        if d_gb > 0.01:
            # If camera has specific quota
            if cam.max_storage_gb > 0:
                est_days = round(cam.max_storage_gb / d_gb, 1)
            else:
                # If no specific quota, it's limited by Global or Disk
                # To be conservative, show Global Estimate
                est_days = global_retention_days

        if cam.id in camera_stats:
            camera_stats[cam.id]["daily_rate_gb"] = round(d_gb, 2)
            camera_stats[cam.id]["estimated_retention_days"] = est_days

    # 4. Calculate Required Storage for Configured Retention
    # Map retention settings to days
    RETENTION_DAYS_MAP = {
        "For One Day": 1,
        "For One Week": 7,
        "For One Month": 30,
        "For One Year": 365,
        "Forever": None
    }
    
    # Get the most common retention setting across cameras, or use a default
    # For simplicity, use the first active camera's setting or fallback
    configured_retention_setting = None
    for cam in cameras:
        if cam.preserve_movies and cam.preserve_movies in RETENTION_DAYS_MAP:
            configured_retention_setting = cam.preserve_movies
            break
    
    configured_retention_days = RETENTION_DAYS_MAP.get(configured_retention_setting) if configured_retention_setting else None
    required_storage_gb = None
    if configured_retention_days and global_daily_gb > 0.01:
        required_storage_gb = round(global_daily_gb * configured_retention_days, 1)

    # 5. System Uptime
    uptime_seconds = int(time.time() - START_TIME)
    uptime_str = f"{uptime_seconds // 86400}d {(uptime_seconds % 86400) // 3600}h {(uptime_seconds % 3600) // 60}m"

    # 6. Resource Usage (CPU/Memory for VibeNVR app only)
    # Backend process stats
    backend_process = psutil.Process(os.getpid())
    backend_cpu = backend_process.cpu_percent(interval=0.1)
    backend_mem_mb = backend_process.memory_info().rss / (1024 * 1024)
    
    # Engine stats (from its /stats endpoint)
    engine_cpu = 0
    engine_mem_mb = 0
    try:
        engine_resp = requests.get("http://vibenvr-engine:8000/stats", timeout=2)
        if engine_resp.status_code == 200:
            engine_data = engine_resp.json()
            engine_cpu = engine_data.get("cpu_percent", 0)
            engine_mem_mb = engine_data.get("memory_mb", 0)
    except:
        pass  # Engine unreachable, use 0
    
    # Total app resources
    total_cpu = round(backend_cpu + engine_cpu, 1)
    total_mem_mb = round(backend_mem_mb + engine_mem_mb, 1)

    return {
        "active_cameras": active_cameras_count,
        "total_events": (global_movies[0] or 0) + (global_pics[0] or 0),
        "video_count": global_movies[0] or 0,
        "picture_count": global_pics[0] or 0,
        "storage": {
            "total_gb": storage_total_gb,
            "used_gb": storage_used_gb,
            "free_gb": storage_free_gb,
            "percent": storage_percent,
            "estimated_retention_days": global_retention_days,
            "daily_rate_gb": round(global_daily_gb, 2),
            "configured_retention": configured_retention_setting,
            "configured_retention_days": configured_retention_days,
            "required_storage_gb": required_storage_gb
        },
        "resources": {
            "cpu_percent": total_cpu,
            "memory_mb": total_mem_mb,
            "backend_cpu": round(backend_cpu, 1),
            "backend_mem_mb": round(backend_mem_mb, 1),
            "engine_cpu": engine_cpu,
            "engine_mem_mb": engine_mem_mb
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

@router.get("/resources-history")
def get_resources_history():
    """
    Returns CPU and memory usage history for the last hour (up to 60 data points).
    Data is collected every minute by a background thread.
    """
    with RESOURCE_HISTORY_LOCK:
        return list(RESOURCE_HISTORY)
