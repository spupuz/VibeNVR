import os
import shutil
import time
import logging
import threading
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
import models
import database
from routers.settings import get_setting

logger = logging.getLogger(__name__)

PRESERVE_MAP = {
    "For One Day": timedelta(days=1),
    "For One Week": timedelta(weeks=1),
    "For One Month": timedelta(days=30),
    "For One Year": timedelta(days=365),
    "Forever": None
}

def translate_path(p):
    """Translate DB path (container-internal engine path) to backend container path"""
    if not p:
        return None
    
    # If the path already exists as-is, return it (e.g. if shared mount exists in both containers)
    if os.path.exists(p):
        return p

    # Standard VibeEngine -> Backend translation
    if p.startswith("/var/lib/vibe/recordings"):
        mapped = p.replace("/var/lib/vibe/recordings", "/data", 1)
        if os.path.exists(mapped):
            return mapped

    # Legacy Motion -> Backend translation
    if p.startswith("/var/lib/motion"):
        mapped = p.replace("/var/lib/motion", "/data", 1)
        if os.path.exists(mapped):
            return mapped
            
    return p

def get_dir_size(path):
    """Get size of directory in bytes"""
    total_size = 0
    try:
        if not os.path.exists(path):
            return 0
        for dirpath, dirnames, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
    except Exception as e:
        logger.error(f"Error calculating directory size for {path}: {e}")
    return total_size

def delete_event_media(event, db: Session, reason="Unknown"):
    """Delete media files associated with an event and the event itself from DB"""
    try:
        # Translate paths from /var/lib/motion (DB) to /data (Backend container)
        def translate_path(p):
            if not p:
                return p
            # Support new Engine path
            if p.startswith("/var/lib/vibe/recordings"):
                return p.replace("/var/lib/vibe/recordings", "/data", 1)
            # Support legacy Motion path
            if p.startswith("/var/lib/motion"):
                return p.replace("/var/lib/motion", "/data", 1)
            return p

        file_path = translate_path(event.file_path)
        thumb_path = translate_path(event.thumbnail_path)

        # Security Check: Ensure we only delete files inside /data
        if file_path and not os.path.abspath(file_path).startswith("/data/"):
             logger.warning(f"Security blocked deletion of unsafe path: {file_path}")
             file_path = None
        
        if thumb_path and not os.path.abspath(thumb_path).startswith("/data/"):
             logger.warning(f"Security blocked deletion of unsafe path: {thumb_path}")
             thumb_path = None

        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"[{reason}] Deleted files for event {event.id}: {file_path}")
        
        if thumb_path and os.path.exists(thumb_path):
            os.remove(thumb_path)
        
        db.delete(event)
        return True
    except Exception as e:
        logger.error(f"Error deleting event {event.id}: {e}")
        return False

