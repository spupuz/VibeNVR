from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session, selectinload
import models
import schemas

def get_camera(db: Session, camera_id: int):
    return db.query(models.Camera).filter(models.Camera.id == camera_id).first()

def get_cameras(db: Session, skip: int = 0, limit: int = 100):
    # Performance Optimization: Use selectinload to eagerly load the groups and
    # storage_profile relationships. This prevents N+1 queries and avoids the Cartesian
    # product explosion that joinedload would cause for collections.
    return db.query(models.Camera).options(
        selectinload(models.Camera.groups),
        selectinload(models.Camera.storage_profile)
    ).order_by(models.Camera.sort_order.asc(), models.Camera.id.asc()).offset(skip).limit(limit).all()

def get_camera_by_rtsp_url(db: Session, rtsp_url: str):
    return db.query(models.Camera).filter(models.Camera.rtsp_url == rtsp_url).first()

def create_camera(db: Session, camera: schemas.CameraCreate):
    create_data = camera.dict()
    # Convert list to JSON string for the DB column only if it's a list
    if 'ai_object_types' in create_data and isinstance(create_data['ai_object_types'], list):
        import json
        create_data['ai_object_types'] = json.dumps(create_data['ai_object_types'])
        
    db_camera = models.Camera(**create_data)
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)
    return db_camera

def update_camera(db: Session, camera_id: int, camera: schemas.CameraCreate):
    db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if db_camera:
        update_data = camera.dict()
        # Convert list to JSON string for the DB column only if it's a list
        if 'ai_object_types' in update_data and isinstance(update_data['ai_object_types'], list):
            import json
            update_data['ai_object_types'] = json.dumps(update_data['ai_object_types'])
            
        for key, value in update_data.items():
            setattr(db_camera, key, value)
        db.commit()
        db.refresh(db_camera)
    return db_camera

def delete_camera(db: Session, camera_id: int):
    from sqlalchemy.orm import joinedload
    db_camera = db.query(models.Camera).options(
        joinedload(models.Camera.storage_profile),
        joinedload(models.Camera.groups)
    ).filter(models.Camera.id == camera_id).first()
    if db_camera:
        db.delete(db_camera)
        db.commit()
    return db_camera

def get_events(db: Session, skip: int = 0, limit: int = 100, camera_id: int = None, type: str = None, date: str = None):
    query = db.query(models.Event)
    if camera_id:
        query = query.filter(models.Event.camera_id == camera_id)
    if type:
        query = query.filter(models.Event.type == type)
    if date:
        # Assuming date is YYYY-MM-DD
        # Use a range to handle timezone correctly
        # Use a range to handle timezone correctly
        from zoneinfo import ZoneInfo
        
        # Get local timezone from env or default to Europe/Rome as per docker-compose
        import os
        tz_name = os.environ.get('TZ', 'Europe/Rome')
        local_tz = ZoneInfo(tz_name)
        
        # Parse date and set to start of day in local timezone
        naive_start = datetime.strptime(date, '%Y-%m-%d')
        start_date = naive_start.replace(tzinfo=local_tz)
        end_date = start_date + timedelta(days=1)
        
        query = query.filter(models.Event.timestamp_start >= start_date)
        query = query.filter(models.Event.timestamp_start < end_date)
        
    return query.order_by(models.Event.timestamp_start.desc()).offset(skip).limit(limit).all()

def create_event(db: Session, event: schemas.EventCreate):
    db_event = models.Event(**event.dict())
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

