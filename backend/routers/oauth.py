from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
import database
import models
import auth_service
from authlib.integrations.starlette_client import OAuth
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/oauth", tags=["oauth"])

limiter = Limiter(key_func=get_remote_address)
oauth = OAuth()

def get_oauth_client(db: Session):
    # Check if OAuth is globally enabled
    global_enabled = db.query(models.SystemSettings).filter_by(key="oauth_global_enabled").first()
    if not global_enabled or global_enabled.value.lower() != "true":
        raise HTTPException(status_code=400, detail="OAuth is globally disabled")
    
    # Fetch settings
    provider_name = db.query(models.SystemSettings).filter_by(key="oauth_provider_name").first()
    client_id = db.query(models.SystemSettings).filter_by(key="oauth_client_id").first()
    client_secret = db.query(models.SystemSettings).filter_by(key="oauth_client_secret").first()
    metadata_url = db.query(models.SystemSettings).filter_by(key="oauth_metadata_url").first()
    
    if not client_id or not client_id.value or not client_secret or not client_secret.value or not metadata_url or not metadata_url.value:
        raise HTTPException(status_code=500, detail="OAuth settings are incomplete")

    # If the provider is already registered, unregister it so we can update it
    if 'sso_provider' in oauth._registry:
        oauth._registry.pop('sso_provider')
        oauth._clients.pop('sso_provider', None)

    oauth.register(
        name='sso_provider',
        client_id=client_id.value,
        client_secret=client_secret.value,
        server_metadata_url=metadata_url.value,
        client_kwargs={
            'scope': 'openid email profile'
        }
    )
    return oauth.sso_provider

@router.get("/login")
@limiter.limit("10/minute")
async def oauth_login(request: Request, db: Session = Depends(database.get_db)):
    client = get_oauth_client(db)
    base_url = str(request.base_url)
    
    # Heuristic: If accessed via a domain name (not IP/localhost), force HTTPS
    # because SSL-terminating proxies often mask the original protocol.
    host = request.headers.get("host", "")
    import re
    if not re.match(r"^[0-9\.]+(:\d+)?$", host) and not host.startswith("localhost"):
        if base_url.startswith("http://"):
            base_url = base_url.replace("http://", "https://", 1)
    
    # Also check referer as an extra fallback
    referer = request.headers.get("referer")
    if referer and referer.startswith("https://"):
        if base_url.startswith("http://"):
            base_url = base_url.replace("http://", "https://", 1)

    if base_url.endswith('/'):
        base_url = base_url[:-1]
            
    redirect_uri = f"{base_url}/api/oauth/callback"
    
    # If the app is behind a proxy, url_for might give http:// instead of https://
    # A standard fix is to ensure X-Forwarded-Proto is respected (handled by uvicorn usually)
    return await client.authorize_redirect(request, str(redirect_uri))

@router.get("/callback")
@limiter.limit("10/minute")
async def oauth_callback(request: Request, db: Session = Depends(database.get_db)):
    client = get_oauth_client(db)
    
    try:
        token = await client.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth authorization failed: {str(e)}")
        
    userinfo = token.get('userinfo')
    if not userinfo:
        # Some providers need a separate call to userinfo endpoint
        try:
            userinfo = await client.userinfo(token=token)
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to fetch user profile from provider")
    
    # Extract identity
    email = userinfo.get('email')
    username = userinfo.get('preferred_username') or userinfo.get('nickname') or userinfo.get('name')
    subject_id = userinfo.get('sub')
    
    if not subject_id:
        raise HTTPException(status_code=400, detail="Provider did not return a subject ID (sub)")
        
    # Check if the user is currently logged in (linking flow)
    token_cookie = request.cookies.get("auth_token")
    logged_in_user = None
    if token_cookie:
        try:
            # Reusing the existing function since it just decodes the token
            logged_in_user = await auth_service.get_user_from_token(token_cookie, db)
        except Exception:
            pass

    if logged_in_user:
        # Link the account to the currently logged-in user
        logged_in_user.oauth_subject_id = subject_id
        logged_in_user.auth_source = "oauth"
        db.commit()
        user = logged_in_user
    else:
        # Match user by oauth_subject_id
        user = db.query(models.User).filter(models.User.oauth_subject_id == subject_id).first()
    
    if not user:
        # No auto-provisioning
        raise HTTPException(status_code=403, detail="User not found. Please ask an administrator to create your account first.")
        
    if not user.oauth_enabled:
        raise HTTPException(status_code=403, detail="OAuth login is disabled for this user.")
        
    # User is authenticated successfully. Generate VibeNVR tokens.
    access_token_expires = auth_service.timedelta(minutes=auth_service.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_service.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    # Generate long-lived media token
    media_token = auth_service.create_access_token(
        data={"sub": user.username}, expires_delta=auth_service.timedelta(days=365) # Valid for 1 year
    )
    
    # Determine the frontend base URL to redirect to
    base_url = str(request.base_url)
    host = request.headers.get("host", "")
    import re
    if not re.match(r"^[0-9\.]+(:\d+)?$", host) and not host.startswith("localhost"):
        if base_url.startswith("http://"):
            base_url = base_url.replace("http://", "https://", 1)
    if base_url.endswith('/'):
        base_url = base_url[:-1]
        
    response = RedirectResponse(url=f"{base_url}/")
    
    # Security: Use Secure cookies in production, lax SameSite
    is_secure = request.url.scheme == "https"
    
    response.set_cookie(
        key="auth_token",
        value=access_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=auth_service.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    
    response.set_cookie(
        key="media_token",
        value=media_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=365 * 24 * 60 * 60
    )
    
    return response

@router.post("/unlink")
@limiter.limit("5/minute")
def unlink_oauth(request: Request, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    current_user.oauth_subject_id = None
    current_user.auth_source = "local"
    db.commit()
    return {"message": "OAuth unlinked successfully"}

@router.get("/logout")
@limiter.limit("10/minute")
async def oauth_logout(request: Request, db: Session = Depends(database.get_db)):
    """Redirect to the OAuth provider's end_session_endpoint if available."""
    try:
        client = get_oauth_client(db)
        metadata = await client.load_server_metadata()
        end_session_endpoint = metadata.get("end_session_endpoint")
        
        base_url = str(request.base_url)
        host = request.headers.get("host", "")
        import re
        if not re.match(r"^[0-9\.]+(:\d+)?$", host) and not host.startswith("localhost"):
            if base_url.startswith("http://"):
                base_url = base_url.replace("http://", "https://", 1)
        if base_url.endswith('/'):
            base_url = base_url[:-1]
            
        post_logout = f"{base_url}/login?local=true"
        
        if end_session_endpoint:
            # We also pass client_id as many providers like Authentik require it.
            redirect_url = f"{end_session_endpoint}?post_logout_redirect_uri={post_logout}&client_id={client.client_id}"
            return RedirectResponse(url=redirect_url)
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to redirect to OAuth end_session_endpoint: {e}")
        
    # Fallback to standard login redirect with local bypass
    return RedirectResponse(url="/login?local=true")
