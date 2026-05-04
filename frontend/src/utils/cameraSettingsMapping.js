export const CAMERA_SETTINGS_CATEGORIES = [
    { id: 'recording', label: 'Recording' },
    { id: 'snapshots', label: 'Snapshots' },
    { id: 'motion', label: 'Motion Detection' },
    { id: 'masks', label: 'Privacy & Masks' },
    { id: 'overlay', label: 'Text Overlay' },
    { id: 'alerts', label: 'Notifications' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'ai', label: 'AI & Tracking' }
];

export const CATEGORY_FIELD_MAP = {
    recording: ['recording_mode', 'movie_quality', 'movie_passthrough', 'max_movie_length', 'preserve_movies', 'max_storage_gb', 'live_view_mode', 'rtsp_transport', 'sub_rtsp_transport'],
    snapshots: ['picture_quality', 'picture_recording_mode', 'preserve_pictures', 'enable_manual_snapshots', 'max_pictures_storage_gb'],
    motion: [
        'threshold', 'despeckle_filter', 'motion_gap', 'captured_before', 'captured_after', 
        'min_motion_frames', 'show_frame_changes', 'auto_threshold_tuning', 
        'auto_noise_detection', 'light_switch_detection', 'detect_motion_mode', 'detect_engine',
        'framerate', 'rotation'
    ],
    masks: ['mask', 'privacy_masks', 'motion_masks'],
    overlay: ['text_left', 'text_right', 'text_scale'],
    alerts: [
        'notify_webhook_url', 'notify_telegram_token', 'notify_telegram_chat_id', 'notify_email_address',
        'notify_health_webhook_url', 'notify_health_telegram_token', 'notify_health_telegram_chat_id',
        'notify_health_email_recipient', 'notify_start_email', 'notify_start_telegram', 'notify_start_webhook',
        'notify_start_command', 'notify_end_webhook', 'notify_end_command', 'notify_health_email',
        'notify_health_telegram', 'notify_health_webhook', 'notify_attach_image_email', 'notify_attach_image_telegram'
    ],
    schedule: [
        'schedule_monday', 'schedule_monday_start', 'schedule_monday_end',
        'schedule_tuesday', 'schedule_tuesday_start', 'schedule_tuesday_end',
        'schedule_wednesday', 'schedule_wednesday_start', 'schedule_wednesday_end',
        'schedule_thursday', 'schedule_thursday_start', 'schedule_thursday_end',
        'schedule_friday', 'schedule_friday_start', 'schedule_friday_end',
        'schedule_saturday', 'schedule_saturday_start', 'schedule_saturday_end',
        'schedule_sunday', 'schedule_sunday_start', 'schedule_sunday_end'
    ],
    ai: ['ai_enabled', 'ai_object_types', 'ai_threshold', 'ai_tracking_enabled']
};

export const EXCLUDED_FIELDS = [
    'id', 'name', 'rtsp_url', 'sub_rtsp_url', 'stream_url', 'created_at', 'location', 'status', 'last_seen',
    'is_active', 'groups', 'storage_profile_id', 'onvif_host', 'onvif_port', 'onvif_username', 'onvif_password', 'onvif_profile_token',
    'resolution_width', 'resolution_height', 'auto_resolution', 'rtsp_username', 'rtsp_password', 'rtsp_host',
    'ptz_can_pan_tilt', 'ptz_can_zoom', 'onvif_can_events', '_sa_instance_state', 'previous_recording_mode'
];
