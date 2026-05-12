# Configuration Reference

All configuration is done via the `.env` file in the project root. Below is a complete reference of every supported variable.

---

## ⚙️ `.env` Reference

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

---

---

### 🌍 Timezone & Localization

| Variable | Default | Description |
|----------|---------|-------------|
| `TZ` | `Europe/Rome` | Sets the timezone for all containers. This ensures that logs, schedules, and recording timestamps are consistent. Use standard TZ database names (e.g., `America/New_York`). |

```env
# Example: Set to New York time
TZ=America/New_York
```

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
