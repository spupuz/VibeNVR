import os
import sys
from sqlalchemy.orm import Session
from database import SessionLocal
import models

def backfill():
    db = SessionLocal()
    try:
        # Get all events with 0 size
        events = db.query(models.Event).filter(models.Event.file_size == 0).all()
        print(f"Found {len(events)} events to backfill.")
        
        updated_count = 0
        for event in events:
            if not event.file_path:
                continue
                
            # Translate path
            local_path = event.file_path.replace("/var/lib/motion", "/data", 1)
            
            if os.path.exists(local_path):
                try:
                    size = os.path.getsize(local_path)
                    event.file_size = size
                    updated_count += 1
                except Exception as e:
                    print(f"Error getting size for {local_path}: {e}")
            else:
                # Optional: If file doesn't exist, we could mark it or leave as 0
                pass
                
            if updated_count % 100 == 0 and updated_count > 0:
                db.commit()
                print(f"Updated {updated_count} events...")
        
        db.commit()
        print(f"Finished. Total updated: {updated_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    backfill()
