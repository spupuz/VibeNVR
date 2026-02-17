from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import secrets
import database, models, schemas, crud, auth_service

router = APIRouter(
    prefix="/api-tokens",
    tags=["api-tokens"],
)

@router.post("", response_model=schemas.ApiTokenResponse)
def create_token(
    token_data: schemas.ApiTokenCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
    """Create a new API token (admin only)"""
    token = secrets.token_urlsafe(32)
    token_hash = auth_service.hash_api_token(token)
    
    db_token = crud.create_api_token(db, token_data.name, token_hash, current_user.id)
    
    response = schemas.ApiTokenResponse.from_orm(db_token)
    response.token = token
    return response

@router.get("", response_model=List[schemas.ApiTokenResponse])
def list_tokens(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
    """List all API tokens (admin only)"""
    return crud.get_api_tokens(db)

@router.delete("/{token_id}")
def delete_token(
    token_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
    """Delete an API token (admin only)"""
    success = crud.delete_api_token(db, token_id)
    if not success:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"status": "deleted"}
