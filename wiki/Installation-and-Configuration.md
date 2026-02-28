# Installation & Configuration Guide

This guide covers how to install VibeNVR and configure the `.env` file for different deployment scenarios (local, LAN, or internet via reverse proxy).

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
cp .env .env.local
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

## ⚙️ `.env` Reference

All configuration is done via the `.env` file in the project root. Below is a complete reference of every supported variable.

---

### 🔑 Security (Required in Production)

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | *(insecure default)* | **Change this.** Used to sign JWT tokens. Generate with: `openssl rand -hex 32`. The app **will not start** if set to the built-in default key. |
| `WEBHOOK_SECRET` | *(insecure default)* | Shared secret between backend and engine for internal webhook verification. Generate with: `openssl rand -hex 32`. |

```env
SECRET_KEY=your_64_char_random_hex_here
WEBHOOK_SECRET=another_64_char_random_hex_here
```

> ⚠️ **Never commit real secrets to Git.** Add `.env` to `.gitignore` if you fork the project.

---

### 🍪 Cookie Security

| Variable | Default | Description |
|----------|---------|-------------|
| `COOKIE_SECURE` | `true` | Controls the `Secure` flag on auth cookies. Set to `false` for local HTTP access (`http://localhost`). Must be `true` when serving via HTTPS. |

```env
# Local HTTP testing only:
COOKIE_SECURE=false

# Behind HTTPS reverse proxy (recommended for internet exposure):
COOKIE_SECURE=true
```

> 💡 With `COOKIE_SECURE=true`, browsers will only send auth cookies over HTTPS. If you access via plain HTTP with this enabled, you will be logged out on every page reload.

---

### 💾 Data Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `VIBENVR_DATA` | Docker named volume | Path on the host where recordings, snapshots, and avatars are stored. Use an absolute path for easy access. |
| `VIBENVR_DB_DATA` | Docker named volume | Path on the host for the PostgreSQL database files. |

```env
# Example: Store data on a dedicated drive
VIBENVR_DATA=/mnt/storage/vibenvr
VIBENVR_DB_DATA=/mnt/storage/vibenvr_db
```

> If left commented out, Docker creates managed named volumes (`vibenvr_data`, `vibenvr_db_data`). Use host paths if you want direct filesystem access to recordings.

---

### 🗃️ Database

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `vibenvr` | PostgreSQL username. |
| `POSTGRES_PASSWORD` | `vibenvrpass` | PostgreSQL password. **Change this in production.** |
| `POSTGRES_DB` | `vibenvr` | PostgreSQL database name. |

```env
POSTGRES_USER=vibenvr
POSTGRES_PASSWORD=a_strong_random_password
POSTGRES_DB=vibenvr
```

> 💡 Database credentials are now automatically injected into `DATABASE_URL`. Simply update the variables below and restart the containers.

---

### 🌐 Network & Ports

| Variable | Default | Description |
|----------|---------|-------------|
| `VIBENVR_FRONTEND_PORT` | `8080` | Host port for the web UI. |
| `VIBENVR_BACKEND_PORT` | `5005` | Host port for the backend API (for direct access/debugging). |
| `ALLOWED_ORIGINS` | *(empty)* | Comma-separated list of allowed CORS origins. Restrict this to your domain in production. If empty, only `localhost` is allowed. |

```env
# Restrict to your domain when exposing publicly:
ALLOWED_ORIGINS=https://nvr.yourdomain.com
```

---

### ⚡ Hardware Acceleration

| Variable | Default | Description |
|----------|---------|-------------|
| `HW_ACCEL` | `false` | Set to `true` to enable GPU-accelerated video transcoding via FFmpeg. |
| `HW_ACCEL_TYPE` | `auto` | GPU type: `auto`, `nvidia`, `intel`, or `amd`. `auto` detects the available encoder automatically. |

```env
# Enable GPU acceleration (Linux with Intel/AMD VAAPI):
HW_ACCEL=true
HW_ACCEL_TYPE=auto

# NVIDIA requires nvidia-container-toolkit installed on the host
HW_ACCEL=true
HW_ACCEL_TYPE=nvidia
```

> For NVIDIA, also uncomment the `deploy.resources.reservations` block in `docker-compose.yml`.

---

## 🔒 Production Security Checklist

Before exposing VibeNVR to the internet, verify the following:

- [ ] `SECRET_KEY` is a unique, random 64-char hex string
- [ ] `WEBHOOK_SECRET` is a unique, random 64-char hex string
- [ ] `POSTGRES_PASSWORD` is a strong, unique password
- [ ] `COOKIE_SECURE=true` is set
- [ ] `ALLOWED_ORIGINS` is restricted to your domain (not `*`)
- [ ] VibeNVR is behind a reverse proxy (Nginx, Caddy, Traefik, etc.) with valid HTTPS/TLS
- [ ] Internal ports (`5005` backend, engine) are **not** exposed directly to the internet
- [ ] 2FA is enabled on all admin accounts
- [ ] API Tokens have expiration dates set

---

## 🔄 Updating VibeNVR

```bash
# Pull latest changes (dev build)
git pull
docker compose down && docker compose up -d --build

# Pull latest image (prod)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## 🔧 Troubleshooting

### Permission errors on Proxmox / Synology / QNAP

If you see `PermissionError: [Errno 13]` or `could not create Unix socket`, try uncommenting in `docker-compose.yml`:

```yaml
security_opt:
  - seccomp:unconfined
  - apparmor:unconfined
```

As a last resort, use `privileged: true` on the affected service.

### Backend fails to start

Check that `SECRET_KEY` is not set to one of the default values. The app will print a critical error and exit if it detects an insecure key:
```
!! CRITICAL SECURITY ERROR: You are using the default SECRET_KEY. !!
```

### Cameras not connecting

Verify the RTSP URL is reachable from inside the Docker container (not from your laptop). The `localhost` / `127.0.0.1` addresses are explicitly blocked for security reasons — use the camera's actual LAN IP.
