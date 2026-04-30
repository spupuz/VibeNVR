# Anonymous Telemetry & Privacy 📊

VibeNVR is built with a "Privacy First" mindset. While we collect anonymous telemetry to help improve the project, we are fully transparent about what data is shared and how it is used.

---

## 🛡️ Privacy Policy

1. **No Sensitive Data**: We NEVER collect IP addresses, camera names, stream URLs, usernames, passwords, or video/image data.
2. **Anonymous Identification**: Every installation generates a random **Instance ID** (UUID) at boot. This ID is not linked to your identity.
3. **Local First**: All video processing, motion detection, and AI inference happen strictly on your local hardware. No media ever leaves your network.
4. **Edge Anonymization**: Telemetry is processed by a Cloudflare Worker at the edge. Your IP address is used only to determine the country of origin and is immediately discarded.

---

## 📋 What is Collected?

The telemetry report contains only technical and aggregate usage metrics:

| Category | Field | Example | Description |
|----------|-------|---------|-------------|
| **Identity** | `instance_id` | `a1b2c3-...` | A random UUID to distinguish unique installations. |
| **Software** | `version` | `1.27.1` | The installed VibeNVR version. |
| **System** | `os` / `arch` | `Linux` / `x86_64` | Operating system and CPU architecture. |
| **Hardware** | `cpu` / `ram` | `12` / `64` | Core count and total RAM (GB). |
| **Hardware** | `gpu` | `True` | Whether hardware acceleration is active. |
| **Usage** | `cameras` | `4` | Total number of configured cameras. |
| **Usage** | `groups` | `2` | Total number of camera groups. |
| **Usage** | `events` | `1500` | Total number of recorded events in the database. |
| **Engines** | `motion_opencv` | `1` | Cameras using the classic OpenCV motion engine. |
| **Engines** | `motion_onvif` | `1` | Cameras using ONVIF Edge hardware detection. |
| **Engines** | `motion_ai_engine` | `2` | Cameras using the **AI Native** detection engine. |
| **Features** | `motion_ai` | `2` | Cameras with the AI detection layer enabled. |
| **Features** | `mqtt_active` | `True` | Whether the Native MQTT Service is enabled. |
| **Features** | `onvif_count` | `3` | Total number of cameras with ONVIF configured. |
| **Features** | `substream_count`| `2` | Total number of cameras using sub-streams. |
| **Status** | `notifications` | `True` | Whether any notification channel (Telegram, Email, Webhook) is configured. |

---

## 🕙 Reporting Frequency

- **Initial Ping**: Sent 30 seconds after the backend starts.
- **Daily Heartbeat**: Sent once every 24 hours while the system is running.

---

## 📊 Public Dashboard

You can view the aggregate, anonymous data from all VibeNVR users on our public dashboard:
**[VibeNVR Public Telemetry](https://vibenvr-telemetry.spupuz.workers.dev/)**

---

## 🚫 Opt-Out

You have total control over your data. To disable telemetry:

1. Go to **Settings** > **Privacy & Analytics**.
2. Toggle off **Enable Anonymous Telemetry**.
3. Save your settings.

Once disabled, the backend will immediately stop sending all reports.