def cleanup_camera(db: Session, camera: models.Camera, media_type: str = None):
    """
    Enforce storage limits and retention for a specific camera.
    media_type: 'video' | 'snapshot' | None (both)
    """
    # 1. Cleanup Movies (max_storage_gb)
    if (not media_type or media_type == 'video') and camera.max_storage_gb and camera.max_storage_gb > 0:
        total_movies_size = db.query(func.sum(models.Event.file_size)).filter(
            models.Event.camera_id == camera.id, 
            models.Event.type == "video"
        ).scalar() or 0
        
        movies_used_gb = total_movies_size / (1024**3)
        if movies_used_gb > camera.max_storage_gb:
            logger.info(f"Camera {camera.name} MOVIE limit exceeded: {movies_used_gb:.2f}GB > {camera.max_storage_gb:.2f}GB")
            target_gb = camera.max_storage_gb * 0.95
            while movies_used_gb > target_gb:
                oldest = db.query(models.Event).filter(
                    models.Event.camera_id == camera.id, 
                    models.Event.type == "video"
                ).order_by(models.Event.timestamp_start.asc()).first()
                if not oldest: break
                
                size_gb = (oldest.file_size / (1024**3)) if oldest.file_size else 0.05
                delete_event_media(oldest, db, reason="Camera Quota (Video)")
                db.commit()
                movies_used_gb -= size_gb

    # 2. Cleanup Pictures (max_pictures_storage_gb)
    if (not media_type or media_type == 'snapshot') and camera.max_pictures_storage_gb and camera.max_pictures_storage_gb > 0:
        total_pics_size = db.query(func.sum(models.Event.file_size)).filter(
            models.Event.camera_id == camera.id, 
            models.Event.type == "snapshot"
        ).scalar() or 0
        
        pics_used_gb = total_pics_size / (1024**3)
        if pics_used_gb > camera.max_pictures_storage_gb:
            logger.info(f"Camera {camera.name} PICTURE limit exceeded: {pics_used_gb:.2f}GB > {camera.max_pictures_storage_gb:.2f}GB")
            target_gb = camera.max_pictures_storage_gb * 0.95
            while pics_used_gb > target_gb:
                oldest = db.query(models.Event).filter(
                    models.Event.camera_id == camera.id, 
                    models.Event.type == "snapshot"
                ).order_by(models.Event.timestamp_start.asc()).first()
                if not oldest: break
                
                size_gb = (oldest.file_size / (1024**3)) if oldest.file_size else 0.001
                delete_event_media(oldest, db, reason="Camera Quota (Snapshot)")
                db.commit()
                pics_used_gb -= size_gb

    # 3. Time-based cleanup
    # Use timezone-aware cutoff to match DB timestamps
    now_aware = datetime.now().astimezone()
    
    if not media_type or media_type == 'video':
        movie_delta = PRESERVE_MAP.get(camera.preserve_movies)
        if movie_delta:
            cutoff = now_aware - movie_delta
            expired = db.query(models.Event).filter(models.Event.camera_id == camera.id, models.Event.type == "video", models.Event.timestamp_start < cutoff).all()
            if expired:
                logger.info(f"Deleting {len(expired)} expired movies for camera {camera.name} (Cutoff: {cutoff})")
                for e in expired:
                    delete_event_media(e, db, reason="Retention Time (Video)")
                db.commit()

    if not media_type or media_type == 'snapshot':
        pic_delta = PRESERVE_MAP.get(camera.preserve_pictures)
        if pic_delta:
            cutoff = now_aware - pic_delta
            expired = db.query(models.Event).filter(models.Event.camera_id == camera.id, models.Event.type == "snapshot", models.Event.timestamp_start < cutoff).all()
            if expired:
                logger.info(f"Deleting {len(expired)} expired pictures for camera {camera.name} (Cutoff: {cutoff})")
                for e in expired:
                    delete_event_media(e, db, reason="Retention Time (Snapshot)")
                db.commit()

def cleanup_profile(db: Session, profile: models.StorageProfile):
    """
    Enforce storage limits for a specific storage profile (shared across multiple cameras).
    """
    if not profile.max_size_gb or profile.max_size_gb <= 0:
        return

    # Calculate total size of all events using this profile
    events_query = db.query(models.Event).join(models.Camera).filter(models.Camera.storage_profile_id == profile.id)
    
    total_size_bytes = db.query(func.sum(models.Event.file_size)).join(models.Camera).filter(models.Camera.storage_profile_id == profile.id).scalar() or 0
    
    current_used_gb = total_size_bytes / (1024**3)
    
    if current_used_gb > profile.max_size_gb:
        logger.info(f"Storage Profile '{profile.name}' limit exceeded: {current_used_gb:.2f}GB > {profile.max_size_gb:.2f}GB")
        target_gb = profile.max_size_gb * 0.95
        
        while current_used_gb > target_gb:
            # Delete oldest event across all cameras in this profile
            oldest = events_query.order_by(models.Event.timestamp_start.asc()).first()
            if not oldest: break
            
            size_gb = (oldest.file_size / (1024**3)) if oldest.file_size else 0
            if size_gb == 0:
                 size_gb = 0.05 # Conservative estimate (50MB) for untracked videos
            
            delete_event_media(oldest, db, reason=f"Profile Quota ({profile.name})")
            db.commit()
            current_used_gb -= size_gb

def cleanup_temp_files():
    """Delete usage-dependent temporary files (e.g. notification snapshots) older than 1 hour"""
    try:
        temp_root = "/data/temp_snaps"
        if not os.path.exists(temp_root):
            return
            
        cutoff = time.time() - 3600 # 1 hour ago
        
        for dirpath, _, filenames in os.walk(temp_root):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                try:
                     if os.path.getmtime(fp) < cutoff:
                         os.remove(fp)
                         # Try removing empty dir? Maybe later.
                except OSError:
                    pass
        logger.info("Cleaned up temporary snapshots.")
    except Exception as e:
        logger.error(f"Error cleaning temp files: {e}")

