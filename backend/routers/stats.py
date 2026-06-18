from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import shutil
import requests
import time
import psutil
import os
import threading
from settings_service import get_setting
from datetime import datetime, timedelta
from collections import deque
from sqlalchemy import func
import crud
import database
import models
import auth_service

router = APIRouter(
    prefix="/stats",
    tags=["stats"],
)

START_TIME = time.time()

# In-memory storage for resource history (last 60 minutes)
RESOURCE_HISTORY = deque(maxlen=60)
RESOURCE_HISTORY_LOCK = threading.Lock()

def fetch_engine_stats():
    """Helper to fetch stats from the engine."""
    try:
        engine_resp = requests.get("http://engine:8000/stats", timeout=2)
        if engine_resp.status_code == 200:
            return engine_resp.json()
    except Exception:
        pass
    return None

def collect_resource_stats(last_net_recv=None, last_net_sent=None, check_duration_sec=60):
    """Collect CPU/RAM/Net stats and store in history. Called every minute."""
    try:
        # Backend stats
        backend_process = psutil.Process(os.getpid())
        backend_cpu = backend_process.cpu_percent(interval=0.1)
        backend_mem_mb = backend_process.memory_info().rss / (1024 * 1024)
        
        # Engine stats
        engine_cpu = 0
        engine_mem_mb = 0
        engine_net_recv = 0
        engine_net_sent = 0
        engine_data = fetch_engine_stats()
        if engine_data:
            engine_cpu = engine_data.get("cpu_percent", 0)
            engine_mem_mb = engine_data.get("memory_mb", 0)
            engine_net_recv = engine_data.get("network_recv", 0)
            engine_net_sent = engine_data.get("network_sent", 0)
        
        # Network stats (Global system-wide = Backend + Engine)
        net_io = psutil.net_io_counters()
        # Sum backend + engine bytes. 
        # Note: This might double count internal traffic between them, but ensures external camera traffic is seen.
        current_net_recv = net_io.bytes_recv + engine_net_recv
        current_net_sent = net_io.bytes_sent + engine_net_sent
        
        net_recv_mbps = 0.0
        net_sent_mbps = 0.0
        
        if last_net_recv is not None and last_net_sent is not None:
             # Calculate MB/s based on difference since last check
             diff_recv = current_net_recv - last_net_recv
             diff_sent = current_net_sent - last_net_sent
             
             # Handle counter resets (if container restarted)
             if diff_recv < 0:
                 diff_recv = 0
             if diff_sent < 0:
                 diff_sent = 0
             
             net_recv_mbps = round((diff_recv / (1024 * 1024)) / check_duration_sec, 2)
             net_sent_mbps = round((diff_sent / (1024 * 1024)) / check_duration_sec, 2)
        
        data_point = {
            "timestamp": datetime.now().isoformat(),
            "cpu_percent": round(backend_cpu + engine_cpu, 1),
            "memory_mb": round(backend_mem_mb + engine_mem_mb, 1),
            "backend_cpu": round(backend_cpu, 1),
            "engine_cpu": engine_cpu,
            "backend_mem_mb": round(backend_mem_mb, 1),
            "engine_mem_mb": engine_mem_mb,
            "network_recv_mbps": net_recv_mbps,
            "network_sent_mbps": net_sent_mbps
        }
        
        with RESOURCE_HISTORY_LOCK:
            RESOURCE_HISTORY.append(data_point)
            
        return current_net_recv, current_net_sent
            
    except Exception as e:
        print(f"Error collecting resource stats: {e}")
        return last_net_recv, last_net_sent

def start_resource_collector():
    """Background thread to collect stats every minute"""
    def collector_loop():
        # Initialize baseline
        last_net_recv = None
        last_net_sent = None
        
        # Collect first point immediately (Network will be 0 MB/s due to 0 interval)
        last_net_recv, last_net_sent = collect_resource_stats(last_net_recv, last_net_sent, 1)
        
        while True:
            time.sleep(60)  # Collect every minute
            last_net_recv, last_net_sent = collect_resource_stats(last_net_recv, last_net_sent, 60)
    
    thread = threading.Thread(target=collector_loop, daemon=True)
    thread.start()

# Start the collector on module load
start_resource_collector()

# Real-time Network Speed State (Updated every 2s)
CURRENT_NET_SPEED = {
    "recv_mbps": 0.0,
    "sent_mbps": 0.0
}
_realtime_net_lock = threading.Lock()

