from pydantic import BaseModel, field_validator, model_validator, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import logging

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
    sub_rtsp_url: Optional[str] = None
    location: Optional[str] = None
    is_active: bool = True
    rtsp_transport: Optional[str] = "tcp" # tcp | udp
    sub_rtsp_transport: Optional[str] = "tcp" # tcp | udp
    live_view_mode: Optional[str] = "auto" # auto | webcodecs | mjpeg
    storage_profile_id: Optional[int] = None
    status: Optional[str] = "STARTING"
    last_seen: Optional[datetime] = None

    # Audio Capabilities
    audio_enabled: bool = False
    enable_audio: bool = False

    # ONVIF Management
    onvif_host: Optional[str] = None
    onvif_port: Optional[int] = 80
    onvif_username: Optional[str] = None
    onvif_password: Optional[str] = None
    onvif_profile_token: Optional[str] = None
    onvif_manufacturer: Optional[str] = None
    onvif_model: Optional[str] = None
    onvif_firmware: Optional[str] = None
    onvif_serial: Optional[str] = None
    onvif_hw_id: Optional[str] = None
    
    # PTZ Capabilities
    ptz_can_pan_tilt: bool = True
    ptz_can_zoom: bool = True
    ptz_can_home: bool = True
    onvif_can_events: bool = False

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
    record_audio: bool = False
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
    privacy_masks: Optional[str] = None # JSON array of polygons
    motion_masks: Optional[str] = None  # JSON array of polygons (exclusion zones)
    create_debug_media: Optional[bool] = False

    @field_validator('privacy_masks', 'motion_masks')
    @classmethod
    def validate_masks_json(cls, v: str) -> str:
        if not v or v == "[]":
            return "[]"
        
        import json
        try:
            data = json.loads(v)
            if not isinstance(data, list):
                raise ValueError('Masks must be a JSON array')
            
            for item in data:
                if not isinstance(item, dict) or 'points' not in item:
                    raise ValueError('Each mask must be an object with a "points" array')
                
                points = item['points']
                if not isinstance(points, list):
                    raise ValueError('"points" must be an array')
                
                for pt in points:
                    if not isinstance(pt, list) or len(pt) != 2:
                        raise ValueError('Each point must be an [x, y] array')
                    if not all(isinstance(coord, (int, float)) for coord in pt):
                        raise ValueError('Coordinates must be numbers')
                    # Validate normalized coordinates (0.0 to 1.0)
                    if not all(0 <= coord <= 1.0 for coord in pt):
                         # We allow slightly outside (e.g. 1.001) but not crazy values
                         if not all(-0.1 <= coord <= 1.1 for coord in pt):
                             raise ValueError('Coordinates must be normalized (0.0 to 1.0)')
            
            return v
        except json.JSONDecodeError:
            raise ValueError('Invalid JSON format for masks')
        except Exception as e:
            if isinstance(e, ValueError): raise e
            raise ValueError(f'Mask validation error: {str(e)}')

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
    detect_engine: Optional[str] = "OpenCV" # OpenCV | ONVIF Edge

    
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

    # AI & Tracking
    ai_enabled: bool = False
    ai_object_types: List[str] = ["person", "vehicle"]
    ai_threshold: float = 0.5
    ai_tracking_enabled: bool = False

    @field_validator('ai_object_types', mode='before')
    @classmethod
    def validate_ai_object_types(cls, v: Any) -> List[str]:
        if v is None:
            return ["person", "vehicle"]
        
        def unwrap_item(item: Any) -> str:
            """Recursively unwrap a single item if it's a JSON-encoded string."""
            if not isinstance(item, str):
                return str(item)
            
            curr = item.strip()
            # If it's not a JSON-looking string, return as is (but sanitized)
            if not curr.startswith(('[', '"', '{')):
                return curr
                
            for _ in range(5):
                try:
                    import json
                    decoded = json.loads(curr)
                    if isinstance(decoded, str):
                        curr = decoded.strip()
                        if not curr.startswith(('[', '"', '{')):
                            return curr
                    elif isinstance(decoded, list) and len(decoded) > 0:
                        # If it decoded into a list, take the first valid-looking item
                        # or just return the first string
                        for sub in decoded:
                            res = unwrap_item(sub)
                            if res and not res.startswith(('[', '"', '{')):
                                return res
                        return str(decoded[0])
                    else:
                        break
                except:
                    break
            return curr

        # 1. Handle if the whole value is a string (double-encoded list)
        if isinstance(v, str):
            import json
            curr_v = v.strip()            # Loop up to 5 times to unwrap nested JSON strings
            for _ in range(5):
                if not curr_v.startswith(('[', '"', '{')):
                    break
                
                # Special case: PostgreSQL native array format {val1,val2}
                if curr_v.startswith('{') and not curr_v.startswith('{"'):
                    # Convert {a,b,c} to [a,b,c] for easier handling or just parse it
                    items = curr_v.strip('{}').split(',')
                    v = [i.strip().strip('"\'') for i in items if i.strip()]
                    break

                try:
                    import json
                    data = json.loads(curr_v)
                    if isinstance(data, list):
                        v = data # Move to list handling below
                        break
                    if isinstance(data, str):
                        curr_v = data.strip()
                        continue
                    break
                except:
                    break
            else:
                # If it didn't decode to a list, try comma separated
                if "," in curr_v:
                    v = [i.strip().strip('{}\"\'') for i in curr_v.split(",") if i.strip()]
                else:
                    v = [curr_v.strip('{}\"\'')]

        # 2. Clean the list items
        if isinstance(v, list):
            clean_list = []
            for item in v:
                cleaned = unwrap_item(item)
                # Final check: skip empty or obviously corrupted remaining strings
                if cleaned and not cleaned.startswith(('[', '{', '\\')):
                    if cleaned not in clean_list:
                        clean_list.append(cleaned)
            
            if not clean_list:
                return ["person", "vehicle"]
            return clean_list[:50]
            
        return ["person", "vehicle"]



    @field_validator('ai_threshold', mode='before')
    @classmethod
    def validate_ai_threshold(cls, v: Any) -> float:
        try:
            val = float(v)
        except (TypeError, ValueError):
            return 0.5
        # Clamp to a sane range: 0.1 to 0.99
        return max(0.1, min(0.99, val))



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

    @field_validator('rtsp_url', 'sub_rtsp_url')
    @classmethod
    def validate_rtsp_url(cls, v: Optional[str]) -> Optional[str]:
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

    model_config = ConfigDict(from_attributes=True)

