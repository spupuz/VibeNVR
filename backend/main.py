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
    # Check for Default Secret Key (Security Warning)
    if auth_service.SECRET_KEY == "vibenvr-super-secret-key-change-me":
        print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        print("!! SECURITY WARNING: You are using the default SECRET_KEY.                      !!")
        print("!! Please set a secure SECRET_KEY in your .env file for production use.       !!")
        print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

    # Wait for DB to be ready
    import time
    
    for i in range(15):
        try:
            Base.metadata.create_all(bind=engine)
            print("Database connection established.")
            
            # Auto-migrate schema updates
            try:
                import migrate_db
                print("Checking for schema migrations...")
                migrate_db.migrate()
            except Exception as e:
                print(f"Migration warning: {e}")
                
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
        # Sync to engine directly using motion_service
        motion_service.generate_motion_config(db)
    except Exception as e:
        print(f"Startup warning: {e}")
    finally:
        db.close()
    
    # Background orphan recovery (delayed to not overload startup)
    def run_orphan_recovery():
        import time
        time.sleep(30)  # Wait 30 seconds after startup
        print("[Startup] Running automatic orphan recording recovery...")
        try:
            import sync_recordings
            sync_recordings.sync_recordings(dry_run=False)
        except Exception as e:
            print(f"[Startup] Orphan recovery warning: {e}")
    
    orphan_thread = threading.Thread(target=run_orphan_recovery, daemon=True, name="OrphanRecovery")
    orphan_thread.start()
        
    yield
    # Shutdown actions (if any)

# Read version from package.json
import json
try:
    with open("package.json", "r") as f:
        data = json.load(f)
        VERSION = data.get("version", "1.0.0")
except:
    VERSION = "1.0.0"

app = FastAPI(title="VibeNVR API", version=VERSION, lifespan=lifespan)
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
    # Security Validation: Ensure path is within /data/
    # Normalize path to prevent traversals like /data/../etc/passwd
    full_path = os.path.normpath(f"/data/{file_path}")
    
    if not full_path.startswith("/data/"):
         # For Windows dev environment compatibility (if /data is mapped to c:\...)
         # In docker linux /data is absolute.
         # But let's be strict for /data prefix.
         # Actually os.path.normpath on windows might flip slashes.
         # The container IS linux.
         print(f"Security Alert (Media): Attempted access to {full_path}")
         raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(full_path)

@app.get("/")
def read_root():
    return {"message": "Welcome to VibeNVR API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
