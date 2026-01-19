# Changelog

All notable changes to the VibeNVR project will be documented in this file.

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
