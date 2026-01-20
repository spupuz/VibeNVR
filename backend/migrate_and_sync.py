import os
import sys
import shutil
import subprocess
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Ensure we can import from the current directory
sys.path.append('/app')

# Get timezone from environment
TZ_NAME = os.environ.get('TZ', 'Europe/Rome')
LOCAL_TZ = ZoneInfo(TZ_NAME)

from database import SessionLocal
from models import Event, Camera

# MAPPING extracted from Logs vs DB
# Old ID -> New ID
ID_MAPPING = {
    '1': '23',  # IPC-Cancelletto
    '2': '18',  # IPC-Posteriore
    '3': '22',  # IPC-Hobby
    '4': '25',  # IPC-Cancello
    '5': '24',  # IPC-BOXPOST
    '7': '20',  # IPC-BOX
    '8': '26',  # IPC-P1
    '10': '21', # IPC-Soggiorno
}

def get_video_duration(file_path):
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", file_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        if result.returncode == 0:
            return float(result.stdout.strip())
    except:
        pass
    return 0

def generate_thumbnail(video_path, thumb_path):
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path, 
            "-ss", "00:00:01", "-vframes", "1", "-vf", "scale=320:-1",
            thumb_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except:
        return False

def migrate_folders(data_root="/data"):
    print("Starting folder migration...")
    
    for old_id, new_id in ID_MAPPING.items():
        old_path = os.path.join(data_root, old_id)
        new_path = os.path.join(data_root, new_id)
        
        if not os.path.exists(old_path):
            print(f"Old path {old_path} does not exist. Skipping migration for {old_id}->{new_id}")
            continue
            
        if not os.path.exists(new_path):
            os.makedirs(new_path)
            
        print(f"Migrating {old_path} -> {new_path} ...")
        
        # Walk and move files
        moved_count = 0
        for root, dirs, files in os.walk(old_path):
            # Compute relative path from old root
            rel_path = os.path.relpath(root, old_path)
            target_dir = os.path.join(new_path, rel_path)
            
            if not os.path.exists(target_dir):
                os.makedirs(target_dir)
                
            for f in files:
                src_file = os.path.join(root, f)
                dst_file = os.path.join(target_dir, f)
                
                if not os.path.exists(dst_file):
                    shutil.move(src_file, dst_file)
                    moved_count += 1
                else:
                    print(f"Conflict: {dst_file} exists. Skipping {f}")
        
        print(f"Moved {moved_count} files.")
        
        # Try to remove empty old dir
        try:
            shutil.rmtree(old_path)
            print(f"Removed old directory {old_path}")
        except Exception as e:
            print(f"Could not remove {old_path}: {e}")

def sync_db(data_root="/data"):
    print("\nStarting DB Sync...")
    db = SessionLocal()
    
    try:
        cameras = db.query(Camera).all()
        print(f"Processing {len(cameras)} active cameras in DB.")
        
        added_count = 0
        
        for cam in cameras:
            cam_dir = os.path.join(data_root, str(cam.id))
            if not os.path.exists(cam_dir):
                print(f"No data directory for Camera {cam.name} (ID: {cam.id})")
                continue
                
            print(f"Scanning {cam_dir} ({cam.name})...")
            
            # Walk
            for root, dirs, files in os.walk(cam_dir):
                for f in files:
                    if f.lower().endswith(('.mp4', '.mkv')):
                        full_path = os.path.join(root, f)
                        
                        # DB Path Format: /var/lib/vibe/recordings/{id}/...
                        rel_path = os.path.relpath(full_path, data_root).replace("\\", "/")
                        db_path = f"/var/lib/vibe/recordings/{rel_path}"
                        
                        # Check exist
                        exists = db.query(Event).filter(Event.file_path == db_path).count()
                        if exists > 0:
                            continue
                            
                        # Missing! Import it.
                        print(f"Importing orphan: {rel_path}")
                        
                        # Date parsing
                        # Expected: .../{date}/{time}.mp4
                        # Parent dir
                        parent = os.path.basename(root) # 2026-01-20
                        base_name = os.path.splitext(f)[0] # 18-03-56
                        
                        try:
                            dt_str = f"{parent} {base_name}".split("-00")[0]
                            timestamp_start = datetime.strptime(dt_str, "%Y-%m-%d %H-%M-%S")
                            # Make timezone-aware using local timezone
                            timestamp_start = timestamp_start.replace(tzinfo=LOCAL_TZ)
                        except:
                            print(f"Failed to parse date from {f}, using mtime")
                            timestamp_start = datetime.fromtimestamp(os.path.getmtime(full_path))
                            
                        duration = get_video_duration(full_path)
                        timestamp_end = timestamp_start + timedelta(seconds=duration)
                        file_size = os.path.getsize(full_path)
                        
                        # Thumbnail
                        thumb_name = base_name + ".jpg"
                        thumb_full = os.path.join(root, thumb_name)
                        thumb_db = None
                        
                        if os.path.exists(thumb_full):
                           thumb_rel = os.path.relpath(thumb_full, data_root).replace("\\", "/") 
                           thumb_db = f"/var/lib/vibe/recordings/{thumb_rel}"
                        else:
                            # Generate
                            if generate_thumbnail(full_path, thumb_full):
                               thumb_rel = os.path.relpath(thumb_full, data_root).replace("\\", "/") 
                               thumb_db = f"/var/lib/vibe/recordings/{thumb_rel}"
                        
                        # Assuming 'motion' event for now
                        new_event = Event(
                            camera_id=cam.id,
                            timestamp_start=timestamp_start,
                            timestamp_end=timestamp_end,
                            type="video",
                            event_type="motion",
                            file_path=db_path,
                            thumbnail_path=thumb_db,
                            file_size=file_size,
                            motion_score=0.0
                        )
                        db.add(new_event)
                        added_count += 1
                        
                        if added_count % 50 == 0:
                            db.commit()
                            print(f"Committed {added_count} events...")
                            
        db.commit()
        print(f"Total Imported: {added_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    migrate_folders()
    sync_db()
