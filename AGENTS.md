# VibeNVR AI Agent Instructions

> **All AI agents must conform to [CONTEXT.md](./CONTEXT.md)**

VibeNVR is a lightweight, modern Network Video Recorder (NVR) built with **Python (FastAPI)** backend and **React (Vite)** frontend. It leverages Docker for orchestration and FFmpeg for video processing.

## Development Environment

```bash
docker compose up -d --build    # Start/Rebuild the dev environment
docker compose logs -f          # Follow logs
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
├── *_service.py      # Business logic (motion, storage, auth, etc.)
└── scripts/          # Migration and utility scripts
```

**Key patterns:**
- **Routers**: Handle HTTP request/response, validation, and auth.
- **Services**: Contain business logic. Called by routers.
- **CRUD**: Strictly database operations.
- **Dependency Injection**: Use `Depends(database.get_db)` and `Depends(auth_service.get_current_active_admin)`.

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
- **Components**: Functional React components with Hooks.
- **Styling**: TailwindCSS utility classes.
- **State Management**: React `useState` and `Context` for global state (Auth).
- **Icons**: `lucide-react` for all icons.

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

The frontend uses `AuthContext` to manage the JWT token. Always check for token existence before making API calls.

```jsx
// frontend/src/contexts/AuthContext.jsx (Pattern)
export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('vibe_token'));
    
    // ...
    
    useEffect(() => {
        if (token) {
             const initAuth = async () => {
                 const res = await fetch('/api/auth/me', {
                     headers: { Authorization: `Bearer ${token}` }
                 });
                 // ...
             }
             initAuth();
        }
    }, [token]);
};
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
        if v and v.strip().lower().startswith('file://'):
            raise ValueError('Local file access via file:// is not allowed')
        return v
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
**Bad**: Logging sensitive data (URLs with credentials, tokens) directly.
```python
logger.info(f"Connecting to {rtsp_url}") # BAD! Exposes credentials.
```
**Good**: Filter sensitive data or use placeholders.
```python
safe_url = re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', rtsp_url)
logger.info(f"Connecting to {safe_url}")
```

## Security & Data Privacy

> **CRITICAL**: All AI agents must read and strictly adhere to [SECURITY.md](SECURITY.md).

- **Sanitize everything**: Every input from the user or the network must be validated using Pydantic schemas.
- **Mask logs and telemetry**: Ensure that no sensitive information is ever written to logs or telemetry streams.
- **Role-Based Access Control (RBAC)**: Always check for `current_user` role when implementing new API endpoints.

## AI-Assisted Contributions

### Required Reading
1. **Must read**: [CONTEXT.md](CONTEXT.md) and [SECURITY.md](SECURITY.md)
2. **Must follow**: Code conventions (Python PEP8, React Hooks rules).

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
