# VibeNVR AI Agent Instructions

> **All AI agents must conform to [CONTEXT.md](./CONTEXT.md)**

VibeNVR is a lightweight, modern Network Video Recorder (NVR) built with **Python (FastAPI)** backend and **React (Vite)** frontend. It leverages Docker for orchestration and FFmpeg for video processing.

## Development Environment

```bash
docker compose down && docker compose up -d --build && docker compose logs --tail 100    # Rebuild/Restart the dev environment
```

- Frontend: http://localhost:8080 (Nginx Production Build)
- Backend: http://localhost:5005 (FastAPI)
- API Docs: http://localhost:5005/docs

## Architecture Overview

### Backend (`backend/`)

```
backend/
├── main.py           # App entry point, CORS config, exception handlers
├── models.py         # SQLAlchemy Database Models
├── schemas.py        # Pydantic Schemas for validation
├── crud.py           # Database CRUD operations
├── database.py       # DB connection & SessionLocal
├── routers/          # API Routes (cameras, events, settings, etc.)
└── *_service.py      # Business logic (motion, storage, auth, etc.)
```

**Key patterns:**
- **Routers**: Handle HTTP request/response, validation, and auth.
- **Services**: Contain business logic. Called by routers.
- **CRUD**: Strictly database operations.
- **Dependency Injection**: Use `Depends(database.get_db)` and `Depends(auth_service.get_current_active_admin)`.

### Engine (`engine/`)

```
engine/
├── core.py               # CameraManager & Webhook Event Dispatcher
├── camera_thread.py      # Main loop, coordinates components & frame processing
├── stream_reader.py      # PyAV RTSP connection, IP ban protection, WS broadcast
├── recording_manager.py  # FFmpeg subprocess management (Passthrough, Transcoding, HW accel)
├── motion_detector.py    # MOG2 background subtraction and motion analysis
├── mask_handler.py       # JSON polygon parsing and frame masking
└── overlay_handler.py    # OSD text overlays on frames
```

**Key patterns:**
- **Modular Components**: `camera_thread.py` delegates IO and heavy processing to dedicated modules.
- **Resilience**: `stream_reader.py` implements smart backoff (401/403 -> 5m, Refused -> 1m) to avoid IP bans on standard consumer cameras (e.g. Tapo/TP-Link).
- **Graceful Degradation**: `recording_manager.py` falls back from Passthrough to software/HW encoding on failures.

### Frontend (`frontend/src/`)

```
src/
├── components/       # Reusable UI components
├── pages/            # Main page views (routed)
├── contexts/         # React Contexts (Auth, Toast, etc.)
├── assets/           # Static assets
├── App.jsx           # Main App component & Routing logic
└── main.jsx          # Entry point
```

**Key patterns:**
- **Components**: Functional React components with Hooks. Keep them small (<300 LOC preferred).
- **Modular Pages**: Large pages (e.g., `Cameras.jsx`) must be decomposed into a directory (e.g., `src/components/Cameras/`) with sub-components for modals and complex UI sections.
- **Styling**: TailwindCSS utility classes.
- **State Management**: React `useState` and `Context` for global state (Auth).
- **Icons**: `lucide-react` for all icons.

### Telemetry Worker (`vibenvr-telemetry-worker/`)

```
vibenvr-telemetry-worker/src/
├── index.js          # Main Cloudflare Worker entry point
├── api.js            # External API interactions
├── dashboard.js      # Status dashboard HTML rendering
├── ingest.js         # Telemetry data ingestion
├── security.js       # Security headers and CSP
└── assets.js         # Static asset delivery
```

**Key patterns:**
- **Cloudflare Worker**: Runs at the edge, requiring lightweight ES modules.
- **Strict Modularity**: Each file handles a single domain to respect the strict 1000 LOC policy.
- **Security Check**: Enforces CSP and API token requirements natively on the edge before requests hit the origin.

## Critical Patterns

### FastAPI Route Pattern

Routes must use `schemas` for validation and `Depends` for database sessions.

```python
# backend/routers/cameras.py (Pattern)
@router.post("", response_model=schemas.Camera)
def create_camera(
    camera: schemas.CameraCreate, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
    # Logic delegated to crud or service
    new_camera = crud.create_camera(db=db, camera=camera)
    motion_service.generate_motion_config(db)
    return new_camera
```

### React Authentication Pattern

The frontend uses `AuthContext` to manage the JWT token in memory. **Do not use `localStorage` for the token** — it is vulnerable to XSS. The token is persisted across page reloads via a `HttpOnly` cookie (`auth_token`) set by the backend on login.

