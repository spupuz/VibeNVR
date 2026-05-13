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
  - Both cookies have the `Secure` flag managed automatically (`COOKIE_SECURE=auto`). The backend detects if the request is over HTTPS (via `X-Forwarded-Proto`) and enables protection only when possible. This allows for seamless transitions between local HTTP and remote HTTPS access.
- **Backup Protection**: Automated configuration backups containing sensitive data (TOTP secrets, hashed passwords) are stored in `/data/backups/`. Access to these files via the media API (`/media/backups/*`) is strictly restricted to users with the `admin` role. Unauthorized access attempts are logged and blocked with a 403 Forbidden response.
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
- Bulk deleting events (`routers/events.py`)
- Managing Storage Profiles (`routers/storage.py`)
- Accessing Engine Debug Status (`routers/settings.py`)
- Generating API tokens (`routers/api_tokens.py`)
- Forcing full system cleanups or manual snapshots
- Modifying general system settings and user accounts
- Configuring ONVIF Management credentials and performing PTZ operations, including **Home Position** and **Presets** navigation (`routers/onvif_router.py`)
- Scanning networks for ONVIF devices via secure SSE streams.

### Standard User Privileges
Standard users pass the `Depends(auth_service.get_current_user)` check but fail the Admin check. They are restricted to purely Read-Only operations essential for monitoring:
- Viewing live streams and static media
- Querying the Event timeline
- Managing their own Profile and 2FA settings

## 🦠 Vulnerability Mitigations & Input Sanitization

VibeNVR's code includes specific mitigations against common attack vectors:

1. **Path Traversal & SSRF Prevention**:
   - The Pydantic Schema validators (`schemas.py`) actively scan `rtsp_url` inputs, webhook destinations, and **Storage Profile paths**. Local file access attempts and internal network probes are explicitly blocked. Storage paths must be absolute (starting with `/`) and are restricted from using `..` traversal sequences.
2. **IP Ban Protection & DoS Mitigation**:
    - The VibeEngine (`camera_thread.py`) performs a mandatory **ffprobe pre-flight check** before initiating a full video stream connection. This prevents rapid authentication retries that trigger IP bans on many camera firmwares (e.g., Tapo/TP-Link).
    - If a 401 Unauthorized or 403 Forbidden is detected, the thread enters a **5-minute backoff period** before retrying. This mitigates accidental or malicious "denial of service" scenarios through camera lockouts while allowing for eventual recovery if credentials are corrected in the UI.
3. **Robust PTZ Home Fallbacks**:
    - PTZ Home positioning utilizes a **3-stage fallback** (Native -> Existing Preset -> Create Preset) to ensure functionality on hardware with non-standard ONVIF implementations. This prevents sensitive 400-series errors from leaking directly to the UI and provides a consistent security boundary for device interactions.
4. **Event File Deletion & Path Traversal**:
    - The final resolved path MUST start with the `/data/` internal storage directory. Any attempt to delete files outside this boundary results in a security alert in the logs and the deletion is blocked.
5. **Storage Resilience & Disk Safety**:
    - **Reactive Monitoring**: VibeNVR implements a reactive 10-minute monitoring loop for storage quotas. This ensures that disk usage remains within limits even under high-volume recording conditions.
    - **Emergency Disk Safety**: If absolute disk space falls below **5%**, an emergency cleanup is automatically triggered to prevent filesystem exhaustion and system instability.
4. **Secure RTSP (RSTSPS) & TLS Verification**:
    - To ensure seamless compatibility with modern NVR systems like **UniFi Protect**, VibeNVR supports the `rstsps://` and `rtsps://` protocols.
    - For these specific protocols, VibeNVR intentionally disables TLS certificate verification (`tls_verify=0`) to handle self-signed certificates common in camera hardware.
    - This bypass is **strictly limited** to the secure RTSP schemes. Standard webhooks and API calls always enforce full certificate verification.