def run_cleanup(quota_only=False):
    """Main cleanup task to be run periodically. If quota_only=True, skips time-based retention."""
    logger.info(f"Starting storage cleanup task (Quota Only: {quota_only})...")
    with database.get_db_ctx() as db:
        try:
            # 0. Emergency: Check absolute disk space (< 5% free)
            try:
                usage = shutil.disk_usage("/data")
                percent_free = (usage.free / usage.total) * 100
                if percent_free < 5.0:
                    logger.warning(f"CRITICAL: Disk space is low ({percent_free:.2f}% free). Forcing emergency cleanup.")
                    # In emergency, we reduce EVERYTHING until we have 10% free
                    target_free_bytes = usage.total * 0.10
                    while usage.free < target_free_bytes:
                        oldest = db.query(models.Event).order_by(models.Event.timestamp_start.asc()).first()
                        if not oldest: break
                        delete_event_media(oldest, db, reason="Emergency Disk Space")
                        db.commit()
                        usage = shutil.disk_usage("/data")
            except Exception as disk_e:
                logger.error(f"Error checking disk usage: {disk_e}")

            # Priority 1: Enforce Per-Camera Quotas
            cameras = db.query(models.Camera).all()
            for camera in cameras:
                if not quota_only:
                    cleanup_camera(db, camera) # Full: Quota + Time
                else:
                    # Just Quota enforcement if requested
                    cleanup_camera(db, camera, media_type=None) # We still call it, but could optimize further

            # Priority 2: Enforce Profile-level Limits
            profiles = db.query(models.StorageProfile).all()
            for profile in profiles:
                cleanup_profile(db, profile)
            
            # Priority 3: Enforce Global Storage Limit
            max_global_str = get_setting(db, "max_global_storage_gb")
            max_global_gb = float(max_global_str) if max_global_str else 0
            
            if max_global_gb > 0:
                current_used_gb = get_dir_size("/data") / (1024**3)
                if current_used_gb > max_global_gb:
                    logger.info(f"Global storage limit exceeded: {current_used_gb:.2f}GB > {max_global_gb:.2f}GB. Cleaning up...")
                    target_gb = max_global_gb * 0.95
                    while current_used_gb > target_gb:
                        oldest_event = db.query(models.Event).order_by(models.Event.timestamp_start.asc()).first()
                        if not oldest_event: break
                        size_gb = (oldest_event.file_size / (1024**3)) if oldest_event.file_size else 0.05
                        delete_event_media(oldest_event, db, reason="Global Quota")
                        db.commit()
                        current_used_gb -= size_gb
            
            # Priority 4: Cleanup Temp Files (Only on full run)
            if not quota_only:
                cleanup_temp_files()

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

def storage_monitor_loop():
    """Background loop to run cleanup periodically"""
    last_full_run = 0
    
    while True:
        try:
            now = time.time()
            with database.get_db_ctx() as db:
                cleanup_enabled = get_setting(db, "cleanup_enabled") == "true"
                interval_str = get_setting(db, "cleanup_interval_hours")
                interval_hours = float(interval_str) if interval_str else 24.0

            if cleanup_enabled:
                # Is it time for a full run (retention + quota)?
                if now - last_full_run > (interval_hours * 3600):
                    run_cleanup(quota_only=False)
                    last_full_run = now
                else:
                    # Otherwise, just do a quick quota check every 10 minutes
                    run_cleanup(quota_only=True)
            
            # Wait 10 minutes between checks
            time.sleep(600)
        except Exception as e:
            logger.error(f"Error in storage monitor loop: {e}")
            time.sleep(300) # Wait 5 mins on error

def delete_camera_media(camera_id: int):
    """Delete all media files on disk for a specific camera"""
    try:
        with database.get_db_ctx() as db:
            camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
            if not camera:
                # If camera already deleted from DB, we try the default path as fallback
                camera_dir = f"/data/Camera{camera_id}"
                if not os.path.exists(camera_dir):
                     camera_dir = f"/data/{camera_id}"
            else:
                storage_prefix = camera.storage_profile.path if camera.storage_profile else "/var/lib/vibe/recordings"
                camera_dir = translate_path(os.path.join(storage_prefix, str(camera_id)))

        if os.path.exists(camera_dir):
            shutil.rmtree(camera_dir, ignore_errors=True)
            logger.info(f"Deleted media directory for camera {camera_id}: {camera_dir}")
        else:
            logger.warning(f"Media directory for camera {camera_id} not found: {camera_dir}")
        return True
    except Exception as e:
        logger.error(f"Error deleting media for camera {camera_id}: {e}")
        return False

def start_scheduler():
    t = threading.Thread(target=storage_monitor_loop, daemon=True, name="StorageCleanupThread")
    t.start()
