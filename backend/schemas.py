from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CameraBase(BaseModel):
    name: str
    rtsp_url: str
    stream_url: Optional[str] = None
    location: Optional[str] = None
    is_active: bool = True

    # Video Device
    resolution_width: Optional[int] = 800
    resolution_height: Optional[int] = 600
    framerate: Optional[int] = 15
    rotation: Optional[int] = 0

    # Text Overlay
    text_left: Optional[str] = "Camera Name"
    text_right: Optional[str] = "%Y-%m-%d %H:%M:%S"
    text_scale: Optional[float] = 1.0

    # File Storage
    storage_path: Optional[str] = None
    root_directory: Optional[str] = None

    # Video Streaming
    stream_quality: Optional[int] = 75
    stream_max_rate: Optional[int] = 15
    stream_port: Optional[int] = None

    # Movies
    movie_file_name: Optional[str] = "%Y-%m-%d/%H-%M-%S"
    movie_passthrough: Optional[bool] = True
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
    auto_threshold_tuning: Optional[bool] = True
    auto_noise_detection: Optional[bool] = True
    light_switch_detection: Optional[int] = 0
    despeckle_filter: Optional[bool] = False
    motion_gap: Optional[int] = 10
    captured_before: Optional[int] = 30
    captured_after: Optional[int] = 30
    min_motion_frames: Optional[int] = 2
    mask: Optional[bool] = False
    show_frame_changes: Optional[bool] = True
    create_debug_media: Optional[bool] = False

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


    @property
    def computed_stream_url(self):
        if self.stream_url:
            return self.stream_url
        if hasattr(self, 'id') and self.id:
            port = 8100 + self.id
            return f"http://localhost:{port}/"
        return None

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
    motion_score: Optional[float] = None

class EventCreate(EventBase):
    pass

class Event(EventBase):
    id: int

    class Config:
        from_attributes = True
