# Live View — WebCodecs H.264 Streaming

From **v1.21.0**, the Live View page uses the browser's native **WebCodecs API** to display a direct H.264 stream via WebSockets.

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
