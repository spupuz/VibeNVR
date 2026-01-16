from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import cameras, events, stats, settings, auth, users, groups
import threading
import storage_service
import motion_service
import database

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="VibeNVR API", version="0.1.0")

@app.on_event("startup")
async def startup_event():
    # Start storage monitor in background
    thread = threading.Thread(target=storage_service.storage_monitor_loop, daemon=True)
    thread.start()
    
    # Regenerate motion config
    db = next(database.get_db())
    try:
        motion_service.generate_motion_config(db)
    finally:
        db.close()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cameras.router)
app.include_router(events.router)
app.include_router(stats.router)
app.include_router(settings.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)

from fastapi.staticfiles import StaticFiles
# Mount /media to serve files from /data (mapped to vibenvr_data)
# Used for video playback and thumbnails
app.mount("/media", StaticFiles(directory="/data"), name="media")

@app.get("/")
def read_root():
    return {"message": "Welcome to VibeNVR API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
