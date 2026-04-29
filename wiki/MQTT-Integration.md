# MQTT & Home Assistant Integration 🏠

VibeNVR includes a native MQTT service that allows for real-time event reporting and seamless integration with **Home Assistant** via **MQTT Discovery**.

## 🚀 Features

- **Home Assistant Discovery**: Automatically creates entities for your cameras in HA.
- **Real-time Motion Reporting**: Instant `ON`/`OFF` state updates for motion sensors.
- **AI Metadata**: Publishes object detection results (e.g., "person", "vehicle") in JSON format.
- **Status Monitoring**: Tracks the online/offline status of each camera thread.
- **Asynchronous & Resilient**: The service runs in the background and automatically reconnects if the broker goes down.

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

All messages follow the pattern: `<prefix>/<camera_id>/<subtopic>`.

| Subtopic | Payload | Description |
| :--- | :--- | :--- |
| **`status`** | `online` / `offline` | Availability of the camera service. |
| **`motion`** | `ON` / `OFF` | Current motion state. |
| **`attributes`** | `JSON` | AI metadata, labels, and event details. |

### Example Topic
If your prefix is `vibenvr` and camera ID is `88`:
- Topic: `vibenvr/88/motion`
- Payload: `ON`

---

## 🤖 Home Assistant Integration

VibeNVR automatically publishes Discovery payloads to the `homeassistant/` topic.

### Entities Created
1. **Binary Sensor**: `binary_sensor.vibenvr_<id>_motion` (Device Class: Motion)
2. **Status Sensor**: `sensor.vibenvr_<id>_status` (Availability monitoring)

> [!TIP]
> Ensure that the **MQTT Integration** is installed and configured in Home Assistant. Once you enable the service in VibeNVR, the cameras will appear as new devices under the **MQTT** integration.

---

## 🛠️ Troubleshooting

- **Service Inactive**: Verify the "Service Active" badge in Settings. If it's red, check your broker address and credentials.
- **No Discovery**: Ensure your Home Assistant MQTT prefix is the default (`homeassistant`). VibeNVR currently uses this standard prefix for discovery.
- **Connection Refused**: Check your broker logs. Ensure that VibeNVR's IP is allowed to connect and that anonymous access is enabled if no credentials are provided.

> [!WARNING]
> If you are using a broker with a very high security profile, ensure that the `vibenvr` user has read/write permissions to both the `homeassistant/#` and `<prefix>/#` topics.
