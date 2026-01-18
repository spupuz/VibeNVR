# VibeNVR v1.6.0 - The "Passthrough" Update

## 🚀 New Features

*   **Passthrough Recording (CPU Saver)**: 
    *   Implemented experimental support for "Direct Stream Copy". This allows recording the RTSP stream directly to disk without CPU-intensive re-encoding.
    *   **Auto-Fallback Mechanism**: If passthrough fails (e.g., stream corruption or incompatible codecs), the system automatically falls back to standard encoding after 1 failed attempt, ensuring no footage is lost.
    *   Added dedicated toggle in Camera Settings.

*   **Mobile Experience Overhaul**:
    *   **Settings Page**: Completely redesigned for mobile. Headers now stack vertically, buttons extend to full width for easier tapping, and the User Management table scrolls horizontally to prevent overflow.

*   **Enhanced Camera Management**:
    *   **Quick Toggle**: Added an explicit ON/OFF switch directly in the Camera List for fast enabling/disabling of cameras.
    *   **Resource Optimization**: Inactive cameras are now fully stopped in the backend engine, freeing up system resources.

*   **UI/UX Improvements**:
    *   **Modals**: Added standard Close (X) buttons and ESC key support to all dialogs (Camera Add/Edit, Password Change, etc.).
    *   **Visual Feedback**: Inactive cameras are clearly visually dimmed in the list.

## 🐛 Bug Fixes

*   **Engine & Backend**: 
    *   Fixed a critical bug where the `movie_passthrough` configuration was not being transmitted to the recording engine.
    *   Fixed logic where updating settings for a disabled camera would inadvertently start it.
    *   Fixed RTSP URL sanitization to allow custom formats (reverted double-slash removal).
    
*   **Dashboard**:
    *   Corrected the Resource Usage chart labels (CPU was incorrectly labeled as Memory).

## 🛠️ Technical Updates

*   Unified Frontend and Backend version to `v1.6.0`.
*   Added database auto-migration for new camera columns.
*   Improved FFmpeg process error handling and logging.
