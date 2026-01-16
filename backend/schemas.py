from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CameraBase(BaseModel):
    name: str
    rtsp_url: str
    location: Optional[str] = None
    is_active: bool = True

    # Video Device
    resolution_width: Optional[int] = 800
    resolution_height: Optional[int] = 600
    auto_resolution: Optional[bool] = True
    framerate: Optional[int] = 15
    rotation: Optional[int] = 0

    # Text Overlay
    text_left: Optional[str] = "Camera Name"
    text_right: Optional[str] = "%Y-%m-%d %H:%M:%S"
    text_scale: Optional[float] = 1.0





    # Movies
    movie_file_name: Optional[str] = "%Y-%m-%d/%H-%M-%S"
    movie_quality: Optional[int] = 75
    recording_mode: Optional[str] = "Motion Triggered"
    max_movie_length: Optional[int] = 0
    preserve_movies: Optional[str] = "For One Week"
    max_storage_gb: Optional[float] = 0  # 0 = unlimited

    # Still Images
    picture_file_name: Optional[str] = "%Y-%m-%d/%H-%M-%S-%q"
    picture_quality: Optional[int] = 75
    picture_recording_mode: Optional[str] = "Manual"
    preserve_pictures: Optional[str] = "Forever"
    enable_manual_snapshots: Optional[bool] = True
    max_pictures_storage_gb: Optional[float] = 0

    # Motion Detection
    threshold: Optional[int] = 1500
    despeckle_filter: Optional[bool] = False
    motion_gap: Optional[int] = 10
    captured_before: Optional[int] = 30
    captured_after: Optional[int] = 30
    min_motion_frames: Optional[int] = 2
    show_frame_changes: Optional[bool] = True

    # Notification Destinations
    notify_webhook_url: Optional[str] = None
    notify_telegram_token: Optional[str] = None
    notify_telegram_chat_id: Optional[str] = None
    notify_email_address: Optional[str] = None

    # Notifications
    notify_start_email: Optional[bool] = False
    notify_start_telegram: Optional[bool] = False
    notify_start_webhook: Optional[bool] = False
    notify_start_command: Optional[bool] = False
    notify_end_webhook: Optional[bool] = False
    notify_end_command: Optional[bool] = False




    # Schedule
    schedule_monday: Optional[bool] = True
    schedule_tuesday: Optional[bool] = True
    schedule_wednesday: Optional[bool] = True
    schedule_thursday: Optional[bool] = True
    schedule_friday: Optional[bool] = True
    schedule_saturday: Optional[bool] = True
    schedule_sunday: Optional[bool] = True
    detect_motion_mode: Optional[str] = "Always"

class CameraCreate(CameraBase):
    pass

class Camera(CameraBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class EventBase(BaseModel):
    camera_id: int
    timestamp_start: datetime
    timestamp_end: Optional[datetime] = None
    type: str
    event_type: str
    file_path: str
    file_size: Optional[int] = 0
    thumbnail_path: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    motion_score: Optional[float] = None

class EventCreate(EventBase):
    pass

class Event(EventBase):
    id: int

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    role: str = "viewer"

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: bool = True # inherited logic? No model has active.
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserPasswordUpdate(BaseModel):
    old_password: Optional[str] = None
    new_password: str

# Groups
class CameraGroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class CameraGroupCreate(CameraGroupBase):
    pass

class CameraGroup(CameraGroupBase):
    id: int
    cameras: list[Camera] = []

    class Config:
        from_attributes = True

class GroupAction(BaseModel):
    action: str  # enable_motion, disable_motion, copy_settings
    source_camera_id: Optional[int] = None
    target_camera_ids: Optional[list[int]] = None

