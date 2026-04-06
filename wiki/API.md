# VibeNVR API Documentation (Wiki)

Welcome to the VibeNVR API Wiki. This document provides a detailed technical reference for interacting with the VibeNVR backend services.

## 🔑 Authentication

VibeNVR uses two primary authentication methods: **JWT (JSON Web Tokens)** for session-based access and **API Tokens** for long-term integrations.

### 1. Bearer Token (JWT)
Used mostly by the frontend for API calls. Tokens are obtained via the login endpoint and usually expire after 7 days.
- **Header**: `Authorization: Bearer <your_jwt_token>`

### 2. Media Authentication (HttpOnly Cookie)
For security, VibeNVR uses **secure HttpOnly cookies** (`media_token`) to authenticate requests for static media (snapshots, recordings, live frames). 
- These cookies are automatically set by the backend upon successful login via browser.
- **Programmatic Access**: If you are accessing media via a script (e.g., Python, Node.js) and Cannot use automated cookie handling, you can manually pass the JWT in the `Cookie` header:
  `Cookie: media_token=<your_jwt_token>`
- They prevent token leakage in browser history and third-party scripts.
- **Note**: Query parameters (`?token=`) are deprecated and will be removed in future versions.

### 3. API Key (Personal Access Token)
Recommended for 3rd party integrations (Home Assistant, scripts, etc.).
- **Header**: `X-API-Key: <your_api_key>`
- **TTL**: Tokens can be created with an optional expiration date (TTL).
- **Scope**: Inherits permissions from the user who created it (mostly Admin).

---

## 🚀 Core API Endpoints

### 🔐 Authentication (`/auth`)

#### **POST** `/auth/login`
Authenticate and obtain a JWT access token. This endpoint also sets two **HttpOnly** cookies:
- `auth_token` — persists the session across page reloads (eliminates localStorage XSS risk)
- `media_token` — authenticates media file access
- **Form Data**:
  - `username`: User's login
  - `password`: User's password
  - `totp_code`: (Optional) 2FA code if enabled
- **Response Example**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

#### **POST** `/auth/logout`
Clear both `auth_token` and `media_token` HttpOnly cookies server-side. Call this on user logout.
- **Auth Required**: None (cookies are cleared regardless)

#### **GET** `/auth/me-from-cookie`
Bootstrap the session from the HttpOnly `auth_token` cookie. Used by the frontend on page reload — the browser sends the cookie automatically and the server returns `{ user, access_token }` for in-memory state.
- **Auth Required**: Valid `auth_token` cookie

#### **GET** `/auth/me`
Retrieve profile information for the currently authenticated user.
- **Auth Required**: JWT or API Key
- **Response Example**:
```json
{
  "username": "admin",
  "email": "user@example.com",
  "role": "admin",
  "is_2fa_enabled": true,
  "id": 1
}
```

---

### 📷 Cameras (`/cameras`)

#### **GET** `/cameras`
List all configured cameras.
- **Auth Required**: JWT or API Key
- **Response Note**: Returns full details for JWT, and sanitized "Summary" for API Keys.
- **Response Example**:
```json
[
  {
    "id": 1,
    "name": "Entrance",
    "location": "Main Door",
    "is_active": true,
    "resolution_width": 1920,
    "resolution_height": 1080,
    "recording_mode": "Motion Triggered",
    "privacy_masks": "[{\"points\":[...]}]",
    "motion_masks": "[]"
  }
]
```

#### **GET** `/cameras/{camera_id}/frame`
Download a live JPEG frame from the camera.
- **Query Params**:
  - `raw`: (Optional, Admin only) Set to `true` to get the unmasked frame for editing.
- **Auth Required**: Admin privileges or valid `media_token` cookie.

#### **POST** `/cameras/{camera_id}/snapshot`
Trigger a manual snapshot.
- **Auth Required**: Admin privileges.

---

### 🔔 Events (`/events`)

#### **GET** `/events`
List motion events and recordings.
- **Filters**: `camera_id`, `type` (video/snapshot), `date` (YYYY-MM-DD).
- **Response Example**:
```json
[
  {
    "id": 42,
    "camera_id": 1,
    "timestamp_start": "2026-02-21T12:00:00",
    "type": "video",
    "file_size": 10485760,
    "width": 1920,
    "height": 1080
  }
]
```

#### **GET** `/events/{event_id}/download`
Download the media file associated with an event.
- **Auth Required**: Valid `media_token` cookie or JWT.

#### **POST** `/events/bulk-delete`
Delete multiple individual events and their associated media files in a single request.
- **Auth Required**: Admin privileges.
- **Payload Example**:
  ```json
  {
    "event_ids": [42, 43, 44]
  }
  ```