4. **Secure Subprocess Execution**:
   - All internal calls to video tools (`ffmpeg`, `ffprobe`) are performed using **list-based arguments** (the secure default in Python's `subprocess.run`), effectively preventing any shell injection vulnerabilities via malicious camera URLs or paths.
    - **Advanced Log & GUI Masking**:
        - The logging infrastructure (`backend/routers/logs.py`) and the **hardened `TokenRedactingFilter`** in `main.py` automatically redact sensitive information from stdout for:
          - **RTSP & ONVIF Credentials**: Redacts passwords in both URLs (`rtsp://user:***@host`) and JSON/KV strings (`"password": "***"`, `password=***`).
          - **Authorization Tokens**: Redacts `X-API-Key`, `Bearer` tokens, `totp_secret`, and `media_token`.
        - **ONVIF Credential Fallback**: To simplify setup, VibeNVR can automatically extract ONVIF management credentials from a camera's RTSP URL if not explicitly provided. These extracted credentials are treated with the same masking and redaction policies as manual entries.
        - **Robust ONVIF Event Parsing**: A multi-vendor robust parser for ONVIF event notifications is used. It employs fuzzy matching for boolean payload states (e.g., `IsMotion`, `State`, `Active`) and topic-payload correlation to ensure reliable triggers across Hikvision, Dahua, Reolink, and Axis devices without compromising XML parsing safety.
        - **Perpetual Security Audit**: Mandatory runtime and static scans are performed during the security audit workflow to ensure that sensitive strings never leak into the application's stdout.
    - **RTSP URL Redaction (GUI Level)**: The frontend configuration interface implements dynamic URL masking. RTSP and Sub-Stream URLs are displayed without plain-text passwords (redacted as `********`). If a user pastes a full URL containing a password, it is automatically extracted to the secure separate fields and redacted in real-time.
5. **Privacy Masking & Motion Zones**: 
    - **Privacy Masks** are applied at the Engine level immediately after frame decoding. They are "burned" into the video frames *before* they reach the recording or motion analysis modules, ensuring that sensitive data is never persisted or processed if masked.
    - **Motion Zones** (Exclusion Zones) are used for motion detection optimization (e.g., ignoring moving trees). Unlike Privacy Masks, they do NOT obscure the video. **MANDATORY**: When **ONVIF Edge** detection is active, NVR-side Motion Zones are bypassed and hidden in the UI to prevent configuration confusion, as the camera's hardware sensor handles all detection logic.
    - An unmasked "raw" frame (for the masking editor) is only accessible via a specialized internal bridge reserved for Admin credentials.

7. **Centralized AI Activation**:
   - VibeNVR features a **Global AI Master Switch** (Admin-only). When disabled, the AI engine singleton completely releases its memory and stops processing frames. All cameras automatically fallback to standard OpenCV detection, ensuring that a single administrative action can reliably disable all AI-related activity across the entire surveillance network.
8. **Resource Exhaustion Prevention & Data Integrity (Self-Healing)**:
   - **Strict Length Limits**: All configuration fields (notably `ai_object_types`) enforce strict length validation at the schema level (max 2000 characters). This prevents a critical vulnerability where corrupted or malicious data could grow to megabytes, freezing the backend during serialization or logging.
   - **Self-Healing Pipeline**: VibeNVR implements a defensive **Recursive Unwrapper** for JSON configuration fields. This architecture automatically detects and repairs "recursive encoding" (where data is accidentally wrapped in multiple layers of JSON strings) up to 5 levels deep.
   - **PostgreSQL Compatibility**: The validation layer natively supports both standard JSON lists and PostgreSQL array formats (`{val1,val2}`). This ensures that even if the database driver returns non-standard formats, the system correctly sanitizes and recovers the user's settings without triggering accidental resets.
   - **Proactive Frontend Sanitization**: The UI performs a real-time whitelist scan of critical configuration tags before submission, ensuring that only valid, safe identifiers are sent to the backend.
   - **Array Sanitization**: Frontend inputs are normalized to ensure list-based data is never processed as raw strings, preventing exponential character-spread growth.
9. **Backup Integrity & De-duplication**:
   - The backup import logic (`routers/settings.py`) prevents resource exhaustion and data fragmentation by de-duplicating cameras based on their RTSP Host/IP, ensuring duplicate configurations aren't accidentally or maliciously created.
10. **Database Security & Cascading**:
   - SQLAlchemy relationships are strictly configured. Deleting a user or a camera automatically triggers `cascade="all, delete-orphan"`, ensuring no orphaned auth tokens, recovery codes, or media records remain in the system.
11. **Log Redaction & Auditability**:
    - Every log entry across all containers (Backend, Engine, Frontend) includes a consistent timestamp (`%Y-%m-%d %H:%M:%S`).
    - **High-Performance Redaction**: The `TokenRedactingFilter` in `main.py` implements a **fast-fail keyword check**. It only applies complex regex-based redaction if a sensitive keyword (e.g., `rtsp`, `token`, `password`) is present. This ensures the filter remains efficient and prevents CPU exhaustion when handling large, non-sensitive payloads.
    - **Nginx Access Logs**: The frontend Nginx configuration automatically redacts `?token=` values from access logs before they are written to disk, ensuring JWTs are not persisted in proxy logs.
12. **Hardened Engine Synchronization**:
    - Critical streaming parameters are synchronized via Admin-only authenticated routes and validated through Pydantic schemas to prevent injection or invalid configuration states.
13. **SECRET_KEY Security Enforcement**:
    - In production, the application **refuses to start** with a weak `SECRET_KEY` (shorter than 32 chars) to ensure session integrity. This can be overridden via `ALLOW_WEAK_SECRET=true` for troubleshooting only.
14. **Browser Security Headers**: 
    - VibeNVR implements standard security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) and a strict **Content-Security-Policy (CSP)** in Report-Only mode.
