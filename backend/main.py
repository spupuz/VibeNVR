from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import cameras, events, stats, settings, auth, users, groups
import threading
import storage_service
import motion_service
import database
import auth_service

import logging
import re

class TokenRedactingFilter(logging.Filter):
    def filter(self, record):
        # Redact token from the message itself
        if isinstance(record.msg, str) and "token=" in record.msg:
            record.msg = re.sub(r"token=[^&\s]*", "token=REDACTED", record.msg)
        
        # Redact token from uvicorn access log arguments (client, method, path, etc)
        if hasattr(record, "args") and record.args:
            new_args = list(record.args)
            for i, arg in enumerate(new_args):
                if isinstance(arg, str) and "token=" in arg:
                    new_args[i] = re.sub(r"token=[^&\s]*", "token=REDACTED", arg)
            record.args = tuple(new_args)
        return True

# Apply the filter to uvicorn access logs
logging.getLogger("uvicorn.access").addFilter(TokenRedactingFilter())
# Also apply to the root logger just in case
logging.getLogger("uvicorn").addFilter(TokenRedactingFilter())

app = FastAPI(title="VibeNVR API", version="1.9.6")

@app.on_event("startup")
async def startup_event():
    # Wait for DB to be ready
    import time
    from sqlalchemy.exc import OperationalError
    
    for i in range(15):
        try:
            Base.metadata.create_all(bind=engine)
            print("Database connection established.")
            break
        except Exception as e:
            print(f"Waiting for Database ({i+1}/15)...")
            time.sleep(2)

    # Start storage monitor in background
    thread = threading.Thread(target=storage_service.storage_monitor_loop, daemon=True)
    thread.start()
    
    # Regenerate motion config
    db = next(database.get_db())
    try:
        # Auto-migration for Passthrough feature
        from sqlalchemy import text
        try:
            db.execute(text("ALTER TABLE cameras ADD COLUMN IF NOT EXISTS movie_passthrough BOOLEAN DEFAULT FALSE"))
            db.commit()
        except Exception as e:
            print(f"Migration warning: {e}")
            db.rollback()

        # Auto-migration for Indices
        try:
            db.execute(text("CREATE INDEX IF NOT EXISTS ix_events_timestamp_start ON events (timestamp_start)"))
            db.execute(text("CREATE INDEX IF NOT EXISTS ix_events_camera_id ON events (camera_id)"))
            db.commit()
        except Exception as e:
            print(f"Index creation warning: {e}")
            db.rollback()
            
        motion_service.generate_motion_config(db)
    finally:
        db.close()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(cameras.router)
app.include_router(events.router)
app.include_router(stats.router)
app.include_router(settings.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)

from fastapi.responses import FileResponse
import os
from fastapi import HTTPException, Depends

# Secure media serving
@app.get("/media/{file_path:path}")
async def get_secure_media(file_path: str, user=Depends(auth_service.get_current_user_from_query)):
    # Prevent directory traversal
    if ".." in file_path:
        raise HTTPException(status_code=400, detail="Invalid path")
    
    full_path = f"/data/{file_path}"
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(full_path)

@app.get("/")
def read_root():
    return {"message": "Welcome to VibeNVR API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
