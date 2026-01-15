# 📘 **VibeNVR – Surveillance System**

VibeNVR is a modern, modular, and containerized video surveillance system designed to manage IP/USB cameras, recordings, motion detection, and a unified event timeline.

---

## 🚀 **Features**
- **Modern Web Interface**: Built with React + Vite.
- **Multi-Camera Support**: RTSP, MJPEG, HTTP, USB.
- **Motion Detection**: Integrated with Motion Project.
- **Unified Timeline**: View events and recordings in a single timeline.
- **Dockerized**: Easy deployment with Docker Compose.

## 🧱 **Architecture**
- **Frontend**: React, TailwindCSS, Vite.
- **Backend**: Python (FastAPI).
- **Video Engine**: Motion Project.
- **Database**: PostgreSQL.

## 🛠️ **Installation**

### Prerequisites
- Docker & Docker Compose

### Quick Start
```bash
docker compose up -d --build
```
Access the application at `http://localhost:8080`.
