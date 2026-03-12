from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import crud, schemas, database, auth_service, models
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
    return crud.create_storage_profile(db=db, profile=profile)

@router.put("/profiles/{profile_id}", response_model=schemas.StorageProfile)
def update_storage_profile(profile_id: int, profile: schemas.StorageProfileCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    db_profile = crud.update_storage_profile(db, profile_id=profile_id, profile=profile)
    if db_profile is None:
        raise HTTPException(status_code=404, detail="Storage profile not found")
    return db_profile

@router.delete("/profiles/{profile_id}")
def delete_storage_profile(profile_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    crud.delete_storage_profile(db, profile_id=profile_id)
    return {"message": "Storage profile deleted successfully"}
