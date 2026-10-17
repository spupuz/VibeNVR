# MQTT & Home Assistant Integration 🏠

VibeNVR includes a native MQTT service that allows for real-time event reporting and seamless integration with **Home Assistant** via **MQTT Discovery**.

## 🚀 Features

- **Home Assistant Discovery**: Automatically creates entities for your cameras in HA.
- **Real-time Motion Reporting**: Instant `ON`/`OFF` state updates for motion sensors.
- **AI Metadata**: Publishes object detection results (e.g., "person", "vehicle") in JSON format.
- **Status Monitoring**: Tracks the online/offline status of each camera thread.
- **Robust Event Queueing**: Natively queues `ON`/`OFF` state transitions in memory if the broker temporarily goes down, flushing them immediately upon reconnect to ensure Home Assistant never gets "stuck".
- **Asynchronous & Resilient**: The service runs in the background and automatically reconnects using a stable unique client ID if the network drops.

---

## ⚙️ Configuration

To enable MQTT, navigate to **Settings -> MQTT Service** in the VibeNVR UI.

### Parameters

| Parameter | Description | Default |
| :--- | :--- | :--- |
| **Enable MQTT Service** | Master toggle to start/stop the service. | `false` |
| **Broker Host** | IP address or hostname of your MQTT broker (e.g. `192.168.1.50`). | - |
| **Broker Port** | Port used by the broker. | `1883` |
| **Username** | Optional username for authentication. | - |
| **Password** | Optional password for authentication. | - |
| **Topic Prefix** | Root topic for all VibeNVR messages. | `vibenvr` |

---

## 🛰️ Topic Structure

Messages are organized under your configured base prefix.

### 1. System Level Topics
| Topic | Payload | Description |
| :--- | :--- | :--- |
| **`<prefix>/status`** | `online` / `offline` | Global VibeNVR engine status (includes MQTT Last Will and Testament - LWT). |

### 2. Camera Specific Topics
All camera messages follow the pattern: `<prefix>/<camera_id>/<subtopic>`.

| Subtopic | Payload | Description |
| :--- | :--- | :--- |
| **`status`** | `online` / `offline` | Availability of the camera stream (retained & refreshed via 30s heartbeat). |
| **`motion`** | `ON` / `OFF` | Current motion state. |
| **`attributes`** | `JSON` | AI metadata, labels, and event details. |

### Example Topics
If your prefix is `vibenvr` and camera ID is `88`:
- System Status: `vibenvr/status` -> `online`
- Camera Availability: `vibenvr/88/status` -> `online`
- Motion Sensor: `vibenvr/88/motion` -> `ON`

> [!NOTE]
> **Availability Heartbeat & Self-Healing**: VibeNVR runs a background watchdog thread (every 30 seconds) that re-verifies camera connectivity and refreshes retained availability messages. If a network blip or broker restart causes an inconsistent state, camera availability automatically self-heals without user intervention.
>
> **Dynamic Prefix Changes**: When changing the MQTT Topic Prefix in Settings, VibeNVR automatically reconnects, resets the discovery cache, and republishes Home Assistant discovery and availability payloads under the new prefix.

---

## 🤖 Home Assistant Integration

VibeNVR automatically publishes Discovery payloads to the `homeassistant/` topic.

### Entities Created
1. **Binary Sensor**: `binary_sensor.vibenvr_<id>_motion` (Device Class: Motion)
2. **Status Sensor**: `sensor.vibenvr_<id>_status` (Availability monitoring)

> [!TIP]
> Ensure that the **MQTT Integration** is installed and configured in Home Assistant. Once you enable the service in VibeNVR, the cameras will appear as new devices under the **MQTT** integration.

---

## 📊 Observability
 
VibeNVR provides real-time visibility into the MQTT service status directly on the **Dashboard**. 
 
- **MQTT Service Widget**: Shows the current connection state, the configured broker host, and the active port.
- **Connection Diagnostics**: The widget status indicator turns green only when a successful handshake with the broker is maintained.
 
---

## 🛠️ Troubleshooting

- **Service Inactive**: Verify the **MQTT Service** widget on the Dashboard. If it's red, check your broker address and credentials.
- **No Discovery**: Ensure your Home Assistant MQTT prefix is the default (`homeassistant`). VibeNVR currently uses this standard prefix for discovery.
- **Connection Refused**: Check your broker logs. Ensure that VibeNVR's IP is allowed to connect and that anonymous access is enabled if no credentials are provided.

> [!WARNING]
> If you are using a broker with a very high security profile, ensure that the `vibenvr` user has read/write permissions to both the `homeassistant/#` and `<prefix>/#` topics.
