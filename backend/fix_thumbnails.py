"""
Check and fix missing thumbnails
"""
import os
import subprocess
from database import SessionLocal
from models import Event

def generate_thumbnail(video_path, thumb_path):
    """Generate thumbnail using ffmpeg"""
    try:
        os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path, 
            "-ss", "00:00:00.5", "-vframes", "1", "-vf", "scale=320:-1",
            thumb_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        return True
    except Exception as e:
        print(f"  ffmpeg error: {e}")
        return False

db = SessionLocal()
events = db.query(Event).filter(Event.thumbnail_path == None, Event.type == "video").all()
print(f"Events without thumbnails: {len(events)}")

fixed = 0
for e in events:
    if not e.file_path:
        continue
    
    fp = e.file_path
    if fp.startswith('/var/lib/vibe/recordings'):
        fp = fp.replace('/var/lib/vibe/recordings', '/data', 1)
    elif fp.startswith('/var/lib/motion'):
        fp = fp.replace('/var/lib/motion', '/data', 1)
    
    exists = os.path.exists(fp)
    size = os.path.getsize(fp) if exists else 0
    print(f"  ID {e.id}: {os.path.basename(fp)} | exists={exists} | size={size}")
    
    if exists and size > 0:
        thumb_path = fp.rsplit('.', 1)[0] + '.jpg'
        if generate_thumbnail(fp, thumb_path):
            db_thumb_path = e.file_path.rsplit('.', 1)[0] + '.jpg'
            e.thumbnail_path = db_thumb_path
            fixed += 1
            print(f"    -> Generated thumbnail!")
        else:
            print(f"    -> Failed to generate thumbnail")

if fixed > 0:
    db.commit()
    print(f"\nFixed {fixed} thumbnails")

db.close()
