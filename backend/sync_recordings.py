"""
Orphan Recovery Script - Scans the recordings directory and imports any files
that exist on disk but are missing from the database.

Run via: docker compose exec backend python sync_recordings.py
Or:      docker compose exec backend python sync_recordings.py --dry-run
"""
import os
import sys
import subprocess
import argparse
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.append('/app')

from database import SessionLocal
from models import Event, Camera

# Get timezone from environment
TZ_NAME = os.environ.get('TZ', 'Europe/Rome')
try:
    LOCAL_TZ = ZoneInfo(TZ_NAME)
except:
    LOCAL_TZ = ZoneInfo('UTC')

def get_video_duration(file_path):
    """Get duration in seconds using ffprobe"""
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", file_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        if result.returncode == 0:
            return float(result.stdout.strip())
    except:
        pass
    return 0

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
    except:
        return False

def is_video_valid(file_path):
    """Check if video file is valid (has moov atom, can be read)"""
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", file_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        if result.returncode != 0:
            return False
        duration = result.stdout.strip()
        # Must have a valid duration > 0
        return duration and float(duration) > 0
    except:
        return False

def is_safe_path(file_path):
    """Ensure file path is within allowed data directories"""
    try:
        abs_path = os.path.abspath(file_path)
        # return abs_path.startswith('/data')
        return '/data' in abs_path # slightly looser but covers the mount
    except:
        return False