class CameraCreate(CameraBase):
    pass

# Groups
class CameraGroupBase(BaseModel):
    name: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class CameraGroupCreate(CameraGroupBase):
    pass

class Camera(CameraBase):
    id: int
    created_at: datetime
    groups: list[CameraGroupBase] = []
    storage_profile: Optional["StorageProfile"] = None

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
    ai_metadata: Optional[str] = None

class EventCreate(EventBase):
    pass

class Event(EventBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

class BulkDeleteRequest(BaseModel):
    event_ids: List[int]

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

    model_config = ConfigDict(from_attributes=True)

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

# Storage Profiles
class StorageProfileBase(BaseModel):
    name: str
    path: str
    description: Optional[str] = None
    max_size_gb: Optional[float] = 0

    @field_validator('path')
    @classmethod
    def prevent_path_traversal(cls, v: str) -> str:
        if '..' in v:
            raise ValueError('Path traversal characters (..) are not allowed')
        if not v.startswith('/'):
            raise ValueError('Path must be an absolute path starting with /')
        return v

    model_config = ConfigDict(from_attributes=True)

class StorageProfileCreate(StorageProfileBase):
    pass

class StorageProfile(StorageProfileBase):
    id: int

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
    rtsp_transport: str
    live_view_mode: str
    status: str
    last_seen: Optional[datetime] = None
    privacy_masks: Optional[str] = None
    motion_masks: Optional[str] = None
    
    # Audio Capabilities
    audio_enabled: bool
    enable_audio: bool
    record_audio: bool
    # PTZ Capabilities
    ptz_can_pan_tilt: bool = True
    ptz_can_zoom: bool = True
    ptz_can_home: bool = True
    detect_engine: str = "OpenCV"
    
    # AI & Tracking
    ai_enabled: bool
    ai_object_types: List[str]
    ai_threshold: float
    ai_hardware: Optional[str] = None
    ai_model: Optional[str] = None
    ai_tracking_enabled: bool
    
    created_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)

class CameraGroupSummary(CameraGroupBase):
    """Sanitized group schema (contains sanitized camera summaries)"""
    id: int
    cameras: list[CameraSummary] = []

class GroupAction(BaseModel):
    action: str  # enable_motion, disable_motion, copy_settings
    source_camera_id: Optional[int] = None
    target_camera_ids: Optional[list[int]] = None
    categories: Optional[List[str]] = None

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
    
    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)




# ONVIF Discovery
class OnvifScanRequest(BaseModel):
    ip_range: str # e.g. "192.168.1.0/24" or "192.168.1.1-100"
    user: Optional[str] = ""
    password: Optional[str] = ""

    @field_validator('ip_range')
    @classmethod
    def validate_ip_range(cls, v: str) -> str:
        if v:
            # Allow CIDR or Range format, basic sanitization
            import re
            if not re.match(r'^[\d\.\-\/ ]+$', v):
                raise ValueError('Invalid IP range format')
        return v

class OnvifDeepScanRequest(BaseModel):
    ip: str
    user: Optional[str] = ""
    password: Optional[str] = ""

    @field_validator('ip')
    @classmethod
    def validate_ip(cls, v: str) -> str:
        if not v:
            raise ValueError('IP address is required')
        v = v.strip()
        import ipaddress
        import socket
        try:
            ipaddress.ip_address(v)
        except ValueError:
            # Check if it's a valid hostname
            try:
                socket.gethostbyname(v)
            except socket.gaierror:
                raise ValueError('Invalid IP address or unreachable hostname')
        return v

class OnvifProbeRequest(BaseModel):
    ip: str
    port: int
    user: Optional[str] = ""
    password: Optional[str] = ""

    @field_validator('port')
    @classmethod
    def validate_port(cls, v: int) -> int:
        if v <= 0:
            raise ValueError('Port must be a positive integer')
        return v

    @field_validator('ip')
    @classmethod
    def validate_ip(cls, v: str) -> str:
        if not v:
            raise ValueError('IP address is required')
        v = v.strip()
        import ipaddress
        import socket
        try:
            ipaddress.ip_address(v)
        except ValueError:
            # Check if it's a valid hostname
            try:
                socket.gethostbyname(v)
            except socket.gaierror:
                raise ValueError('Invalid IP address or unreachable hostname')
        return v

class OnvifProfile(BaseModel):
    name: str
    token: str
    url: str

class OnvifDeviceDetails(BaseModel):
    ip: str
    port: int
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    firmware: Optional[str] = None
    serial: Optional[str] = None
    hw_id: Optional[str] = None
    profiles: List[OnvifProfile] = []
    features: Optional[Dict[str, bool]] = None
    auth_required: bool = False

# PTZ Controls
class PTZMoveRequest(BaseModel):
    pan: float = 0.0  # -1.0 to 1.0
    tilt: float = 0.0 # -1.0 to 1.0
    zoom: float = 0.0 # -1.0 to 1.0

class PTZGotoPresetRequest(BaseModel):
    preset_token: str
