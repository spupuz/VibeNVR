# Antigravity Context File

## 🧠 Project Philosophy
- **Name**: VibeNVR
- **Goal**: A lightweight NVR (Network Video Recorder), built on Docker, Python, and React.
- **Tone**: Professional, highly functional, but with a strong focus on "Premium" and modern aesthetics.

## 🛠 Tech Stack & Conventions
- **Backend**: Python (FastAPI), SQLAlchemy, process management via `multiprocessing`.
- **Frontend**: React, TailwindCSS, Lucide Icons, Vite.
- **Database**: PostgreSQL (container `vibenvr-db`).
- **Sanitize everything**: Every input from the user or the network must be validated using Pydantic schemas.
- **Mask logs and telemetry**: Ensure that no sensitive information is ever written to logs or telemetry streams.
- **No Absolute Host Paths**: The codebase and documentation MUST NOT contain absolute host paths (e.g., `/absolute/path/to/repo/...`). Always use relative paths or dynamic resolution.
- **Role-Based Access Control (RBAC)**: Always check for `current_user` role when implementing new API endpoints.
- **Styling**: strictly use standard Tailwind utility classes. Avoid custom CSS where possible.

## 📐 Architecture Overview
- The Backend manages the Engine module, which handles cameras via a modular architecture (`stream_reader`, `recording_manager`, `motion_detector`).
- The Frontend communicates via REST API and **WebSockets** for live streaming.
- **Live View**: Uses browser's native **WebCodecs API** (H.264 via WebSockets).
- **Dual-Stream Optimization**: Dedicated sub-streams for grid views, while main streams handle recording/analysis.
- Video files are stored in `/media/recordings` mapped in docker-compose.
- **Privacy Masking & Motion Zones**: Privacy masks are burned into the video stream at the engine level before recording/motion analysis. Motion Zones are used to exclude areas from motion triggers. Unmasked frames for the editor are Admin-only.
- **Configuration Backup & Restore**: Full system configuration (cameras, settings, users) can be exported, imported, and restored from automated/manual snapshots stored in `/data/backups/`.
- **System Integrity Audit**: Integrated security, RBAC, and synchronization audits (e.g., Audio/PTZ) are performed on every release to ensure system-wide consistency and safety.
- **Build Hygiene**: Every component context enforces strict build isolation via `.dockerignore` files, ensuring lean and secure production images.
- **Frontend Modularity**: Large page views (e.g., `Cameras.jsx`) are decomposed into component directories to maintain code size limits and improve reusability.
- **Telemetry Worker**: A Cloudflare edge service (`vibenvr-telemetry-worker`) handles telemetry, static assets, and proxying. It is cleanly modularized (`api.js`, `dashboard.js`, `ingest.js`, `security.js`, `assets.js`) to enforce strict security at the edge level and maintain short file lengths.


## ⚠️ Important Rules for AI
1. **Docker**: Before any major commit, suggest or perform a rebuild (`docker compose up -d --build`) to verify integrity.
2. **Language**: Code comments in English. User interactions in Italian (or as requested).
3. **RBAC**: Remember that `admin` (full access) and `viewer` (read-only) roles exist. Always verify permissions for destructive or configuration actions.
4. **Security & Vulnerabilities**: **CRITICAL**. Review and adhere to `SECURITY.md`. Always verify that code changes do not introduce security vulnerabilities (e.g., IDOR, Injection, Unprotected Endpoints). Proactively sanitize inputs and verify user roles for every sensitive API or Action.
5. **Data Masking & Privacy**: Logs, telemetry, and debugging outputs MUST ALWAYS be filtered to exclude sensitive data (passwords, tokens, credentials in RTSP URLs). Use existing filters (`TokenRedactingFilter` in `main.py`) or implement new ones as needed.
6. **Log Rotation**: **CRITICAL**. Ensure all log outputs (Docker logs and file logs) are subject to rotation and size limits to prevent host disk exhaustion.

## 🏷️ Versioning Strategy

### Semantic Versioning: `MAJOR.MINOR.PATCH` (e.g., `1.15.1`)

| Version Type | Format | When to Use | Example |
|--------------|--------|-------------|---------|
| **Patch Release** | `1.15.x` | Bug fixes, UI tweaks, minor improvements, no breaking changes | `1.15.0` → `1.15.1` |
| **Minor Release** | `1.x.0` | New features, significant improvements, backward compatible | `1.15.1` → `1.16.0` |
| **Major Release** | `x.0.0` | Breaking changes, major refactoring, architecture changes | `1.16.0` → `2.0.0` |

### Versioning & Release Workflow

We use **Semantic Versioning** (`MAJOR.MINOR.PATCH`).

#### 1. Source of Truth Files
When releasing a new version, you **MUST** update the version string in the following files:

| Component | File Path | Line | Reason |
|-----------|-----------|------|--------|
| **Frontend** | [`frontend/package.json`](frontend/package.json) | `"version": "..."` | Used by the UI to display the current version. |
| **Backend** | [`backend/package.json`](backend/package.json) | `"version": "..."` | Used by FastAPI for the API Documentation (`/docs`) and startup logs. |

> **Note**: These two versions MUST always match.

#### 2. Release Checklist
To release a version (e.g., `1.23.0`):

1. **Update Files**: Bump version in both `frontend/package.json` and `backend/package.json`.
2. **Commit**: `git commit -am "chore: release v1.23.0"`
3. **Tag**: `git tag v1.23.0`
4. **Push**: `git push origin main --tags`
5. **Release**: Create a GitHub Release referencing the tag `v1.23.0` with a changelog.

## 📝 Current Focus
- Enforcing English language policy across all project documentation and interfaces.
- Maintaining and enforcing Security documentation (`SECURITY.md`), 2FA recovery, and RBAC definitions.
