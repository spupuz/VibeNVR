from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import crud, database, models

import os
import pyotp

# Secret key for JWT (Should be in env var in production)
SECRET_KEY = os.getenv("SECRET_KEY", "vibenvr-super-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def generate_totp_secret():
    return pyotp.random_base32()

def verify_totp(secret: str, code: str):
    if not secret:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)

def get_totp_uri(secret: str, username: str):
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name="VibeNVR")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user



async def get_current_active_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Admin privileges required"
        )
    return current_user

async def get_current_user_from_query(token: str, db: Session = Depends(database.get_db)):
    """
    Alternative auth dependency extracting token from query param ?token=...
    Used for static media files where Headers cannot be easily set (img/video tags).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

async def get_current_user_mixed(
    token: Optional[str] = None, 
    token_header: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(database.get_db)
):
    """
    Accepts auth token from either ?token=... query param OR Authorization: Bearer header.
    Query param takes precedence.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Resolve token
    effective_token = token or token_header
    if not effective_token:
        raise credentials_exception

    try:
        payload = jwt.decode(effective_token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# Backward compatibility function
async def get_user_from_token(token: str, db: Session):
    return await get_current_user_from_query(token, db)

# API Token Auth
import hashlib
from fastapi import Header

def hash_api_token(token: str) -> str:
    """Create SHA256 hash of the token"""
    return hashlib.sha256(token.encode()).hexdigest()

async def verify_api_token(
    x_api_key: Optional[str] = Header(None),
    db: Session = Depends(database.get_db)
) -> models.ApiToken:
    """Verify API token from X-API-Key header"""
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail="API Key required"
        )
    
    token_hash = hash_api_token(x_api_key)
    token = crud.get_api_token_by_hash(db, token_hash)
    
    if not token or not token.is_active:
        raise HTTPException(
            status_code=401,
            detail="Invalid or inactive API Key"
        )
    
    # Update last_used_at
    crud.update_token_last_used(db, token.id)
    
    return token

async def verify_api_token_optional(
    x_api_key: Optional[str] = Header(None),
    db: Session = Depends(database.get_db)
) -> Optional[models.ApiToken]:
    """Verify API token if present, return None if not"""
    if not x_api_key:
        return None
    
    token_hash = hash_api_token(x_api_key)
    token = crud.get_api_token_by_hash(db, token_hash)
    
    if not token or not token.is_active:
        return None
        
    # Update last_used_at
    crud.update_token_last_used(db, token.id)
    return token

async def get_current_user_optional(token: str = Depends(oauth2_scheme_optional), db: Session = Depends(database.get_db)) -> Optional[models.User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
    
    user = db.query(models.User).filter(models.User.username == username).first()
    return user

async def get_current_user_or_token(
    api_token: Optional[models.ApiToken] = Depends(verify_api_token_optional),
    jwt_user: Optional[models.User] = Depends(get_current_user_optional)
) -> tuple[models.User, bool]:
    """
    Authenticate using either API Token (X-API-Key) or JWT (Bearer).
    Returns (User, is_token) tuple.
    """
    if api_token:
        # Return the user who created the token and True flag
        return api_token.created_by, True
        
    if jwt_user:
        return jwt_user, False
        
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
