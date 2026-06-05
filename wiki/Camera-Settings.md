# Camera Settings Management

VibeNVR allows you to rapidly configure multiple cameras using the **Selective Copy Settings** feature. This can be done for individual cameras, at the group level, or even during the initial camera creation via **Cloning**.

---

## 📋 Copy & Clone Logic

To ensure system integrity and avoid connection conflicts, the system distinguishes between **configuration** (reusable) and **identity** (unique).

### ❌ What is NOT copied (Excluded)
These fields are specific to each hardware device or system-managed and are **never** overwritten or cloned:

*   **Identity**: ID, Name, Location, Creation Date.
*   **Connection**: Primary RTSP URL, Sub-Stream URL, Internal Stream URL.
*   **Status**: Online/Offline status, Last seen timestamp, Enabled/Disabled state.
*   **Hardware/Video**: Resolution (Width/Height), Auto-resolution setting.
*   **ONVIF Configuration**: Host, Port, Username, Password, and Profile Tokens.
*   **Capabilities**: Hardware-detected flags for PTZ (Pan/Tilt/Zoom) and ONVIF Event support.
*   **Relations**: Group assignments and assigned Storage Profiles.
*   **Layout**: Visual Sort Order (Drag-and-drop position).

### ✅ What IS copied (Categories)
Users can selectively pick which categories of settings to propagate. The available categories are:

*   **Recording**: Mode (Continuous, Motion Triggered, Off), quality (CRF), and retention policies.
*   **Motion Detection**: Threshold, Sensitivity, Discovery Engine, and capture buffers.
*   **Privacy Masks**: Black-out polygons used for legal/privacy shielding.
*   **Motion Zones**: Exclusion areas where motion is ignored.
*   **Snapshots**: Frequency and quality for still images.
*   **Alerts/Notifications**: Telegram, Email, and Webhook dispatch settings.
*   **Overlay (OSD)**: Timestamp and text overlays on the video stream.
*   **Advanced/Schedule**: Weekly schedules and other low-level system flags.

---

## 🛠️ Feature Workflows

- [Selective Propagation](#selective-propagation)
- [Camera Cloning](#camera-cloning)
- [Advanced Engine Sync](#advanced-engine-sync)
- [Edge Motion Visual Feedback](#edge-motion-visual-feedback)
- [💡 Pro Tips](#pro-tips)

### 1. Cloning during Creation
When adding a **New Camera**, you can use the "Clone Settings From..." dropdown. 
1. Select a source camera.
2. Toggle the specific **Categories** you wish to import (Recording, Motion, etc.).
3. The form will automatically populate with those settings, while keeping the Name, URLs, and unique configurations fresh.

### 2. Selective Propagation
From the camera list, select "Copy Settings to...". This opens a modal where you can select one or more target cameras and exactly which categories to apply.

### 3. Group-Level Propagation
In the **Groups Manager**, each group has a "Copy Settings" button.
1. Select a *Source Camera* (from anywhere in the system).
2. Select the categories to apply.
3. Every camera in that group will be updated simultaneously with the selected settings.

---

## Advanced Engine Sync
Certain critical settings are automatically synchronized with the recording engine to ensure streaming stability and correct rendering:

- **RTSP Transport**: Whether to use TCP or UDP for the main stream (fully supported in both Re-encode and Passthrough modes).
- **Sub RTSP Transport**: Independent transport setting for the sub-stream.
- **Live View Mode**: Global preference for WebCodecs (WebSocket/H.264) vs MJPEG fallback.

These settings are applied in real-time when the camera configuration is saved.

## Edge Motion & AI Motion Visual Feedback

VibeNVR supports three detection engines, each with dedicated Live View feedback. The live camera tile displays a color-coded badge that reflects the full recording lifecycle:

### Detection Badges (Active Motion)

| Engine | Badge | Color | Description |
|--------|-------|-------|-------------|
| **OpenCV** | `MOTION` | 🔴 Pulsing Red | Classical background subtraction (MOG2). Fast, no hardware required. |
| **ONVIF Edge** | `EDGE MOTION` | 🔴 Pulsing Red | Motion events triggered by the camera hardware via ONVIF protocol. |
| **AI Engine** | `AI: PERSON` (or detected label) | 🔴 Pulsing Red | TFLite object recognition (YOLOv8 or MobileNet SSD). The badge shows the actual detected class name(s). |

### Lifecycle Badges (Post-Motion)

| State | Badge | Color | Description |
|-------|-------|-------|-------------|
| **Saving Recording** | `SAVING REC` | 🟠 Solid Orange | Motion has ended, but the post-capture buffer is still writing the video file to disk. The border also turns solid orange (non-pulsing) to distinguish this from an active alarm. |
| **Continuous Mode** | `CONTINUOUS` | 🔵 Solid Blue | The camera is in Always-on recording mode. No motion trigger is needed. |

> [!NOTE]
> The complete recording lifecycle transition is: **`AI: PERSON`** (motion active) → **`SAVING REC`** (post-capture buffer finalizing) → *(badge disappears)* (file written to disk).

### Motion State Reliability (v1.29.6)

The backend maintains an in-memory live motion registry (`LIVE_MOTION`). Three safeguards ensure badges never get stuck:

- **Instant Cleanup on Stop**: Disabling a camera immediately clears its motion state. The badge disappears the moment you toggle the camera off.
- **60-Second TTL**: If the engine crashes mid-event and a `motion_end` signal is never sent, the badge automatically expires after 60 seconds.
- **Engine Switch Reset**: If you change the detection engine (e.g., from OpenCV to AI) while a motion event is active, the system fires a synthetic `motion_end` before handing off to the new engine — preventing stale state carry-over.

> [!TIP]
> For full documentation on setting up **AI detection** with a **Google Coral Edge TPU**, including Docker Compose configuration and Proxmox LXC USB passthrough, see the dedicated **[AI Object Detection Guide](AI-Detection.md)**.

---

## 💡 Pro Tips

### Scaling Privacy Masks
Privacy Masks and Motion Zones use normalized coordinates (0.0 to 1.0), meaning they will scale correctly even if you copy them between cameras with different resolutions.

### Hardware Differences
> [!CAUTION]
> While masks scale correctly, the physical FOV (Field of View) might differ between cameras. Always verify masks and zones after copying to ensure they align with the actual scene of the target camera.

### Verification
After copying settings, it is recommended to check the **Live View** to ensure the cameras are still communicating correctly, especially if you have changed recording modes or engines.
