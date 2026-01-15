from database import SessionLocal
from models import Camera
import traceback

def debug_insert():
    db = SessionLocal()
    
    print("Testing Override Defaults...")
    cam = Camera(
        name="Test Override",
        rtsp_url="rtsp://test",
        # Override suspect fields
        movie_file_name="simple_name", 
        text_right="simple_text",
        detect_motion_mode="Always"
    )
    try:
        db.add(cam)
        db.commit()
        print("Override Success")
    except Exception as e:
        db.rollback()
        if hasattr(e, 'orig'):
            print(f"ORIG_ERROR: {str(e.orig)}")
        else:
            print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    debug_insert()
