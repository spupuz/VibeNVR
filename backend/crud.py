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

def get_events(db: Session, skip: int = 0, limit: int = 100, camera_id: int = None, type: str = None):
    query = db.query(models.Event)
    if camera_id:
        query = query.filter(models.Event.camera_id == camera_id)
    if type:
        # type in DB is 'video' or 'image' (if implemented later), currently mostly 'video'
        # event_type is 'motion'
        # The user request asks for "picture browser" and "movie browser".
        # Assuming type field: 'video' for movies. 'image' for pictures.
        query = query.filter(models.Event.type == type)
        
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
