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

### 📦 Installation via Docker (Recommended)

You can pull the pre-built images directly from Docker Hub without needing to build from source.

1.  Create a `docker-compose.yml` file:

    ```yaml
    services:
      frontend:
        image: spupuz/vibenvr-frontend:latest
        ports:
          - "8080:80" # Frontend (UI) Port
        restart: always

      backend:
        image: spupuz/vibenvr-backend:latest
        ports:
          - "5000:5000"
        volumes:
          - ./data/recordings:/data # Bind Mount for video storage
        environment:
          - DATABASE_URL=postgresql://vibenvr:your_secure_password@db:5432/vibenvr
          - TZ=Europe/Rome
        depends_on:
          - db
        restart: always

      engine:
        image: spupuz/vibenvr-engine:latest
        ports:
          - "8000:8000"
        volumes:
          - ./data/recordings:/var/lib/vibe/recordings # Same Bind Mount as backend
        environment:
          - TZ=Europe/Rome
        restart: always

      db:
        image: postgres:15-alpine
        environment:
          - POSTGRES_USER=vibenvr
          - POSTGRES_PASSWORD=your_secure_password
          - POSTGRES_DB=vibenvr
        volumes:
          - ./data/db:/var/lib/postgresql/data # Bind Mount for DB
        restart: always
    ```

2.  Start the service:
    ```bash
    docker compose up -d
    ```

---

### 🛠️ Development & Source Build

If you want to modify the code or build locally:

```bash
# Clone the repository
git clone https://github.com/spupuz/VibeNVR.git
cd VibeNVR

# Build and start the application
docker compose up -d --build
```

---

### 💾 Data Persistence (Bind Mounts vs Volumes)

By default, Docker uses **Named Volumes** which are managed internally by Docker. To easily access your recordings and database files from your host system (e.g., for backup or external players), use **Bind Mounts**.

**To use Bind Mounts (Host Folders):**
Modify your `docker-compose.yml` volumes section as shown above:
*   Change `vibenvr_data:/data` to `- ./your/local/path:/data`
*   Change `vibenvr_db_data:/var/lib/postgresql/data` to `- ./your/local/db_path:/var/lib/postgresql/data`

*Note: Ensure the local folders exist or that Docker has permission to create them.*

---

### ⚙️ Configuration

**Changing the Frontend Port:**
If port `8080` is occupied, change the mapping in `docker-compose.yml`:

```yaml
frontend:
  ports:
    - "YOUR_PORT:80" # Change 8080 to your desired port (e.g., "3000:80")
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

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/spupuz">spupuz</a>
</p>
