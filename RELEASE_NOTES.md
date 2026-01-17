# VibeNVR v1.4.1 Release Notes

## ⚡ Zero-Lag Live View System
**Critical Update for Video Stability**

We have completely rewritten the core video acquisition engine to eliminate video lag and synchronization issues.

### The Problem
Previously, the video processing loop handled both frame reading and analysis sequentially. If the analysis (motion detection, recording, overlay) took longer than the frame interval (even by milliseconds), frames would accumulate in the buffer. Over time, this caused the "Live View" to display video that was minutes or even hours old.

### The Solution: Multi-Threaded Stream Reader
- **Separate Reader Thread**: We introduced a dedicated `StreamReader` thread for each camera that does nothing but read frames from the RTSP stream at maximum speed.
- **Buffer Management**: The reader aggressively drains the buffer and always provides the absolute latest frame to the processing engine.
- **Stale Frame Prevention**: The engine now detects if a frame is "stale" (older than 10 seconds) and automatically stops serving it to the frontend, preventing misleading "frozen" images.

### Improvements
- **Real-Time Latency**: Live View is now synchronized with reality with negligible latency.
- **Auto-Healing**: If a stream disconnects, the new architecture detects it immediately and handles reconnection more robustly.
- **Performance**: Processing delays no longer impact the freshness of the video stream.

---

*This release is highly recommended for all users experiencing video lag or "stuck" cameras.*