def _get_current_network_bytes():
    """Helper to fetch current network bytes (backend + engine)."""
    net_io = psutil.net_io_counters()
    recv = net_io.bytes_recv
    sent = net_io.bytes_sent
    try:
        resp = requests.get("http://engine:8000/stats", timeout=1)
        if resp.status_code == 200:
            data = resp.json()
            recv += data.get("network_recv", 0)
            sent += data.get("network_sent", 0)
    except Exception:
        pass
    return recv, sent

def start_realtime_collector():
    """Background thread to calculate current network speed every 2 seconds"""
    def collector_loop():
        last_time = time.time()
        psutil.Process(os.getpid())
        
        # Initial counters
        last_recv, last_sent = _get_current_network_bytes()

        while True:
            time.sleep(2)
            try:
                now_time = time.time()
                delta_time = now_time - last_time
                if delta_time <= 0:
                    continue
                
                # Get current stats
                curr_recv, curr_sent = _get_current_network_bytes()
                
                # Calculate diff
                diff_recv = curr_recv - last_recv
                diff_sent = curr_sent - last_sent
                
                # Handle restarts/overflows
                if diff_recv < 0:
                    diff_recv = 0
                if diff_sent < 0:
                    diff_sent = 0
                
                # MB/s
                recv_mbps = round((diff_recv / (1024*1024)) / delta_time, 2)
                sent_mbps = round((diff_sent / (1024*1024)) / delta_time, 2)
                
                with _realtime_net_lock:
                    CURRENT_NET_SPEED["recv_mbps"] = recv_mbps
                    CURRENT_NET_SPEED["sent_mbps"] = sent_mbps
                
                # Update baseline
                last_recv = curr_recv
                last_sent = curr_sent
                last_time = now_time
                
            except Exception as e:
                print(f"Error in realtime net collector: {e}")
                time.sleep(5) # Backoff on error

    thread = threading.Thread(target=collector_loop, daemon=True)
    thread.start()

# Start collectors
start_realtime_collector()


def _get_detailed_storage_stats(db: Session, cameras: list, allowed_ids: list | None = None) -> tuple:
    """Calculates detailed storage statistics for movies and images globally and per camera."""
    query_movies = db.query(func.count(models.Event.id), func.sum(models.Event.file_size)).filter(models.Event.type == "video")
    query_pics = db.query(func.count(models.Event.id), func.sum(models.Event.file_size)).filter(models.Event.type == "snapshot")
    
    if allowed_ids is not None:
        query_movies = query_movies.filter(models.Event.camera_id.in_(allowed_ids))
        query_pics = query_pics.filter(models.Event.camera_id.in_(allowed_ids))
        
    global_movies = query_movies.first()
    global_pics = query_pics.first()
    
    global_stats = {
        "movies": {"count": global_movies[0] or 0, "size_gb": round((global_movies[1] or 0) / (1024**3), 2)},
        "images": {"count": global_pics[0] or 0, "size_gb": round((global_pics[1] or 0) / (1024**3), 2)}
    }

    camera_stats = {}
    for cam in cameras:
        cam_movies = db.query(func.count(models.Event.id), func.sum(models.Event.file_size)).filter(models.Event.camera_id == cam.id, models.Event.type == "video").first()
        cam_pics = db.query(func.count(models.Event.id), func.sum(models.Event.file_size)).filter(models.Event.camera_id == cam.id, models.Event.type == "snapshot").first()
        
        camera_stats[cam.id] = {
            "movies": {"count": cam_movies[0] or 0, "size_gb": round((cam_movies[1] or 0) / (1024**3), 2)},
            "images": {"count": cam_pics[0] or 0, "size_gb": round((cam_pics[1] or 0) / (1024**3), 2)}
        }
    return global_movies, global_pics, global_stats, camera_stats

def _get_disk_usage_stats(global_movies: tuple, global_pics: tuple) -> tuple:
    """Calculates disk usage statistics based on physical disk and application usage."""
    storage_path = "/data"
    try:
        total, used_physical, free = shutil.disk_usage(storage_path)
        storage_total_gb = round(total / (2**30), 1)
        storage_free_gb = round(free / (2**30), 1)
        
        vibe_used_bytes = (global_movies[1] or 0) + (global_pics[1] or 0)
        storage_used_gb = round(vibe_used_bytes / (1024**3), 2)
        
        storage_percent = round((vibe_used_bytes / total) * 100) if total > 0 else 0
    except Exception as e:
        print(f"Error getting disk usage: {e}")
        storage_total_gb = storage_used_gb = storage_free_gb = storage_percent = 0
    return storage_total_gb, storage_free_gb, storage_used_gb, storage_percent

