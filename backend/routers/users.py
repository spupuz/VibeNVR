from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import crud, database, schemas, models, auth_service

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get("", response_model=List[schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    users = crud.get_users(db, skip=skip, limit=limit)
    return users

@router.post("", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    # Check username uniqueness
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Check email uniqueness
    db_user_email = crud.get_user_by_email(db, email=user.email)
    if db_user_email:
        raise HTTPException(status_code=400, detail="Email already registered")
        
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

import shutil
import os
import uuid
from fastapi import UploadFile, File

@router.post("/{user_id}/avatar", response_model=schemas.User)
def upload_avatar(
    user_id: int, 
    file: UploadFile = File(...), 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(auth_service.get_current_user)
):
    # 1. Permission Check
    is_self = current_user.id == user_id
    is_admin = current_user.role == "admin"
    
    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to update this avatar")

    # 2. Check User
    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 3. Validate File
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
        
    # Check file size (limit to 5MB)
    # Note: UploadFile.file is a SpooledTemporaryFile. We can check its size.
    file.file.seek(0, 2) # Seek to end
    file_size = file.file.tell()
    file.file.seek(0) # Reset to start
    
    if file_size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size must be less than 5MB")

    # 4. Save File
    # Ensure directory exists
    avatar_dir = "/data/avatars"
    os.makedirs(avatar_dir, exist_ok=True)

    # Generate filename
    file_ext = os.path.splitext(file.filename)[1]
    if not file_ext:
        file_ext = ".jpg" # Default fallback
    
    # Use UUID to prevent caching issues and filename collisions
    new_filename = f"{user_id}_{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(avatar_dir, new_filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # 5. Update DB & Cleanup Old
    old_avatar = db_user.avatar_path
    
    # Update Record
    db_user.avatar_path = f"avatars/{new_filename}" # Relative path for API
    db.commit()
    db.refresh(db_user)

    # Delete old file if it exists and is different
    if old_avatar:
        try:
            old_full_path = os.path.join("/data", old_avatar)
            if os.path.exists(old_full_path) and old_full_path != file_path:
                os.remove(old_full_path)
        except Exception as e:
            print(f"Warning: Failed to delete old avatar {old_avatar}: {e}")

    return db_user
