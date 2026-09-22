from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import sftp_client
import utils
import crud
import schemas
import database
import auth_service
import models
from typing import List

router = APIRouter(
    prefix="/storage",
    tags=["storage"],
    responses={404: {"description": "Not found"}},
)

@router.get("/profiles", response_model=List[schemas.StorageProfile])
def read_storage_profiles(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    profiles = crud.get_storage_profiles(db, skip=skip, limit=limit)
    return profiles

@router.get("/profiles/{profile_id}", response_model=schemas.StorageProfile)
def read_storage_profile(profile_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    db_profile = crud.get_storage_profile(db, profile_id=profile_id)
    if db_profile is None:
        raise HTTPException(status_code=404, detail="Storage profile not found")
    return db_profile

@router.post("/profiles", response_model=schemas.StorageProfile)
def create_storage_profile(profile: schemas.StorageProfileCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    if crud.get_storage_profile_by_name(db, profile.name):
        raise HTTPException(status_code=400, detail="Storage profile with this name already exists")
    return crud.create_storage_profile(db=db, profile=profile)

@router.put("/profiles/{profile_id}", response_model=schemas.StorageProfile)
def update_storage_profile(profile_id: int, profile: schemas.StorageProfileCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    existing_profile = crud.get_storage_profile_by_name(db, profile.name)
    if existing_profile and existing_profile.id != profile_id:
        raise HTTPException(status_code=400, detail="Storage profile with this name already exists")
        
    db_profile = crud.update_storage_profile(db, profile_id=profile_id, profile=profile)
    if db_profile is None:
        raise HTTPException(status_code=404, detail="Storage profile not found")
    return db_profile

@router.delete("/profiles/{profile_id}")
def delete_storage_profile(profile_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    crud.delete_storage_profile(db, profile_id=profile_id)
    return {"message": "Storage profile deleted successfully"}


@router.post("/test-sftp")
def test_sftp_connection(
    request: schemas.SFTPTestRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
    password = request.sftp_password
    
    # If the password is obscured (e.g. from an existing profile being edited), we need to fetch it
    if password == "********" and request.profile_id:
        profile = db.query(models.StorageProfile).filter(models.StorageProfile.id == request.profile_id).first()
        if profile and profile.sftp_password:
            password = utils.decrypt_password(profile.sftp_password)
        else:
            return {"success": False, "message": "Original password not found."}
    
    result = sftp_client.test_connection(
        host=request.sftp_host,
        port=request.sftp_port,
        username=request.sftp_username,
        password=password,
        remote_path=request.sftp_remote_path
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
        
    return {"message": result["message"]}
