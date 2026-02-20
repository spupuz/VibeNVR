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
    - **Trusted Devices**: Users can cryptographically mark personal devices as "trusted" by storing a 32-byte URL-safe token in the database. This skips 2FA on recognized devices without compromising base security.
    - **Recovery Codes**: 2FA setup automatically provisions 10 hashed, single-use fallback codes directly into the database as a fail-safe mechanism against administrative lockout.

### 2. Media & API Protection
Static media files (historical recordings, snapshots, and live proxy streams) are **never** served via public, unauthenticated directories.
- **Dependency Injection (`Depends`)**: FastAPI handles route protection dynamically. Every restricted endpoint relies on `Depends(auth_service.get_current_user)`.
- **Dual-Token Validation**: Access requires a valid JSON Web Token (JWT). The backend accepts this either via standard `Authorization: Bearer` Headers (for API calls) or via securely signed Query Parameters (`?token=...`) specifically designed for downloading or embedding media in standard HTML elements (`<img>`, `<video>`).
- **3rd Party API Tokens**: Machine-to-machine integrations use fixed API Tokens verified via the `X-API-Key` header. These tokens are stored as SHA-256 hashes in the database.

## 👥 Role-Based Access Control (RBAC)

RBAC is strictly enforced across the backend routers using FastAPI's dependency injection system. The system currently differentiates between two primary roles: Admins and Users.

### Admin Privileges
Endpoints that alter system state rely on `Depends(auth_service.get_current_active_admin)`. This explicitly checks the JWT payload to confirm the user has the `admin` role. If a standard user attempts to access these endpoints, the request is immediately rejected with an HTTP 403 Forbidden.

Actions protected by the Admin RBAC include:
- Creating, importing, modifying, or deleting Cameras (`routers/cameras.py`)
- Generating 3rd-Party API tokens (`routers/settings.py`)
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
   - The Pydantic Schema validators (`schemas.py`) actively scan `rtsp_url` inputs. For example, local file access attempts via `file://` URIs are explicitly blocked and cause validation errors before reaching the database.
2. **Data & Password Masking**:
   - The logging infrastructure actively sanitizes output. If a camera URL containing a plaintext password (e.g., `rtsp://admin:pass123@192.168...`) is logged, the backend strips the credentials and replaces them with `***` via Regex (`re.sub`) to prevent accidental leaks in Docker logs.
3. **Database Cascading**:
   - SQLAlchemy relationships are strictly configured. Deleting a user or a camera automatically triggers `cascade="all, delete-orphan"`, ensuring no orphaned auth tokens, recovery codes, or media records remain in the system.

## 🛑 Vulnerability Disclosure

If you happen to find a security vulnerability within VibeNVR, please do **NOT** open a public GitHub issue. 

Please report all security concerns directly to the maintainer via email at **[5xjan6deh@mozmail.com](mailto:5xjan6deh@mozmail.com)**.

We will make every effort to acknowledge your report promptly and resolve the issue confidentially before public disclosure.
