import pytest
import sys
import os
sys.path.insert(0, os.path.abspath('backend'))
from unittest.mock import patch, MagicMock
from health_service import check_camera_health, refresh_camera_health, _fetch_and_update_health
import asyncio

@pytest.mark.asyncio
async def test_fetch_and_update_health_with_camera():
    db_mock = MagicMock()
    camera_mock = MagicMock()
    camera_mock.id = 1
    camera_mock.is_active = True
    camera_mock.name = "Test Camera"

    engine_status = {"1": {"health": "CONNECTED"}}

    # Test with camera object
    await _fetch_and_update_health(db_mock, engine_status, camera=camera_mock)

    # Verify DB was not queried since camera was provided
    db_mock.query.assert_not_called()
    assert camera_mock.status == "CONNECTED"

@pytest.mark.asyncio
async def test_fetch_and_update_health_with_camera_id():
    db_mock = MagicMock()
    camera_mock = MagicMock()
    camera_mock.id = 1
    camera_mock.is_active = True
    camera_mock.name = "Test Camera"

    db_mock.query.return_value.filter.return_value.first.return_value = camera_mock

    engine_status = {"1": {"health": "CONNECTED"}}

    # Test with camera_id
    await _fetch_and_update_health(db_mock, engine_status, camera_id=1)

    # Verify DB was queried
    db_mock.query.assert_called_once()
    assert camera_mock.status == "CONNECTED"
