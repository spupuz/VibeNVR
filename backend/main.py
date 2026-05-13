import os
import logging
import json
import asyncio
import tarfile
import io
import re
import threading
from typing import Optional
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, Request, WebSocket
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import database
from database import engine, Base
from routers import cameras, events, stats, settings, auth, users, groups, logs, homepage, api_tokens, onvif_router, storage
import auth_service
import crud
import models
import storage_service
import motion_service
from models import Camera 

# 1. IMMEDIATE LOGGING CONFIGURATION
# We do this at the very top to catch Uvicorn's earliest messages
def setup_initial_logging():
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    
    # Configure Root Logger
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)
    else:
        for handler in root_logger.handlers:
            handler.setFormatter(formatter)
    root_logger.setLevel(logging.INFO)

    # Configure Uvicorn Loggers
    for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        u_logger = logging.getLogger(logger_name)
        u_logger.propagate = False # Prevent double logging if root also has handlers
        if not u_logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(formatter)
            u_logger.addHandler(handler)
        else:
            for handler in u_logger.handlers:
                handler.setFormatter(formatter)

setup_initial_logging()

logger = logging.getLogger("VibeBackend")

class TokenRedactingFilter(logging.Filter):
    def filter(self, record):
        # Redact token from the message itself
        if isinstance(record.msg, str):
            # 1. Redact credentials in URLs (rtsp://user:pass@host)
            record.msg = re.sub(r'([a-z]+://[^:]+:)([^@]+)(@)', r'\1***\3', record.msg)
            
            # 2. Sensitive keys list (matching logs.py)
            sensitive_keys = r'password|pwd|secret|token|access_token|Authorization|X-API-Key|client_secret|totp_secret|media_token'
            
            # 3. Handle Bearer tokens specifically
            record.msg = re.sub(r'(?i)Bearer\s+[\w\-\.]+', r'Bearer REDACTED', record.msg)
            
            # 4. Handle JSON/YAML/Quoted formats: "key": "value" or 'key': 'value'
            record.msg = re.sub(rf'(?i)(["\']?({sensitive_keys})["\']?\s*[:=]\s*["\'])([^"\']+)(["\'])', r'\1***\4', record.msg)
            
            # 5. Handle unquoted key-value pairs: key=value or key: value
            record.msg = re.sub(rf'(?i)\b({sensitive_keys})\b\s*[:=]\s*(?!Bearer )[\w\-\.!@#$%^&*()]+', r'\1=REDACTED', record.msg)

            # 6. Legacy fallback for simple token=
            if "token=" in record.msg:
                record.msg = re.sub(r"token=[^&\s]*", "token=REDACTED", record.msg)
        
        # Redact token from uvicorn access log arguments (client, method, path, etc)
        if hasattr(record, "args") and record.args:
            new_args = list(record.args)
            for i, arg in enumerate(new_args):
                if isinstance(arg, str):
                    if "token=" in arg:
                        new_args[i] = re.sub(r"token=[^&\s]*", "token=REDACTED", arg)
                    # Redact sensitive credentials in URLs (e.g. RTSP)
                    if "://" in arg and "@" in arg:
                        new_args[i] = re.sub(r"://[^@]+@", r"://***@", arg)
            record.args = tuple(new_args)
        return True

class PollingSamplingFilter(logging.Filter):
    """
    Reduces the frequency of logging for high-volume polling endpoints like /health and /stats.
    Logs successful requests only once every 10 times, but always logs errors or state changes.
    """
    def __init__(self, name: str = "", sample_rate: int = 10):
        super().__init__(name)
        self.sample_rate = sample_rate
        self.counters = {}

    def filter(self, record):
        # record.args for uvicorn.access is (host, method, path, http_ver, status)
        if hasattr(record, "args") and len(record.args) >= 5:
            method = record.args[1]
            path = record.args[2]
            status = record.args[4]
            
            # Only sample successful GET requests to specific polling endpoints
            if method == "GET" and status == 200 and any(p in path for p in ["/health", "/stats", "/frame", "/events/status"]):
                count = self.counters.get(path, 0)
                self.counters[path] = (count + 1) % self.sample_rate
                return count == 0 # Log every N-th request
        return True

