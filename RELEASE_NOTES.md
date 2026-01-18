# VibeNVR v1.6.4 - Remote Access Hotfix

## 🐛 Critical Fixes

*   **Remote LAN Access**: Fixed a critical issue where the Frontend was hardcoded to `localhost`, preventing access from other devices on the network (e.g., phones, tablets, remote PCs). The frontend now dynamically determines the API address based on the current hostname (`window.location.hostname`), performing robustly in any network environment.
*   **Port Exposure**: Updated `docker-compose.prod.yml` to expose Backend (port 5000) and Engine (port 8000) to the LAN (`0.0.0.0`). This ensures the Frontend client running on your browser can directly contact the necessary APIs and video streams.

---

# VibeNVR v1.6.3 - Connection Hotfix

## 🐛 Bug Fixes

*   **Docker Compose Configuration**: Simplified the database password variable substitution in `docker-compose.prod.yml`. This fixes a critical issue on some deployment environments (e.g., remote shells, older Docker versions) where complex variable expansion caused connection strings to be malformed (e.g., `$!@db`), preventing the backend from connecting to the database.

---

# VibeNVR v1.6.2 - Release Notes

## 🛟 Infrastructure & Stability Updates

*   **Startup Race Condition Fix**: Implemented **Docker Healthchecks** for the database in `docker-compose.prod.yml`. The backend service now strictly waits for `pg_isready` to return success before attempting to start, preventing connection errors during cold boots.
*   **Code-Level Resilience**: The Backend application now includes internal retry logic (15 attempts) for the initial database connection, making it robust against network storage delays or slow database startups even without Docker healthchecks.

---

# VibeNVR v1.6.1 - Release Notes

## 🔒 Security & Deployment Updates

*   **Production Network Hardening**: The `docker-compose.prod.yml` configuration has been hardened for better security.
    *   **Backend & Engine**: Now bind strictly to `127.0.0.1` (localhost), preventing accidental exposure of sensitive internal API ports (5000/8000) to the public network.
    *   **Frontend**: Exposed on port `8080` to all interfaces (`0.0.0.0`), allowing LAN access.
    *   *Recommendation*: For secure remote access, use a Reverse Proxy (e.g., Nginx Proxy Manager) to route traffic from port 80/443 to the containers.

## 🐛 Critical Bug Fixes

*   **Export/Backup Fixed**: Resolved a critical recursion issue where exporting configuration (Global Backup or Single Camera Settings) would fail or hang by attempting to serialize the entire event history. Exports are now optimized, instant, and reliable.
*   **Database Performance**: Added automatic indexing for `timestamp` and `camera_id` columns on startup. This drastically improves query performance for the Timeline and Dashboard as the database grows.

## 🚀 Key Features (v1.6.0 included)

*   **Passthrough Recording**: Added experimental "Direct Stream Copy" support to record RTSP streams without re-encoding, saving 50-80% CPU. Includes auto-fallback to encoding if the stream is incompatible.
*   **Mobile Experience**: Completely redesigned the **Settings** page for mobile devices (vertical stacking, scrollable tables, full-width touch targets).
*   **Camera Management**: Added quick ON/OFF toggles in the camera list and improved handling of inactive cameras (fully stopped in backend).
*   **UI Enhancements**: Added 'Close' (X) buttons and ESC key support to all modals.
