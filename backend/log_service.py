import os
import shutil
import time
import threading
import logging
from routers.settings import get_setting, set_setting, DEFAULT_SETTINGS
from database import SessionLocal
from routers.logs import LOG_DIR, FILES_MAP

logger = logging.getLogger("LogService")

def get_conf(key: str, db=None) -> str:
    """Helper to get config with db session handling"""
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        val = get_setting(db, key)
        if val is None and key in DEFAULT_SETTINGS:
            return DEFAULT_SETTINGS[key]["value"]
        return val
    except Exception as e:
        logger.error(f"Error reading config {key}: {e}")
        return DEFAULT_SETTINGS.get(key, {}).get("value", "0")
    finally:
        if close:
            db.close()

def rotate_file(filepath: str, backups: int):
    """
    Perform a copy-truncate rotation.
    1. Delete oldest backup (.N)
    2. Shift .N-1 -> .N
    3. Copy current -> .1
    4. Truncate current
    """
    try:
        if not os.path.exists(filepath):
            return

        # 1. Rotate backups
        for i in range(backups - 1, 0, -1):
            src = f"{filepath}.{i}"
            dst = f"{filepath}.{i+1}"
            if os.path.exists(src):
                # If dst exists, it gets overwritten by rename usually, or delete first
                if os.path.exists(dst):
                    os.remove(dst)
                os.rename(src, dst)
        
        # 2. Copy current to .1
        dst_1 = f"{filepath}.1"
        if os.path.exists(dst_1):
            os.remove(dst_1)
            
        # Copy file content
        shutil.copy2(filepath, dst_1)
        
        # 3. Truncate current
        # Open with 'w' truncates
        with open(filepath, 'w') as f:
            f.write(f"[LOG ROTATION] Log rotated at {time.ctime()}\n")
            
        logger.info(f"Rotated {filepath}")
        
    except Exception as e:
        logger.error(f"Failed to rotate {filepath}: {e}")

def run_log_cleanup():
    """Main cleanup routine"""
    logger.info("Running log cleanup check...")
    
    try:
        max_size_mb = float(get_conf("log_max_size_mb"))
        backups = int(get_conf("log_backup_count"))
    except ValueError:
        max_size_mb = 50.0
        backups = 5
        
    if max_size_mb <= 0:
        return # Disabled
        
    max_bytes = max_size_mb * 1024 * 1024
    
    for _, filename in FILES_MAP.items():
        filepath = os.path.join(LOG_DIR, filename)
        if not os.path.exists(filepath):
            continue
            
        try:
            size = os.path.getsize(filepath)
            if size > max_bytes:
                logger.info(f"File {filename} size {size/1024/1024:.2f}MB exceeds limit {max_size_mb}MB. Rotating...")
                rotate_file(filepath, backups)
        except OSError as e:
            logger.error(f"Error checking file {filepath}: {e}")

def start_scheduler():
    """Start the background thread"""
    def _loop():
        # Initial delay
        time.sleep(60)
        while True:
            try:
                run_log_cleanup()
            except Exception as e:
                logger.error(f"Log cleanup loop error: {e}")
            
            # Get interval
            try:
                interval_mins = int(get_conf("log_rotation_check_minutes"))
            except:
                interval_mins = 60
            
            if interval_mins < 1: interval_mins = 1
            
            time.sleep(interval_mins * 60)

    t = threading.Thread(target=_loop, daemon=True, name="LogCleanupThread")
    t.start()
