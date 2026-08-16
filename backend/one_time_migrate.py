from sqlalchemy import text, inspect
from database import engine

def migrate():
    with engine.connect() as conn:
        print("Checking for width/height columns in events table...")
        try:
            # Check if columns exist
            inspector = inspect(engine)
            columns = [col['name'] for col in inspector.get_columns('events')]
            if 'width' not in columns:
                print("Adding width column...")
                conn.execute(text("ALTER TABLE events ADD COLUMN width INTEGER"))
            
            if 'height' not in columns:
                print("Adding height column...")
                conn.execute(text("ALTER TABLE events ADD COLUMN height INTEGER"))
            
            conn.commit()
            print("Migration completed successfully.")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
