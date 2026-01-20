# VibeNVR v1.10.2 - Mobile Polish

## 🐛 Fixes

*   **Mobile Playback Control**: Fixed an issue where the timeline direction selector (Oldest → Newest) was hidden on mobile devices.

---

# VibeNVR v1.10.1 - Structural Improvements

## 🧹 Maintenance

*   **Single Source of Truth**: We've updated the build system to read the version number directly from `package.json`. This eliminates inconsistencies and simplifies the development process.

---

# VibeNVR v1.10.0 - Enhanced Timeline Playback

## 🚀 Features

*   **Timeline Auto-Next Upgrade**: 
    *   You can now control the **playback direction** (Oldest → Newest or Newest → Oldest).
    *   **Images** are now part of the auto-play loop (displayed for 5 seconds).
    *   A seamless mixed-media experience for reviewing events.

---

# VibeNVR v1.9.7 - Stability & Bug Fixes

## 🐛 Bug Fixes & Stability

*   **Startup Reliability**: Fixed a race condition where the Frontend container would crash if the Backend wasn't ready yet. Added a smart entrypoint that waits for the backend service.
*   **Notification Engine**: Resolved a critical "DetachedInstanceError" that caused email and Telegram notifications to fail sporadically.
*   **Image Attachments**: Fixed an issue where snapshots and video thumbnails were not attaching correctly to notifications due to path resolution errors.
*   **Camera Management**: Fixed a UI bug where hitting "Apply" would duplicate the camera instead of updating it.

---

# VibeNVR v1.9.6 - Legacy Cleanup

## 🧹 Housekeeping

*   **Removed Legacy Motion Code**: Deleted the obsolete `motion/` directory and removed unused volume mounts from `docker-compose.yml`. The system now relies entirely on the new Python-based **VibeEngine**.
*   **Repo Hygiene**: Cleaned up `.gitignore` and project structure.

---

# VibeNVR v1.9.5 - Security Hardening & Cleanup

## 🔒 Security Enhancements

*   **Auth Token Privacy**: Moved the authentication token from query parameters to HTTP Authorization headers for Live View frames. This prevents tokens from appearing in Nginx and backend access logs.
*   **Automatic Log Masking**: Added a backend logging filter that automatically redacts any `token=` parameters from logs (via `TokenRedactingFilter`). This provides a second layer of security for media requests that still require query params.

---

# VibeNVR v1.7.0 - Architectural Overhaul & Proxy Implementation

## 🚀 Major Updates

*   **Integrated Nginx Reverse Proxy**: The frontend now uses Nginx instead of `serve`. This allows the application to handle both site rendering and API routing through a single port (8080).
*   **Enhanced Security & Connectivity**: 
    *   **Port Consolidation**: You no longer need to expose ports 5000 (Backend) and 8000 (Engine) to the LAN. Everything is now routed through the Frontend port (8080).
    *   **Relative API Routing**: The frontend now uses relative paths (`/api/`) which are handled by the Nginx proxy, making the application more robust and easier to manage in various network configurations (LAN, VPN, or Reverse Proxies like Nginx Proxy Manager).
*   **Streamlined Deployment**: Reduced complexity in `docker-compose.prod.yml` by keeping internal services isolated from the public network while maintaining full functionality.

---

# VibeNVR v1.6.4 - Remote Access Hotfix

## 🐛 Critical Fixes

*   **Remote LAN Access**: Fixed a critical issue where the Frontend was hardcoded to `localhost`, preventing access from other devices on the network.
*   **Port Exposure**: Updated production configuration to expose Backend and Engine ports to the LAN for direct client access.

---

# VibeNVR v1.6.3 - Connection Hotfix

## 🐛 Bug Fixes

*   **Docker Compose Configuration**: Simplified the database password variable substitution in `docker-compose.prod.yml`. This fixes a critical issue on some deployment environments (e.g., remote shells) where complex variable expansion caused connection strings to be malformed.

---

# VibeNVR v1.6.2 - Release Notes

## 🛟 Infrastructure & Stability Updates

*   **Startup Race Condition Fix**: Implemented **Docker Healthchecks** for the database in `docker-compose.prod.yml`. The backend service now strictly waits for `pg_isready` to return success before attempting to start.
*   **Code-Level Resilience**: The Backend application now includes internal retry logic (15 attempts) for the initial database connection.

---

# VibeNVR v1.6.1 - Release Notes

## 🔒 Security & Deployment Updates

*   **Production Network Hardening**: The `docker-compose.prod.yml` configuration has been hardened for better security.
*   **Export/Backup Fixed**: Resolved a critical recursion issue where exporting configuration would fail or hang.
*   **Database Performance**: Added automatic indexing for `timestamp` and `camera_id` columns on startup.
