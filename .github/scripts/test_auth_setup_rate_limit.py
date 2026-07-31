import pytest
from fastapi.testclient import TestClient
from fastapi import Request
from main import app
import database
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone
import crud
import models

client = TestClient(app)

@patch("crud.create_user")
def test_setup_admin_rate_limit(mock_create_user):
    # Set Limiter enabled
    app.state.limiter.enabled = True

    # Mock database
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    # simulate existing_user is None
    mock_query.first.return_value = None
    app.dependency_overrides[database.get_db] = lambda: mock_db

    mock_user = models.User(
        id=1,
        username="test",
        email="test@test.com",
        role="admin",
        language="en",
        auth_source="local",
        oauth_subject_id=None,
        avatar_path=None,
        created_at=datetime.now(timezone.utc),
        is_2fa_enabled=False
    )

    mock_create_user.return_value = mock_user

    # Send 6 requests quickly
    for i in range(10):
        # We need to make sure the endpoint is accessed exactly as in production
        # In main.py, it's just app.include_router(auth.router), which has prefix="/auth"
        response = client.post("/auth/setup", json={"username": "test", "password": "password", "email": "test@test.com"})
        if response.status_code == 429:
            break

    assert response.status_code == 429
