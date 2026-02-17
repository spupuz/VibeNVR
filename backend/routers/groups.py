from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Any
import crud, schemas, database, models, motion_service, auth_service

router = APIRouter(
    prefix="/groups",
    tags=["groups"],
    responses={404: {"description": "Not found"}},
)

@router.get("", response_model=List[Any])
def read_groups(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), auth_info: tuple[models.User, bool] = Depends(auth_service.get_current_user_or_token)):
    user, is_token = auth_info
    groups = crud.get_groups(db, skip=skip, limit=limit)
    if is_token:
        # Return sanitized groups (masking camera details)
        return [schemas.CameraGroupSummary.from_orm(g) for g in groups]
    return [schemas.CameraGroup.from_orm(g) for g in groups]

@router.post("", response_model=schemas.CameraGroup)
def create_group(group: schemas.CameraGroupCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    return crud.create_group(db, group=group)

@router.get("/{group_id}", response_model=Any)
def read_group(group_id: int, db: Session = Depends(database.get_db), auth_info: tuple[models.User, bool] = Depends(auth_service.get_current_user_or_token)):
    user, is_token = auth_info
    db_group = crud.get_group(db, group_id=group_id)
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if is_token:
        # Return sanitized group
        return schemas.CameraGroupSummary.from_orm(db_group)
    return schemas.CameraGroup.from_orm(db_group)

@router.delete("/{group_id}")
def delete_group(group_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    deleted = crud.delete_group(db, group_id=group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"message": "Group deleted"}

@router.post("/bulk-delete")
def bulk_delete_groups(group_ids: List[int], db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    """Delete multiple groups at once"""
    deleted_count = 0
    for group_id in group_ids:
        deleted = crud.delete_group(db, group_id=group_id)
        if deleted:
            deleted_count += 1
    return {"message": f"Successfully deleted {deleted_count} group(s)", "count": deleted_count}

@router.post("/{group_id}/cameras", response_model=schemas.CameraGroup)
def update_group_cameras_endpoint(group_id: int, camera_ids: List[int], db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    group = crud.update_group_cameras(db, group_id, camera_ids)
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")
    return group

@router.post("/{group_id}/action")
def perform_group_action(group_id: int, action: schemas.GroupAction, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    group = crud.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if not group.cameras:
        return {"message": "No cameras in group", "count": 0}

    modified_count = 0
    
    if action.action == "enable_motion":
        for cam in group.cameras:
            # If off, move to motion triggered. If already recording (motion or continuous), stay.
            if cam.recording_mode == "Off":
                cam.recording_mode = "Motion Triggered"
            
            # Always ensure detection is active if the group toggle is ON
            cam.detect_motion_mode = "Always"
            modified_count += 1
            
    elif action.action == "disable_motion":
        for cam in group.cameras:
            # Only disable if it was purely motion recording. Continuous remains active.
            if cam.recording_mode == "Motion Triggered":
                cam.recording_mode = "Off"
            
            # Turn off detection for the group toggle
            cam.detect_motion_mode = "Off"
            modified_count += 1

    elif action.action == "copy_settings":
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required for copy_settings")
            
        if not action.source_camera_id:
            raise HTTPException(status_code=400, detail="source_camera_id required for copy_settings")
        
        source = crud.get_camera(db, action.source_camera_id)
        if not source:
             raise HTTPException(status_code=404, detail="Source camera not found")
        
        # Fields to copy (exclude identity/system fields)
        excluded = [
            'id', 'name', 'rtsp_url', 'stream_url', 'location', 
            'is_active', 'created_at', 'groups', 
            '_sa_instance_state',
            'resolution_width', 'resolution_height', 'auto_resolution'
        ]
        
        source_data = source.__dict__
        
        for cam in group.cameras:
             if cam.id == source.id:
                 continue
             
             for key, val in source_data.items():
                 if key not in excluded and not key.startswith('_'):
                     setattr(cam, key, val)
             modified_count += 1

    else:
         raise HTTPException(status_code=400, detail="Invalid action")

    if modified_count > 0:
        db.commit()
        # Sync updated cameras to VibeEngine
        for cam in group.cameras:
            motion_service.update_camera_runtime(cam)
        motion_service.generate_motion_config(db) # Regenerate for all (legacy)
    
    return {"status": "success", "modified_count": modified_count}
