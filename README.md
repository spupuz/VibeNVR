# 📹 VibeNVR – Modern Video Surveillance System

VibeNVR is a modern, modular, and containerized video surveillance system designed to manage IP/USB cameras, recordings, motion detection, and a unified event timeline.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🖥️ **Modern Web Interface** | Built with React + Vite + TailwindCSS |
| 📷 **Multi-Camera Support** | RTSP, MJPEG, HTTP, USB cameras |
| 🎯 **Motion Detection** | Integrated with Motion Project |
| 📅 **Unified Timeline** | View events and recordings in a single timeline |
| 🐳 **Dockerized** | Easy deployment with Docker Compose |
| 🔐 **Authentication** | Secure login with session management |
| 📊 **Dashboard** | Real-time stats on cameras, storage, and system health |

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

| Component | Technology |
|-----------|------------|
| Frontend | React, TailwindCSS, Vite |
| Backend | Python (FastAPI) |
| Video Engine | Motion Project |
| Database | PostgreSQL |

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose

### Installation

```bash
# Clone the repository
git clone https://github.com/spupuz/VibeNVR.git
cd VibeNVR

# Start the application
docker compose up -d --build
```

Access the application at **http://localhost:8080**

### Default Ports

| Service | Port |
|---------|------|
| Frontend (UI) | 8080 |
| Backend (API) | 5000 |
| Motion Stream | 8081 |
| Motion Control | 8082 |
| Camera Streams | 8101-8120 |

---

## 🐳 Docker Images

Pre-built images are available on Docker Hub:

```bash
docker pull spupuz/vibenvr-frontend:latest
docker pull spupuz/vibenvr-backend:latest
docker pull spupuz/vibenvr-motion:latest
```

Images are automatically built on each release with semantic versioning tags.

---

## 📁 Project Structure

```
VibeNVR/
├── frontend/          # React frontend application
├── backend/           # FastAPI backend server
├── motion/            # Motion project configuration
└── docker-compose.yml # Docker orchestration
```

---

## 🔧 Configuration

### Adding Cameras

1. Navigate to **Settings** in the web UI
2. Click **Add Camera**
3. Enter camera details (name, stream URL, type)
4. Save and the camera will appear in Live View

### Motion Detection

Motion detection is powered by [Motion Project](https://motion-project.github.io/). Configuration files are in `motion/`.

---

## 📄 License

This project is open source.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/spupuz">spupuz</a>
</p>
