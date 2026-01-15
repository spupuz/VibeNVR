from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    rtsp_url = Column(String, nullable=False)
    stream_url = Column(String, nullable=True) # Browser-compatible URL (MJPEG/HLS)
    location = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Video Device
    resolution_width = Column(Integer, default=800)
    resolution_height = Column(Integer, default=600)
    framerate = Column(Integer, default=15)
    rotation = Column(Integer, default=0) # 0, 90, 180, 270

    # Text Overlay
    text_left = Column(String, default="Camera Name")
    text_right = Column(String, default="%Y-%m-%d %H:%M:%S")
    text_scale = Column(Float, default=1.0)

    # File Storage
    storage_path = Column(String, nullable=True) # Custom path
    root_directory = Column(String, nullable=True) # e.g. /var/lib/motioneye/Camera1
    
    # Video Streaming
    stream_quality = Column(Integer, default=75) # %
    stream_max_rate = Column(Integer, default=15) # FPS
    stream_port = Column(Integer, nullable=True) # e.g. 8081

    # Movies
    movie_file_name = Column(String, default="%Y-%m-%d/%H-%M-%S")
    movie_passthrough = Column(Boolean, default=True)
    movie_quality = Column(Integer, default=75)
    recording_mode = Column(String, default="Motion Triggered")
    max_movie_length = Column(Integer, default=0)
    preserve_movies = Column(String, default="For One Week")
    max_storage_gb = Column(Float, default=0)  # 0 = unlimited

    # Still Images
    picture_file_name = Column(String, default="%Y-%m-%d/%H-%M-%S-%q")
    picture_quality = Column(Integer, default=75)
    picture_recording_mode = Column(String, default="Manual")
    preserve_pictures = Column(String, default="Forever")
    enable_manual_snapshots = Column(Boolean, default=True)
    max_pictures_storage_gb = Column(Float, default=0)

    # Motion Detection
    threshold = Column(Integer, default=1500)
    auto_threshold_tuning = Column(Boolean, default=True)
    auto_noise_detection = Column(Boolean, default=True)
    light_switch_detection = Column(Integer, default=0)
    despeckle_filter = Column(Boolean, default=False)
    motion_gap = Column(Integer, default=10) # seconds
    captured_before = Column(Integer, default=30) # frames
    captured_after = Column(Integer, default=30) # frames
    min_motion_frames = Column(Integer, default=2)
    mask = Column(Boolean, default=False)
    show_frame_changes = Column(Boolean, default=True)
    create_debug_media = Column(Boolean, default=False)

    # Notification Destinations
    notify_webhook_url = Column(String, nullable=True)
    notify_telegram_token = Column(String, nullable=True)
    notify_telegram_chat_id = Column(String, nullable=True)
    notify_email_address = Column(String, nullable=True)

    notify_start_email = Column(Boolean, default=False)
    notify_start_telegram = Column(Boolean, default=False)
    notify_start_webhook = Column(Boolean, default=False)
    notify_start_command = Column(Boolean, default=False)
    notify_end_webhook = Column(Boolean, default=False)
    notify_end_command = Column(Boolean, default=False)


    # Schedule
    schedule_monday = Column(Boolean, default=True)
    schedule_tuesday = Column(Boolean, default=True)
    schedule_wednesday = Column(Boolean, default=True)
    schedule_thursday = Column(Boolean, default=True)
    schedule_friday = Column(Boolean, default=True)
    schedule_saturday = Column(Boolean, default=True)
    schedule_sunday = Column(Boolean, default=True)
    detect_motion_mode = Column(String, default="Always") # Always | Working Schedule


    created_at = Column(DateTime(timezone=True), server_default=func.now())

    events = relationship("Event", back_populates="camera")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    timestamp_start = Column(DateTime(timezone=True), nullable=False)
    timestamp_end = Column(DateTime(timezone=True), nullable=True)
    type = Column(String) # video | snapshot
    event_type = Column(String) # motion | manual | scheduled
    file_path = Column(String)
    thumbnail_path = Column(String, nullable=True)
    file_size = Column(Integer, default=0) # Size in bytes
    motion_score = Column(Float, nullable=True)
    
    camera = relationship("Camera", back_populates="events")

class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(String, nullable=True)
    description = Column(String, nullable=True)
