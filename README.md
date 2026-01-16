# 📹 VibeNVR – Modern Video Surveillance System

VibeNVR is a modern, modular, and containerized video surveillance system designed to manage IP/USB cameras, recordings, motion detection, and a unified event timeline. It features a custom high-performance video engine (VibeEngine) built for efficiency and reliability.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🖥️ **Modern Web Interface** | Ultra-premium UI built with React, Vite, and Lucide icons. |
| 📷 **Advanced Video Engine** | Custom Python engine using OpenCV & FFmpeg for RTSP streaming and processing. |
| 🎯 **Smart Motion Detection** | Native motion detection with adjustable sensitivity, gap, and pre/post-capture buffers. |
| 📅 **Event Timeline** | Unified browser for movie recordings and high-res snapshots with instant filters. |
| 🛡️ **Storage Management** | Automated background cleanup (FIFO) with global and per-camera GB/retention limits. |
| 📁 **Camera Groups** | Organize cameras into custom groups for logical multi-view management. |
| 🕙 **Timezone Synchronization** | Full ISO 8601 support ensures perfect timing between engine, backend, and UI. |
| 🐳 **Dockerized** | Zero-dependency deployment using Docker Compose. |
| 📊 **Real-time Monitoring** | Live view with adaptive frame polling and dynamic MJPEG stream proxying. |

---

## 📸 Screenshots

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)

### Live View
![Live View](docs/screenshots/liveview.png)

### Cameras
![Cameras](docs/screenshots/cameras.png)

### Camera Settings
![Camera Settings](docs/screenshots/camera_settings.png)

### Timeline
![Timeline](docs/screenshots/timeline.png)

### Settings
![Settings](docs/screenshots/settings.png)

---

## 🧱 Architecture

VibeNVR is split into four main microservices:

*   **Frontend**: React-based SPA providing a sleek, responsive dashboard.
*   **Backend**: FastAPI server handling logic, database (PostgreSQL), and media relay.
*   **VibeEngine**: Custom processing engine for motion detection, recording, and overlays.
*   **Database**: PostgreSQL for persistent storage of camera configs and events.

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose (V2 recommended)

---

### 🛠️ Development & Source Build

```bash
# Clone the repository
git clone https://github.com/spupuz/VibeNVR.git
cd VibeNVR

# Build and start the application
docker compose up -d --build
```

### 🌐 Access the Application

Once running, access VibeNVR at **http://localhost:8080**

| Service | Port | External Access |
|---------|------|-----------------|
| Frontend (UI) | 8080 | Dashboard & Live View |
| Backend (API) | 5000 | Core API & Webhooks |
| VibeEngine | 8000 | Video Node API |

---

## 🔧 Core Functionality

### 🎬 Recording & Snapshots
VibeNVR supports three recording modes: **Off**, **Always**, and **Motion Triggered**.
- **Pre-capture Buffer**: Capture the seconds *before* motion was detected.
- **Post-capture Buffer**: Continue recording for a set duration after motion ends.
- **Motion Snapshots**: Automatically save high-resolution JPEG images when motion starts.

### 💾 Storage Monitor
The system includes a background `storage_service` that monitors disk usage:
- **Global Limit**: Set a maximum size (GB) for all recordings.
- **Per-Camera Retention**: Define how long or how much space each camera can take.
- **FIFO Cleanup**: Automatically deletes the oldest media when limits are reached.

---

## 📁 Project Structure

```
VibeNVR/
├── frontend/          # React frontend application
├── backend/           # FastAPI backend server
├── engine/            # Custom Video Engine (OpenCV/FFmpeg)
├── motion/            # Legacy/External motion config support
└── docker-compose.yml # Docker orchestration
```

---

## 📄 License

This project is open source.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/spupuz">spupuz</a>
</p>