def sync_recordings(dry_run=False):
    print("=" * 60)
    print("VibeNVR - Orphan Recording Recovery")
    print("=" * 60)
    print(f"Timezone: {TZ_NAME}")
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will import)'}")
    print()
    
    db = SessionLocal()
    data_root = "/data"
    
    try:
        # Get all cameras
        cameras = {str(c.id): c for c in db.query(Camera).all()}
        if not cameras:
            print("WARNING: No cameras found in database!")
            print("This script can only import files for existing cameras.")
            return
            
        print(f"Found {len(cameras)} cameras in database:")
        for cam_id, cam in cameras.items():
            print(f"  - ID {cam_id}: {cam.name}")
        print()
        
        # Scan for orphans
        added_count = 0
        skipped_count = 0
        unknown_camera_files = 0
        unknown_camera_size = 0
        
        for entry in os.listdir(data_root):
            entry_path = os.path.join(data_root, entry)
            
            # Skip non-directories and special folders
            if not os.path.isdir(entry_path):
                continue
            if entry in ['logs', 'temp_snaps', 'motion']:
                continue
            if not entry.isdigit():
                continue
                
            camera_id_str = entry
            
            # Check if camera exists
            if camera_id_str not in cameras:
                # Camera no longer exists - these files are truly orphaned
                # Delete the entire folder since there's no camera to associate them with
                file_count = 0
                deleted_size = 0
                
                for dirpath, dirnames, filenames in os.walk(entry_path):
                    for f in filenames:
                        file_path = os.path.join(dirpath, f)
                        try:
                            file_size = os.path.getsize(file_path)
                            if dry_run:
                                file_count += 1
                                deleted_size += file_size
                            else:
                                os.remove(file_path)
                                file_count += 1
                                deleted_size += file_size
                        except Exception as e:
                            print(f"  ⚠️  Failed to delete {file_path}: {e}")
                
                # Remove empty directories
                if not dry_run:
                    try:
                        import shutil
                        shutil.rmtree(entry_path)
                    except Exception as e:
                        print(f"  ⚠️  Failed to remove folder {entry_path}: {e}")
                
                if file_count > 0:
                    size_mb = round(deleted_size / (1024 * 1024), 2)
                    unknown_camera_files += file_count
                    unknown_camera_size += deleted_size
                    action = "Would delete" if dry_run else "Deleted"
                    print(f"🗑️  {action} {file_count} orphaned files ({size_mb} MB) from deleted camera ID {camera_id_str}")
                continue
            
            camera = cameras[camera_id_str]
            print(f"Scanning Camera {camera_id_str} ({camera.name})...")
            
            # Walk through date folders
            for root, dirs, files in os.walk(entry_path):
                for f in files:
                    # Only process video files
                    if not f.lower().endswith(('.mp4', '.mkv', '.avi')):
                        continue
                        
                    full_path = os.path.join(root, f)
                    
                    # Build the DB path format
                    rel_path = os.path.relpath(full_path, data_root).replace("\\", "/")
                    db_file_path = f"/var/lib/vibe/recordings/{rel_path}"
                    
                    # Check if already in DB
                    exists = db.query(Event).filter(Event.file_path == db_file_path).first()
                    if exists:
                        skipped_count += 1
                        continue
                    
                    # Parse timestamp from path structure
                    # Expected: {camera_id}/{date}/{time}.mp4
                    # e.g., 28/2026-01-20/21-05-30.mp4
                    try:
                        parent_dir = os.path.basename(root)  # "2026-01-20"
                        filename_base = os.path.splitext(f)[0]  # "21-05-30" or "21-05-30-00"
                        
                        # Handle potential suffix like "-00"
                        time_part = filename_base.split("-00")[0] if "-00" in filename_base else filename_base
                        
                        dt_str = f"{parent_dir} {time_part}"
                        timestamp_start = datetime.strptime(dt_str, "%Y-%m-%d %H-%M-%S")
                        timestamp_start = timestamp_start.replace(tzinfo=LOCAL_TZ)
                        
                    except (ValueError, IndexError) as e:
                        print(f"  ⚠️  Could not parse date from {f}, using file mtime")
                        mtime = os.path.getmtime(full_path)
                        timestamp_start = datetime.fromtimestamp(mtime, tz=LOCAL_TZ)
                    
                    # Get file info
                    file_size = os.path.getsize(full_path)
                    duration = get_video_duration(full_path)
                    timestamp_end = timestamp_start + timedelta(seconds=duration)
                    
                    # Thumbnail
                    thumb_name = os.path.splitext(f)[0] + ".jpg"
                    thumb_full = os.path.join(root, thumb_name)
                    thumb_db_path = None
                    
                    if os.path.exists(thumb_full):
                        thumb_rel = os.path.relpath(thumb_full, data_root).replace("\\", "/")
                        thumb_db_path = f"/var/lib/vibe/recordings/{thumb_rel}"
                    elif not dry_run:
                        # Generate thumbnail
                        if generate_thumbnail(full_path, thumb_full):
                            thumb_rel = os.path.relpath(thumb_full, data_root).replace("\\", "/")
                            thumb_db_path = f"/var/lib/vibe/recordings/{thumb_rel}"
                    
                    if dry_run:
                        print(f"  [Would Import] {rel_path}")
                    else:
                        # Create Event
                        new_event = Event(
                            camera_id=int(camera_id_str),
                            timestamp_start=timestamp_start,
                            timestamp_end=timestamp_end,
                            type="video",
                            event_type="motion",
                            file_path=db_file_path,
                            thumbnail_path=thumb_db_path,
                            file_size=file_size,
                            motion_score=0.0
                        )
                        db.add(new_event)
                        print(f"  ✅ Imported: {rel_path}")
                    
                    added_count += 1
                    
                    # Commit every 50 to avoid memory issues
                    if not dry_run and added_count % 50 == 0:
                        db.commit()
                        print(f"  ... committed {added_count} events")
        
        if not dry_run:
            db.commit()
        
        # Step 2: Fix missing thumbnails for existing events
        print()
        print("Checking for missing thumbnails...")
        thumb_fixed = 0
        events_without_thumbs = db.query(Event).filter(
            Event.thumbnail_path == None, 
            Event.type == "video"
        ).all()
        
        for event in events_without_thumbs:
            if not event.file_path:
                continue
            
            # Convert DB path to filesystem path
            file_path = event.file_path
            if file_path.startswith('/var/lib/vibe/recordings'):
                file_path = file_path.replace('/var/lib/vibe/recordings', '/data', 1)
            elif file_path.startswith('/var/lib/motion'):
                file_path = file_path.replace('/var/lib/motion', '/data', 1)
            
            if not os.path.exists(file_path):
                continue
            
            # Generate thumbnail
            thumb_path = file_path.rsplit('.', 1)[0] + '.jpg'
            if not dry_run and generate_thumbnail(file_path, thumb_path):
                db_thumb_path = event.file_path.rsplit('.', 1)[0] + '.jpg'
                event.thumbnail_path = db_thumb_path
                thumb_fixed += 1
            elif dry_run:
                print(f"  [Would generate] thumbnail for {os.path.basename(file_path)}")
        
        if not dry_run and thumb_fixed > 0:
            db.commit()
        
        # Step 3: Clean up corrupted/incomplete videos
        print()
        print("Checking for corrupted/incomplete videos...")
        corrupted_count = 0
        corrupted_size = 0
        all_video_events = db.query(Event).filter(Event.type == "video").all()
        
        for event in all_video_events:
            if not event.file_path:
                continue
            
            # Convert DB path to filesystem path
            file_path = event.file_path
            if file_path.startswith('/var/lib/vibe/recordings'):
                file_path = file_path.replace('/var/lib/vibe/recordings', '/data', 1)
            elif file_path.startswith('/var/lib/motion'):
                file_path = file_path.replace('/var/lib/motion', '/data', 1)
            
            if not os.path.exists(file_path):
                # File missing - delete DB entry
                if not dry_run:
                    db.delete(event)
                corrupted_count += 1
                print(f"  🗑️  Missing file, removing DB entry: {os.path.basename(event.file_path)}")
                continue
            
            # Check if video is valid
            if not is_video_valid(file_path):
                file_size = os.path.getsize(file_path)
                corrupted_size += file_size
                
                if dry_run:
                    print(f"  [Would delete] corrupted: {os.path.basename(file_path)}")
                else:
                    # Validate path safety before deletion
                    if not is_safe_path(file_path):
                        print(f"  ⚠️  Skipping unsafe path deletion: {file_path}")
                        continue

                    # Delete file
                    try:
                        os.remove(file_path)
                        # Delete thumbnail if exists
                        thumb_path = file_path.rsplit('.', 1)[0] + '.jpg'
                        if os.path.exists(thumb_path):
                            os.remove(thumb_path)
                    except Exception as e:
                        print(f"  ⚠️  Failed to delete file: {e}")
                    
                    # Delete DB entry
                    db.delete(event)
                    print(f"  🗑️  Deleted corrupted: {os.path.basename(file_path)}")
                
                corrupted_count += 1
        
        if not dry_run and corrupted_count > 0:
            db.commit()
        
        # Prepare result stats
        stats = {
            "imported": added_count,
            "skipped": skipped_count,
            "thumbnails_generated": thumb_fixed,
            "corrupted_deleted": corrupted_count,
            "corrupted_size_mb": round(corrupted_size / (1024 * 1024), 2),
            "orphaned_deleted": unknown_camera_files,
            "orphaned_size_mb": round(unknown_camera_size / (1024 * 1024), 2),
            "dry_run": dry_run
        }
        
        print()
        print("=" * 60)
        print("Summary:")
        print(f"  {'Would import' if dry_run else 'Imported'}: {stats['imported']} recordings")
        print(f"  Already in DB (skipped): {stats['skipped']}")
        if stats['thumbnails_generated'] > 0 or (dry_run and len(events_without_thumbs) > 0):
            count = len(events_without_thumbs) if dry_run else stats['thumbnails_generated']
            action = "Would generate" if dry_run else "Generated"
            print(f"  🖼️  {action} {count} missing thumbnails")
        if stats['corrupted_deleted'] > 0:
            action = "Would delete" if dry_run else "Deleted"
            print(f"  ⚠️  {action} {stats['corrupted_deleted']} corrupted/incomplete videos ({stats['corrupted_size_mb']} MB)")
        if stats['orphaned_deleted'] > 0:
            action = "Would delete" if dry_run else "Deleted"
            print(f"  🗑️  {action} {stats['orphaned_deleted']} orphaned files ({stats['orphaned_size_mb']} MB) from deleted cameras")
        print("=" * 60)
        
        return stats
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Recover orphaned recordings")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be imported without making changes")
    args = parser.parse_args()
    
    sync_recordings(dry_run=args.dry_run)