def _get_retention_estimates(db: Session, cameras: list, storage_total_gb: float, camera_stats: dict, allowed_ids: list | None = None) -> dict:
    """Calculates retention estimates and storage requirements based on daily usage."""
    now = datetime.now()
    one_day_ago = now - timedelta(days=1)
    
    daily_stats_query = db.query(models.Event.camera_id, func.sum(models.Event.file_size))\
        .filter(models.Event.timestamp_start >= one_day_ago)
        
    if allowed_ids is not None:
        daily_stats_query = daily_stats_query.filter(models.Event.camera_id.in_(allowed_ids))
        
    daily_stats_query_res = daily_stats_query.group_by(models.Event.camera_id).all()
    
    daily_usage_map = {cam_id: (float(size) if size is not None else 0.0) for cam_id, size in daily_stats_query_res}
    global_daily_bytes = sum(daily_usage_map.values())
    global_daily_gb = global_daily_bytes / (1024**3)

    events_24h_query = db.query(func.count(models.Event.id))\
        .filter(models.Event.timestamp_start >= one_day_ago)
        
    if allowed_ids is not None:
        events_24h_query = events_24h_query.filter(models.Event.camera_id.in_(allowed_ids))
        
    events_24h = events_24h_query.scalar() or 0

    global_limit_row = db.query(models.SystemSettings).filter(models.SystemSettings.key == "max_global_storage_gb").first()
    max_global_gb = float(global_limit_row.value) if global_limit_row and global_limit_row.value else 0

    global_retention_days: float | None = None
    if global_daily_gb > 0.01:
        available_gb = max_global_gb if max_global_gb > 0 else storage_total_gb
        global_retention_days = round(available_gb / global_daily_gb, 1)

    for cam in cameras:
        d_bytes = daily_usage_map.get(cam.id, 0)
        d_gb = d_bytes / (1024**3)
        est_days = None
        
        if d_gb > 0.01:
            if cam.max_storage_gb > 0:
                est_days = round(cam.max_storage_gb / d_gb, 1)
            else:
                est_days = global_retention_days

        if cam.id in camera_stats:
            camera_stats[cam.id]["daily_rate_gb"] = round(d_gb, 2)
            camera_stats[cam.id]["estimated_retention_days"] = est_days

    RETENTION_DAYS_MAP = {
        "For One Day": 1,
        "For One Week": 7,
        "For One Month": 30,
        "For One Year": 365,
        "Forever": None
    }
    
    required_storage_gb = 0.0
    max_retention_days = 0
    has_valid_retention = False
    
    for cam in cameras:
        cam_daily_gb = daily_usage_map.get(cam.id, 0.0) / (1024**3)
        cam_days = None
        
        if cam.preserve_movies:
            if cam.preserve_movies in RETENTION_DAYS_MAP:
                cam_days = RETENTION_DAYS_MAP.get(cam.preserve_movies)
            elif cam.preserve_movies != "Forever":
                try:
                    days = int(cam.preserve_movies)
                    if days > 0:
                        cam_days = days
                except (ValueError, TypeError):
                    pass
                    
        if cam_days is not None:
            has_valid_retention = True
            if cam_days > max_retention_days:
                max_retention_days = cam_days
            if cam_daily_gb > 0.01:
                required_storage_gb += (cam_daily_gb * cam_days)

    if has_valid_retention and max_retention_days > 0 and required_storage_gb > 0:
        configured_retention_days = max_retention_days
        configured_retention_setting = f"Max {max_retention_days} Days"
        required_storage_gb = round(required_storage_gb, 1)
    else:
        configured_retention_days = None
        configured_retention_setting = None
        required_storage_gb = None

    return {
        "global_daily_gb": global_daily_gb,
        "events_24h": events_24h,
        "max_global_gb": max_global_gb,
        "global_retention_days": global_retention_days,
        "configured_retention_setting": configured_retention_setting,
        "configured_retention_days": configured_retention_days,
        "required_storage_gb": required_storage_gb
    }

