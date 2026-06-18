from unittest.mock import MagicMock
import json
import pytest

from crud import update_camera
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
