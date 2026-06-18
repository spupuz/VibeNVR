import pytest
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, Camera, Event
import crud
import schemas

# Setup SQLite in-memory database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def sample_data(db):
    # Create two cameras
    camera1 = Camera(name="Camera 1", rtsp_url="rtsp://cam1")
    camera2 = Camera(name="Camera 2", rtsp_url="rtsp://cam2")
    db.add_all([camera1, camera2])
    db.commit()
    db.refresh(camera1)
    db.refresh(camera2)

    # Use a fixed date for reliable testing
    local_tz = ZoneInfo("Europe/Rome") # Matching the default in crud.py
    # Midnight in local time
    base_date_local = datetime(2023, 10, 25, 0, 0, 0, tzinfo=local_tz)

    # Create events for Camera 1
    event1 = Event(
        camera_id=camera1.id,
        type="motion",
        timestamp_start=base_date_local + timedelta(hours=10) # 10:00 AM local
    )
    event2 = Event(
        camera_id=camera1.id,
        type="object",
        timestamp_start=base_date_local + timedelta(hours=15) # 03:00 PM local
    )

    # Create event for Camera 2
    event3 = Event(
        camera_id=camera2.id,
        type="motion",
        timestamp_start=base_date_local + timedelta(days=1, hours=8) # Next day 8:00 AM local
    )

    db.add_all([event1, event2, event3])
    db.commit()

    return {
        "camera1": camera1,
        "camera2": camera2,
        "event1": event1,
        "event2": event2,
        "event3": event3,
        "base_date": base_date_local
    }

def test_get_events_no_filters(db, sample_data):
    events = crud.get_events(db)
    assert len(events) == 3
    # crud.get_events orders by timestamp_start.desc()
    assert events[0].id == sample_data["event3"].id
    assert events[1].id == sample_data["event2"].id
    assert events[2].id == sample_data["event1"].id

def test_get_events_by_camera_id(db, sample_data):
    events = crud.get_events(db, camera_id=sample_data["camera1"].id)
    assert len(events) == 2
    assert all(e.camera_id == sample_data["camera1"].id for e in events)

def test_get_events_by_type(db, sample_data):
    events = crud.get_events(db, type="motion")
    assert len(events) == 2
    assert all(e.type == "motion" for e in events)

def test_get_events_by_date(db, sample_data, monkeypatch):
    import os
    # Ensure TZ is set consistently for the test
    monkeypatch.setenv("TZ", "Europe/Rome")

    # Should get events from 2023-10-25
    events = crud.get_events(db, date="2023-10-25")
    assert len(events) == 2
    assert sample_data["event1"] in events
    assert sample_data["event2"] in events

    # Should get events from 2023-10-26
    events_next_day = crud.get_events(db, date="2023-10-26")
    assert len(events_next_day) == 1
    assert sample_data["event3"] in events_next_day

def test_get_events_combined_filters(db, sample_data, monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Rome")

    events = crud.get_events(
        db,
        camera_id=sample_data["camera1"].id,
        type="object",
        date="2023-10-25"
    )
    assert len(events) == 1
    assert events[0].id == sample_data["event2"].id

def test_get_events_no_matches(db, sample_data, monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Rome")

    # Wrong type
    events1 = crud.get_events(db, type="nonexistent")
    assert len(events1) == 0

    # Wrong date
    events2 = crud.get_events(db, date="2020-01-01")
    assert len(events2) == 0

    # Wrong camera
    events3 = crud.get_events(db, camera_id=999)
    assert len(events3) == 0

def test_get_events_pagination(db, sample_data):
    events_limit1 = crud.get_events(db, limit=1)
    assert len(events_limit1) == 1
    assert events_limit1[0].id == sample_data["event3"].id

    events_skip1 = crud.get_events(db, skip=1)
    assert len(events_skip1) == 2
    assert events_skip1[0].id == sample_data["event2"].id
    assert events_skip1[1].id == sample_data["event1"].id