- **Response Example**:
  ```json
  {
    "deleted_count": 3,
    "errors": []
  }
  ```

#### **DELETE** `/events/bulk/all`
Delete all events in the system, with optional filtering by type.
- **Query Params**:
  - `event_type`: (Optional) `video` or `picture`. If omitted, all events are deleted.
- **Auth Required**: Admin privileges.
- **Response Example**:
  ```json
  {
    "deleted_count": 150,
    "deleted_size_mb": 1240.5,
    "type": "all"
  }
  ```

---

### 📊 System & Stats (`/stats`)

#### **GET** `/stats`
Get comprehensive system health, storage, and resource usage.
- **Auth Required**: Bearer or API Key
- **Response Example**:
```json
{
  "active_cameras": 4,
  "storage": {
    "used_gb": 150.5,
    "total_gb": 1000.0,
    "percent": 15
  },
  "resources": {
    "cpu_percent": 12.5,
    "memory_mb": 450.2
  },
  "uptime": "5d 12h 30m"
}
```

#### **GET** `/stats/history`
Get event activity history for the last 24 hours (hourly buckets).

---

### 💾 Storage Profiles (`/storage/profiles`)

#### **GET** `/storage/profiles`
List all custom storage profiles.
- **Auth Required**: Admin privileges.

#### **POST** `/storage/profiles`
Create a new storage profile.
- **Payload**:
  ```json
  {
    "name": "SSD Storage",
    "path": "/storage/ssd",
    "description": "Optional info",
    "max_size_gb": 100.0
  }
  ```
- **Auth Required**: Admin privileges.

#### **PUT** `/storage/profiles/{id}`
Update an existing storage profile.

#### **DELETE** `/storage/profiles/{id}`
Delete a storage profile.
- **Note**: Cameras using this profile will automatically revert to the default storage path.

---

---
 
### 💾 Backup & Restore (`/settings/backup`)
 
#### **GET** `/settings/backup/export`
Export the entire system configuration (cameras, settings, users, etc.) as a JSON file.
- **Auth Required**: Admin privileges.
- **Rate Limit**: 5/minute.
 
#### **POST** `/settings/backup/import`
Import a configuration from a JSON file. Overwrites existing matching settings.
- **Payload**: `multipart/form-data` with a `file` field.
- **Auth Required**: Admin privileges.
- **Rate Limit**: 5/minute.
 
#### **GET** `/settings/backup/list`
List all backup files available on the server in `/data/backups/`.
- **Auth Required**: Admin privileges.
- **Response Example**:
```json
[
  {
    "filename": "vibenvr_backup_AUTO_20260221_120000.json",
    "size": 15420,
    "created_at": "2026-02-21T12:00:00"
  }
]
```
 
#### **POST** `/settings/backup/run`
Manually trigger a system backup. The file will be saved on the server with a `MANUAL` prefix.
- **Auth Required**: Admin privileges.
 
#### **POST** `/settings/backup/restore-file/{filename}`
Restore the system configuration from a file already stored on the server.
- **Auth Required**: Admin privileges.
 
#### **DELETE** `/settings/backup/{filename}`
Permanently delete a backup file from the server.
- **Auth Required**: Admin privileges.
 
---
 
### 🛠 Settings (`/settings`)

#### **GET** `/settings`
Retrieve all global system settings (Admin only).

#### **PUT** `/settings/{key}`
Update a specific system setting.
- **Example Payload**: `"value": "30"`

#### **GET** `/settings/engine/debug-status`
Retrieve the real-time runtime status of the video engine (Admin only).
- **Usage**: Diagnostic tool to verify mask synchronization and thread health.
- **Response**: Map of camera IDs to their engine state.

---

## 🔗 Integration Examples

### Python (using Bearer Token)
```python
import requests

url = "http://localhost:8080/stats"
headers = {"Authorization": "Bearer YOUR_JWT_TOKEN"}
response = requests.get(url, headers=headers)
print(response.json())
```

### cURL (using API Key)
```bash
curl -X GET "http://localhost:8080/stats" \
     -H "X-API-Key: YOUR_VIBENVR_API_KEY"
```

### Using Shared URL (Media)
Media access is now secured via cookies. Browser-based requests (like `<img>` tags) work automatically after login.
*(Current Version: v1.23.0)*
```html
<img src="http://localhost:8080/media/Camera1/2026-02-21/snap.jpg" />
```

---

> [!TIP]
> Always use HTTPS in production environments.
> API Keys are only shown once during creation—store them securely.
