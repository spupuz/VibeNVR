"""Admin-only camera event-provider diagnostics."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import auth_service
import crud
import database
import models
from camera_event_provider import selected_provider
from hikvision_event_service import event_manager as hikvision_manager

router = APIRouter(prefix="/cameras", tags=["camera event sources"])


@router.get("/{camera_id}/event-provider/status")
def get_event_provider_status(
    camera_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin),
):
    """Return redacted connection status without camera credentials or payloads."""
    camera = crud.get_camera(db, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    provider = selected_provider(camera)
    return {"provider": provider, **(hikvision_manager.diagnostics(camera_id) if provider == "hikvision_isapi" else {})}
