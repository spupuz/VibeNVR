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
| `SECRET_KEY` | *(insecure default)* | **Change this.** Used to sign JWT tokens (min 32 chars). In production, the app **will not start** if set to a built-in default or weak key, unless `ALLOW_WEAK_SECRET=true` is set. |
| `WEBHOOK_SECRET` | *(insecure default)* | Shared secret between backend and engine for internal webhook verification. Generate with: `openssl rand -hex 32`. |
| `ALLOW_WEAK_SECRET` | `false` | Set to `true` to bypass the `SECRET_KEY` security check in production (NOT RECOMMENDED). |

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

# Pull latest image (prod releases are built on tag pushes)
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

If the backend fails to start with a `SystemExit: 1`, check that `SECRET_KEY` is not set to one of the default values and is at least 32 characters long.

In production (`ENVIRONMENT=production`), the app will strictly enforce this. To bypass it for troubleshooting, you can set `ALLOW_WEAK_SECRET=true` in your `.env` file, though this is **not recommended** for actual production use.

In non-production environments, it will only print a loud warning but will allow the application to start.

### Cameras not connecting

Verify the RTSP URL is reachable from inside the Docker container (not from your laptop). The `localhost` / `127.0.0.1` addresses are explicitly blocked for security reasons — use the camera's actual LAN IP.

> 💡 **Note on URL format**: From v1.22.0, VibeNVR supports raw RTSP paths including double slashes (e.g., `rtsp://ip:port//stream2`). Aggressive URL sanitization has been removed to ensure compatibility with all camera brands.

---

### Live View shows "Authentication Error" / 401 on some cameras

If you see an "AUTH ERROR" overlay immediately on page load, it might be due to a race condition where the browser starts requesting frames before the authentication token is fully loaded in memory.

**Solution:**
1. Update to **v1.20.4 or later**, which adds a "token guard" in `LiveView.jsx` to prevent polling until the JWT is available.
2. Check that your camera credentials (Username/Password) in **Settings → Cameras** are correct. VibeNVR now includes a pre-flight safety check to prevent your camera from banning your IP if the credentials are wrong.
3. If you suspect an IP ban (camera pingable but RTSP connection refused), VibeNVR will now **automatically enter a 5-minute backoff period**. You can see the status in the logs; the system will retry once the timer expires.

### ⚡ Troubleshooting WebCodecs
If you experience "black screens" or delayed startup on the live view:
1. Ensure your browser supports **WebCodecs API** (Chrome/Edge 94+).
2. VibeNVR v1.22.0+ includes **Keyframe Caching** to ensure instant synchronization even on high-latency links.
3. If the stream stalls, the frontend incorporates a **micro-jitter buffer** to smooth out network fluctuations automatically.

---

### Live View — WebCodecs H.264 Streaming

From **v1.21.0**, the Live View page uses the browser's native **WebCodecs API** to display a direct H.264 stream via WebSockets, replacing the previous MJPEG/JPEG polling approach for supported browsers.

#### How to verify WebCodecs is active

1. Open the **Live View** page in a supported browser (Chrome 94+, Edge 94+, most Chromium-based browsers).
2. Hover over any active camera tile. In the bottom-left info badge you will see a **`WS / H.264`** label in green if the native decoder is active, or **`JPEG Poll`** in yellow if it fell back.
3. Open **DevTools → Network → WS** filter — you will see an active WebSocket connection to `/api/cameras/{id}/ws` receiving binary frames.

#### Browser compatibility

| Browser | WebCodecs Support | Streaming Mode |
|---------|-------------------|----------------|
| Chrome 94+ | ✅ | H.264 via WebCodecs (direct, low latency) |
| Edge 94+ | ✅ | H.264 via WebCodecs (direct, low latency) |
| Firefox | ❌ | Falls back to MJPEG/JPEG polling automatically |
| Safari | Partial | Falls back to MJPEG/JPEG polling automatically |

**🔴 Crucial: Secure Context Requirement**  
WebCodecs uses the `VideoDecoder` API which is a "Powerful API" strictly limited to **Secure Contexts** by all modern browsers (Chrome, Edge, Firefox, Safari).  
This means WebCodecs **will only work if**:
1. You access VibeNVR via **`http://localhost:8080`** (localhost is always a secure context).
2. You access VibeNVR via **`https://...`** (using a reverse proxy with a valid or self-signed TLS certificate).

If you access VibeNVR via an insecure local IP (e.g., `http://192.168.1.100:8080`), you are in an Insecure Context. The browser will completely disable the `VideoDecoder` API, and VibeNVR will silently fall back to JPEG polling (the badge will show `JPEG Poll`).

#### Reverse Proxy Configuration for WebSockets

If you expose VibeNVR to the internet or your LAN via an **external reverse proxy** (to provide the required HTTPS context), you **must ensure your proxy is configured to pass WebSocket connections** (`Connection: Upgrade`). If the proxy strips these headers, the `WS / H.264` connection will fail and the NVR will fall back to JPEG polling.

- **Nginx (Classic):** You must explicitly define the `Upgrade` headers in your `location` block:
  ```nginx
  location / {
      proxy_pass http://192.168.1.28:8080;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
  }
  ```
- **Nginx Proxy Manager:** Edit your Proxy Host, go to the **Details** tab, and toggle the **"Websockets Support"** switch to ON.
- **Caddy / Traefik:** WebSockets are supported automatically by default. No extra configuration is needed.
- **Cloudflare Tunnels:** WebSockets are enabled by default in the Network settings, but long streams might occasionally hit Cloudflare proxy timeouts.

If WebCodecs initialisation fails (unsupported codec profile, decoder error, or WS proxy failure), the player **automatically falls back** to the previous JPEG polling mechanism with no user action required.

#### H.264 profile compatibility

The WebCodecs player dynamically detects the exact H.264 profile of your camera by inspecting the SPS (Sequence Parameter Set) NAL unit from the raw stream. It will automatically build the correct codec string (e.g. `avc1.4d001e` for Main Profile or `avc1.64002a` for High Profile) before configuring the decoder. 

If there is a decoder error or WebCodecs is unsupported, the player **automatically falls back** to the JPEG polling mechanism with no user action required.

#### Streaming Mode Selection
If a specific camera has persistent compatibility issues with WebCodecs (e.g. constant "No Signal" or artifacting), you can override the streaming technology:
1. **Global Default**: Go to **Settings → General Preferences** and set the `Default Streaming Mode`. This applies to all new cameras.
2. **Per-Camera Override**: Go to **Settings → Cameras**, select a camera, and change the `Live View Mode`:
    - **Auto**: Optimal performance with WebCodecs, falling back to MJPEG if necessary.
    - **Force WebCodecs**: Explicitly uses the H.264 decoder (Chrome/Edge only).
    - **Force JPEG Polling**: Uses the legacy approach for maximum compatibility and minimal client CPU.

---