All API calls — including media endpoints (`/cameras/{id}/frame`, `/cameras/{id}/stream`) — must use `Authorization: Bearer ${token}` in the request headers. The `media_token` HttpOnly cookie is maintained as a secondary fallback but should never be the sole authentication mechanism.

```jsx
// frontend/src/contexts/AuthContext.jsx (Pattern)
export const AuthProvider = ({ children }) => {
    // Token in memory ONLY — never in localStorage
    const [token, setToken] = useState(null);

    // On page reload: bootstrap session from HttpOnly cookie (server-side read)
    const bootstrapFromCookie = useCallback(async () => {
        const res = await fetch('/api/auth/me-from-cookie', { credentials: 'include' });
        if (res.ok) {
            const { user, access_token } = await res.json();
            setUser(user);
            setToken(access_token); // stored in memory, not localStorage
        }
    }, []);

    const login = (newToken, userData) => {
        setToken(newToken); // HttpOnly cookie already set by backend response
        setUser(userData);
        // No localStorage
    };

    const logout = async () => {
        setToken(null);
        setUser(null);
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    };
};

// Correct pattern for media fetch (frame polling):
const response = await fetch(`/api/cameras/${id}/frame?t=${Date.now()}`, {
    credentials: 'include',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
});
```


### Pydantic Schema Validation

All data models must use Pydantic schemas with validators where necessary (e.g., preventing path traversal).

```python
# backend/schemas.py (Pattern)
class CameraBase(BaseModel):
    name: str
    rtsp_url: str
    
    @field_validator('rtsp_url')
    @classmethod
    def validate_rtsp_url(cls, v: str) -> str:
        if v:
            v_lower = v.strip().lower()
            if not v_lower.startswith(('rtsp://', 'rtsps://', 'http://', 'https://')):
                raise ValueError('URL must start with valid protocols')
            if 'localhost' in v_lower or '127.0.0.1' in v_lower:
                raise ValueError('Localhost access is not allowed')
        return v
```

### Camera Connection Pattern (IP Ban Protection)

To prevent cameras from banning the host IP due to rapid authentication retries (common on Tapo/TP-Link), use **PyAV (`av.open`)** for the connection attempt. PyAV provides native FFmpeg bindings that are more resilient than `cv2.VideoCapture` for RTSP streams.

- **Rule**: A 401/403 result from `av.open` must enter a **5-minute backoff period**.
- **Rule**: Connection refused/reset errors should trigger a longer backoff (60-300s).
- **Rule**: If a Sub-Stream is configured, the system initializes an independent `sub_stream_reader`. The `CameraThread` prioritizes frames from the sub-stream for the UI grid view to optimize bandwidth.

```python
# engine/camera_thread.py (Pattern)
import av

# Main Stream Reader
self.stream_reader = StreamReader(url, transport, ...)
# Optional Sub Stream Reader
if sub_url:
    self.sub_stream_reader = StreamReader(sub_url, sub_transport, ...)

try:
    container = av.open(url, options={'rtsp_transport': 'tcp'}, timeout=8.0)
    # Success
except Exception as e:
    if "401" in str(e) or "unauthorized" in str(e).lower():
        self.health_status = "UNAUTHORIZED"
        # Enter 5-minute backoff
```

### Configuration Backup & Restore Pattern

The system supports full configuration backups (Cameras, Settings, Groups, Users, Storage Profiles) stored in JSON format within `/data/backups/`.

- **Rule**: Standard retention policy (default 10 files) applies ONLY to automatic backups (`AUTO`).
- **Rule**: Manual backups (`MANUAL`) are preserved indefinitely until user deletion.
- **Rule**: On startup, the `BackupSchedulerThread` checks for existing recent backups and skips the immediate run if the interval has not passed (to avoid spamming during restarts).
- **Rule**: All backup/restore endpoints must be Admin-only.

```python
# backend/routers/settings.py (Pattern)
@router.post("/backup/run")
def manual_backup(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth_service.get_current_active_admin)):
    backup_service.run_backup(is_manual=True)
    return {"message": "Manual backup completed successfully"}
```

### Privacy Masking & Motion Zones Pattern

Privacy masks and motion zones are stored as JSON strings in the database and synced to the engine.

- **Rule**: Privacy masks are applied *before* any other processing (recording, motion).
- **Rule**: Motion zones are used strictly for **motion exclusion** and do not obscure video.
- **Rule**: `passthrough_recording` must be disabled if privacy masks are active to allow burning masks into the stream.
- **Rule**: Use the `?raw=true` query parameter with admin credentials to retrieve unmasked frames for the UI editor.

