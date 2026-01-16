from sqlalchemy import text
from database import engine

def migrate():
    with engine.connect() as conn:
        print("Checking for width/height columns in events table...")
        try:
            # Check if columns exist
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='events' AND column_name='width'"))
            if not result.fetchone():
                print("Adding width column...")
                conn.execute(text("ALTER TABLE events ADD COLUMN width INTEGER"))
            
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='events' AND column_name='height'"))
            if not result.fetchone():
                print("Adding height column...")
                conn.execute(text("ALTER TABLE events ADD COLUMN height INTEGER"))
            
            conn.commit()
            print("Migration completed successfully.")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
