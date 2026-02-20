from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Form, Body
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
import auth_service, crud, database, schemas, models

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

@router.post("/login", response_model=schemas.Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    totp_code: Optional[str] = Form(None),
    trust_device: Optional[bool] = Form(False),
    device_name: Optional[str] = Form(None),
    device_token: Optional[str] = Form(None), # Client can send existing token to validate trust
    recovery_code: Optional[str] = Form(None), # Client can send a backup code instead of TOTP
    db: Session = Depends(database.get_db)
):
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user or not auth_service.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 2FA Check
    is_trusted = False
    output_device_token = None
    
    # Check if a valid trusted device token was provided
    if user.is_2fa_enabled and device_token:
        print(f"DEBUG: Checking device token: {device_token[:10]}...")
        trusted_device = db.query(models.TrustedDevice).filter(
            models.TrustedDevice.user_id == user.id,
            models.TrustedDevice.token == device_token
        ).first()
        
        if trusted_device:
            print(f"DEBUG: Device trusted! {trusted_device.name}")
            # Update last used
            trusted_device.last_used = func.now()
            db.commit()
            is_trusted = True
            output_device_token = device_token
        else:
            print("DEBUG: Device token Invalid or not found.")
    else:
        print(f"DEBUG: No device token provided. 2FA enabled: {user.is_2fa_enabled}")
    
    if user.is_2fa_enabled and not is_trusted:
        if not totp_code and not recovery_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA_REQUIRED",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Prefer validation via Recovery Code if provided
        if recovery_code:
            # Hash the input and check DB
            code_hash = auth_service.get_password_hash(recovery_code)
            # Find a match (We can't easily query by hash if it's Argon2/bcrypt because salts differ)
            # We must iterate or use a simple hash like SHA-256 for recovery codes so we can query them directly.
            # Using verify_password is safer but slower. Let's iterate user's codes.
            db_codes = crud.get_recovery_codes(db, user.id)
            valid_code_id = None
            for db_code in db_codes:
                if auth_service.verify_password(recovery_code, db_code.code_hash):
                    valid_code_id = db_code.id
                    break
                    
            if not valid_code_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid Recovery Code",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # Code is valid, consume it (delete it)
            crud.delete_recovery_code(db, valid_code_id)
            print(f"DEBUG: Consumed recovery code {valid_code_id} for user {user.username}")
            
        else:
            # Validating via TOTP code
            if not auth_service.verify_totp(user.totp_secret, totp_code):
                 raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid 2FA Code",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        
        # Code is valid (either TOTP or Recovery). Check if user wants to trust this device
        if trust_device:
            import secrets
            new_token = secrets.token_urlsafe(32)
            new_device = models.TrustedDevice(
                user_id=user.id,
                token=new_token,
                name=device_name or "Unknown Device"
            )
            db.add(new_device)
            db.commit()
            output_device_token = new_token

    access_token_expires = timedelta(minutes=auth_service.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_service.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    response_data = {"access_token": access_token, "token_type": "bearer"}
    response_data = {"access_token": access_token, "token_type": "bearer"}
    if output_device_token:
        response_data["device_token"] = output_device_token
        
    return response_data

@router.post("/2fa/setup", response_model=schemas.TOTPSetupResponse)
def setup_2fa(current_user: models.User = Depends(auth_service.get_current_user), db: Session = Depends(database.get_db)):
    """Generate a new TOTP secret for the user and 10 recovery codes."""
    secret = auth_service.generate_totp_secret()
    
    # Temporarily store the secret but don't enable it yet
    current_user.totp_secret = secret
    
    # Generate 10 random recovery codes
    import secrets
    recovery_codes = [secrets.token_hex(4) for _ in range(10)]
    hashed_codes = [auth_service.get_password_hash(code) for code in recovery_codes]
    
    # Wipe any existing codes and save new ones
    crud.delete_all_recovery_codes(db, current_user.id)
    crud.create_recovery_codes(db, current_user.id, hashed_codes)
    
    db.commit()
    
    # Generate otpauth URL for QR Code
    otpauth_url = auth_service.get_totp_uri(secret, current_user.username)
    
    return {"secret": secret, "otpauth_url": otpauth_url, "recovery_codes": recovery_codes}

@router.post("/2fa/enable")
def enable_2fa(
    verify_data: schemas.TOTPVerify,
    current_user: models.User = Depends(auth_service.get_current_user), 
    db: Session = Depends(database.get_db)
):
    """Verify the code and enable 2FA."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA setup not initiated")
        
    if not auth_service.verify_totp(current_user.totp_secret, verify_data.code):
        raise HTTPException(status_code=400, detail="Invalid code")
        
    current_user.is_2fa_enabled = True
    db.commit()
    return {"status": "2FA enabled"}

@router.post("/2fa/disable")
def disable_2fa(current_user: models.User = Depends(auth_service.get_current_user), db: Session = Depends(database.get_db)):
    """Disable 2FA for the current user."""
    current_user.is_2fa_enabled = False
    current_user.totp_secret = None
    crud.delete_all_recovery_codes(db, current_user.id)
    db.commit()
    return {"status": "2FA disabled"}

@router.post("/2fa/recovery-codes")
def regenerate_recovery_codes(current_user: models.User = Depends(auth_service.get_current_user), db: Session = Depends(database.get_db)):
    """Regenerate recovery codes for a user who already has 2FA enabled."""
    if not current_user.is_2fa_enabled:
        raise HTTPException(status_code=400, detail="2FA must be enabled first")
        
    import secrets
    recovery_codes = [secrets.token_hex(4) for _ in range(10)]
    hashed_codes = [auth_service.get_password_hash(code) for code in recovery_codes]
    
    crud.delete_all_recovery_codes(db, current_user.id)
    crud.create_recovery_codes(db, current_user.id, hashed_codes)
    
    return {"recovery_codes": recovery_codes}

@router.get("/devices", response_model=list[schemas.TrustedDevice])
def list_trusted_devices(current_user: models.User = Depends(auth_service.get_current_user), db: Session = Depends(database.get_db)):
    """List trusted devices for current user."""
    return current_user.trusted_devices

@router.delete("/devices/{device_id}")
def revoke_trusted_device(
    device_id: int,
    current_user: models.User = Depends(auth_service.get_current_user), 
    db: Session = Depends(database.get_db)
):
    """Revoke a trusted device."""
    device = db.query(models.TrustedDevice).filter(models.TrustedDevice.id == device_id, models.TrustedDevice.user_id == current_user.id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    db.delete(device)
    db.commit()
    return {"status": "Device revoked"}

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
