import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock

import auth_service

@pytest.mark.asyncio
async def test_get_current_user_invalid_token():
    # A malformed token that will raise jwt.PyJWTError (e.g. DecodeError)
    invalid_token = "invalid.token.here"

    # Mock db session
    mock_db = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.get_current_user(token=invalid_token, db=mock_db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Could not validate credentials"
