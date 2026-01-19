from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import cameras, events, stats, settings, auth, users, groups, logs
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

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    # Wait for DB to be ready
    import time
    
    for i in range(15):
        try:
            Base.metadata.create_all(bind=engine)
            print("Database connection established.")
            break
        except Exception as e:
            print(f"Waiting for Database ({i+1}/15)...")
            time.sleep(2)

    # Start background tasks
    storage_service.start_scheduler()
    motion_service.start_check_loop()
    import log_service
    log_service.start_scheduler()
    
    # Regenerate motion config
    db = next(database.get_db())
    try:
        # Auto-migration for Passthrough feature (field exists check?)
        # Base.metadata.create_all handles table creation, alembic usually handles migrations.
        # Assuming we just need to regen config
        from routers import cameras
        cameras.regenerate_motion_config_all(db)
        # Sync to engine? Engines pulls from us or we push?
        # Typically backend might restart engine if config changes, 
        # but here we just ensure config files are fresh.
    except Exception as e:
        print(f"Startup warning: {e}")
    finally:
        db.close()
        
    yield
    # Shutdown actions (if any)

app = FastAPI(title="VibeNVR API", version="1.9.9", lifespan=lifespan)
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
app.include_router(logs.router)

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
