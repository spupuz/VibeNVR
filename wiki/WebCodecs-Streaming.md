# Live View — WebCodecs H.264 Streaming

The Live View page uses the browser's native **WebCodecs API** to display a direct H.264 stream via WebSockets.

---

## 🔍 How to verify WebCodecs is active

1. Open the **Live View** page in a supported browser (Chrome 94+, Edge 94+).
2. Hover over any active camera tile. Bottom-left badge: **`WS / H.264`** (Green) vs **`JPEG Poll`** (Yellow).
3. Open **DevTools → Network → WS** to see the binary stream.

---

## 🌐 Browser Compatibility

| Browser | WebCodecs Support | Streaming Mode |
|---------|-------------------|----------------|
| Chrome 94+ | ✅ | H.264 via WebCodecs |
| Edge 94+ | ✅ | H.264 via WebCodecs |
| Firefox | ❌ | Falls back to MJPEG/JPEG polling |
| Safari | Partial | Falls back to MJPEG/JPEG polling |

---

## 🔒 Secure Context Requirement

WebCodecs strictly requires a **Secure Context**:
1. Access via **`http://localhost:8080`**.
2. Access via **`https://...`** (Reverse Proxy).

Insecure local IP access (`http://192.168.x.x`) will fall back to JPEG polling.

---

## ⚙️ Streaming Mode Selection

You can override the streaming technology:
1. **Global Default**: **Settings → General Preferences**.
2. **Per-Camera**: **Settings → Cameras** -> `Live View Mode`:
    - **Auto**: Optimal performance with WebCodecs fallback.
    - **Force WebCodecs**: Explicit H.264.
    - **Force JPEG Polling**: Legacy approach for maximum compatibility.

---

## 🎙️ Audio Synchronization

VibeNVR muxes video and audio packets into a single WebSocket stream. To ensure a low-latency experience:
- **Auto-Sync**: The player monitors the drift between video frames and audio playback.
- **Drift Correction**: If the audio lag exceeds **300ms** (common after network spikes), the buffer is automatically reset to "jump" the audio back into perfect sync with the video.
- **A-law Support**: Native G.711 A-law decoding is handled client-side for immediate playback without backend transcoding latency.

---

## 🤖 AI Tracking Boxes
Since v1.28.5, VibeNVR supports real-time **AI Tracking Boxes** in WebCodecs mode:
- **Metadata Channel**: Detections are sent as JSON metadata packets multiplexed within the WebSocket stream.
- **Client-side Rendering**: The browser draws the bounding boxes on top of the video canvas. This ensures low server CPU usage while maintaining visual parity with MJPEG mode.
- **Dynamic Styling**: Bounding boxes are color-coded by class (Green for Persons, Blue for Vehicles, Orange for Animals).
