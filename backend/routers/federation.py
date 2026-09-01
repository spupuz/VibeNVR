from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from typing import List

import models
import requests
import schemas
import crud_federation
from database import get_db
import auth_service
from federation_service import proxy_request

router = APIRouter(
    prefix="/federation",
    tags=["Federation"]
)


def _verify_remote_node(url: str, token: str):
    base_url = url.rstrip("/")
    try:
        resp = requests.get(f"{base_url}/api/auth/me", headers={"X-API-Key": token}, timeout=5)
        if resp.status_code in [401, 403]:
            raise HTTPException(status_code=400, detail="Invalid API token for the remote node.")
        elif resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Remote node validation failed (HTTP {resp.status_code}).")
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=400, detail="Federated node is unreachable. Please verify the Node URL.")

# Admin only management of nodes
@router.get("/nodes", response_model=List[schemas.FederatedNodeResponse])
def read_nodes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    nodes = crud_federation.get_nodes(db, skip=skip, limit=limit)
    return nodes

@router.post("/nodes", response_model=schemas.FederatedNodeResponse)
def create_node(node: schemas.FederatedNodeCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    _verify_remote_node(node.url, node.api_token)
    return crud_federation.create_node(db=db, node=node)

@router.put("/nodes/{node_id}", response_model=schemas.FederatedNodeResponse)
def update_node(node_id: int, node: schemas.FederatedNodeUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    existing = crud_federation.get_node(db, node_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Node not found")
        
    url_to_test = node.url if node.url is not None else existing.url
    token_to_test = node.api_token if node.api_token is not None else existing.api_token
    
    # Only test if url or token changed
    if node.url is not None or node.api_token is not None:
        _verify_remote_node(url_to_test, token_to_test)
        
    db_node = crud_federation.update_node(db, node_id, node)
    return db_node

@router.delete("/nodes/{node_id}")
def delete_node(node_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    db_node = crud_federation.delete_node(db, node_id)
    if not db_node:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"ok": True}

# Proxy endpoint
# This route catches all paths under /proxy/{node_id}/...
@router.api_route("/proxy/{node_id}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy_to_node(
    node_id: int, 
    path: str, 
    request: Request, 
    db: Session = Depends(get_db)
):
    auth_header = request.headers.get("Authorization", "")
    bearer_token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    token_param = request.query_params.get("token")
    media_token = bearer_token or token_param or request.cookies.get("media_token")
    
    if not media_token:
        raise HTTPException(status_code=401, detail="Missing authentication")
        
    try:
        from auth_service import get_user_from_token
        current_user = await get_user_from_token(media_token, db)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Only users can proxy. We use get_current_active_user because viewers might need to see remote cameras.
    # The RBAC should be handled by the remote node based on the Token we use.
    # Wait, the Master node is using an Admin token for the remote node.
    # If a viewer proxies a request to delete a camera on the remote node, the remote node will allow it
    # because the Master is using an Admin token!
    # TO FIX: For now, we enforce Admin on the proxy route if it's not GET, OR we require Admin for federation.
    # Let's require Admin for any non-GET request for safety, until remote RBAC mapping is implemented.
    if request.method not in ["GET", "HEAD"] and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can perform write operations on federated nodes")

    node = crud_federation.get_node(db, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Federated node not found")
        
    return await proxy_request(node.url, node.api_token, path, request)


from fastapi import WebSocket
from federation_service import proxy_websocket

@router.websocket("/proxy/{node_id}/{path:path}")
async def proxy_websocket_to_node(
    websocket: WebSocket,
    node_id: int,
    path: str,
    db: Session = Depends(get_db)
):
    node = crud_federation.get_node(db, node_id)
    if not node:
        await websocket.close(code=1008, reason="Federated node not found")
        return

    # WebSocket authentication in FastAPI usually checks query params or cookies.
    token = websocket.query_params.get("token") or websocket.cookies.get("media_token")
    if not token:
        await websocket.close(code=1008, reason="Missing media authentication")
        return

    try:
        from auth_service import get_current_user_from_query
        # Validate the token on the master node
        user = await get_current_user_from_query(token, db)
    except Exception as e:
        await websocket.close(code=1008, reason="Invalid token")
        return

    await proxy_websocket(node.url, node.api_token, path, websocket)
