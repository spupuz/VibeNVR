from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime

class TestNotificationConfig(BaseModel):
    channel: str # 'email', 'telegram', 'webhook'
    settings: dict

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
    movie_passthrough: Optional[bool] = False
    recording_mode: Optional[str] = "Motion Triggered"
    previous_recording_mode: Optional[str] = None
    max_movie_length: Optional[int] = 120  # Default 2 minutes, range 60-300 (1-5 min)
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
    
    # Advanced Motion Detection
    auto_threshold_tuning: Optional[bool] = True
    auto_noise_detection: Optional[bool] = True
    light_switch_detection: Optional[int] = 0
    mask: Optional[bool] = False
    create_debug_media: Optional[bool] = False

    # Notification Destinations
    notify_webhook_url: Optional[str] = None
    notify_telegram_token: Optional[str] = None
    notify_telegram_chat_id: Optional[str] = None
    notify_email_address: Optional[str] = None

    # Health Notification Destinations
    notify_health_webhook_url: Optional[str] = None
    notify_health_telegram_token: Optional[str] = None
    notify_health_telegram_chat_id: Optional[str] = None
    notify_health_email_recipient: Optional[str] = None

    # Notifications
    notify_start_email: Optional[bool] = False
    notify_start_telegram: Optional[bool] = False
    notify_start_webhook: Optional[bool] = False
    notify_start_command: Optional[bool] = False
    notify_end_webhook: Optional[bool] = False
    notify_end_command: Optional[bool] = False
    
    # Health Notifications
    notify_health_email: Optional[bool] = False
    notify_health_telegram: Optional[bool] = False
    notify_health_webhook: Optional[bool] = False
    
    notify_attach_image_email: Optional[bool] = True




    # Schedule
    detect_motion_mode: Optional[str] = "Always"
    
    schedule_monday: Optional[bool] = True
    schedule_monday_start: Optional[str] = "00:00"
    schedule_monday_end: Optional[str] = "23:59"
    
    schedule_tuesday: Optional[bool] = True
    schedule_tuesday_start: Optional[str] = "00:00"
    schedule_tuesday_end: Optional[str] = "23:59"
    
    schedule_wednesday: Optional[bool] = True
    schedule_wednesday_start: Optional[str] = "00:00"
    schedule_wednesday_end: Optional[str] = "23:59"
    
    schedule_thursday: Optional[bool] = True
    schedule_thursday_start: Optional[str] = "00:00"
    schedule_thursday_end: Optional[str] = "23:59"
    
    schedule_friday: Optional[bool] = True
    schedule_friday_start: Optional[str] = "00:00"
    schedule_friday_end: Optional[str] = "23:59"
    
    schedule_saturday: Optional[bool] = True
    schedule_saturday_start: Optional[str] = "00:00"
    schedule_saturday_end: Optional[str] = "23:59"
    
    schedule_sunday: Optional[bool] = True
    schedule_sunday_start: Optional[str] = "00:00"
    schedule_sunday_end: Optional[str] = "23:59"

    @field_validator('max_movie_length')
    @classmethod
    def validate_max_movie_length(cls, v: Optional[int]) -> Optional[int]:
        if v is None or v == 0 or v > 300:
            return 300  # Cap at 5 minutes max
        if v < 60:
            return 60   # Minimum 1 minute
        return v

    @field_validator('movie_file_name', 'picture_file_name')
    @classmethod
    def prevent_path_traversal(cls, v: Optional[str]) -> Optional[str]:
        if v and ('..' in v or v.strip().startswith('/') or v.strip().startswith('\\')):
            raise ValueError('Path traversal characters (.., /) are not allowed')
        return v

    @field_validator('rtsp_url')
    @classmethod
    def validate_rtsp_url(cls, v: str) -> str:
        if v and v.strip().lower().startswith('file://'):
            raise ValueError('Local file access via file:// is not allowed')
        return v

    @field_validator('notify_webhook_url')
    @classmethod
    def validate_webhook_url(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
            
        import socket
        from urllib.parse import urlparse
        import ipaddress

        try:
            parsed = urlparse(v)
            if parsed.scheme not in ('http', 'https'):
                raise ValueError('Webhook must be http or https')
            
            hostname = parsed.hostname
            if not hostname:
                raise ValueError('Invalid webhook hostname')

            # Block localhost strings
            if hostname.lower() in ['localhost', 'loopback', '::1', '127.0.0.1']:
                 raise ValueError('Webhook cannot target localhost')

            # Resolve IP to check for private networks (Basic SSRF protection)
            # Note: This has race conditions (DNS rebinding) but good for "Vibe Coding" level
            try:
                ip_str = socket.gethostbyname(hostname)
                ip = ipaddress.ip_address(ip_str)
                if ip.is_loopback or ip.is_private or ip.is_reserved:
                    # Allow docker internal if user REALLY wants? 
                    # Usually we want to BLOCK access to other containers like 'engine' or 'db'
                    # But user might want to webhook to Home Assistant on same LAN.
                    # This is tricky. Let's block Loopback and Link Local.
                    # Blocking Private (192.168.x) might break Home Assistant integration.
                    # Compromise: Block Loopback, 127.0.0.0/8
                    if ip.is_loopback:
                        raise ValueError('Webhook cannot target loopback IP')
            except socket.gaierror:
                pass # DNS fail - might be unreachable, but let requests handle it?
                
        except ValueError as e:
            raise e
        except Exception:
             # If parsing fails, it's likely invalid
             pass
        return v

    class Config:
        from_attributes = True

class CameraCreate(CameraBase):
    pass

# Groups
class CameraGroupBase(BaseModel):
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True

class CameraGroupCreate(CameraGroupBase):
    pass

class Camera(CameraBase):
    id: int
    created_at: datetime
    groups: list[CameraGroupBase] = []

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



class CameraGroup(CameraGroupBase):
    id: int
    cameras: list[Camera] = []

    class Config:
        from_attributes = True

class GroupAction(BaseModel):
    action: str  # enable_motion, disable_motion, copy_settings
    source_camera_id: Optional[int] = None
    target_camera_ids: Optional[list[int]] = None

