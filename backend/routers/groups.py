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
def perform_group_action(group_id: int, action: schemas.GroupAction, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    group = crud.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if not group.cameras:
        return {"message": "No cameras in group", "count": 0}

    modified_count = 0
    
    if action.action == "enable_motion":
        for cam in group.cameras:
            # If currently off, try to restore previous state or default to Motion Triggered
            if cam.recording_mode == "Off":
                # Restore previous mode if it was something useful (Continuous or Motion Triggered)
                if cam.previous_recording_mode and cam.previous_recording_mode != "Off":
                    cam.recording_mode = cam.previous_recording_mode
                else:
                    cam.recording_mode = "Motion Triggered"
                
                # After enabling, we can clear the previous mode or set it to Off 
                # to indicate it was enabled by this master action
                cam.previous_recording_mode = "Off" 
                modified_count += 1
            
    elif action.action == "disable_motion":
        for cam in group.cameras:
            # Save current state before turning off
            if cam.recording_mode != "Off":
                cam.previous_recording_mode = cam.recording_mode
                cam.recording_mode = "Off"
                modified_count += 1

    elif action.action == "copy_settings":
        if not action.source_camera_id:
            raise HTTPException(status_code=400, detail="source_camera_id required for copy_settings")
        
        source = crud.get_camera(db, action.source_camera_id)
        if not source:
             raise HTTPException(status_code=404, detail="Source camera not found")
        
        # Fields to ALWAYS exclude (identity/system fields)
        excluded = [
            'id', 'name', 'rtsp_url', 'sub_rtsp_url', 'stream_url', 'location', 
            'is_active', 'created_at', 'groups', 'status', 'last_seen',
            '_sa_instance_state', 'previous_recording_mode',
            'resolution_width', 'resolution_height', 'auto_resolution',
            'storage_profile_id',
            'onvif_host', 'onvif_port', 'onvif_username', 'onvif_password', 'onvif_profile_token',
            'ptz_can_pan_tilt', 'ptz_can_zoom', 'onvif_can_events'
        ]

        # Category mapping
        category_map = {
            'recording': ['recording_mode', 'movie_quality', 'movie_passthrough', 'max_movie_length', 'preserve_movies', 'max_storage_gb', 'live_view_mode', 'rtsp_transport', 'sub_rtsp_transport'],
            'snapshots': ['picture_quality', 'picture_recording_mode', 'preserve_pictures', 'enable_manual_snapshots', 'max_pictures_storage_gb'],
            'motion': [
                'threshold', 'despeckle_filter', 'motion_gap', 'captured_before', 'captured_after', 
                'min_motion_frames', 'show_frame_changes', 'auto_threshold_tuning', 
                'auto_noise_detection', 'light_switch_detection', 'detect_motion_mode', 'detect_engine',
                'framerate', 'rotation'
            ],
            'masks': ['mask', 'privacy_masks', 'motion_masks'],
            'overlay': ['text_left', 'text_right', 'text_scale'],
            'alerts': [
                'notify_webhook_url', 'notify_telegram_token', 'notify_telegram_chat_id', 'notify_email_address',
                'notify_health_webhook_url', 'notify_health_telegram_token', 'notify_health_telegram_chat_id',
                'notify_health_email_recipient', 'notify_start_email', 'notify_start_telegram', 'notify_start_webhook',
                'notify_start_command', 'notify_end_webhook', 'notify_end_command', 'notify_health_email',
                'notify_health_telegram', 'notify_health_webhook', 'notify_attach_image_email', 'notify_attach_image_telegram'
            ],
            'schedule': [
                'schedule_monday', 'schedule_monday_start', 'schedule_monday_end',
                'schedule_tuesday', 'schedule_tuesday_start', 'schedule_tuesday_end',
                'schedule_wednesday', 'schedule_wednesday_start', 'schedule_wednesday_end',
                'schedule_thursday', 'schedule_thursday_start', 'schedule_thursday_end',
                'schedule_friday', 'schedule_friday_start', 'schedule_friday_end',
                'schedule_saturday', 'schedule_saturday_start', 'schedule_saturday_end',
                'schedule_sunday', 'schedule_sunday_start', 'schedule_sunday_end'
            ]
        }

        # Determine which fields to copy
        fields_to_copy = []
        if action.categories:
            for cat in action.categories:
                if cat in category_map:
                    fields_to_copy.extend(category_map[cat])
        else:
            # If no categories provided, copy EVERYTHING not excluded (legacy support)
            source_data = source.__dict__
            fields_to_copy = [k for k in source_data.keys() if k not in excluded and not k.startswith('_')]
        
        source_data = source.__dict__
        
        for cam in group.cameras:
             if cam.id == source.id:
                 continue
             
             for key in fields_to_copy:
                 if key in source_data and key not in excluded:
                      setattr(cam, key, getattr(source, key))
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