def _get_resource_usage() -> tuple:
    """Fetches resource usage statistics for the backend and engine processes."""
    backend_process = psutil.Process(os.getpid())
    backend_cpu = backend_process.cpu_percent(interval=0.1)
    backend_mem_mb = backend_process.memory_info().rss / (1024 * 1024)
    
    engine_stats = fetch_engine_stats()
    engine_cpu = 0
    engine_mem_mb = 0
    if engine_stats:
        engine_cpu = engine_stats.get("cpu_percent", 0)
        engine_mem_mb = engine_stats.get("memory_mb", 0)

    total_cpu = round(backend_cpu + engine_cpu, 1)
    total_mem_mb = round(backend_mem_mb + engine_mem_mb, 1)

    return backend_cpu, backend_mem_mb, engine_cpu, engine_mem_mb, total_cpu, total_mem_mb, engine_stats

def _get_network_rate() -> tuple:
    """Gets the current network receive and send rates in Mbps."""
    recv_mbps = 0.0
    sent_mbps = 0.0
    with _realtime_net_lock:
        recv_mbps = CURRENT_NET_SPEED["recv_mbps"]
        sent_mbps = CURRENT_NET_SPEED["sent_mbps"]
    return recv_mbps, sent_mbps

def _get_database_size(db: Session) -> float:
    """Gets the current database size in MB."""
    from sqlalchemy import text
    db_size_mb = 0
    try:
        result = db.execute(text("SELECT pg_database_size(current_database())")).fetchone()
        if result:
            db_size_mb = round(result[0] / (1024*1024), 1)
    except Exception as e:
        print(f"Error getting DB size: {e}")
    return db_size_mb

def _get_system_health_and_mqtt(db: Session, cameras: list, active_cameras_count: int, engine_stats: dict) -> tuple:
    """Evaluates system health and retrieves MQTT connection status."""
    total_errors = len([c for c in cameras if c.status in ("UNREACHABLE", "UNAUTHORIZED") and c.is_active])
    system_status = "Healthy" if total_errors == 0 else "Issues Detected"
    if active_cameras_count == 0 and len(cameras) > 0:
        system_status = "Standby"

    mqtt_enabled = get_setting(db, "mqtt_enabled") == "true"
    mqtt_host = get_setting(db, "mqtt_host") or "Not configured"
    
    mqtt_connected = False
    ai_status = {"hardware": "unknown", "initialized": False}

    if engine_stats:
        mqtt_connected = engine_stats.get("mqtt_connected", False)
        ai_status = engine_stats.get("ai_status", ai_status)

    return total_errors, system_status, mqtt_enabled, mqtt_host, mqtt_connected, ai_status

