
import os
import sys
from sqlalchemy import create_engine, text
from database import Base, get_db

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://vibenvr:vibenvrpass@db:5432/vibenvr")

def cleanup_db():
    print(f"Connecting to database...")
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as connection:
        # Columns to drop from 'cameras'
        columns_to_drop = [
            "stream_url",
            "storage_path",
            "root_directory",
            "stream_quality",
            "stream_max_rate",
            "stream_port",
            "movie_passthrough",
            "auto_threshold_tuning",
            "auto_noise_detection",
            "light_switch_detection",
            "mask",
            "create_debug_media"
        ]

        print("Checking for columns to drop in 'cameras' table...")
        
        # Check existing columns first to avoid errors
        result = connection.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'cameras';"))
        existing_columns = [row[0] for row in result]
        
        for col in columns_to_drop:
            if col in existing_columns:
                print(f"Dropping column: {col}")
                try:
                    connection.execute(text(f"ALTER TABLE cameras DROP COLUMN {col};"))
                    connection.commit()
                    print(f" - Dropped {col}")
                except Exception as e:
                    print(f" - Error dropping {col}: {e}")
            else:
                print(f" - Column {col} does not exist (already clean)")

    print("Database cleanup complete.")

if __name__ == "__main__":
    cleanup_db()
