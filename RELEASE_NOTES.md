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
