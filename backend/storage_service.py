import os
import shutil
import time
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
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

def get_dir_size(path):
    """Get size of directory in bytes"""
    total_size = 0
    try:
        if not os.path.exists(path):
            return 0
        for dirpath, dirnames, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                # skip if it is symbolic link
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
    except Exception as e:
        logger.error(f"Error calculating directory size for {path}: {e}")
    return total_size

def delete_event_media(event, db: Session):
    """Delete media files associated with an event and the event itself from DB"""
    try:
        # Translate paths from /var/lib/motion (DB) to /data (Backend container)
        def translate_path(p):
            if p and p.startswith("/var/lib/motion"):
                return p.replace("/var/lib/motion", "/data", 1)
            return p

        file_path = translate_path(event.file_path)
        thumb_path = translate_path(event.thumbnail_path)

        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Deleted file: {file_path}")
        if thumb_path and os.path.exists(thumb_path):
            os.remove(thumb_path)
            logger.info(f"Deleted thumbnail: {thumb_path}")
        
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
    camera_dir = f"/data/Camera{camera.id}"
    if not os.path.exists(camera_dir):
        # We don't return here because DB events might exist even if dir is gone
        pass

    # 1. Cleanup Movies (max_storage_gb)
    if (not media_type or media_type == 'video') and camera.max_storage_gb and camera.max_storage_gb > 0:
        total_movies_size = 0
        movie_events = db.query(models.Event).filter(models.Event.camera_id == camera.id, models.Event.type == "video").all()
        for e in movie_events:
            # Use file_size if available, else check disk
            if e.file_size and e.file_size > 0:
                total_movies_size += e.file_size
            else:
                fp = e.file_path.replace("/var/lib/motion", "/data", 1) if e.file_path else None
                if fp and os.path.exists(fp):
                    total_movies_size += os.path.getsize(fp)
        
        movies_used_gb = total_movies_size / (1024**3)
        if movies_used_gb > camera.max_storage_gb:
            logger.info(f"Camera {camera.name} MOVIE limit exceeded: {movies_used_gb:.2f}GB > {camera.max_storage_gb:.2f}GB")
            target_gb = camera.max_storage_gb * 0.95
            while movies_used_gb > target_gb:
                oldest = db.query(models.Event).filter(models.Event.camera_id == camera.id, models.Event.type == "video").order_by(models.Event.timestamp_start.asc()).first()
                if not oldest: break
                
                size_gb = (oldest.file_size / (1024**3)) if oldest.file_size else 0
                if size_gb == 0: # Fallback
                     fp = oldest.file_path.replace("/var/lib/motion", "/data", 1) if oldest.file_path else None
                     if fp and os.path.exists(fp): size_gb = os.path.getsize(fp) / (1024**3)

                delete_event_media(oldest, db)
                db.commit()
                movies_used_gb -= size_gb

    # 2. Cleanup Pictures (max_pictures_storage_gb)
    if (not media_type or media_type == 'snapshot') and camera.max_pictures_storage_gb and camera.max_pictures_storage_gb > 0:
        total_pics_size = 0
        pic_events = db.query(models.Event).filter(models.Event.camera_id == camera.id, models.Event.type == "snapshot").all()
        for e in pic_events:
             if e.file_size and e.file_size > 0:
                total_pics_size += e.file_size
             else:
                fp = e.file_path.replace("/var/lib/motion", "/data", 1) if e.file_path else None
                if fp and os.path.exists(fp):
                    total_pics_size += os.path.getsize(fp)
        
        pics_used_gb = total_pics_size / (1024**3)
        if pics_used_gb > camera.max_pictures_storage_gb:
            logger.info(f"Camera {camera.name} PICTURE limit exceeded: {pics_used_gb:.2f}GB > {camera.max_pictures_storage_gb:.2f}GB")
            target_gb = camera.max_pictures_storage_gb * 0.95
            while pics_used_gb > target_gb:
                oldest = db.query(models.Event).filter(models.Event.camera_id == camera.id, models.Event.type == "snapshot").order_by(models.Event.timestamp_start.asc()).first()
                if not oldest: break
                
                size_gb = (oldest.file_size / (1024**3)) if oldest.file_size else 0
                if size_gb == 0:
                     fp = oldest.file_path.replace("/var/lib/motion", "/data", 1) if oldest.file_path else None
                     if fp and os.path.exists(fp): size_gb = os.path.getsize(fp) / (1024**3)

                delete_event_media(oldest, db)
                db.commit()
                pics_used_gb -= size_gb

    # 3. Time-based cleanup
    if not media_type or media_type == 'video':
        movie_delta = PRESERVE_MAP.get(camera.preserve_movies)
        if movie_delta:
            cutoff = datetime.utcnow() - movie_delta
            expired = db.query(models.Event).filter(models.Event.camera_id == camera.id, models.Event.type == "video", models.Event.timestamp_start < cutoff).all()
            if expired:
                logger.info(f"Deleting {len(expired)} expired movies for camera {camera.name}")
                for e in expired:
                    delete_event_media(e, db)
                db.commit()

    if not media_type or media_type == 'snapshot':
        pic_delta = PRESERVE_MAP.get(camera.preserve_pictures)
        if pic_delta:
            cutoff = datetime.utcnow() - pic_delta
            expired = db.query(models.Event).filter(models.Event.camera_id == camera.id, models.Event.type == "snapshot", models.Event.timestamp_start < cutoff).all()
            if expired:
                logger.info(f"Deleting {len(expired)} expired pictures for camera {camera.name}")
                for e in expired:
                    delete_event_media(e, db)
                db.commit()

def run_cleanup():
    """Main cleanup task to be run periodically"""
    logger.info("Starting storage cleanup task...")
    db = next(database.get_db())
    try:
        # 1. Global Storage Limit
        max_global_str = get_setting(db, "max_global_storage_gb")
        max_global_gb = float(max_global_str) if max_global_str else 0
        
        if max_global_gb > 0:
            current_used_gb = get_dir_size("/data") / (1024**3)
            
            if current_used_gb > max_global_gb:
                logger.info(f"Global storage limit exceeded: {current_used_gb:.2f}GB > {max_global_gb:.2f}GB. Cleaning up...")
                # Delete oldest events regardless of camera until we are under limit
                # We target 95% of the limit to provide some buffer
                target_gb = max_global_gb * 0.95
                
                while current_used_gb > target_gb:
                    oldest_event = db.query(models.Event).order_by(models.Event.timestamp_start.asc()).first()
                    if not oldest_event:
                        break
                    
                    delete_event_media(oldest_event, db)
                    db.commit()
                    
                    current_used_gb = get_dir_size("/data") / (1024**3)
                    logger.debug(f"Current usage after deletion: {current_used_gb:.2f}GB")

        # 2. Per-Camera Storage Limit
        cameras = db.query(models.Camera).all()
        for camera in cameras:
            cleanup_camera(db, camera)

    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
    finally:
        db.close()

def storage_monitor_loop():
    """Background loop to run cleanup periodically"""
    while True:
        try:
            db = next(database.get_db())
            cleanup_enabled = get_setting(db, "cleanup_enabled") == "true"
            interval_str = get_setting(db, "cleanup_interval_hours")
            interval_hours = int(interval_str) if interval_str else 24
            db.close()

            if cleanup_enabled:
                run_cleanup()
            
            # Use a shorter wait if something failed, otherwise wait for configured interval
            time.sleep(interval_hours * 3600)
        except Exception as e:
            logger.error(f"Error in storage monitor loop: {e}")
            time.sleep(300) # Wait 5 mins on error
