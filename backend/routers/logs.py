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
        
    log_files = []
    if service == 'all':
        for svc_name, filename in FILES_MAP.items():
            log_files.append((svc_name, filename))
    elif service in FILES_MAP:
        log_files.append((service, FILES_MAP[service]))
    else:
        raise HTTPException(status_code=400, detail="Invalid service name")
        
    all_logs = []
    
    # Simple timestamp regex for sorting: 202Y-MM-DD HH:MM:SS
    # Captures: 2026-01-19 22:23:20
    ts_pattern = re.compile(r'^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})')

    from collections import deque
    
    for svc_name, filename in log_files:
        filepath = os.path.join(LOG_DIR, filename)
        if not os.path.exists(filepath):
            continue
            
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                # Read last 'lines' for each file if 'all' is selected, 
                # or just 'lines' total? slightly ambiguous.
                # Let's read 'lines' from each to ensure we get recent data from all.
                file_lines = deque(f, maxlen=lines)
                
            for line in file_lines:
                clean_line = line.strip()
                if not clean_line:
                    continue
                
                # Prefix if displaying all
                display_line = f"[{svc_name.upper()}] {clean_line}" if service == 'all' else clean_line
                redacted = redact_line(display_line)
                
                # Extract timestamp for sorting
                match = ts_pattern.search(clean_line)
                # Fallback for Uvicorn/Nginx logs if they don't match the simple ISO-like format
                # We simply store them as (timestamp_str, line_content)
                # If no timestamp, use "0" to put them at start, or rely on python's stable sort?
                # Using a default sort key "z" to put them at end might be better, or "0" for start.
                # Let's try to maintain relative order.
                ts_key = match.group(1) if match else "0000-00-00 00:00:00"
                
                all_logs.append({
                    "time": ts_key,
                    "line": redacted
                })
                
        except Exception as e:
            all_logs.append({"time": "0000-00-00 00:00:00", "line": f"[{svc_name.upper()}] Error reading file: {str(e)}"})

    # If 'all', sort by timestamp. If single service, they are already ordered by file read (chronological).
    if service == 'all':
        # Sort by timestamp
        all_logs.sort(key=lambda x: x['time'])
    
    # Return just the lines
    return [item['line'] for item in all_logs]

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