15. **Live Audio Privacy & Control**:
    - Audio is disabled by default and proxied via an authenticated WebSocket. Capability flags are synchronized between backend and engine via Admin-only routes.
16. **PTZ Mobile Integrity**:
    - Mobile PTZ controls follow identical RBAC rules as the desktop UI, with all movement requests validated against the user's role on the backend.

## ⚠️ Known Accepted Trade-offs

These are documented security trade-offs made intentionally for compatibility or usability:

- **`CORS: ALLOWED_ORIGINS=*`**: The default CORS policy allows all origins. While `allow_credentials=True` prevents browsers from actually sending cookies cross-origin to a wildcard origin, the wildcard should be explicitly set to your domain in production via the `ALLOWED_ORIGINS` environment variable.
- **`seccomp:unconfined` on the engine container**: Disabled for compatibility with Proxmox/PVE kernel environments that block certain syscalls required by OpenCV/FFmpeg. Consider using a custom seccomp profile instead of fully disabling it if running on a standard Linux host.
- **JWT has no server-side revocation**: Since JWTs are stateless, logging out only clears the client cookie. The token remains cryptographically valid until its 7-day expiry. This is an accepted trade-off for simplicity. Mitigation: the `HttpOnly` cookie is cleared on logout, requiring physical cookie theft for further misuse.
- **Webhook SSRF allows private IPs**: The global settings webhook validation (`settings.py`) deliberately permits private IP ranges to allow Home Assistant and other local integrations. Per-camera webhook validation in `schemas.py` enforces stricter SSRF protection.
- **WebSocket live stream uses `?token=` query parameter**: The Browser WebSocket API cannot send custom headers during the HTTP upgrade handshake. The JWT is therefore passed as `?token=` for the `/cameras/{id}/ws` live stream endpoint. This is mitigated by: (1) the Nginx `map` directive which redacts `?token=` from all access logs before they are written to disk, (2) TLS encryption in production which prevents interception in transit, and (3) an HttpOnly `media_token` cookie which serves as an automatic fallback when available. The engine's raw WebSocket endpoint (port 8000) is internal-only and not exposed externally.
- **WebCodecs & Multi-Stream Resilience**: 
    - To ensure instant startup in high-latency environments, the engine caches the most recent H.264 keyframe (SPS/PPS/IDR) and pushes it immediately to new WebSocket clients. 
    - **Hybrid Packetization**: The WebSocket stream uses a **10-byte binary header** to multiplex video, audio, and metadata packets (pType, isKeyframe, Timestamp).
    - **Audio Sync Optimization**: The player implements active drift detection. If audio lag exceeds **300ms**, the buffer is automatically reset to resync with the video stream.
    - **AI Metadata Sync**: Detections are transmitted as JSON objects (pType 2) and rendered client-side on a canvas overlay. This eliminates server-side OSD overhead while maintaining secure context enforcement.
    - **Resilience**: The frontend employs a micro-jitter buffer (2 frames) and handles decoder re-initialization automatically if a resolution switch is detected.
