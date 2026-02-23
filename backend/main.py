import os
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import cameras, events, stats, settings, auth, users, groups, logs, homepage, api_tokens
import threading
import storage_service
import motion_service
import database
import auth_service
import requests
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from models import Camera # Fixed missing import

import logging
import re

class TokenRedactingFilter(logging.Filter):
    def filter(self, record):
        # Redact token from the message itself
        if isinstance(record.msg, str):
            if "token=" in record.msg:
                record.msg = re.sub(r"token=[^&\s]*", "token=REDACTED", record.msg)
            if "X-API-Key" in record.msg:
                record.msg = re.sub(r"X-API-Key[^\s]*[:=]\s*['\"]?[^'\"]+['\"]?", "X-API-Key: REDACTED", record.msg)
        
        # Redact token from uvicorn access log arguments (client, method, path, etc)
        if hasattr(record, "args") and record.args:
            new_args = list(record.args)
            for i, arg in enumerate(new_args):
                if isinstance(arg, str):
                    if "token=" in arg:
                        new_args[i] = re.sub(r"token=[^&\s]*", "token=REDACTED", arg)
                    # Redact RTSP credentials
                    if "rtsp://" in arg:
                        new_args[i] = re.sub(r"rtsp://([^:]+):([^@]+)@", r"rtsp://\1:***@", arg)
            record.args = tuple(new_args)
        return True

# Apply the filter to uvicorn access logs
# Apply the filter to uvicorn access logs
uvicorn_access_logger = logging.getLogger("uvicorn.access")
uvicorn_access_logger.addFilter(TokenRedactingFilter())

# Configure timestamp for uvicorn access logs
# Uvicorn's default formatter doesn't include time
console_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

# Apply formatter to all handlers of uvicorn.access
if uvicorn_access_logger.hasHandlers():
    for handler in uvicorn_access_logger.handlers:
        handler.setFormatter(console_formatter)
else:
    # If no handlers yet (likely), add one or rely on uvicorn's default being added later?
    # Uvicorn usually configures logging *before* importing app or *during* run.
    # If we are running via 'uvicorn main:app', this code runs on import.
    # We might need to handle this in lifespan or ensure we don't duplicate.
    # But usually setting it here works if handlers exist or we add one.
    # Note: Uvicorn overwrites config unless --log-config is used.
    # safer strategy: Re-configure in lifespan? Or just let's try assuming standard uvicorn init.
    pass

# Also apply filter to the root logger just in case
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
    
    # Force log formatting for Uvicorn Access logs (ensure timestamps)
    try:
        # Define formatter
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

        # 1. Uvicorn Access Logger
        access_log = logging.getLogger("uvicorn.access")
        for handler in access_log.handlers:
            handler.setFormatter(formatter)
            
        # 2. Root Logger (for app-generated logs)
        root_log = logging.getLogger()
        # If root has no handlers, add one (stdout)
        if not root_log.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(formatter)
            root_log.addHandler(handler)
            root_log.setLevel(logging.INFO)
        else:
            for handler in root_log.handlers:
                handler.setFormatter(formatter)
                
    except Exception as e:
        print(f"Log setup warning: {e}")

    retry_count = 0
    while True:
        try:
            Base.metadata.create_all(bind=engine)
            print("Database connection established.")
            
            # Auto-migrate schema updates
            try:
                import migrate_db
                print("Checking for schema migrations...")
                migrate_db.migrate()
                
                # Auto-migrate captured_before (Frames -> Seconds)
                import migrate_captured_before
                migrate_captured_before.migrate_frames_to_seconds()
            except Exception as e:
                print(f"Migration warning: {e}")
                
            break
        except Exception as e:
            retry_count += 1
            print(f"Waiting for Database (Attempt {retry_count})...")
            time.sleep(2)

    # Start background tasks
    storage_service.start_scheduler()
    motion_service.start_check_loop()
    import log_service
    log_service.start_scheduler()
    import health_service
    health_service.start_health_service()
    import telemetry_service
    telemetry_service.start_telemetry()
    
    # Regenerate motion config
    with database.get_db_ctx() as db:
        try:
            # Sync to engine directly using motion_service
            motion_service.generate_motion_config(db)
        except Exception as e:
            print(f"Startup warning: {e}")
    
    # Background orphan recovery (delayed to not overload startup)
    def run_orphan_recovery():
        import time
        time.sleep(60)  # Wait 60 seconds after startup to ensure system stability
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
        VERSION = data.get("version", "1.18.2")
