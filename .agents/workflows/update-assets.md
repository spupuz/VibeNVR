---
description: Capture updated screenshots/videos and sync project documentation (README and website)
---

This workflow automates the process of capturing the latest UI features and updating the project's visual documentation.

### 1. Prerequisites
- The VibeNVR stack must be running (usually on `http://localhost:8080`).
- Ensure you have a test camera configured with a live stream for meaningful screenshots.
- Use credentials: `admin` / `admin`.
- Ensure you are logged in using these credentials to allow the `browser_subagent` to navigate.

### 2. Capture Assets
Use the `browser_subagent` to capture high-quality screenshots (and optionally video) of the following areas:

| Area | Description | Target Path |
|------|-------------|-------------|
| **Login** | Modern login screen with premium aesthetics. | `docs/screenshots/login.png` |
| **Dashboard** | Main dashboard with widgets active. | `docs/screenshots/dashboard.png` |
| **Live View** | Grid view showing WebCodecs streams (16:9). | `docs/screenshots/liveview.png` |
| **Video Playback** | A camera stream or recording in active playback. | `docs/screenshots/video_playback.png` |
| **Timeline** | Event browser with high-res snapshots. | `docs/screenshots/timeline.png` |
| **Camera List** | The list of all configured cameras. | `docs/screenshots/cameras.png` |
| **Camera Scanner** | The interface for adding new cameras (discovery). | `docs/screenshots/camera_scanner.png` |
| **Groups** | Camera group management interface. | `docs/screenshots/camera_groups.png` |
| **Camera Config (General)** | Camera General settings tab. | `docs/screenshots/camera_config_general.png` |
| **Camera Config (Stream)** | Camera Stream/RTSP settings tab. | `docs/screenshots/camera_config_stream.png` |
| **Camera Config (Recording)**| Camera Recording settings tab. | `docs/screenshots/camera_config_recording.png` |
| **Camera Config (Motion)**   | Camera Motion detection settings tab. | `docs/screenshots/camera_config_motion.png` |
| **Settings (General)** | General preferences and UI settings. | `docs/screenshots/settings_general.png` |
| **Settings (Storage)** | Storage cleanup and disk management. | `docs/screenshots/settings_storage.png` |
| **Settings (Users)** | User management and roles. | `docs/screenshots/settings_users.png` |
| **Settings (System)** | System preferences and health status. | `docs/screenshots/settings_system.png` |
| **System Logs** | Real-time system activity logs. | `docs/screenshots/logs.png` |
| **My Profile** | User profile and security settings. | `docs/screenshots/profile.png` |
| **About** | The 'About VibeNVR' informational page. | `docs/screenshots/about.png` |
| **Mobile Dashboard** | Dashboard in mobile view (iPhone 12/Pro). | `docs/screenshots/mobile_dashboard.png` |
| **Mobile Live View** | Live View in mobile view. | `docs/screenshots/mobile_liveview.png` |
| **Mobile Timeline** | Timeline in mobile view. | `docs/screenshots/mobile_timeline.png` |
| **Full Demo Video** | High-quality screen recording of system usage. | `docs/screenshots/demo.webp` |
| **Camera Config (Still)** | Camera Still Images settings tab. | `docs/screenshots/camera_config_still_images.png` |
| **Camera Config (Alerts)**| Camera Notifications/Alerts settings tab. | `docs/screenshots/camera_config_notifications.png` |
| **Camera Config (OSD)**   | Camera Text Overlay (OSD) settings tab. | `docs/screenshots/camera_config_text_overlay.png` |

> [!TIP]
> Use the `browser_subagent` to take screenshots at both Desktop and Mobile resolutions. For mobile, use an emulator preset like **iPhone 12 Pro**.
> **IMPORTANT**: For long pages or modals, scroll to ensure all content is captured. Take multiple screenshots if necessary.
> **VIDEO**: Record a full-system walk-through (Dashboard → Live View → Timeline → Cameras → About) as a high-quality `.webp` or `.mp4` for the hero section of the README and website.

### 3. Process and Optimize
// turbo
1. Move the captured images to:
   - `VibeNVR/docs/screenshots/`
   - `VibeNVR-site/assets/`
2. Optimize images using `ffmpeg` or similar tools to WebP format where appropriate for the website.
   Example: `ffmpeg -i input.png -lossless 1 output.webp`

### 4. Update Documentation
// turbo
1. Update `VibeNVR/README.md` to ensure all image links point to the latest files and descriptions are accurate.
2. Update `VibeNVR-site/index.html` (or equivalent) to reflect the new feature highlights and visuals.

### 5. Final Audit
// turbo
1. Run `/audit-changes` to ensure documentation style and security guidelines are met.
2. If everything looks good, use `/commit-and-release` to publish the updates.
