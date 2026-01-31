
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
import sys

# Get DB URL from env or default
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://vibenvr:vibenvr@db:5432/vibenvr")

def migrate_frames_to_seconds():
    print("Starting migration: captured_before Frames -> Seconds")
    
    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = SessionLocal()
        
        # Check if migration already ran (heuristic: if values are generally small)
        # But user might have set 30 seconds manually? 
        # Safest is to check a flag or just assume values > 10 are likely frames given defaults.
        # Default was 30 frames. 30 seconds is a lot but possible. 
        # Let's trust the user request: "migrazione deve esser indolore".
        
        # Strategy:
        # Iterate all cameras.
        # If captured_before > 10 (likely frames):
        #    new_val = captured_before // framerate
        #    Update DB.
        
        from models import Camera 
        
        cameras = db.query(Camera).all()
        count = 0
        
        for cam in cameras:
            if cam.captured_before is None:
                continue
                
            val = cam.captured_before
            fps = cam.framerate or 15
            
            # Threshold to distinguish frames vs seconds.
            # If value is, say, 30. 
            # If it interprets as seconds -> 30s buffer. 
            # If it interprets as frames -> 2s buffer (at 15fps).
            # It's safer to assume anything >= 15 is Frames. 
            # (Who sets < 1s pre-capture? Maybe 5-10 frames?)
            
            if val >= 10: 
                new_val_seconds = max(1, val // fps)
                print(f"Camera {cam.id} ({cam.name}): converting {val} frames -> {new_val_seconds} seconds (FPS {fps})")
                
                cam.captured_before = new_val_seconds
                count += 1
            else:
                print(f"Camera {cam.id} ({cam.name}): value {val} seems small enough to be seconds/ignored.")
        
        if count > 0:
            db.commit()
            print(f"Successfully migrated {count} cameras.")
        else:
            print("No cameras needed migration.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate_frames_to_seconds()
