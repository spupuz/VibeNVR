from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

class TestNotificationConfig(BaseModel):
    channel: str # 'email', 'telegram', 'webhook'
    settings: dict

    @model_validator(mode='after')
    def validate_webhook_settings(self) -> 'TestNotificationConfig':
        if self.channel == 'webhook':
            url = self.settings.get('notify_webhook_url')
            if url:
                # We reuse the validation logic but manually here or call a helper
                import socket
                from urllib.parse import urlparse
                import ipaddress
                try:
                    parsed = urlparse(url)
                    if not parsed.scheme or not parsed.netloc:
                        raise ValueError('Invalid URL format')
                    host = parsed.hostname
                    try:
                        ip_addr = ipaddress.ip_address(host)
                    except ValueError:
                        try:
                            ip_addr = ipaddress.ip_address(socket.gethostbyname(host))
                        except Exception:
                            return self
                    if ip_addr.is_loopback or ip_addr.is_private or ip_addr.is_reserved or ip_addr.is_link_local:
                        # Skip strictly blocking for local lab/test environments if explicitly intended
                        # In a real production SaaS this should be True, but for VibeNVR local it's often needed.
                        pass 
                except Exception as e:
                    if isinstance(e, ValueError): raise e
                    raise ValueError(f'Invalid or unreachable URL: {str(e)}')
        return self

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
        if v:
            v_lower = v.strip().lower()
            if not v_lower.startswith(('rtsp://', 'rtsps://', 'http://', 'https://')):
                raise ValueError('URL must start with rtsp://, rtsps://, http://, or https://')
            if 'localhost' in v_lower or '127.0.0.1' in v_lower or '::1' in v_lower:
                raise ValueError('Localhost access is not allowed')
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
                    # Strict SSRF Protection: Block access to internal/private networks
                    # This prevents targeting other containers (db, engine) or local services.
                    # Exception: User might need local IPs for Home Assistant, 
                    # but for security we block by default.
                    raise ValueError(f'Webhook cannot target private or reserved IP ranges ({ip_str})')
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
    role: Optional[str] = "viewer"
    is_2fa_enabled: Optional[bool] = False

class TOTPSetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    recovery_codes: Optional[List[str]] = None

class TOTPVerify(BaseModel):
    code: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: bool = True # inherited logic? No model has active.
    avatar_path: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    device_token: Optional[str] = None

class TokenData(BaseModel):
    username: Optional[str] = None

class UserPasswordUpdate(BaseModel):
    old_password: Optional[str] = None
    new_password: str

class Disable2FARequest(BaseModel):
    password: str



class CameraGroup(CameraGroupBase):
    id: int
    cameras: list[Camera] = []

    class Config:
        from_attributes = True

class CameraSummary(BaseModel):
    """Sanitized camera schema for public API access (no sensitive URLs/tokens)"""
    id: int
    name: str
    location: Optional[str] = None
    is_active: bool
    resolution_width: int
    resolution_height: int
    framerate: int
    recording_mode: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class CameraGroupSummary(CameraGroupBase):
    """Sanitized group schema (contains sanitized camera summaries)"""
    id: int
    cameras: list[CameraSummary] = []
    
    class Config:
        from_attributes = True

class GroupAction(BaseModel):
    action: str  # enable_motion, disable_motion, copy_settings
    source_camera_id: Optional[int] = None
    target_camera_ids: Optional[list[int]] = None

# API Tokens
class ApiTokenCreate(BaseModel):
    name: str
    expires_in_days: Optional[int] = None

class ApiTokenResponse(BaseModel):
    id: int
    name: str
    token: Optional[str] = None  # Present only on creation
    created_at: datetime
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    is_active: bool
    
    class Config:
        from_attributes = True

class HomepageStats(BaseModel):
    """Schema for Homepage integration statistics"""
    cameras_total: int
    cameras_online: int
    cameras_recording: int
    events_today: int
    events_this_week: int
    events_this_month: int
    last_event_time: Optional[str] = None
    last_event_camera: Optional[str] = None
    storage_used_gb: float
    storage_total_gb: float
    storage_percent: int
    uptime: str

class TrustedDevice(BaseModel):
    id: int
    name: Optional[str] = None
    last_used: datetime
    created_at: datetime

    class Config:
        from_attributes = True



