import os
import sys

# Ensure we can import from the current directory (which is /app in the container)
sys.path.append('/app')

from database import SessionLocal
from models import Event
from storage_service import translate_path

def cleanup():
    print("Starting orphan cleanup...")
    db = SessionLocal()
    try:
        # Get all valid paths
        print("Fetching valid files from DB...")
        events = db.query(Event).all()
        valid_paths = set()
        for e in events:
            # Video
            vp = translate_path(e.file_path)
            if vp: valid_paths.add(vp)
            # Thumb
            tp = translate_path(e.thumbnail_path)
            if tp: valid_paths.add(tp)
        
        print(f"Found {len(valid_paths)} valid files in DB.")
        
        # Scan /data
        deleted_count = 0
        deleted_size = 0
        
        data_root = "/data"
        for dirpath, dirnames, filenames in os.walk(data_root):
            for f in filenames:
                full_path = os.path.join(dirpath, f)
                
                # Filter extensions to avoid deleting random system files
                if not f.lower().endswith(('.mp4', '.jpg', '.jpeg', '.png')):
                    continue
                    
                if full_path not in valid_paths:
                    try:
                        size = os.path.getsize(full_path)
                        os.remove(full_path)
                        print(f"Deleted orphan: {full_path} ({size/1024/1024:.2f} MB)")
                        deleted_count += 1
                        deleted_size += size
                    except Exception as e:
                        print(f"Failed to delete {full_path}: {e}")
                        
        print("-" * 30)
        print(f"Cleanup Complete.")
        print(f"Deleted {deleted_count} orphaned files.")
        print(f"Freed {deleted_size / (1024**3):.2f} GB.")
        
    except Exception as e:
        print(f"Critical Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup()
