from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://vibenvr:vibenvrpass@db:5432/vibenvr")

engine = create_engine(
    DATABASE_URL,
    pool_size=50,       # Initial pool size
    max_overflow=50,    # Allow up to 50 more connections
    pool_timeout=30,    # Wait 30s before timing out
    pool_recycle=1800   # Recycle connections every 30 mins
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

from contextlib import contextmanager

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Also provide a version that can be used with 'with' stmt
get_db_ctx = contextmanager(get_db)
