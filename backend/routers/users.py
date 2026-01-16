from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import crud, database, schemas, models, auth_service

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get("/", response_model=List[schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    users = crud.get_users(db, skip=skip, limit=limit)
    return users

@router.post("/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    return crud.create_user(db=db, user=user)

@router.delete("/{user_id}", response_model=schemas.User)
def delete_user(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
    db_user = crud.delete_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@router.put("/{user_id}/password", response_model=schemas.User)
def update_password(user_id: int, passwords: schemas.UserPasswordUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    # 1. Check if user exists
    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Permission Check
    is_self = current_user.id == user_id
    is_admin = current_user.role == "admin"
    
    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to change this password")

    # 3. Verification Logic
    if is_self:
        # If changing own password, MUST provide old password for security
        if not passwords.old_password:
             raise HTTPException(status_code=400, detail="Old password required")
        if not auth_service.verify_password(passwords.old_password, current_user.hashed_password):
             raise HTTPException(status_code=400, detail="Incorrect old password")
    
    # 4. Update
    new_hashed_pwd = auth_service.get_password_hash(passwords.new_password)
    updated_user = crud.update_user_password(db, user_id=user_id, hashed_password=new_hashed_pwd)
    return updated_user
