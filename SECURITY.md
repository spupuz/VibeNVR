# Security Policy & Architecture

VibeNVR treats the security of your video surveillance data as a top priority. This document outlines the security architecture, authentication mechanisms, and procedures for reporting vulnerabilities as implemented directly in the core codebase.

## 🛡️ Security Architecture

VibeNVR employs a defense-in-depth strategy, isolating components and ensuring strict access control at the network and API layers.

1. **Internal Port Protection**: By default, critical internal services (the Python Backend API on port `5005` and the VibeEngine processing node on port `8000`) bind exclusively to the internal Docker network. They are **NOT** safely accessible from the outside network, effectively isolating them from direct external attacks.
2. **Reverse Proxy Ready**: The system is designed to be deployed behind a Reverse Proxy (e.g., Nginx Proxy Manager). This offloads SSL termination and ensures only the frontend interface (HTTP/HTTPS) is exposed to the public internet or untrusted LAN segments.
3. **Database Security**: The PostgreSQL database is contained within the Docker bridge network and is not mapped to any host ports. Data persistence is managed securely via Docker volumes or bind mounts.

## 🔐 Authentication & Security Checks

### 1. Robust Account Authentication
VibeNVR's primary defense against unauthorized access is a strict authentication flow enforced by `backend/auth_service.py`:
- **Password Hashing**: User passwords are encrypted using the Argon2 hashing algorithm (`passlib`), providing robust defense against theoretical brute-force and dictionary attacks.
- **Rate-Limiting by Design (Argon2)**: Validation requires evaluating the Argon2 hash *before* any other fallback mechanisms, which inherently increases the computational cost for attackers attempting password sprays.
- **Two-Factor Authentication (2FA)**: VibeNVR supports Time-based One-Time Passwords (TOTP).
    - **Trusted Devices**: Users can cryptographically mark personal devices as "trusted" by storing a SHA256 hashed 32-byte URL-safe token in the database. This skips 2FA on recognized devices without compromising base security.
    - **Recovery Codes**: 2FA setup automatically provisions 10 hashed, single-use fallback codes (128-bit entropy) directly into the database as a fail-safe mechanism against administrative lockout.
    - **Secure Disabling**: Disabling 2FA requires the user to re-enter their current password for confirmation, preventing accidental or unauthorized disabling by standard users.
- **Rate-Limiting**: The login endpoint is protected by **SlowAPI**, limiting attempts to **10 requests per minute** to prevent brute-force and credential stuffing.

### 2. Media & API Protection
Static media files (historical recordings, snapshots, and live proxy streams) are **never** served via public, unauthenticated directories.
- **Dependency Injection (`Depends`)**: FastAPI handles route protection dynamically. Every restricted endpoint relies on `Depends(auth_service.get_current_user)`.
- **HttpOnly Cookie Authentication**: VibeNVR uses **secure HttpOnly cookies** for all authenticated sessions:
  - `auth_token` — protects the main session (replaces `localStorage` storage, eliminating XSS token theft).
  - `media_token` — authenticates access to static media files (recordings, snapshots, live frames).
  - Both cookies have the `Secure` flag enabled by default (`COOKIE_SECURE=true`). Set `COOKIE_SECURE=false` **only** for local HTTP testing. Never in production.
- **API Tokens with TTL**: Machine-to-machine integrations use API Tokens verified via the `X-API-Key` header.
    - **TTL (Time-To-Live)**: Tokens support optional expiration dates.
    - **Hashing**: All tokens are stored as SHA-256 hashes in the database.
    - **Isolation**: API token auth returns a sanitized `CameraSummary` schema (no RTSP URLs or credentials).

## 👥 Role-Based Access Control (RBAC)

RBAC is strictly enforced across the backend routers using FastAPI's dependency injection system. The system currently differentiates between two primary roles: Admins and Users.

### Admin Privileges
Endpoints that alter system state rely on `Depends(auth_service.get_current_active_admin)`. This explicitly checks the JWT payload to confirm the user has the `admin` role. If a standard user attempts to access these endpoints, the request is immediately rejected with an HTTP 403 Forbidden.

Actions protected by the Admin RBAC include:
- Creating, importing, modifying, or deleting Cameras (`routers/cameras.py`)
- Generating API tokens (`routers/api_tokens.py`)
- Forcing full system cleanups or manual snapshots
- Modifying general system settings and user accounts