except:
    VERSION = "1.18.2"

app = FastAPI(title="VibeNVR API", version=VERSION, lifespan=lifespan)
# CORS configuration
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

@app.exception_handler(OperationalError)
async def database_exception_handler(request: Request, exc: OperationalError):
    import logging
    logger = logging.getLogger("uvicorn.error")
    logger.error(f"Database Connectivity Error: {exc}")
    
    return JSONResponse(
        status_code=503,
        content={
            "status": "error",
            "message": "Database connection lost or unavailable.",
            "detail": "Connection to the database failed. This usually happens during database maintenance or container restarts.",
            "components": {
                "database": "lost",
                "engine": "unknown", # Backend can't check engine status without DB (often) or it's unknown in this context
                "backend": "ok"
            }
        }
    )

app.include_router(cameras.router)
app.include_router(events.router)
app.include_router(stats.router)
app.include_router(settings.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)
app.include_router(logs.router)
app.include_router(homepage.router, prefix="/v1")
app.include_router(api_tokens.router, prefix="/v1")

from fastapi.responses import FileResponse
import os
from fastapi import HTTPException, Depends

# Secure media serving
@app.get("/media/{file_path:path}")
async def get_secure_media(file_path: str, token: str):
    # Release DB connection early
    with database.get_db_ctx() as db:
        await auth_service.get_user_from_token(token, db)
    
    # Security Validation: Ensure path is within /data/
    # Normalize path to prevent traversals like /data/../etc/passwd
    full_path = os.path.normpath(f"/data/{file_path}")
    
    if not full_path.startswith("/data/"):
         print(f"Security Alert (Media): Attempted access to {full_path}")
         raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(full_path)

@app.get("/")
def read_root():
    return {"message": "Welcome to VibeNVR API"}

# Removed local lock, moving to motion_service.py

@app.get("/health")
async def health_check(background_tasks: BackgroundTasks):
    health_status = {"status": "ok", "components": {}}
    is_healthy = True

    # 1. Check Database
    try:
        with database.get_db_ctx() as db:
            db.execute(text("SELECT 1"))
        health_status["components"]["database"] = "ok"
    except Exception as e:
        health_status["components"]["database"] = f"error: {str(e)}"
        is_healthy = False

    # 2. Check Engine
    try:
        # We use the stats endpoint as a lightweight ping
        resp = requests.get("http://engine:8000/stats", timeout=2)
        if resp.status_code == 200:
            engine_data = resp.json()
            health_status["components"]["engine"] = "ok"
            
            # PROACTIVE SYNC: If engine is alive but has 0 active cameras,
            # and we have active cameras in DB, trigger a re-sync.
            if engine_data.get("active_cameras") == 0:
                 with database.get_db_ctx() as db:
                     active_cams_count = db.query(Camera).filter(Camera.is_active == True).count()
                     if active_cams_count > 0:
                         # Use a lock to prevent spawning dozens of sync threads if health is polled rapidly
                         if motion_service.sync_lock.acquire(blocking=False):
                             print("Health check: Engine is empty. Triggering proactive re-sync...", flush=True)
                             
                             def do_sync():
                                 try:
                                     with database.get_db_ctx() as db_inner:
                                         motion_service.generate_motion_config(db_inner)
                                 finally:
                                     motion_service.sync_lock.release()
                                     
                             background_tasks.add_task(do_sync)
        else:
            health_status["components"]["engine"] = f"error: status_code {resp.status_code}"
            is_healthy = False
    except Exception as e:
        health_status["components"]["engine"] = f"unreachable"
        # Only log connectivity errors as warnings to avoid cluttering logs during restarts
        import logging
        logger = logging.getLogger("uvicorn.error")
        logger.warning(f"Health check: Engine is unreachable at {resp.url if 'resp' in locals() else 'http://engine:8000'}")
        is_healthy = False

    if not is_healthy:
        health_status["status"] = "error"
        return JSONResponse(status_code=503, content=health_status)

    return health_status