def delete_event(db: Session, event_id: int):
    db_event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if db_event:
        db.delete(db_event)
        db.commit()
    return db_event

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    # Performance Optimization: Use selectinload to eagerly load camera_accesses
    # and group_accesses relationships. This resolves an N+1 query issue during
    # API serialization, significantly reducing DB query count from O(N) to O(1).
    return db.query(models.User).options(
        selectinload(models.User.camera_accesses).selectinload(models.UserCameraAccess.camera),
        selectinload(models.User.group_accesses).selectinload(models.UserGroupAccess.group)
    ).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate):
    # Import here to avoid circular dependency
    import auth_service
    hashed_password = auth_service.get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        role=user.role,
        restrict_camera_access=user.restrict_camera_access
    )
    db.add(db_user)
    db.commit()
    
    if user.camera_accesses is not None:
        db_user.camera_accesses = []
        for acc in user.camera_accesses:
            db_user.camera_accesses.append(models.UserCameraAccess(
                camera_id=acc.id, can_view=acc.can_view, can_replay=acc.can_replay, can_control=acc.can_control
            ))
    elif user.allowed_camera_ids:
        db_user.camera_accesses = []
        cameras = db.query(models.Camera).filter(models.Camera.id.in_(user.allowed_camera_ids)).all()
        for c in cameras:
            db_user.camera_accesses.append(models.UserCameraAccess(camera_id=c.id))
            
    if user.group_accesses is not None:
        db_user.group_accesses = []
        for acc in user.group_accesses:
            db_user.group_accesses.append(models.UserGroupAccess(
                group_id=acc.id, can_view=acc.can_view, can_replay=acc.can_replay, can_control=acc.can_control
            ))
    elif user.allowed_group_ids:
        db_user.group_accesses = []
        groups = db.query(models.CameraGroup).filter(models.CameraGroup.id.in_(user.allowed_group_ids)).all()
        for g in groups:
            db_user.group_accesses.append(models.UserGroupAccess(group_id=g.id))
        
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user: schemas.UserUpdate):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
        
    db_user.username = user.username
    db_user.email = user.email
    db_user.role = user.role
    db_user.restrict_camera_access = user.restrict_camera_access
    
    # Note: password update is handled separately, but if provided here, we could update it.
    if user.password and user.password != "********":
        import auth_service
        db_user.hashed_password = auth_service.get_password_hash(user.password)
        
    # Update relations
    if user.camera_accesses is not None:
        db_user.camera_accesses = []
        for acc in user.camera_accesses:
            db_user.camera_accesses.append(models.UserCameraAccess(
                camera_id=acc.id, can_view=acc.can_view, can_replay=acc.can_replay, can_control=acc.can_control
            ))
    elif user.allowed_camera_ids is not None:
        db_user.camera_accesses = []
        cameras = db.query(models.Camera).filter(models.Camera.id.in_(user.allowed_camera_ids)).all()
        for c in cameras:
            db_user.camera_accesses.append(models.UserCameraAccess(camera_id=c.id))
            
    if user.group_accesses is not None:
        db_user.group_accesses = []
        for acc in user.group_accesses:
            db_user.group_accesses.append(models.UserGroupAccess(
                group_id=acc.id, can_view=acc.can_view, can_replay=acc.can_replay, can_control=acc.can_control
            ))
    elif user.allowed_group_ids is not None:
        db_user.group_accesses = []
        groups = db.query(models.CameraGroup).filter(models.CameraGroup.id.in_(user.allowed_group_ids)).all()
        for g in groups:
            db_user.group_accesses.append(models.UserGroupAccess(group_id=g.id))
        
    db.commit()
    db.refresh(db_user)
    return db_user

def get_allowed_camera_ids_for_user(db: Session, user_id: int, permission: str = "view") -> list[int] | None:
    """Returns a list of camera IDs the user is allowed to access with the required permission, or None if they have full access."""
    user = get_user(db, user_id)
    if not user or user.role == "admin" or not user.restrict_camera_access:
        return None

    # ⚡ Bolt: Resolving N+1 query issue.
    # Instead of iterating over relationships which triggers a query for each group's cameras,
    # we directly query the association tables, reducing DB queries from O(N) to O(1).
    camera_ids = set()

    # 1. Collect explicit camera IDs
    direct_ids = db.query(models.UserCameraAccess.camera_id).filter(
        models.UserCameraAccess.user_id == user_id,
        getattr(models.UserCameraAccess, f"can_{permission}").is_(True)
    ).all()

    for (cid,) in direct_ids:
        camera_ids.add(cid)

    # 2. Collect camera IDs from groups with the required permission
    group_camera_ids = db.query(models.CameraGroupAssociation.camera_id).join(
        models.UserGroupAccess,
        models.UserGroupAccess.group_id == models.CameraGroupAssociation.group_id
    ).filter(
        models.UserGroupAccess.user_id == user_id,
        getattr(models.UserGroupAccess, f"can_{permission}").is_(True)
    ).all()

    for (cid,) in group_camera_ids:
        camera_ids.add(cid)

    return list(camera_ids)


def delete_user(db: Session, user_id: int):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        db.delete(db_user)
        db.commit()
    return db_user

def update_user_password(db: Session, user_id: int, hashed_password: str):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        db_user.hashed_password = hashed_password
        db.commit()
        db.refresh(db_user)
    return db_user