### Standard User Privileges
Standard users pass the `Depends(auth_service.get_current_user)` check but fail the Admin check. They are restricted to purely Read-Only operations essential for monitoring:
- Viewing live streams and static media
- Querying the Event timeline
- Managing their own Profile and 2FA settings

## 🦠 Vulnerability Mitigations & Input Sanitization

VibeNVR's code includes specific mitigations against common attack vectors:

1. **Path Traversal & SSRF Prevention**:
   - The Pydantic Schema validators (`schemas.py`) actively scan `rtsp_url` inputs and webhook destinations. Local file access attempts and internal network probes are explicitly blocked.
2. **Advanced Log Masking**:
   - The logging infrastructure (`backend/routers/logs.py`) uses a robust regex-based redaction system. It automatically masks:
     - **RTSP Credentials**: `rtsp://user:***@host`
     - **Sensitive JSON fields**: `"password": "***"`, `"token": "***"`, etc.
     - **Headers**: `X-API-Key=REDACTED`, `Bearer REDACTED`.
     - **IP Addresses**: External IP addresses are masked to preserve privacy, while `127.0.0.1` is kept for debugging.
4. **Schema-Aware De-duplication**:
   - The backup import logic (`routers/settings.py`) prevents resource exhaustion and data fragmentation by de-duplicating cameras based on their RTSP Host/IP, ensuring duplicate configurations aren't accidentally or maliciously created.
5. **Database Cascading**:
   - SQLAlchemy relationships are strictly configured. Deleting a user or a camera automatically triggers `cascade="all, delete-orphan"`, ensuring no orphaned auth tokens, recovery codes, or media records remain in the system.
6. **Log Masking & Privacy**:
   - The centralized log router (`backend/routers/logs.py`) and the custom `TokenRedactingFilter` in `main.py` automatically mask stdout logs.
   - **Nginx Access Logs**: The frontend Nginx configuration (`nginx.conf`) uses a custom `log_format` and `map` logic to automatically redact `?token=` values from access logs before they are written to disk. This ensures that even if the token fallback is used for media streaming, the JWT is not persisted in the proxy logs.
7. **SECRET_KEY Security Enforcement**:
   - In development or non-standard environments, using a weak or default `SECRET_KEY` triggers a **loud warning** in the logs but allows the application to proceed for troubleshooting.
   - If `ENVIRONMENT=production` (default), the application **refuses to start** with a weak key (shorter than 32 chars or a known default) to ensure critical security.
   - **Bypass**: If strictly necessary, set `ALLOW_WEAK_SECRET=true` in your `.env` to override the production exit (NOT RECOMMENDED).

## ⚠️ Known Accepted Trade-offs

These are documented security trade-offs made intentionally for compatibility or usability:

- **`CORS: ALLOWED_ORIGINS=*`**: The default CORS policy allows all origins. While `allow_credentials=True` prevents browsers from actually sending cookies cross-origin to a wildcard origin, the wildcard should be explicitly set to your domain in production via the `ALLOWED_ORIGINS` environment variable.
- **`seccomp:unconfined` on the engine container**: Disabled for compatibility with Proxmox/PVE kernel environments that block certain syscalls required by OpenCV/FFmpeg. Consider using a custom seccomp profile instead of fully disabling it if running on a standard Linux host.
- **JWT has no server-side revocation**: Since JWTs are stateless, logging out only clears the client cookie. The token remains cryptographically valid until its 7-day expiry. This is an accepted trade-off for simplicity. Mitigation: the `HttpOnly` cookie is cleared on logout, requiring physical cookie theft for further misuse.
- **Webhook SSRF allows private IPs**: The global settings webhook validation (`settings.py`) deliberately permits private IP ranges to allow Home Assistant and other local integrations. Per-camera webhook validation in `schemas.py` enforces stricter SSRF protection.

## 🛑 Vulnerability Disclosure

If you happen to find a security vulnerability within VibeNVR, please do **NOT** open a public GitHub issue. 

Please report all security concerns directly to the maintainer via email at **[5xjan6deh@mozmail.com](mailto:5xjan6deh@mozmail.com)**.

We will make every effort to acknowledge your report promptly and resolve the issue confidentially before public disclosure.
