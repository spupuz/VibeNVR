from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
import os
import re
from typing import List, Optional
import zipfile
import io
from auth_service import get_current_user

router = APIRouter(
    prefix="/logs",
    tags=["logs"],
    responses={404: {"description": "Not found"}},
)

LOG_DIR = "/var/log/vibenvr"
FILES_MAP = {
    "backend": "backend.log",
    "engine": "engine.log",
    "frontend_access": "frontend.access.log",
    "frontend_error": "frontend.error.log",
}

def redact_line(line: str) -> str:
    # 1. Redact JWT Tokens / Bearer tokens
    line = re.sub(r'(token|access_token|Authorization)=\s*[\w\-\.]+', r'\1=REDACTED', line)
    line = re.sub(r'Bearer\s+[\w\-\.]+', r'Bearer REDACTED', line)
    
    # 2. Redact Passwords (in URLs or JSON)
    line = re.sub(r'(password|pwd|secret|client_secret)=[\w\-\.!@#$%^&*()]+', r'\1=REDACTED', line)
    
    # 3. Redact IPs (preserve localhost)
    # Regex for IPv4
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    
    def mask_ip(match):
        ip = match.group(0)
        # Preserve loopback
        if ip.startswith("127."):
            return ip
        # Preserve internal docker subnet (often 172.)? User said NO IP. So we mask all external.
        return "XXX.XXX.XXX.XXX"
        
    line = re.sub(ip_pattern, mask_ip, line)
    
    return line

@router.get("/", response_model=List[str])
async def get_logs(
    service: str = Query(..., description="Service name: backend, engine, frontend_access, frontend_error"),
    lines: int = Query(100, description="Number of lines to return"),
    search: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    if user.role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
        
    if service not in FILES_MAP:
        raise HTTPException(status_code=400, detail="Invalid service name")
        
    filepath = os.path.join(LOG_DIR, FILES_MAP[service])
    if not os.path.exists(filepath):
        return ["Log file not found or empty yet."]
        
    # Read file efficiently
    try:
        # Use simple reading for now. For huge files, `tail` equivalent is better.
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            # If requesting huge lines, maybe seek? But simple readlines is safer for now.
            # reading all lines can be heavy.
            # Optimization: Seek to end and read backwards? Too complex for python text I/O.
            # Using deque is standard for 'tail'.
            from collections import deque
            all_lines = deque(f, maxlen=2000) # Read last 2000 lines max to memory
            
        processed_lines = []
        # Filter and Redact (in reverse order roughly if we want newest first? No, logs usually displayed old->new)
        # Deque is old->new.
        
        # We need to take the LAST 'lines' requested.
        # If search is enabled, we might need to search deeper than 'lines'.
        # But for performance let's stick to the window.
        
        final_list = list(all_lines)
        if search:
            # If searching, filter first
            final_list = [l for l in final_list if search.lower() in l.lower()]
            
        # Slice to requested limit
        final_list = final_list[-lines:]
        
        for line in final_list:
            processed_lines.append(redact_line(line.strip()))
            
        return processed_lines
        
    except Exception as e:
        return [f"Error reading logs: {str(e)}"]

@router.get("/download")
async def download_all_logs(user: dict = Depends(get_current_user)):
    """
    Generate a sanitized tar.gz/zip of all log files.
    """
    if user.role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")

    # Create in-memory zip
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        for service, filename in FILES_MAP.items():
            filepath = os.path.join(LOG_DIR, filename)
            if os.path.exists(filepath):
                # We need to read, redact, and write to zip
                sanitized_content = []
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                        for line in f:
                            sanitized_content.append(redact_line(line))
                    
                    zip_file.writestr(f"sanitized_{filename}", "".join(sanitized_content))
                except Exception as e:
                    zip_file.writestr(f"error_{service}.txt", str(e))
    
    zip_buffer.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="vibenvr_logs_sanitized.zip"'
    }
    
    return StreamingResponse(iter([zip_buffer.getvalue()]), media_type="application/zip", headers=headers)
