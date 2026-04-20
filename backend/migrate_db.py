from database import engine, Base
from sqlalchemy import text
import models

def add_column_if_not_exists(engine, table_name, column_name, column_type, default_val=None):
    with engine.connect() as conn:
        # Check if column exists
        query = text(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table_name}' AND column_name='{column_name}'")  # nosec
        result = conn.execute(query).fetchone()
        
        if not result:
            print(f"Adding column {column_name} to {table_name}...")
            alter_query = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
            if default_val is not None:
                # Handle string defaults with quotes
                if isinstance(default_val, str):
                    alter_query += f" DEFAULT '{default_val}'"
                elif isinstance(default_val, bool):
                    alter_query += f" DEFAULT {'TRUE' if default_val else 'FALSE'}"
                else:
                    alter_query += f" DEFAULT {default_val}"
            
            conn.execute(text(alter_query))
            conn.commit()
            print(f"Added {column_name}.")
        else:
            print(f"Column {column_name} already exists.")

def migrate():
    # Video Device
    add_column_if_not_exists(engine, "cameras", "resolution_width", "INTEGER", 800)
    add_column_if_not_exists(engine, "cameras", "resolution_height", "INTEGER", 600)
    add_column_if_not_exists(engine, "cameras", "framerate", "INTEGER", 15)
    add_column_if_not_exists(engine, "cameras", "rotation", "INTEGER", 0)
    add_column_if_not_exists(engine, "cameras", "auto_resolution", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "sub_rtsp_url", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "rtsp_transport", "VARCHAR", "tcp")
    add_column_if_not_exists(engine, "cameras", "sub_rtsp_transport", "VARCHAR", "tcp")
    add_column_if_not_exists(engine, "cameras", "live_view_mode", "VARCHAR", "auto")
    add_column_if_not_exists(engine, "cameras", "status", "VARCHAR", "STARTING")
    add_column_if_not_exists(engine, "cameras", "last_seen", "TIMESTAMP WITH TIME ZONE")
    
    # Audio Capabilities
    add_column_if_not_exists(engine, "cameras", "audio_enabled", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "enable_audio", "BOOLEAN", False)

    # ONVIF Management
    add_column_if_not_exists(engine, "cameras", "onvif_host", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "onvif_port", "INTEGER", 80)
    add_column_if_not_exists(engine, "cameras", "onvif_username", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "onvif_password", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "onvif_profile_token", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "onvif_manufacturer", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "onvif_model", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "onvif_firmware", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "onvif_serial", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "onvif_hw_id", "VARCHAR")
    
    # PTZ Capabilities
    add_column_if_not_exists(engine, "cameras", "ptz_can_pan_tilt", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "ptz_can_zoom", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "ptz_can_home", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "onvif_can_events", "BOOLEAN", False)

    # Text Overlay
    add_column_if_not_exists(engine, "cameras", "text_left", "VARCHAR", "Camera Name")
    add_column_if_not_exists(engine, "cameras", "text_right", "VARCHAR", "%Y-%m-%d %H:%M:%S")
    add_column_if_not_exists(engine, "cameras", "text_scale", "FLOAT", 1.0)
    
    # File Storage
    add_column_if_not_exists(engine, "cameras", "storage_path", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "root_directory", "VARCHAR")

    # Streaming
    add_column_if_not_exists(engine, "cameras", "stream_url", "VARCHAR") 
    add_column_if_not_exists(engine, "cameras", "stream_quality", "INTEGER", 75)
    add_column_if_not_exists(engine, "cameras", "stream_max_rate", "INTEGER", 15)
    add_column_if_not_exists(engine, "cameras", "stream_port", "INTEGER")

    # Movies
    add_column_if_not_exists(engine, "cameras", "movie_file_name", "VARCHAR", "%Y-%m-%d/%H-%M-%S")
    add_column_if_not_exists(engine, "cameras", "movie_passthrough", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "movie_quality", "INTEGER", 75)
    add_column_if_not_exists(engine, "cameras", "recording_mode", "VARCHAR", "Motion Triggered")
    add_column_if_not_exists(engine, "cameras", "previous_recording_mode", "VARCHAR")  # For toggle state memory
    add_column_if_not_exists(engine, "cameras", "max_movie_length", "INTEGER", 0)
    add_column_if_not_exists(engine, "cameras", "record_audio", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "preserve_movies", "VARCHAR", "For One Week")
    add_column_if_not_exists(engine, "cameras", "max_storage_gb", "FLOAT", 0)

    # Still Images
    add_column_if_not_exists(engine, "cameras", "picture_file_name", "VARCHAR", "%Y-%m-%d/%H-%M-%S-%q")
    add_column_if_not_exists(engine, "cameras", "picture_quality", "INTEGER", 75)
    add_column_if_not_exists(engine, "cameras", "picture_recording_mode", "VARCHAR", "Manual")
    add_column_if_not_exists(engine, "cameras", "preserve_pictures", "VARCHAR", "Forever")
    add_column_if_not_exists(engine, "cameras", "enable_manual_snapshots", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "max_pictures_storage_gb", "FLOAT", 0)

    # Motion Detection
    add_column_if_not_exists(engine, "cameras", "threshold", "INTEGER", 1500)
    add_column_if_not_exists(engine, "cameras", "auto_threshold_tuning", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "auto_noise_detection", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "light_switch_detection", "INTEGER", 0)
    add_column_if_not_exists(engine, "cameras", "despeckle_filter", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "detect_motion_mode", "VARCHAR", "Always")
    add_column_if_not_exists(engine, "cameras", "detect_engine", "VARCHAR", "OpenCV")
    add_column_if_not_exists(engine, "cameras", "motion_gap", "INTEGER", 10)
    add_column_if_not_exists(engine, "cameras", "captured_before", "INTEGER", 2)
    add_column_if_not_exists(engine, "cameras", "captured_after", "INTEGER", 2)
    add_column_if_not_exists(engine, "cameras", "min_motion_frames", "INTEGER", 2)
    add_column_if_not_exists(engine, "cameras", "mask", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "show_frame_changes", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "create_debug_media", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "privacy_masks", "TEXT")
    add_column_if_not_exists(engine, "cameras", "motion_masks", "TEXT")

    # Notification Destinations
    add_column_if_not_exists(engine, "cameras", "notify_webhook_url", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_telegram_token", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_telegram_chat_id", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_email_address", "VARCHAR")

    # Health Notification Destinations
    add_column_if_not_exists(engine, "cameras", "notify_health_webhook_url", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_health_telegram_token", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_health_telegram_chat_id", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_health_email_recipient", "VARCHAR")

    # Notifications
    add_column_if_not_exists(engine, "cameras", "notify_start_email", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_start_telegram", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_start_webhook", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_start_command", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_end_webhook", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_end_command", "BOOLEAN", False)
    
    add_column_if_not_exists(engine, "cameras", "notify_attach_image_email", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "notify_attach_image_telegram", "BOOLEAN", True)

    # Health Notifications
    add_column_if_not_exists(engine, "cameras", "notify_health_email", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_health_telegram", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_health_webhook", "BOOLEAN", False)

    # Schedule
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for day in days:
        add_column_if_not_exists(engine, "cameras", f"schedule_{day}", "BOOLEAN", True)
        add_column_if_not_exists(engine, "cameras", f"schedule_{day}_start", "VARCHAR", "00:00")
        add_column_if_not_exists(engine, "cameras", f"schedule_{day}_end", "VARCHAR", "23:59")


    # Events Table Improvements
    add_column_if_not_exists(engine, "events", "event_type", "VARCHAR")
    add_column_if_not_exists(engine, "events", "file_size", "INTEGER", 0)
    add_column_if_not_exists(engine, "events", "width", "INTEGER")
    add_column_if_not_exists(engine, "events", "height", "INTEGER")
    add_column_if_not_exists(engine, "events", "motion_score", "FLOAT")
    add_column_if_not_exists(engine, "events", "thumbnail_path", "VARCHAR")

    # Users
    add_column_if_not_exists(engine, "users", "avatar_path", "VARCHAR")
    add_column_if_not_exists(engine, "users", "totp_secret", "VARCHAR")
    add_column_if_not_exists(engine, "users", "is_2fa_enabled", "BOOLEAN", False)

    # API Tokens (New Security Features)
    add_column_if_not_exists(engine, "api_tokens", "name", "VARCHAR", "Unnamed Token")
    add_column_if_not_exists(engine, "api_tokens", "expires_at", "TIMESTAMP WITH TIME ZONE")
    add_column_if_not_exists(engine, "api_tokens", "last_used_at", "TIMESTAMP WITH TIME ZONE")
    add_column_if_not_exists(engine, "api_tokens", "is_active", "BOOLEAN", True)

    # API Tokens (Fallback creation if create_all missed it)
    with engine.connect() as conn:
        try:
            # Simple check if table exists
            conn.execute(text("SELECT 1 FROM api_tokens LIMIT 1"))
        except:
            print("Creating api_tokens table via migration...")
            models.ApiToken.__table__.create(engine)
            conn.commit()
            print("api_tokens table created.")

    # Trusted Devices (Fallback creation)
    with engine.connect() as conn:
        try:
            conn.execute(text("SELECT 1 FROM trusted_devices LIMIT 1"))
        except:
            print("Creating trusted_devices table via migration...")
            models.TrustedDevice.__table__.create(engine)
            conn.commit()
            print("trusted_devices table created.")

    # Recovery Codes (Fallback creation)
    with engine.connect() as conn:
        try:
            conn.execute(text("SELECT 1 FROM recovery_codes LIMIT 1"))
        except:
            print("Creating recovery_codes table via migration...")
            models.RecoveryCode.__table__.create(engine)
            conn.commit()
            print("recovery_codes table created.")

    # Camera Group Improvements
    add_column_if_not_exists(engine, "camera_groups", "description", "VARCHAR")

    # Storage Profiles (New Feature)
    with engine.connect() as conn:
        try:
            conn.execute(text("SELECT 1 FROM storage_profiles LIMIT 1"))
        except:
            print("Creating storage_profiles table via migration...")
            models.StorageProfile.__table__.create(engine)
            conn.commit()
            print("storage_profiles table created.")
            
    # Add storage_profile_id to cameras
    add_column_if_not_exists(engine, "cameras", "storage_profile_id", "INTEGER")

    # [v1.27.1] Cleanup: Ensure detect_motion_mode is not 'Off' (which was disabled in new UI)
    # This prevents cameras from being stuck in a non-detecting state after upgrade.
    with engine.connect() as conn:
        print("Ensuring detect_motion_mode is not 'Off' (v1.27.1 upgrade)...")
        conn.execute(text("UPDATE cameras SET detect_motion_mode = 'Always' WHERE detect_motion_mode = 'Off' OR detect_motion_mode IS NULL"))
        conn.commit()

if __name__ == "__main__":
    print("Starting migration...")
    migrate()
    print("Migration complete!")
