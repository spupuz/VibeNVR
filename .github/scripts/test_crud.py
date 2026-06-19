from unittest.mock import MagicMock, patch
import json
import pytest

from crud import update_camera
import crud
import models

def test_update_camera_success():
    # Setup mock DB session and query
    db_mock = MagicMock()
    query_mock = MagicMock()
    filter_mock = MagicMock()
    db_camera_mock = MagicMock(spec=models.Camera)
    db_camera_mock.id = 1
    db_camera_mock.name = "Old Camera Name"
    db_camera_mock.rtsp_url = "rtsp://old_url"

    db_mock.query.return_value = query_mock
    query_mock.filter.return_value = filter_mock
    filter_mock.first.return_value = db_camera_mock

    # Setup mock camera schema input
    camera_schema_mock = MagicMock()
    camera_schema_mock.dict.return_value = {
        "name": "New Camera Name",
        "rtsp_url": "rtsp://new_url",
        "is_active": False
    }

    # Call the function
    updated_camera = update_camera(db_mock, 1, camera_schema_mock)

    # Assertions
    assert updated_camera is db_camera_mock
    assert updated_camera.name == "New Camera Name"
    assert updated_camera.rtsp_url == "rtsp://new_url"
    assert updated_camera.is_active is False

    db_mock.commit.assert_called_once()
    db_mock.refresh.assert_called_once_with(db_camera_mock)


def test_update_camera_ai_object_types_list():
    # Setup mock DB session and query
    db_mock = MagicMock()
    query_mock = MagicMock()
    filter_mock = MagicMock()
    db_camera_mock = MagicMock(spec=models.Camera)
    db_camera_mock.id = 1

    db_mock.query.return_value = query_mock
    query_mock.filter.return_value = filter_mock
    filter_mock.first.return_value = db_camera_mock

    # Setup mock camera schema input with list
    camera_schema_mock = MagicMock()
    ai_types_list = ["person", "car", "dog"]
    camera_schema_mock.dict.return_value = {
        "ai_object_types": ai_types_list
    }

    # Call the function
    updated_camera = update_camera(db_mock, 1, camera_schema_mock)

    # Assertions
    assert updated_camera is db_camera_mock
    # Verify the ai_object_types field was correctly serialized
    assert updated_camera.ai_object_types == json.dumps(ai_types_list)

    db_mock.commit.assert_called_once()
    db_mock.refresh.assert_called_once_with(db_camera_mock)


def test_update_camera_not_found():
    # Setup mock DB session to return None for first()
    db_mock = MagicMock()
    query_mock = MagicMock()
    filter_mock = MagicMock()

    db_mock.query.return_value = query_mock
    query_mock.filter.return_value = filter_mock
    filter_mock.first.return_value = None

    camera_schema_mock = MagicMock()

    # Call the function
    updated_camera = update_camera(db_mock, 999, camera_schema_mock)

    # Assertions
    assert updated_camera is None
    db_mock.commit.assert_not_called()
    db_mock.refresh.assert_not_called()

from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Camera, Event
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
    camera1 = Camera(name="Camera 1", rtsp_url="rtsp://cam1")
    camera2 = Camera(name="Camera 2", rtsp_url="rtsp://cam2")
    db.add_all([camera1, camera2])
    db.commit()
    db.refresh(camera1)
    db.refresh(camera2)

    local_tz = ZoneInfo("Europe/Rome")
    base_date_local = datetime(2023, 10, 25, 0, 0, 0, tzinfo=local_tz)

    event1 = Event(
        camera_id=camera1.id,
        type="motion",
        timestamp_start=base_date_local + timedelta(hours=10)
    )
    event2 = Event(
        camera_id=camera1.id,
        type="object",
        timestamp_start=base_date_local + timedelta(hours=15)
    )
    event3 = Event(
        camera_id=camera2.id,
        type="motion",
        timestamp_start=base_date_local + timedelta(days=1, hours=8)
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

def test_get_events_by_camera_id(db, sample_data):
    events = crud.get_events(db, camera_id=sample_data["camera1"].id)
    assert len(events) == 2

def test_get_events_by_type(db, sample_data):
    events = crud.get_events(db, type="motion")
    assert len(events) == 2

def test_get_events_by_date(db, sample_data, monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Rome")
    events = crud.get_events(db, date="2023-10-25")
    assert len(events) == 2

def test_get_events_combined_filters(db, sample_data, monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Rome")
    events = crud.get_events(db, camera_id=sample_data["camera1"].id, type="object", date="2023-10-25")
    assert len(events) == 1

def test_get_events_no_matches(db, sample_data, monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Rome")
    assert len(crud.get_events(db, type="nonexistent")) == 0
    assert len(crud.get_events(db, date="2020-01-01")) == 0
    assert len(crud.get_events(db, camera_id=999)) == 0

def test_get_events_pagination(db, sample_data):
    assert len(crud.get_events(db, limit=1)) == 1
    assert len(crud.get_events(db, skip=1)) == 2

@patch('models.Camera')
def test_create_camera_json_serialization(mock_camera):
    # Mocking db session
    db_mock = MagicMock()

    # Mocking schema with list for ai_object_types
    camera_data = {
        "name": "Test Camera",
        "rtsp_url": "rtsp://test",
        "ai_object_types": ["person", "car"]
    }

    # Mock schema object
    class DummyCameraSchema:
        def dict(self):
            return camera_data.copy()

    camera_schema = DummyCameraSchema()

    crud.create_camera(db_mock, camera_schema)

    # Check that it serialized correctly
    import json
    expected_data = camera_data.copy()
    expected_data['ai_object_types'] = json.dumps(["person", "car"])

    mock_camera.assert_called_once_with(**expected_data)
    db_mock.add.assert_called_once()
    db_mock.commit.assert_called_once()

@patch('models.Camera')
def test_create_camera_no_ai_object_types(mock_camera):
    # Mocking db session
    db_mock = MagicMock()

    # Mocking schema without ai_object_types
    camera_data = {
        "name": "Test Camera",
        "rtsp_url": "rtsp://test"
    }

    class DummyCameraSchema:
        def dict(self):
            return camera_data.copy()

    camera_schema = DummyCameraSchema()

    crud.create_camera(db_mock, camera_schema)

    mock_camera.assert_called_once_with(**camera_data)
    db_mock.add.assert_called_once()
    db_mock.commit.assert_called_once()

@patch('models.Camera')
def test_create_camera_string_ai_object_types(mock_camera):
    # Mocking db session
    db_mock = MagicMock()

    # Mocking schema with string for ai_object_types
    camera_data = {
        "name": "Test Camera",
        "rtsp_url": "rtsp://test",
        "ai_object_types": "person, car" # This shouldn't be serialized to json
    }

    class DummyCameraSchema:
        def dict(self):
            return camera_data.copy()

    camera_schema = DummyCameraSchema()

    crud.create_camera(db_mock, camera_schema)

    mock_camera.assert_called_once_with(**camera_data)
    db_mock.add.assert_called_once()
    db_mock.commit.assert_called_once()
