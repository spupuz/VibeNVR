from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import crud, schemas, database, models, motion_service

router = APIRouter(
    prefix="/groups",
    tags=["groups"],
    responses={404: {"description": "Not found"}},
)

@router.get("", response_model=List[schemas.CameraGroup])
def read_groups(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    return crud.get_groups(db, skip=skip, limit=limit)

@router.post("", response_model=schemas.CameraGroup)
def create_group(group: schemas.CameraGroupCreate, db: Session = Depends(database.get_db)):
    return crud.create_group(db, group=group)

@router.get("/{group_id}", response_model=schemas.CameraGroup)
def read_group(group_id: int, db: Session = Depends(database.get_db)):
    db_group = crud.get_group(db, group_id=group_id)
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return db_group

@router.delete("/{group_id}")
def delete_group(group_id: int, db: Session = Depends(database.get_db)):
    deleted = crud.delete_group(db, group_id=group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"message": "Group deleted"}

@router.post("/{group_id}/cameras", response_model=schemas.CameraGroup)
def update_group_cameras_endpoint(group_id: int, camera_ids: List[int], db: Session = Depends(database.get_db)):
    group = crud.update_group_cameras(db, group_id, camera_ids)
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")
    return group

@router.post("/{group_id}/action")
def perform_group_action(group_id: int, action: schemas.GroupAction, db: Session = Depends(database.get_db)):
    group = crud.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if not group.cameras:
        return {"message": "No cameras in group", "count": 0}

    modified_count = 0
    
    if action.action == "enable_motion":
        for cam in group.cameras:
            cam.recording_mode = "Motion Triggered"
            cam.detect_motion_mode = "Always"
            modified_count += 1
            
    elif action.action == "disable_motion":
        for cam in group.cameras:
            cam.recording_mode = "Off"
            cam.detect_motion_mode = "Off"
            modified_count += 1

    elif action.action == "copy_settings":
        if not action.source_camera_id:
            raise HTTPException(status_code=400, detail="source_camera_id required for copy_settings")
        
        source = crud.get_camera(db, action.source_camera_id)
        if not source:
             raise HTTPException(status_code=404, detail="Source camera not found")
        
        # Fields to copy (exclude identity/system fields)
        excluded = [
            'id', 'name', 'rtsp_url', 'stream_url', 'location', 
            'is_active', 'created_at', 'groups', 
            '_sa_instance_state'
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
