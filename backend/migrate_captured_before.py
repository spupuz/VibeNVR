from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("VibeMigrateCaptured")

# Get DB URL from env or default
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://vibenvr:vibenvr@db:5432/vibenvr")

def migrate_frames_to_seconds():
    logger.info("Starting migration: captured_before Frames -> Seconds")
    
    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = SessionLocal()
        
        from models import Camera 
        
        cameras = db.query(Camera).all()
        count = 0
        
        for cam in cameras:
            if cam.captured_before is None:
                continue
                
            val = cam.captured_before
            fps = cam.framerate or 15
            
            if val >= 10: 
                new_val_seconds = max(1, val // fps)
                logger.info(f"Camera {cam.id} ({cam.name}): converting {val} frames -> {new_val_seconds} seconds (FPS {fps})")
                
                cam.captured_before = new_val_seconds
                count += 1
            else:
                logger.info(f"Camera {cam.id} ({cam.name}): value {val} seems small enough to be seconds/ignored.")
        
        if count > 0:
            db.commit()
            logger.info(f"Successfully migrated {count} cameras.")
        else:
            logger.info("No cameras needed migration.")
            
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        # sys.exit(1) # Don't crash the whole backend if this optional migration fails

if __name__ == "__main__":
    migrate_frames_to_seconds()
