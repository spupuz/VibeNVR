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

def test_get_cameras_eager_loading_and_sorting(db):
    from models import Camera, CameraGroup, StorageProfile
    import crud

    # Create a storage profile
    sp = StorageProfile(name="Main Storage", path="/mnt/data")
    db.add(sp)
    db.commit()
    db.refresh(sp)

    # Create groups
    g1 = CameraGroup(name="Group 1")
    g2 = CameraGroup(name="Group 2")
    db.add_all([g1, g2])
    db.commit()
    db.refresh(g1)
    db.refresh(g2)

    # Create cameras with specific sort_order
    c1 = Camera(name="Cam B", rtsp_url="rtsp://b", sort_order=2, storage_profile_id=sp.id)
    c2 = Camera(name="Cam A", rtsp_url="rtsp://a", sort_order=1) # No storage profile
    c3 = Camera(name="Cam C", rtsp_url="rtsp://c", sort_order=1) # Same sort_order, higher id (inserted later)
    db.add_all([c1, c2, c3])
    db.commit()
    db.refresh(c1)
    db.refresh(c2)
    db.refresh(c3)

    # Associate groups
    c1.groups.append(g1)
    c2.groups.extend([g1, g2])
    db.commit()

    # Clear the session so we are forced to load from DB
    db.expunge_all()

    # Test get_cameras with default skip=0, limit=100
    cameras = crud.get_cameras(db)

    # Check sorting: sort_order ASC, id ASC
    # c2 and c3 have sort_order=1. Since c2 was added first, c2.id < c3.id
    # c1 has sort_order=2
    assert len(cameras) >= 3
    test_cams = [c for c in cameras if c.name in ("Cam A", "Cam B", "Cam C")]
    assert len(test_cams) == 3
    assert test_cams[0].name == "Cam A" # c2
    assert test_cams[1].name == "Cam C" # c3
    assert test_cams[2].name == "Cam B" # c1

    # Check eager loading by expunging from session and checking attributes
    db.expunge_all()

    cam_a = next(c for c in test_cams if c.name == "Cam A")
    cam_b = next(c for c in test_cams if c.name == "Cam B")
    cam_c = next(c for c in test_cams if c.name == "Cam C")

    # These should not raise detached instance errors because of selectinload
    assert len(cam_a.groups) == 2
    assert {g.name for g in cam_a.groups} == {"Group 1", "Group 2"}
    assert cam_a.storage_profile is None

    assert len(cam_b.groups) == 1
    assert cam_b.groups[0].name == "Group 1"
    assert cam_b.storage_profile is not None
    assert cam_b.storage_profile.name == "Main Storage"

    assert len(cam_c.groups) == 0
    assert cam_c.storage_profile is None

def test_get_cameras_pagination(db):
    from models import Camera
    import crud

    # Create 5 cameras
    cams = [Camera(name=f"Cam P{i}", rtsp_url=f"rtsp://p{i}", sort_order=i) for i in range(5)]
    db.add_all(cams)
    db.commit()

    # Test skip and limit
    all_cams = crud.get_cameras(db)
    total = len(all_cams)

    assert total >= 5

    res1 = crud.get_cameras(db, skip=0, limit=2)
    assert len(res1) == 2
    assert res1[0].id == all_cams[0].id
    assert res1[1].id == all_cams[1].id

    res2 = crud.get_cameras(db, skip=2, limit=2)
    assert len(res2) == 2
    assert res2[0].id == all_cams[2].id
    assert res2[1].id == all_cams[3].id