```python
# backend/routers/cameras.py
@router.get("/{camera_id}/frame")
def get_camera_frame(camera_id: int, raw: bool = False, ...):
    # If raw=true and admin, fetch unmasked frame from engine
    pass
```

### Event Deletion & Path Traversal Pattern

All file deletions must be performed via the `delete_event_files` helper to ensure mandatory path sanitization and prevent traversal attacks.

```python
# backend/routers/events.py (Pattern)
def delete_event_files(event: models.Event) -> int:
    # 1. Map container paths (/var/lib/...) to backend paths (/data/...)
    # 2. MANDATORY: Verify os.path.abspath(path).startswith("/data/")
    # 3. Securely remove file and return bytes deleted
```
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Blocking Async Logic
**Bad**: Performing blocking I/O (DB, File) inside an `async def` function in FastAPI.
```python
@router.get("/")
async def read_items(db: Session = Depends(get_db)):
    return db.query(models.Item).all()  # BLOCKING! Freezes the event loop.
```
**Good**: Use `def` for blocking operations (FastAPI runs them in a threadpool).
```python
@router.get("/")
def read_items(db: Session = Depends(get_db)):
    return db.query(models.Item).all()  # Safe.
```

### Anti-Pattern 2: Hardcoded Styles
**Bad**: Using custom CSS or inline styles when Tailwind exists.
```jsx
<div style={{ padding: '20px', backgroundColor: 'red' }}>Error</div>
```
**Good**: Use Tailwind utilities.
```jsx
<div className="p-5 bg-red-500 text-white">Error</div>
```

### Anti-Pattern 3: Ignoring RBAC
**Bad**: Creating sensitive endpoints without checking user role.
```python
@router.delete("/camera/{id}")
def delete_camera(id: int, db: Session = Depends(get_db)):
    # Anyone can delete!
```
**Good**: Require appropriate role (e.g., Admin).
```python
@router.delete("/camera/{id}")
def delete_camera(
    id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_active_admin)
):
### Anti-Pattern 4: Raw Logs
**Bad**: Logging sensitive data (URLs with credentials, tokens) directly without context.
```python
logger.info(f"Connecting to {rtsp_url}") # BAD! Exposes credentials in stdout.
```
**Good**: While the **centralized log router** (`backend/routers/logs.py`) automatically masks stdout logs, it is best practice to sanitize URLs before logging using `re.sub`.
```python
safe_url = re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', rtsp_url)
logger.info(f"Connecting to {safe_url}")
```

## Security & Data Privacy

> **CRITICAL**: All AI agents must read and strictly adhere to [SECURITY.md](SECURITY.md).

- **Sanitize everything**: Every input from the user or the network must be validated using Pydantic schemas.
- **Mask logs and telemetry**: Ensure that no sensitive information is ever written to logs or telemetry streams.
- **No Absolute Host Paths**: Never hardcode absolute host paths (e.g., `/absolute/path/to/repo/...`). All paths in documentation must be relative or dynamically resolved.
- **Role-Based Access Control (RBAC)**: Always check for `current_user` role when implementing new API endpoints.

## AI-Assisted Contributions

### Required Reading
1. **Must read**: [CONTEXT.md](CONTEXT.md) and [SECURITY.md](SECURITY.md)
2. **Must follow**: Code conventions (Python PEP8, React Hooks rules).

### Developer Guidelines

- **Testing**: Before any verification (automated or manual), always perform a full rebuild to ensure all changes are active:
  ```bash
  docker compose down && docker compose up -d --build && docker compose logs --tail 100
  ```
- **Commits**: Always run local tests (`/run-tests.md` or manual pytest) AND perform manual verification (human UX check) after a full rebuild before committing. Never commit failing code or unverified UI changes. **Wait for explicit USER confirmation after manual verification before committing.**
- **Pushes**: Do NOT push to remote repositories unless explicitly requested by the USER.
- **Documentation**: Keep documentation synced with code changes.
- **Code Size Policy**: 
  - **New files**: MUST NOT exceed **500 effective lines of code** (excluding comments/blank lines).
  - **Existing files (Legacy)**: MUST NOT exceed **1000 effective lines of code**. If reached, the file must be refactored into smaller modules.
  - **Enforcement**: This is strictly enforced via the `check_effective_loc.py` assurance script. Any violation will fail the security audit workflow.

### Contribution Template

```markdown
## Summary
[Description of changes]

## Changes
- [File/Component]: [Change details]

## Verification
- [ ] Docker build successful
- [ ] Backend logs clear of errors
- [ ] UI tested on Desktop & Mobile
```
