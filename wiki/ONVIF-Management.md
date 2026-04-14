# ONVIF Management & PTZ Controls

VibeNVR supports advanced camera management via the **ONVIF (Open Network Video Interface Forum)** protocol. This allows the system to interact with your camera's hardware features beyond just receiving a video stream.

---

## 🎮 Key Features

- **Real-time PTZ**: Control Pan, Tilt, and Zoom directly from the Live View.
- **PTZ Presets**: View and trigger hardware-defined camera presets (Upcoming).
- **Probing**: Automatically discover camera details (Manufacturer, Model, RTSP profiles).
- **Credential Fallback**: Automatically attempts to use RTSP streaming credentials if management credentials are not explicitly set.

---

## ⚙️ Configuration

To enable ONVIF features, navigate to the **ONVIF** tab in the camera settings modal.

### Settings Fields

| Field | Description |
|-------|-------------|
| **ONVIF Host** | The IP address or hostname for management (usually the same as the RTSP IP). |
| **Port** | The ONVIF port (Default: `80`, common alternatives: `8080`, `8899`, `8000`). |
| **Username** | Management user (e.g., `admin`). |
| **Password** | Management password. |

> [!TIP]
> Use the **"Test ONVIF Connection"** button to verify that VibeNVR can communicate with your camera's management service before saving.

---

## 🕹️ Live View Controls

Once ONVIF is configured, a **Move** icon (four arrows) will appear in the action bar of the camera's live view.

1.  **Toggle Controls**: Click the Move icon to show the joystick overlay.
2.  **Move**: Click and **hold** the directional arrows to move the camera.
3.  **Zoom**: Use the `+` and `-` buttons on the right to control optical/digital zoom.
4.  **Stop**: Releasing any button sends a mandatory `Stop` command to prevent the camera from moving indefinitely.
5.  **Exit**: Click the **X** in the top-right of the overlay or toggle the Move icon again to hide the controls.

---

## 🛡️ Security & Privacy

- **RBAC**: Only users with the **Admin** role can access ONVIF configuration and PTZ controls.
- **Log Redaction**: All ONVIF passwords and management URLs are automatically redacted in system logs.
- **Isolated Network**: VibeNVR only requires access to the camera's management port (usually port 80/8899). It does not require the camera to have internet access.

---

## 🔧 Troubleshooting

### Connection Failed
- **Firewall**: Ensure port 80 (or your configured port) is open between the VibeNVR container and the camera.
- **ONVIF Enabled**: Some cameras (e.g., Tapo, Reolink) require ONVIF to be explicitly enabled in their native mobile app or web interface.
- **Separate Account**: Some cameras require a dedicated "ONVIF Account" separate from the main web/app login.

### Movement is Jerky or Laggy
- **Network Latency**: PTZ commands rely on low-latency SOAP requests. Ensure your camera is connected via a stable link.
- **Browser Performance**: The Live View uses `WebCodecs` or `MJPEG` polling. Ensure your browser supports hardware acceleration for the smoothest experience.

---

> [!NOTE]
> Future updates will include support for **ONVIF Events**, allowing VibeNVR to use the camera's built-in motion sensor to trigger recordings, significantly reducing server CPU load.
