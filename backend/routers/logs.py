from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
import os
import re
from typing import List, Optional
import zipfile
import io
from auth_service import get_current_user
import psutil
import platform
import subprocess
from datetime import datetime
import database
import models
from sqlalchemy import func

def generate_debug_report():
    """Generate a sanitized system report for debugging"""
    report = []
    report.append("=== VibeNVR System Report ===")
    report.append(f"Date: {datetime.now().isoformat()}")
    report.append(f"OS: {platform.system()} {platform.release()}")
    
    # 1. System Resources
    report.append("\n--- Resources ---")
    try:
        cpu_usage = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/data')
        
        report.append(f"CPU Usage: {cpu_usage}%")
        report.append(f"Memory: {mem.used / (1024**3):.2f}GB / {mem.total / (1024**3):.2f}GB ({mem.percent}%)")
        report.append(f"Disk (/data): {disk.used / (1024**3):.2f}GB / {disk.total / (1024**3):.2f}GB ({disk.percent}%)")
    except Exception as e:
        report.append(f"Error reading resources: {e}")

    # 1.5 HW Acceleration Check
    report.append("\n--- Hardware Acceleration ---")
    hw_status = []
    # Check NVIDIA
    try:
        if subprocess.run(['which', 'nvidia-smi'], stdout=subprocess.DEVNULL).returncode == 0:
            hw_status.append("NVIDIA GPU: Detected (nvidia-smi found)")
        else:
            hw_status.append("NVIDIA GPU: Not Detected")
    except:
         hw_status.append("NVIDIA GPU: Check Failed")
    
    # Check VAAPI/Intel
    if os.path.exists('/dev/dri/renderD128'):
        hw_status.append("VAAPI/Intel: Detected (/dev/dri/renderD128 found)")
    else:
        hw_status.append("VAAPI/Intel: Not Detected")
        
    report.extend(hw_status)

    # 2. Application Config
    report.append("\n--- VibeNVR Config ---")
    
    # Try to read version from package.json
    version = "1.0.0"
    if os.path.exists("package.json"):
        try:
            with open("package.json", "r") as f:
                import json
                data = json.load(f)
                version = data.get("version", "1.0.0")
        except:
            pass
    report.append(f"Version: {version}")

    with database.get_db_ctx() as db:
        try:
            # Camera Summary
            cameras = db.query(models.Camera).all()
            report.append(f"Total Cameras: {len(cameras)}")
            for cam in cameras:
                # Sanitize URL: rtsp://user:pass@ip:port/path -> rtsp://***:***@ip:port/path
                # Sanitize URL: rtsp://user:pass@ip:port/path -> rtsp://user:***@ip:port/path
                # Mask password only, show username for debugging context
                safe_url = "N/A"
                if cam.rtsp_url:
                    safe_url = re.sub(r'(rtsp://[^:]+):([^@]+)@', r'\1:***@', cam.rtsp_url) 
                    
                safe_url = re.sub(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', 'XXX.XXX.XXX.XXX', safe_url)
                
                report.append(f"  - Camera ID {cam.id} ({cam.name}):")
                report.append(f"    Mode: {cam.recording_mode}, Picture Mode: {cam.picture_recording_mode}")
                report.append(f"    Resolution: {cam.resolution_width}x{cam.resolution_height} @ {cam.framerate}fps")
                report.append(f"    Storage Limit: {cam.max_storage_gb}GB")
                report.append(f"    Movie Passthrough: {cam.movie_passthrough}")
                report.append(f"    URL Structure: {safe_url}")
                report.append(f"    Enabled: {cam.is_active}")

            # Global Settings
            settings = db.query(models.SystemSettings).all()
            report.append("\n--- Global Settings ---")
            for s in settings:
                # Redact sensitive settings
                val = s.value
                if any(k in s.key for k in ['password', 'token', 'secret', 'key']):
                    val = "***REDACTED***"
                report.append(f"  {s.key}: {val}")

            # Optimization Status
            report.append("\n--- Optimization Status ---")
            opt_keys = [
                "opt_live_view_fps_throttle", "opt_motion_fps_throttle", 
                "opt_live_view_height_limit", "opt_motion_analysis_height",
                "opt_live_view_quality", "opt_snapshot_quality", "opt_ffmpeg_preset"
            ]
            # Create a lookup from the already fetched settings
            settings_map = {s.key: s.value for s in settings}
            
            for k in opt_keys:
                val = settings_map.get(k, "Not Set (Using Default)")
                report.append(f"  {k}: {val}")

            # 3. Database Stats
            report.append("\n--- Database Stats ---")
            try:
                total_videos = db.query(models.Event).filter(models.Event.type == 'video').count()
                total_images = db.query(models.Event).filter(models.Event.type == 'image').count() # or snapshot?
                # Check models.Event types. Usually 'video' and 'snapshot' or 'image'. 
                # Let's check actual data.
                # Assuming 'video' and 'snapshot' based on other files.
                total_snapshots = db.query(models.Event).filter(models.Event.type == 'snapshot').count()
                
                report.append(f"Total Video Events: {total_videos}")
                report.append(f"Total Snapshot Events: {total_snapshots}")
                
                # Oldest Event
                oldest = db.query(models.Event).order_by(models.Event.timestamp_start.asc()).first()
                if oldest:
                    report.append(f"Oldest Event: {oldest.timestamp_start}")
                else:
                     report.append("Oldest Event: None")
                     
            except Exception as e:
                report.append(f"Error querying DB stats: {e}")

        except Exception as e:
            report.append(f"Error generating config report: {e}")

    return "\n".join(report)

router = APIRouter(
    prefix="/logs",
    tags=["logs"],
    responses={404: {"description": "Not found"}},
)

LOG_DIR = "/data/logs"
FILES_MAP = {
    "backend": "backend.log",
    "engine": "engine.log",
    "frontend_access": "frontend.access.log",
    "frontend_error": "frontend.error.log",
}

def redact_line(line: str) -> str:
    # 1. Redact credentials in URLs (rtsp://user:pass@host)
    line = re.sub(r'([a-z]+://[^:]+:)([^@]+)(@)', r'\1***\3', line)
    
    # 2. Sensitive keys list
    sensitive_keys = r'password|pwd|secret|token|access_token|Authorization|X-API-Key|client_secret|totp_secret|media_token'
    
    # 3. Handle Bearer tokens specifically (to avoid overlap with Authorization header masking)
    line = re.sub(r'(?i)Bearer\s+[\w\-\.]+', r'Bearer REDACTED', line)
    
    # 4. Handle JSON/YAML/Quoted formats: "key": "value" or 'key': 'value'
    # Quotes around the key are optional, but quotes around the value are handled.
    line = re.sub(rf'(?i)(["\']?({sensitive_keys})["\']?\s*[:=]\s*["\'])([^"\']+)(["\'])', r'\1***\4', line)
    
    # 5. Handle unquoted key-value pairs: key=value or key: value
    # We avoid matching if it was already handled by quotes or if it's Bearer
    # Use negative lookahead/lookbehind if needed, but simple order often works
    line = re.sub(rf'(?i)\b({sensitive_keys})\b\s*[:=]\s*(?!Bearer )[\w\-\.!@#$%^&*()]+', r'\1=REDACTED', line)
    
    # 6. Redact IPs (preserve localhost 127.0.0.1)
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    def mask_ip(match):
        ip = match.group(0)
        if ip.startswith("127."):
            return ip
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
                # Extract timestamp for sorting
                # 1. Standard (Python logging): 2026-01-19 22:23:20
                match = ts_pattern.search(clean_line)
                
                # 2. Uvicorn/FastAPI sometimes: INFO:     172.18.0.5:46074 - "GET ...
                # These don't have timestamps by default in console output, but file might if configured?
                # If reading direct stdout redirection, they lack it unless we configure uvicorn log config.
                
                # 3. Nginx Access Log default: [21/Jan/2026:10:33:57 +0000]
                nginx_match = re.search(r'\[(\d{2}/[A-Za-z]{3}/\d{4}:\d{2}:\d{2}:\d{2})', clean_line)
                
                ts_key = "0000-00-00 00:00:00"
                if match:
                    ts_key = match.group(1)
                elif nginx_match:
                    # Convert Nginx format to sortable string? Or just use "z" to append?
                    # Nginx: 21/Jan/2026:10:33:57
                    try:
                        dt = datetime.strptime(nginx_match.group(1), "%d/%b/%Y:%H:%M:%S")
                        ts_key = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except:
                        pass
                
                # Uvicorn lines without timestamp -> Assign current time or file mod time? 
                # Impossible to know exactly. We'll use a special prefix "z_" + line_index to keep relative order
                # if mixed with timestamped logs this will be messy.
                # BETTER: If 'all' is requested, we really want sortable keys.
                # If we fail to parse, we might look at the *previous* parsed timestamp in this file context?
                
                if ts_key == "0000-00-00 00:00:00":
                     # Attempt to grab trailing Uvicorn access log? No, it's prefix.
                     # Let's just leave it as 0000-00-00. They will appear at the top.
                     pass
                
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
        
        # Add System Info Report
        try:
            report = generate_debug_report()
            zip_file.writestr("system_report.txt", report)
        except Exception as e:
            zip_file.writestr("report_error.txt", f"Failed to generate report: {str(e)}")
    
    zip_buffer.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="vibenvr_logs_sanitized.zip"'
    }
    
    return StreamingResponse(iter([zip_buffer.getvalue()]), media_type="application/zip", headers=headers)
