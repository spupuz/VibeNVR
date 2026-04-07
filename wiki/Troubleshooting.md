# Troubleshooting Guide

This guide addresses common issues and provides steps for diagnostics and support.

---

## 🔧 Common Issues

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

In production (`ENVIRONMENT=production`), the app will strictly enforce this. To bypass it for troubleshooting, you can set `ALLOW_WEAK_SECRET=true` in your `.env` file.

### Cameras not connecting

Verify the RTSP URL is reachable from inside the Docker container. The `localhost` addresses are blocked for security reasons — use the camera's actual LAN IP.

> 💡 **Note on URL format**: VibeNVR supports raw RTSP paths including double slashes (e.g., `rtsp://ip:port//stream2`).

---

### Live View shows "Authentication Error" / 401

If you see an "AUTH ERROR" overlay, it might be a race condition during token load.

**Solution:**
1. Update to **v1.20.4 or later**.
2. Check camera credentials in **Settings → Cameras**.
3. VibeNVR automatically enters a **5-minute backoff period** on persistent 401 errors to prevent IP bans.

---

### ⚡ Troubleshooting WebCodecs
If you experience "black screens":
1. Ensure your browser supports **WebCodecs API** (Chrome/Edge 94+).
2. Check for **Secure Context** (HTTPS or localhost).
3. If the stream stalls, the frontend jitter buffer should smooth it out automatically.

---

### 🐢 High CPU Usage / UI Lag in Grid View
If the browser or host CPU spikes when viewing multiple cameras:
1. **Enable Dual-Stream**: Configure a low-resolution sub-stream for your cameras. the UI grid will automatically prioritize the sub-stream, saving massive amounts of bandwidth and decoding power.
2. **Check FPS Throttle**: Increase `opt_live_view_fps_throttle` in Global Settings to reduce the frequency of MJPEG fallback frames.

---

### 🐛 Reporting Bugs
If you encounter a bug, please open an issue on GitHub.
Include a **Diagnostic Bundle**:
1. Log in as **Admin**.
2. Go to **System Logs**.
3. Click **"Download Report"**.
4. Attach the `.zip` file to your GitHub issue.
