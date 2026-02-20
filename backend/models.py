from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    rtsp_url = Column(String, nullable=False)
    location = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Video Device
    resolution_width = Column(Integer, default=800)
    resolution_height = Column(Integer, default=600)
    framerate = Column(Integer, default=15)
    rotation = Column(Integer, default=0) # 0, 90, 180, 270
    auto_resolution = Column(Boolean, default=True)

    # Text Overlay
    text_left = Column(String, default="Camera Name")
    text_right = Column(String, default="%Y-%m-%d %H:%M:%S")
    text_scale = Column(Float, default=1.0)


    

    # Movies
    movie_file_name = Column(String, default="%Y-%m-%d/%H-%M-%S")
    movie_quality = Column(Integer, default=75)
    movie_passthrough = Column(Boolean, default=False)
    recording_mode = Column(String, default="Motion Triggered")
    previous_recording_mode = Column(String, nullable=True)  # Stores mode before manual override
    max_movie_length = Column(Integer, default=120)
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
    despeckle_filter = Column(Boolean, default=False)
    motion_gap = Column(Integer, default=10) # seconds
    captured_before = Column(Integer, default=2) # seconds
    captured_after = Column(Integer, default=2) # seconds
    min_motion_frames = Column(Integer, default=2)
    show_frame_changes = Column(Boolean, default=True)
    
    # Advanced Motion Detection
    auto_threshold_tuning = Column(Boolean, default=True)
    auto_noise_detection = Column(Boolean, default=True)
    light_switch_detection = Column(Integer, default=0)
    mask = Column(Boolean, default=False)
    create_debug_media = Column(Boolean, default=False)

    # Notification Destinations
    notify_webhook_url = Column(String, nullable=True)
    notify_telegram_token = Column(String, nullable=True)
    notify_telegram_chat_id = Column(String, nullable=True)
    notify_email_address = Column(String, nullable=True)

    # Health Notification Destinations (Overrides generic if set)
    notify_health_webhook_url = Column(String, nullable=True)
    notify_health_telegram_token = Column(String, nullable=True)
    notify_health_telegram_chat_id = Column(String, nullable=True)
    notify_health_email_recipient = Column(String, nullable=True)

    notify_start_email = Column(Boolean, default=False)
    notify_start_telegram = Column(Boolean, default=False)
    notify_start_webhook = Column(Boolean, default=False)
    notify_start_command = Column(Boolean, default=False)
    notify_end_webhook = Column(Boolean, default=False)
    notify_end_command = Column(Boolean, default=False)
    
    # Health Notifications
    notify_health_email = Column(Boolean, default=False)
    notify_health_telegram = Column(Boolean, default=False)
    notify_health_webhook = Column(Boolean, default=False)
    
    notify_attach_image_email = Column(Boolean, default=True)
    notify_attach_image_telegram = Column(Boolean, default=True)


    # Schedule
    detect_motion_mode = Column(String, default="Always") # Always | Working Schedule
    
    schedule_monday = Column(Boolean, default=True)
    schedule_monday_start = Column(String, default="00:00")
    schedule_monday_end = Column(String, default="23:59")
    
    schedule_tuesday = Column(Boolean, default=True)
    schedule_tuesday_start = Column(String, default="00:00")
    schedule_tuesday_end = Column(String, default="23:59")
    
    schedule_wednesday = Column(Boolean, default=True)
    schedule_wednesday_start = Column(String, default="00:00")
    schedule_wednesday_end = Column(String, default="23:59")
    
    schedule_thursday = Column(Boolean, default=True)
    schedule_thursday_start = Column(String, default="00:00")
    schedule_thursday_end = Column(String, default="23:59")
    
    schedule_friday = Column(Boolean, default=True)
    schedule_friday_start = Column(String, default="00:00")
    schedule_friday_end = Column(String, default="23:59")
    
    schedule_saturday = Column(Boolean, default=True)
    schedule_saturday_start = Column(String, default="00:00")
    schedule_saturday_end = Column(String, default="23:59")
    
    schedule_sunday = Column(Boolean, default=True)
    schedule_sunday_start = Column(String, default="00:00")
    schedule_sunday_end = Column(String, default="23:59")


    created_at = Column(DateTime(timezone=True), server_default=func.now())

    events = relationship("Event", back_populates="camera", cascade="all, delete-orphan")
    
    # Groups (Many-to-Many)
    groups = relationship("CameraGroup", secondary="camera_group_association", back_populates="cameras")

# Association Table
class CameraGroupAssociation(Base):
    __tablename__ = "camera_group_association"
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), primary_key=True)
    group_id = Column(Integer, ForeignKey("camera_groups.id", ondelete="CASCADE"), primary_key=True)

class CameraGroup(Base):
    __tablename__ = "camera_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)

    cameras = relationship("Camera", secondary="camera_group_association", back_populates="groups")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), index=True, nullable=False)
    timestamp_start = Column(DateTime(timezone=True), nullable=False, index=True)
    timestamp_end = Column(DateTime(timezone=True), nullable=True)
    type = Column(String) # video | snapshot
    event_type = Column(String) # motion | manual | scheduled
    file_path = Column(String)
    thumbnail_path = Column(String, nullable=True)
    file_size = Column(Integer, default=0) # Size in bytes
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    motion_score = Column(Float, nullable=True)
    
    camera = relationship("Camera", back_populates="events")

class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(String, nullable=True)
    description = Column(String, nullable=True)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="viewer") # "admin", "viewer"
    avatar_path = Column(String, nullable=True)
    totp_secret = Column(String, nullable=True)
    is_2fa_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ApiToken(Base):
    __tablename__ = "api_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # Configurable name
    token_hash = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    is_active = Column(Boolean, default=True)
    
    created_by = relationship("User")

class TrustedDevice(Base):
    __tablename__ = "trusted_devices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True) # e.g. "Chrome on Linux"
    last_used = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True) # Optional, can rely on manual revocation or cleanup job
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="trusted_devices")
