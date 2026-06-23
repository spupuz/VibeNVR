# Network & Port Forwarding

This guide covers network configuration, ports, and reverse proxy setups for VibeNVR.

> [!TIP]
> **VibeNVR is designed for local-first privacy.** While you can expose it to the internet via a reverse proxy, we recommend using a VPN (like Tailscale or WireGuard) for the most secure remote access experience.

---

## 🌐 Network & Ports Reference

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

## 🛡️ Cookie Security

| Variable | Default | Description |
|----------|---------|-------------|
| `COOKIE_SECURE` | `true` | Controls the `Secure` flag on auth cookies. Set to `false` for local HTTP access (`http://localhost`). Must be `true` when serving via HTTPS. |

```env
# Local HTTP testing only:
COOKIE_SECURE=false

# Behind HTTPS reverse proxy (recommended for internet exposure):
COOKIE_SECURE=true
```

---

## 🔄 Reverse Proxy Configuration for WebSockets

If you expose VibeNVR to the internet or your LAN via an **external reverse proxy**, you **must ensure your proxy is configured to pass WebSocket connections** (`Connection: Upgrade`).

- **Nginx (Classic):**
  ```nginx
  location / {
      proxy_pass http://192.168.1.28:8080;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
  }
  ```
- **Nginx Proxy Manager:** Edit your Proxy Host, go to the **Details** tab, and toggle the **"Websockets Support"** switch to ON.
- **Caddy / Traefik:** WebSockets are supported automatically by default.

---

## 🎥 Internal Streaming Gateway (go2rtc)

VibeNVR integrates an internal **go2rtc** gateway to handle flaky IP cameras and mitigate IP bans.

- **Role:** When enabled globally in Settings, the Backend registers all active cameras with the internal go2rtc service.
- **RTSP Proxy:** The Engine (VibeEngine) connects to the internal gateway (`127.0.0.1:8554`) instead of connecting directly to the camera hardware.
- **Benefits:**
  - Dramatically improves connection stability for cheap/battery cameras (e.g., Wyze, Tapo).
  - Absorbs dropped packets and reconnects invisibly.
  - Mitigates aggressive IP-banning behavior from consumer cameras if multiple clients try to connect simultaneously.

---

## 🔒 Browser Security Headers

VibeNVR includes standard browser security headers served by the internal Nginx frontend. These provide an extra layer of defense against common web vulnerabilities.

| Header | Value | Purpose |
|--------|-------|---------|
| **X-Frame-Options** | `DENY` / `SAMEORIGIN` | Prevents Clickjacking by restricting embedding. |
| **X-Content-Type-Options** | `nosniff` | Prevents MIME-type sniffing. |
| **X-XSS-Protection** | `1; mode=block` | Blocks cross-site scripting attacks. |
| **Strict-Transport-Security** | `max-age=31536000; includeSubDomains` | Enforces secure (HTTPS) connections to the server. |
| **Referrer-Policy** | `strict-origin-when-cross-origin` | Protects privacy when navigating to external links. |
| **Content-Security-Policy** | *(Strict)* | Actively mitigates XSS. See [SECURITY.md](SECURITY.md) for details. |

> [!NOTE]
> **Custom Proxies**: If you are using an external reverse proxy (like Nginx Proxy Manager or Traefik), you do **not** need to manually add these headers to your proxy configuration, as they are already served by the internal VibeNVR frontend and passed through by your proxy.
