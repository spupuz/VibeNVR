from database import engine, Base
from sqlalchemy import text

def add_column_if_not_exists(engine, table_name, column_name, column_type, default_val=None):
    with engine.connect() as conn:
        # Check if column exists
        query = text(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table_name}' AND column_name='{column_name}'")
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
    add_column_if_not_exists(engine, "cameras", "movie_passthrough", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "movie_quality", "INTEGER", 75)
    add_column_if_not_exists(engine, "cameras", "recording_mode", "VARCHAR", "Motion Triggered")
    add_column_if_not_exists(engine, "cameras", "previous_recording_mode", "VARCHAR")  # For toggle state memory
    add_column_if_not_exists(engine, "cameras", "max_movie_length", "INTEGER", 0)
    add_column_if_not_exists(engine, "cameras", "preserve_movies", "VARCHAR", "For One Week")

    # Motion Detection
    add_column_if_not_exists(engine, "cameras", "auto_threshold_tuning", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "auto_noise_detection", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "light_switch_detection", "INTEGER", 0)
    add_column_if_not_exists(engine, "cameras", "despeckle_filter", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "motion_gap", "INTEGER", 10)
    add_column_if_not_exists(engine, "cameras", "captured_before", "INTEGER", 30)
    add_column_if_not_exists(engine, "cameras", "captured_after", "INTEGER", 30)
    add_column_if_not_exists(engine, "cameras", "min_motion_frames", "INTEGER", 2)
    add_column_if_not_exists(engine, "cameras", "mask", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "show_frame_changes", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "create_debug_media", "BOOLEAN", False)

    # Notification Destinations
    add_column_if_not_exists(engine, "cameras", "notify_webhook_url", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_telegram_token", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_telegram_chat_id", "VARCHAR")
    add_column_if_not_exists(engine, "cameras", "notify_email_address", "VARCHAR")

    # Notifications

    add_column_if_not_exists(engine, "cameras", "notify_start_email", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_start_telegram", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_start_webhook", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_start_command", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_end_webhook", "BOOLEAN", False)
    add_column_if_not_exists(engine, "cameras", "notify_end_command", "BOOLEAN", False)
    
    add_column_if_not_exists(engine, "cameras", "notify_attach_image_email", "BOOLEAN", True)
    add_column_if_not_exists(engine, "cameras", "notify_attach_image_telegram", "BOOLEAN", True)

    # Schedule
    # Schedule
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for day in days:
        add_column_if_not_exists(engine, "cameras", f"schedule_{day}", "BOOLEAN", True)
        add_column_if_not_exists(engine, "cameras", f"schedule_{day}_start", "VARCHAR", "00:00")
        add_column_if_not_exists(engine, "cameras", f"schedule_{day}_end", "VARCHAR", "23:59")
    
    add_column_if_not_exists(engine, "cameras", "detect_motion_mode", "VARCHAR", "Always")

if __name__ == "__main__":
    print("Starting migration...")
    migrate()
    print("Migration complete!")
