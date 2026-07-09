import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
import hmac
import os
from backend.routers.events import webhook_event
import asyncio
from fastapi import Request

@pytest.mark.asyncio
async def test_webhook_event_invalid_secret():
    request = MagicMock(spec=Request)
    request.headers.get.return_value = "invalid_secret"
    payload = {"camera_id": 1, "event_type": "motion_on"}
    background_tasks = MagicMock()
    db = MagicMock()

    with patch.dict(os.environ, {"WEBHOOK_SECRET": "correct_secret"}):
        with pytest.raises(HTTPException) as excinfo:
            await webhook_event(request, payload, background_tasks, db)
        assert excinfo.value.status_code == 401
