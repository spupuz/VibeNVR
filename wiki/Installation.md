# Installation Guide

This guide covers how to install VibeNVR and manage your deployment via Docker.

---

## 📋 Prerequisites

- **Docker** ≥ 24.x and **Docker Compose** ≥ 2.x
- A host with at least **2 GB RAM** and **10 GB disk** recommended
- (Optional) An NVIDIA or Intel/AMD GPU for hardware-accelerated transcoding

---

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/spupuz/VibeNVR.git
cd VibeNVR

# 2. Copy the example config and edit it
cp .env.example .env
nano .env   # or your preferred editor

# 3. Start VibeNVR
docker compose up -d --build

# 4. Open the UI
# http://localhost:8080
```

On first launch, the UI will prompt you to create the first **admin account**.

---

## 🗂️ Choosing the Right Compose File

| File | Use case | Images |
|------|----------|--------|
| `docker-compose.yml` | Local development / build from source | Built locally |
| `docker-compose.prod.yml` | Production / pull from Docker Hub | `spupuz/vibenvr-*:latest` |

```bash
# Production (pre-built images, no build step needed):
docker compose -f docker-compose.prod.yml up -d
```

---

## 🔄 Updating VibeNVR

When a new version is released, follow these steps to pull the latest image and update your deployment:

```bash
# 1. Download the latest production compose file
curl -O https://raw.githubusercontent.com/spupuz/VibeNVR/main/docker-compose.prod.yml

# 2. Pull the new images
docker compose -f docker-compose.prod.yml pull

# 3. Restart the containers
docker compose -f docker-compose.prod.yml up -d
```

> [!TIP]
> If you are building from source (dev build), use `git pull` followed by `docker compose up -d --build`.