@router.get("")
def get_stats(db: Session = Depends(database.get_db), auth_info: tuple[models.User, bool] = Depends(auth_service.get_current_user_or_token)):
    user, is_token = auth_info

    allowed_ids = None
    if user.role == "viewer" and user.restrict_camera_access:
        allowed_ids = crud.get_allowed_camera_ids_for_user(db, user.id, permission="view")
        if allowed_ids is None:
            allowed_ids = []

    # 1. Active Cameras
    cameras = crud.get_cameras(db, skip=0, limit=1000)
    if allowed_ids is not None:
        cameras = [c for c in cameras if c.id in allowed_ids]

    active_cameras_count = len([c for c in cameras if c.is_active])

    # 2. Detailed Storage Stats
    global_movies, global_pics, global_stats, camera_stats = _get_detailed_storage_stats(db, cameras, allowed_ids)

    # 3. Storage Usage
    storage_total_gb, storage_free_gb, storage_used_gb, storage_percent = _get_disk_usage_stats(global_movies, global_pics)

    # 4. Retention Estimation Logic
    retention_info = _get_retention_estimates(db, cameras, storage_total_gb, camera_stats, allowed_ids)

    # 5. System Uptime
    uptime_seconds = int(time.time() - START_TIME)
    uptime_str = f"{uptime_seconds // 86400}d {(uptime_seconds % 86400) // 3600}h {(uptime_seconds % 3600) // 60}m"

    # 6. Resource Usage
    backend_cpu, backend_mem_mb, engine_cpu, engine_mem_mb, total_cpu, total_mem_mb, engine_stats = _get_resource_usage()

    # Network Rate
    recv_mbps, sent_mbps = _get_network_rate()

    # Database Size
    db_size_mb = _get_database_size(db)

    # 7. System Health Calculation
    total_errors, system_status, mqtt_enabled, mqtt_host, mqtt_connected, ai_status = _get_system_health_and_mqtt(
        db, cameras, active_cameras_count, engine_stats
    )

    return {
        "active_cameras": active_cameras_count,
        "total_errors": total_errors,
        "total_events": (global_movies[0] or 0) + (global_pics[0] or 0),
        "events_24h": retention_info["events_24h"],
        "video_count": global_movies[0] or 0,
        "picture_count": global_pics[0] or 0,
        "storage": {
            "total_gb": storage_total_gb,
            "used_gb": storage_used_gb,
            "free_gb": storage_free_gb,
            "percent": storage_percent,
            "estimated_retention_days": retention_info["global_retention_days"],
            "daily_rate_gb": round(retention_info["global_daily_gb"], 2),
            "configured_retention": retention_info["configured_retention_setting"],
            "configured_retention_days": retention_info["configured_retention_days"],
            "required_storage_gb": retention_info["required_storage_gb"],
            "total_quota_gb": retention_info["max_global_gb"],
            "quota_percent": round((storage_used_gb / retention_info["max_global_gb"]) * 100) if retention_info["max_global_gb"] > 0 else 0
        },
        "resources": {
            "cpu_percent": total_cpu,
            "memory_mb": total_mem_mb,
            "backend_cpu": round(backend_cpu, 1),
            "backend_mem_mb": round(backend_mem_mb, 1),
            "engine_cpu": engine_cpu,
            "engine_mem_mb": engine_mem_mb
        },
        "network": {
            "recv_mbps": recv_mbps,
            "sent_mbps": sent_mbps
        },
        "engine": {
            "status": "ONLINE" if engine_stats else "OFFLINE",
            "hw_accel": engine_stats.get("hw_accel", False) if engine_stats else False,
            "hw_accel_type": engine_stats.get("hw_accel_type", "N/A") if engine_stats else "N/A",
            "mqtt": {
                "enabled": mqtt_enabled,
                "host": mqtt_host,
                "connected": mqtt_connected
            },
            "ai": ai_status
        },
        "database": {
            "size_mb": db_size_mb,
            "event_count": (global_movies[0] or 0) + (global_pics[0] or 0)
        },
        "details": {
            "global": global_stats,
            "cameras": camera_stats
        },
        "system_status": system_status,
        "uptime": uptime_str,
        "hw_accel": {
            "enabled": engine_stats.get("hw_accel", False) if engine_stats else False,
            "type": engine_stats.get("hw_accel_type", "N/A") if engine_stats else "N/A",
            "status": engine_stats.get("hw_accel_status", "INACTIVE") if engine_stats else "INACTIVE"
        }
    }

def _aggregate_hourly_events(events: list, now: datetime) -> list[dict]:
    """
    Aggregates a list of events into hourly buckets for the last 24 hours.
    """
    history = {}
    for i in range(25):
        t = now - timedelta(hours=i)
        key = t.strftime("%H:00")
        history[key] = {"events": 0, "videos": 0}

    for evt in events:
        if not evt.timestamp_start:
            continue
        key = evt.timestamp_start.strftime("%H:00")
        if key in history:
            history[key]["events"] += 1
            if evt.type == 'video':
                history[key]["videos"] += 1

    data = []
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

@router.get("/history")
def get_stats_history(db: Session = Depends(database.get_db), auth_info: tuple[models.User, bool] = Depends(auth_service.get_current_user_or_token)):
    user, is_token = auth_info
    """
    Returns hourly event counts for the last 24 hours.
    """
    now = datetime.now()
    twenty_four_hours_ago = now - timedelta(hours=24)
    
    allowed_ids = None
    if user.role == "viewer" and user.restrict_camera_access:
        allowed_ids = crud.get_allowed_camera_ids_for_user(db, user.id, permission="view")
        if allowed_ids is None:
            allowed_ids = []
            
    # Query for events in the last 24h
    try:
        events_query = db.query(models.Event.timestamp_start, models.Event.type)\
            .filter(models.Event.timestamp_start >= twenty_four_hours_ago)
            
        if allowed_ids is not None:
            events_query = events_query.filter(models.Event.camera_id.in_(allowed_ids))
            
        events = events_query.all()
            
        return _aggregate_hourly_events(events, now)

    except Exception as e:
        print(f"Error generating history stats: {e}")
        return []

@router.get("/resources-history")
def get_resources_history(auth_info: tuple[models.User, bool] = Depends(auth_service.get_current_user_or_token)):
    user, is_token = auth_info
    """
    Returns CPU and memory usage history for the last hour (up to 60 data points).
    Data is collected every minute by a background thread.
    """
    with RESOURCE_HISTORY_LOCK:
        return list(RESOURCE_HISTORY)
