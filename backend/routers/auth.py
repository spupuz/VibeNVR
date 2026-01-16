from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import auth_service, crud, database, schemas, models

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

@router.post("/login", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user or not auth_service.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth_service.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_service.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/status")
def auth_status(db: Session = Depends(database.get_db)):
    """Check if the system requires initial setup (no users)."""
    user_count = db.query(models.User).count()
    return {"setup_required": user_count == 0}

@router.get("/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(auth_service.get_current_user)):
    return current_user

@router.post("/setup", response_model=schemas.User)
def setup_admin(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    """
    Initial setup endpoint to create the first admin user.
    Only allows creation if no users exist in the database.
    """
    existing_user = db.query(models.User).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Setup already completed. Users exist."
        )
    
    # Force role to admin
    user.role = "admin"
    return crud.create_user(db=db, user=user)
