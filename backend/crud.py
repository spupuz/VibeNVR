from sqlalchemy.orm import Session
import models, schemas

def get_camera(db: Session, camera_id: int):
    return db.query(models.Camera).filter(models.Camera.id == camera_id).first()

def get_cameras(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Camera).offset(skip).limit(limit).all()

def create_camera(db: Session, camera: schemas.CameraCreate):
    db_camera = models.Camera(**camera.dict())
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)
    return db_camera

def update_camera(db: Session, camera_id: int, camera: schemas.CameraCreate):
    db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if db_camera:
        for key, value in camera.dict().items():
            setattr(db_camera, key, value)
        db.commit()
        db.refresh(db_camera)
    return db_camera

def delete_camera(db: Session, camera_id: int):
    db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
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
        from datetime import datetime, timedelta
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

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate):
    # Import here to avoid circular dependency
    import auth_service
    hashed_password = auth_service.get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        role=user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

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
    return db.query(models.CameraGroup).offset(skip).limit(limit).all()

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
