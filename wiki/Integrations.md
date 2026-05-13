# API & Third-Party Integrations 🔌

VibeNVR is designed to be extensible and easily integrated into your existing smart home or dashboard ecosystem.

---

## 🏠 Homepage Integration

[Homepage](https://gethomepage.dev/) is a modern, static, semi-automated dashboard. VibeNVR provides a compatible API endpoint for the `customapi` widget.

### ⚙️ Configuration

Add the following to your `services.yaml` in Homepage:

```yaml
- VibeNVR:
    icon: mdi-cctv
    href: http://your-vibenvr-ip:8080/
    description: Video Surveillance
    widget:
      type: customapi
      url: http://your-vibenvr-ip:8080/api/v1/homepage/stats
      headers:
        X-API-Key: "your-api-token-here"  # Found in Settings -> General
      method: GET
      mappings:
        - { field: cameras_online, label: Online }
        - { field: cameras_recording, label: Recording }
        - { field: events_today, label: Events (24h) }
        - { field: storage_used_gb, label: Storage (GB) }
        - { field: storage_total_gb, label: Total Disk (GB) }
```

### 🔑 Obtaining an API Key
Navigate to **Settings -> General** in the VibeNVR UI. Your API key is unique to your installation and should be kept private.

---

## 🤖 Home Assistant (MQTT)

VibeNVR supports **MQTT Discovery**, meaning it will automatically appear in Home Assistant once the MQTT service is configured.

### ⚙️ Setup
1. Go to **Settings -> MQTT Service**.
2. Enable the service and provide your broker details.
3. In Home Assistant, navigate to **Settings -> Devices & Services -> MQTT**.
4. You should see a new device for each of your cameras.

### 📊 Available Entities
- **Binary Sensor**: Motion detection state (`ON`/`OFF`).
- **Sensor**: Camera status (`online`/`offline`).
- **Attributes**: JSON metadata containing AI detection results (labels, confidence).

For more details, see the **[MQTT Integration Guide](MQTT-Integration.md)**.
+
+---
+
+## 📱 Telegram Notifications
+
+VibeNVR supports real-time alerts with snapshot attachments via Telegram Bots.
+
+### 🛠️ Hardened Security
+The notification pipeline is hardened to ensure that special characters in camera names or object labels do not cause API failures.
+- **HTML Escaping**: All data sent to Telegram is automatically HTML-escaped.
+- **Snapshot Cleanup**: Temporary snapshots used for notifications are automatically cleaned up after 1 hour.
+
+### ⚙️ Setup
+1. Create a bot using [@BotFather](https://t.me/botfather).
+2. Obtain your **Bot Token**.
+3. Get your **Chat ID** (using bots like `@userinfobot`).
+4. Configure these in **Settings -> Notifications**.
+
+---

---

## 🛠️ REST API

For custom scripts or advanced integrations, VibeNVR exposes a full REST API.

### 📚 Documentation
- **Interactive Swagger**: Access `/docs` on your backend port (default: `5005`).
- **API Reference**: See the **[API.md](API.md)** wiki page for common endpoints.

### 🛡️ Authentication
All API requests (except public assets) require a Bearer token or a valid `X-API-Key` header.
