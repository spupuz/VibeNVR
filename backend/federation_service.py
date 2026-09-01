import httpx
from fastapi import Request, HTTPException
from fastapi.responses import StreamingResponse

# Setup a global async client to reuse connections
# We use a long timeout because media streams (like playback) can take a while to initialize
# and we might stream large chunks of data.
client = httpx.AsyncClient(timeout=30.0)

async def proxy_request(node_url: str, api_token: str, path: str, request: Request):
    """
    Proxies an incoming FastAPI Request to a remote federated node.
    """
    # Clean up base URL and path to avoid double slashes
    base_url = node_url.rstrip("/")
    if not path.startswith("api/"):
        path = f"api/{path}"
    
    target_url = f"{base_url}/{path}"
    
    # We copy the query params
    params = dict(request.query_params)
    
    # We strip headers that could cause issues (Host, Content-Length)
    # and we inject the API Token as X-API-Key for the remote node
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)
    # Remove local authorization header
    headers.pop("authorization", None)
    if api_token:
        headers["x-api-key"] = str(api_token)
    
    # Read the body if it exists
    body = await request.body()
    
    try:
        req_kwargs = {
            "method": request.method,
            "url": target_url,
            "params": params,
            "headers": headers
        }
        if request.method not in ["GET", "HEAD", "OPTIONS"]:
            req_kwargs["content"] = body
            
        client = httpx.AsyncClient(timeout=30.0, verify=False)  # nosec B501
        req = client.build_request(**req_kwargs)
        
        response = await client.send(req, stream=True)
        
        return StreamingResponse(
            response.aiter_raw(),
            status_code=response.status_code,
            headers={k: v for k, v in response.headers.items() if k.lower() not in ("content-encoding", "content-length", "transfer-encoding")}
        )
        
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Bad Gateway: Error communicating with federated node. {str(exc)}")
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal proxy error: {str(exc)}")

import websockets
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
import logging

async def proxy_websocket(node_url: str, api_token: str, path: str, websocket: WebSocket):
    """
    Proxies an incoming WebSocket connection to a remote federated node.
    """
    base_url = node_url.rstrip("/")
    if not path.startswith("api/"):
        path = f"api/{path}"
        
    # Convert http:// to ws://
    if base_url.startswith("http://"):
        target_ws_url = base_url.replace("http://", "ws://", 1)
    elif base_url.startswith("https://"):
        target_ws_url = base_url.replace("https://", "wss://", 1)
    else:
        target_ws_url = f"ws://{base_url}"
        
    target_ws_url = f"{target_ws_url}/{path}"
    
    # Append query params if any
    query = websocket.scope.get("query_string", b"").decode()
    if query:
        target_ws_url += f"?{query}"
        
    headers = {"x-api-key": str(api_token)}
    
    await websocket.accept()
    
    try:
        async with websockets.connect(target_ws_url, additional_headers=headers) as remote_ws:
            async def forward_to_remote():
                try:
                    while True:
                        msg = await websocket.receive()
                        if "bytes" in msg:
                            await remote_ws.send(msg["bytes"])
                        elif "text" in msg:
                            await remote_ws.send(msg["text"])
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logging.error(f"WS Proxy forward error: {e}")

            async def forward_to_client():
                try:
                    while True:
                        msg = await remote_ws.recv()
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                except websockets.exceptions.ConnectionClosed:
                    pass
                except Exception as e:
                    logging.error(f"WS Proxy receive error: {e}")

            # Run both forwarding tasks concurrently
            await asyncio.gather(
                forward_to_remote(),
                forward_to_client()
            )
    except Exception as e:
        logging.error(f"Failed to connect to remote websocket {target_ws_url}: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
