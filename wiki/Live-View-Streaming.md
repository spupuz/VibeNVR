# Live View Streaming Architecture

The Live View page employs a **3-stage fallback architecture** to ensure the best possible performance across different environments and network setups, while respecting strict browser security requirements.

All playback modes connect to the same efficient WebSocket endpoint on the backend, which multiplexes H.264 Video, G.711 Audio, and AI Metadata into a custom 10-byte hybrid binary protocol.

---

## 1️⃣ Primary Mode: WebCodecs (WS / H.264)
- **Technology**: Native HTML5 `VideoDecoder` API.
- **Latency**: Ultra-low (<200ms).
- **Environment**: **Strictly Requires a Secure Context**.

To use the WebCodecs API, modern browsers (Chrome, Edge, Safari) strictly enforce that the page is loaded over **HTTPS** (or `localhost`). If you deploy VibeNVR locally and access it via `http://192.168.x.x`, WebCodecs is intentionally blocked by the browser.

## 2️⃣ Intermediate Fallback: MSE via JMuxer (MSE / H.264)
- **Technology**: Media Source Extensions (MSE) parsing NAL units via JMuxer.
- **Latency**: Low (~1.5s).
- **Environment**: Works on any HTTP or HTTPS connection.

This is the primary solution for **isolated LAN installations** where setting up a Reverse Proxy, self-signed certificates, or a local DNS server is not practical. When accessed via plain HTTP, VibeNVR gracefully degrades to MSE. 
- You still get **fluid 30fps H.264 video**.
- You still get **perfectly synchronized G.711 Audio** via the Web Audio API.
- You avoid the complexity of local HTTPS setups.

## 3️⃣ Final Failsafe: MJPEG Polling (JPEG Poll)
- **Technology**: Repeated HTTP `GET` requests for single JPEG frames.
- **Latency**: High (1-5fps).
- **Environment**: Universal (used when WebSocket/H.264 decoding fails completely).

Used as a final resort for legacy browsers (e.g., old Firefox) or if the H.264 decoding fails repeatedly. Note that **audio is disabled** in this mode to save bandwidth and prevent extreme desynchronization, although AI Metadata continues to be streamed via WebSocket (Metadata-Only mode).

---

## 🔍 How to verify your active transport

1. Open the **Live View** page.
2. Check the indicator in the upper-left corner of any camera feed:
   - **`WS / H.264`** (Green): WebCodecs is active.
   - **`MSE / H.264`** (Blue): MSE fallback is active.
   - **`JPEG Poll`** (Yellow): MJPEG polling is active.
3. Open **DevTools → Network → WS** to inspect the hybrid binary stream.

---

## ⚙️ Streaming Mode Selection

You can override the streaming technology:
1. **Global Default**: **Settings → General Preferences**.
2. **Per-Camera**: **Settings → Cameras** -> `Live View Mode`:
    - **Auto**: Optimal performance using the 3-stage fallback architecture (Recommended).
    - **Force WebCodecs**: Explicit H.264 (will fail to MJPEG on HTTP).
    - **Force JPEG Polling**: Legacy approach for maximum compatibility.

---

## 🎙️ Audio Synchronization

VibeNVR muxes video and audio packets into a single WebSocket stream. To ensure a low-latency experience in both WebCodecs and MSE modes:
- **Auto-Sync**: The player monitors the drift between video frames and audio playback.
- **Drift Correction**: If the audio lag exceeds **300ms** (common after network spikes), the buffer is automatically reset to "jump" the audio back into perfect sync with the video.
- **A-law Support**: Native G.711 A-law decoding is handled client-side for immediate playback without backend transcoding latency.

---

## 🤖 AI Tracking Boxes
VibeNVR supports real-time **AI Tracking Boxes** natively overlaid on the video:
- **Metadata Channel**: Detections are sent as JSON metadata packets (pType 2) multiplexed within the WebSocket stream.
- **Client-side Rendering**: The browser draws the bounding boxes on an invisible canvas perfectly aligned over the video element. This ensures low server CPU usage.
- **Dynamic Styling**: Bounding boxes are color-coded by class (Green for Persons, Blue for Vehicles, Orange for Animals).
