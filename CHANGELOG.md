# Changelog

All notable changes to the VibeNVR project will be documented in this file.

## [1.10.2] - 2026-01-20

### 🐛 Bug Fixes
*   **Mobile UI**: Added the missing "Playback Direction" selector to the mobile view.

## [1.10.1] - 2026-01-20

### 🧹 Maintenance & Refactoring
*   **Versioning**: Consolidated version management. The version is now defined solely in `package.json` and automatically reflected reflecting in the Backend, Frontend, and System Reports.

## [1.10.0] - 2026-01-20

### 🚀 Improvements & Features
*   **Smart Timeline Auto-Next**: 
    *   **Playback Direction**: Added a new dropdown in the Timeline to choose playback order: **Newest → Oldest** (default) or **Oldest → Newest**.
    *   **Image Support**: "Auto-next" now supports snapshots. Images are displayed for 5 seconds before automatically advancing to the next event.
    *   **Mixed Media**: The player now seamlessly cycles through both videos and images in your selected order.

## [1.9.11] - 2026-01-20

### 🚀 Improvements & Features
*   **Startup Stability**: Fixed an issue where cameras wouldn't automatically start/sync with the Engine on backend startup. This ensures that after a system reboot, all enabled cameras resume streaming without manual intervention.

## [1.9.9] - 2026-01-19

### 🚀 Improvements & Features
*   **Env Configuration**: Added `VIBENVR_FRONTEND_PORT` and `VIBENVR_BACKEND_PORT` support to `.env` to easily configure external ports without modifying compose files.
*   **Production Defaults**: Changed default backend port in `docker-compose.prod.yml` to `5005` (via fallback) to avoid common conflicts on port 5000.
*   **Deployment**: Validated deployment workflow updates.

## [1.9.8] - 2026-01-19

### 🚀 Improvements & Features
*   **PostgreSQL**: Restored PostgreSQL as the default database for improved reliability and performance.
*   **Flexible Configuration**: Introduced `.env` support for configuring `VIBENVR_DATA` and `VIBENVR_DB_DATA` paths.
*   **Startup Stability**: Improved service dependency handling (Frontend now waits for Engine & Backend) and updated backend startup to use lifespan events.

### 🐛 Fixed
*   **Docker Volumes**: Consolidated log storage to `/data/logs` and removed duplicate/unused volume definitions.
*   **Compose Alignment**: Aligned `docker-compose.prod.yml` with development configuration.
*   **Backend Startup**: Fixed indentation error and missing imports in service modules.

## [1.9.7] - 2026-01-19

### 🐛 Fixed
*   **Startup**: Added wait-for-backend check in frontend container to prevent startup crash loop.
*   **Notifications**: Fixed database session error in background notification thread.
*   **Attachments**: Corrected file path resolution for notification images (Telegram/Email).
*   **UI**: Fixed duplicate camera creation when clicking "Apply" in camera settings.

## [1.9.6] - 2026-01-19

### 🧹 Maintenance
*   **Code Cleanup**: Removed obsolete `motion/` directory and related Docker configurations.
*   **Docker Compose**: Updated default compose file to remove unused volumes.

## [1.9.5] - 2026-01-19

### 🔒 Security & Privacy
*   **Security Cleanup**: Removed sensitive log files (`engine_logs.txt`, `backend_logs.txt`) and credential-leakage risks from the repository.
*   **Enhanced Token Security**: Removed JWT tokens from query parameters in Live View requests. Tokens are now sent via secure HTTP Authorization headers.
*   **Log Redaction**: Implemented a `TokenRedactingFilter` in the backend that automatically masks `token=...` strings in access logs, preventing sensitive information leakage.

## [1.8.0] - 2026-01-19

### 🚀 Improvements & New Features
*   **Security & RBAC**: Implementation of Role-Based Access Control.
    *   Non-admin users can now only access their own profile settings.
    *   Sensitive information (like RTSP URLs) and administrative controls are hidden from "viewer" users.
    *   Event deletion on the Timeline is now restricted to administrators.
*   **Enhanced Group Management**:
    *   "Viewer" users can now create and manage camera groups.
    *   Clearer confirmation messages for group actions (Enable/Disable Motion & Recording).
    *   "Copy Settings" functionality is now protected and reserved for administrators.
*   **Dashboard Refinement**: Optimized "Recent Events" widget layout and improved direct navigation to the Timeline.

### 🛠 Fixes & Tweaks
*   Improved responsiveness of the Settings page.
*   Optimized backend synchronization for bulk group actions.

---
[1.8.0]: https://github.com/spupuz/VibeNVR/releases/tag/v1.8.0