# Groups
def get_groups(db: Session, skip: int = 0, limit: int = 100):
    # ⚡ Bolt: Resolving N+1 query issue during serialization.
    # When Pydantic serializes groups, it fetches the cameras, which in turn fetch their nested groups and storage profiles.
    # Using chained selectinload pre-fetches all these relationships in constant O(1) queries instead of O(N) queries.
    return db.query(models.CameraGroup).options(
        selectinload(models.CameraGroup.cameras).selectinload(models.Camera.groups),
        selectinload(models.CameraGroup.cameras).selectinload(models.Camera.storage_profile)
    ).offset(skip).limit(limit).all()

def get_group(db: Session, group_id: int):
    return db.query(models.CameraGroup).filter(models.CameraGroup.id == group_id).first()

def create_group(db: Session, group: schemas.CameraGroupCreate):
    db_group = models.CameraGroup(**group.dict())
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

def delete_group(db: Session, group_id: int):
    db_group = db.query(models.CameraGroup).filter(models.CameraGroup.id == group_id).first()
    if db_group:
        db.delete(db_group)
        db.commit()
    return db_group

def update_group_cameras(db: Session, group_id: int, camera_ids: list[int]):
    db_group = get_group(db, group_id)
    if not db_group:
        return None
    
    # Fetch cameras
    cameras = db.query(models.Camera).filter(models.Camera.id.in_(camera_ids)).all()
    db_group.cameras = cameras
    db.commit()
    db.refresh(db_group)
    return db_group

# API Tokens
def create_api_token(db: Session, name: str, token_hash: str, user_id: int, expires_at: datetime = None):
    """Create a new API token"""
    db_token = models.ApiToken(name=name, token_hash=token_hash, created_by_user_id=user_id, expires_at=expires_at)
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token

def get_api_tokens(db: Session, user_id: int = None):
    """List all API tokens (optionally filtered by user)"""
    query = db.query(models.ApiToken)
    if user_id:
        query = query.filter(models.ApiToken.created_by_user_id == user_id)
    return query.all()

def get_api_token_by_hash(db: Session, token_hash: str):
    """Find token by hash (for authentication)"""
    return db.query(models.ApiToken).filter(models.ApiToken.token_hash == token_hash).first()

def update_token_last_used(db: Session, token_id: int):
    """Update last used timestamp"""
    token = db.query(models.ApiToken).filter(models.ApiToken.id == token_id).first()
    if token:
        token.last_used_at = datetime.now(timezone.utc)
        db.commit()

def delete_api_token(db: Session, token_id: int):
    """Delete an API token"""
    token = db.query(models.ApiToken).filter(models.ApiToken.id == token_id).first()
    if token:
        db.delete(token)
        db.commit()
        return True
    return False

# Recovery Codes
def create_recovery_codes(db: Session, user_id: int, hashed_codes: list[str]):
    codes = [models.RecoveryCode(user_id=user_id, code_hash=hash_val) for hash_val in hashed_codes]
    db.add_all(codes)
    db.commit()

def get_recovery_codes(db: Session, user_id: int):
    return db.query(models.RecoveryCode).filter(models.RecoveryCode.user_id == user_id).all()

def delete_recovery_code(db: Session, code_id: int):
    code = db.query(models.RecoveryCode).filter(models.RecoveryCode.id == code_id).first()
    if code:
        db.delete(code)
        db.commit()
        return True
    return False

def delete_all_recovery_codes(db: Session, user_id: int):
    db.query(models.RecoveryCode).filter(models.RecoveryCode.user_id == user_id).delete()
    db.commit()

# Storage Profiles
def get_storage_profile(db: Session, profile_id: int):
    return db.query(models.StorageProfile).filter(models.StorageProfile.id == profile_id).first()

def get_storage_profiles(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.StorageProfile).offset(skip).limit(limit).all()

def create_storage_profile(db: Session, profile: schemas.StorageProfileCreate):
    db_profile = models.StorageProfile(**profile.dict())
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile

def update_storage_profile(db: Session, profile_id: int, profile: schemas.StorageProfileCreate):
    db_profile = db.query(models.StorageProfile).filter(models.StorageProfile.id == profile_id).first()
    if db_profile:
        for key, value in profile.dict().items():
            setattr(db_profile, key, value)
        db.commit()
        db.refresh(db_profile)
    return db_profile

def delete_storage_profile(db: Session, profile_id: int):
    db_profile = db.query(models.StorageProfile).filter(models.StorageProfile.id == profile_id).first()
    if db_profile:
        # Before deleting, nullify camera references
        db.query(models.Camera).filter(models.Camera.storage_profile_id == profile_id).update(
            {models.Camera.storage_profile_id: None},
            synchronize_session=False
        )
        db.delete(db_profile)
        db.commit()
    return db_profile