- **Proxy Buffering & WebSocket Stability**:
    - **Nginx Proxying**: To prevent connection resets and MJPEG flickering, VibeNVR enforces `proxy_buffering off` and standardized WebSocket `Upgrade` headers. This ensures stable delivery through Nginx Proxy Manager and DuckDNS environments.
- **Secure Context Enforcement**:
    - High-performance APIs (WebCodecs, VideoDecoder) are strictly limited to **Secure Contexts** (HTTPS or localhost). In insecure HTTP environments (e.g., local LAN IP), the system provides visual feedback and automatically falls back to MJPEG polling to maintain service availability.
- **ONVIF Polling Stability**:
    - Configuration updates (e.g., Audio toggle) automatically trigger a clean subscription restart. The system explicitly awaits the cancellation of the previous background task before initializing a new SOAP session, preventing session lease conflicts on the camera hardware.

## 📁 Host Privacy & Path Sanitization

To ensure project portability and prevent the leakage of sensitive host-specific information, VibeNVR enforces a strict **Relative Path Policy**:

1. **No Absolute Host Paths**: The codebase, documentation, and metadata MUST NOT contain absolute host paths (e.g., `/absolute/path/to/repo/...`).
2. **Relative Paths Only**: All internal links in documentation (`.md`) and internal references must use relative paths (e.g., `../data/`).
3. **Dynamic Path Resolution**: Scripts that require the repository root must resolve it dynamically (e.g., using `pathlib.Path(__file__).resolve()`) rather than hardcoding absolute paths.
4. **Automated Enforcement**: Automated scans are performed during the security audit workflow to block any commit containing unauthorized absolute path patterns.


## 🧼 Repository & Build Hygiene

To ensure the integrity of the release images and prevent the leakage of development artifacts, VibeNVR enforces strict hygiene policies for both the Git repository and Docker images:

1. **Docker Isolation**:
   - Every build context (`engine/`, `frontend/`, `backend/`) MUST have a dedicated `.dockerignore` file.
   - Prohibited files (e.g., `venv/`, `__pycache__/`, `node_modules/`, `*.log`) MUST be explicitly excluded from the build context to prevent them from being baked into production images.
   - Use `--no-install-recommends` in `apt-get install` commands to minimize the attack surface and image size.

2. **Git Hygiene**:
   - The `.gitignore` file utilizes recursive patterns (`**/venv/`, `**/__pycache__/`) to ensure that development artifacts are never tracked, regardless of their location in the project structure.
   - Absolute host paths are strictly prohibited in the codebase and documentation to maintain project portability and privacy.

## 🛑 Vulnerability Disclosure

If you happen to find a security vulnerability within VibeNVR, please do **NOT** open a public GitHub issue. 

Please report all security concerns directly to the maintainer via email at **[5xjan6deh@mozmail.com](mailto:5xjan6deh@mozmail.com)**.

We will make every effort to acknowledge your report promptly and resolve the issue confidentially before public disclosure.
