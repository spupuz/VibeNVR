# System Architecture

VibeNVR is designed as a modern, modular microservices ecosystem to ensure reliability, security, and high performance.

---

## 🏗️ Core Components

VibeNVR is split into four primary services, each running in its own Docker container:

### 1. Frontend (React SPA)
A premium, responsive dashboard built with **React**, **Vite**, and **TailwindCSS**. It communicates with the backend via a REST API and handles low-latency video playback using the WebCodecs API.

### 2. Backend (FastAPI)
The central logic hub powered by **FastAPI (Python)**.
- **Authentication**: Full JWT stack with 2FA support.
- **API**: Handles configuration, user management, and event queries.
- **Media Relay**: Manages secure, authenticated access to video streams via HttpOnly cookies.

### 3. VibeEngine (Custom Python Engine)
The dedicated video processing service. This is the "heavy lifter" of the system:
- **Stream Ingestion**: Uses **PyAV** (native FFmpeg bindings) for robust RTSP connection management and packet demuxing.
- **Image Processing**: Leverages **OpenCV (cv2)** for motion detection analysis, text overlays, and dynamic JPEG encoding for legacy previews.
- **Security**: Communicates via internal Docker networks and requires a shared `WEBHOOK_SECRET` for backend interaction.

### 4. Database (PostgreSQL)
Uses **PostgreSQL 15** for reliable storage of all persistent data, including camera configurations, user settings, and the event timeline.

---

## 🔒 Security Model

VibeNVR implements a "Security by Design" approach:
- **Internal API Protection**: Sensitive internal APIs (like the Engine's control port) are not exposed to the host machine.
- **Token Scoping**: API tokens can be created with specific TTLs and limited permissions.
- **Reverse Proxy Ready**: Built to work seamlessly behind Nginx Proxy Manager or Traefik with full WebSocket support.

---

## ⚡ Performance Optimization

- **Passthrough Recording**: Optionally records raw RTSP streams directly to disk without re-encoding, resulting in near-zero CPU usage.
- **Adaptive Streaming**: Automatically switches between high-performance WebCodecs (H.264) and compatible JPEG polling based on browser support and connection quality.