def apply_security_logging():
    """
    Forcefully apply Redacting and Sampling filters to all relevant loggers.
    """
    redact_filter = TokenRedactingFilter()
    sampling_filter = PollingSamplingFilter()
    
    # Target loggers: root, uvicorn, and its sub-loggers
    target_loggers = ["", "uvicorn", "uvicorn.access", "uvicorn.error", "websockets", "fastapi"]
    
    for name in target_loggers:
        logger_obj = logging.getLogger(name)
        # 1. Add Filters to logger
        if not any(isinstance(f, TokenRedactingFilter) for f in logger_obj.filters):
            logger_obj.addFilter(redact_filter)
        if name == "uvicorn.access" and not any(isinstance(f, PollingSamplingFilter) for f in logger_obj.filters):
            logger_obj.addFilter(sampling_filter)
        
        # 2. Add to all existing handlers
        for handler in logger_obj.handlers:
            if not any(isinstance(f, TokenRedactingFilter) for f in handler.filters):
                handler.addFilter(redact_filter)
            if name == "uvicorn.access" and not any(isinstance(f, PollingSamplingFilter) for f in handler.filters):
                handler.addFilter(sampling_filter)
                
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

# Initial application on import
apply_security_logging()

# Apply filter to the root uvicorn logger
logging.getLogger("uvicorn").addFilter(TokenRedactingFilter())

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    # Check for Default Secret Key (Security Warning)
    default_keys = [
        "vibenvr-super-secret-key-change-me",
        "change_this_to_a_long_random_string",
        "vibe_secure_key_9823748923748923_change_in_prod",  # .env dev default
    ]
    
    is_weak_key = auth_service.SECRET_KEY in default_keys or len(auth_service.SECRET_KEY) < 32
    auth_service.IS_WEAK_KEY = is_weak_key
    
    if is_weak_key:
        logger.warning("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        logger.warning("!! WARNING: You are using a default or a weak SECRET_KEY.                     !!")
        logger.warning("!! This is a security risk. Please set a secure SECRET_KEY in your .env file. !!")
        logger.warning("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        
        # Only exit if in production and not explicitly bypassed
        if os.getenv("ENVIRONMENT", "production").lower() == "production":
             if os.getenv("ALLOW_WEAK_SECRET", "false").lower() != "true":
                 logger.error("!! CRITICAL: Strict security is enabled (ENVIRONMENT=production).       !!")
                 logger.error("!! The application will not start with a weak key.                      !!")
                 logger.error("!! To bypass this (NOT RECOMMENDED), set ALLOW_WEAK_SECRET=true.         !!")
                 logger.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
                 # We no longer exit, but persist the warning in the UI
                 # sys.exit(1) 
             else:
                 logger.warning("!! WARNING: Bypassing weak SECRET_KEY check in production.              !!")
                 logger.warning("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

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
        logger.error(f"Log setup warning: {e}")

    # Re-apply security logging inside lifespan to catch process-level resets/reloads
    apply_security_logging()

    retry_count = 0
    while True:
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Database connection established.")
            
            # Auto-migrate schema updates
            try:
                import migrate_db
                logger.info("Checking for schema migrations...")
                migrate_db.migrate()
                
                # Auto-migrate captured_before (Frames -> Seconds)
                import migrate_captured_before
                migrate_captured_before.migrate_frames_to_seconds()
            except Exception as e:
                logger.warning(f"Migration warning: {e}")
                
            break
        except Exception as e:
            retry_count += 1
            logger.info(f"Waiting for Database (Attempt {retry_count})...")
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
    import backup_service
    backup_service.start_scheduler()
    from onvif_event_service import event_manager
    event_manager.start()
    
    # Regenerate motion config
    with database.get_db_ctx() as db:
        try:
            # Sync to engine directly using motion_service
            motion_service.generate_motion_config(db)
            
            # Initialize default settings (adds new keys like MQTT if missing)
            settings.init_default_settings(db, current_user=None) # Bypass admin check during startup
        except Exception as e:
            logger.warning(f"Startup warning: {e}")
    
    # Background orphan recovery (delayed to not overload startup)
    def run_orphan_recovery():
        import time
        time.sleep(60)  # Wait 60 seconds after startup to ensure system stability
        logger.info("[Startup] Running automatic orphan recording recovery...")
        try:
            import sync_recordings
            sync_recordings.sync_recordings(dry_run=False)
        except Exception as e:
            logger.warning(f"[Startup] Orphan recovery warning: {e}")
    
    orphan_thread = threading.Thread(target=run_orphan_recovery, daemon=True, name="OrphanRecovery")
    orphan_thread.start()
        
    yield
    # Shutdown actions (if any)
    from onvif_event_service import event_manager
    event_manager.stop()

# Read version from package.json
import json
try:
    with open("package.json", "r") as f:
        data = json.load(f)
        VERSION = data.get("version", "1.18.2")
except:
    VERSION = "1.18.2"

_is_dev = os.getenv("ENVIRONMENT", "production").lower() == "dev"
app = FastAPI(
    title="VibeNVR API",
    version=VERSION,
    lifespan=lifespan,
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
)

# --- WebSocket Debugging & Proxy Fix ---
@app.middleware("http")
async def log_websocket_attempts(request: Request, call_next):
    if "upgrade" in request.headers.get("connection", "").lower() and "websocket" in request.headers.get("upgrade", "").lower():
        logger.info(f"[WS-UPGRADE] Attempt for path: {request.url.path} from {request.client.host if request.client else 'unknown'}")
        logger.debug(f"[WS-HEADERS] {dict(request.headers)}")
    return await call_next(request)

# Rate Limiter setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
# CORS Configuration
# Default to empty/restrictive for security. User should set ALLOWED_ORIGINS in .env
allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "")
if not allowed_origins_raw:
    # Allow localhost for development if not set
    allowed_origins = ["http://localhost:5173", "http://localhost:5005", "http://localhost:8080"]
else:
    allowed_origins = allowed_origins_raw.split(",")

if "*" in allowed_origins:
    logger.warning("--------------------------------------------------------------------------------")
    logger.warning("!! WARNING: CORS ALLOWED_ORIGINS is set to '*'.                               !!")
    logger.warning("!! For production, set this to your specific domain (e.g., https://vibe.io).  !!")
    logger.warning("--------------------------------------------------------------------------------")

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
app.include_router(onvif_router.router)
app.include_router(storage.router)

from fastapi.responses import FileResponse
import os
from fastapi import HTTPException, Depends

# Secure media serving
@app.get("/media/{file_path:path}")
async def get_secure_media(file_path: str, request: Request, token: Optional[str] = None):
    # Debug cookies
    logging.debug(f"DEBUG Media: Request cookies for {file_path}: {request.cookies}")

    # Try query param first (for backward compatibility), then cookie
    media_token = token or request.cookies.get("media_token")
    if not media_token:
        logging.warning(f"Media Auth Fail: No token for {file_path}. Cookies present: {list(request.cookies.keys())}")
        raise HTTPException(status_code=401, detail="Missing media authentication")

    try:
        # Release DB connection early
        with database.get_db_ctx() as db:
            await auth_service.get_user_from_token(media_token, db)
    except Exception as e:
        logging.error(f"Media Auth Fail: Invalid token for {file_path} - {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid media authentication")
    
    # Security Validation: Ensure path is within /data/
    # Normalize path to prevent traversals like /data/../etc/passwd
    full_path = os.path.normpath(f"/data/{file_path}")
    
    if not full_path.startswith("/data/"):
         logger.warning(f"Security Alert (Media): Attempted access to {full_path}")
         raise HTTPException(status_code=403, detail="Access denied")

    # RBAC for backups folder: Only allow admins to access anything in /data/backups/
    if full_path.startswith("/data/backups/"):
         # We already validated the token above, now check the user role
         with database.get_db_ctx() as db:
              try:
                  target_user = await auth_service.get_user_from_token(media_token, db)
                  if target_user.role != 'admin':
                      logging.warning(f"Security Alert (Backups): Unauthorized access attempt to {full_path} by user {target_user.username}")
                      raise HTTPException(status_code=403, detail="Access denied to system backups")
              except HTTPException as e:
                  raise e
              except Exception:
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
    health_status = {"status": "ok", "components": {}, "is_weak_key": auth_service.IS_WEAK_KEY}
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
