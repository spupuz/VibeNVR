# ONVIF Management & PTZ Controls

VibeNVR supports advanced camera management via the **ONVIF (Open Network Video Interface Forum)** protocol. This allows the system to interact with your camera's hardware features beyond just receiving a video stream.

---

## 🎮 Key Features

- **Real-time PTZ**: Control Pan, Tilt, Zoom, and **Home Positions** directly from the Live View.
- **ONVIF Edge Motion**: Offload detection logic to camera hardware to save server resources.
- **Advanced PTZ Home**: Native support for `SetHomePosition` and `GotoHomePosition` with intelligent software fallbacks for restrictive hardware.
- **Probing**: Automatically discover camera details (Manufacturer, Model, RTSP profiles, and hardware capabilities) as visual badges.
- **Credential Fallback**: Automatically attempts to use RTSP streaming credentials if management credentials are not explicitly set.
- **Network Discovery**: Securely scan your local network for ONVIF and RTSP devices using an optimized SSE (Server-Sent Events) stream.

---

## 🔍 Network Discovery (Scanner)

VibeNVR includes a secure, high-concurrency network scanner to help you find cameras without needing to check your router's DHCP list.

### How it works
1.  **Select Range**: Enter an IP range (e.g., `192.168.1.0/24` or `192.168.1.1-100`).
2.  **SSE Streaming**: The scanner uses **Server-Sent Events** to provide real-time feedback. Results appear as they are discovered, rather than waiting for the entire scan to finish.
3.  **Secure Probing**: 
    - The scanner attempts to probe ONVIF ports (`80`, `8080`, `8899`, etc.) and RTSP ports (`554`).
    - It uses **HTTP Headers** (`X-Scanner-User`, `X-Scanner-Password`) to securely pass test credentials during discovery, ensuring that passwords never leak into URL logs or browser history.
4.  **Auto-Verification**: If discovery succeeds, the system identifies the manufacturer, model, and whether authentication is required.

> [!IMPORTANT]
> To use the scanner, navigate to the **Add Camera** modal and click the **"Scan Network"** button. Ensure you provide the base credentials for your cameras to allow the scanner to verify specialized profiles.

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
4.  **Presets**: Click the **Bookmark** icon to open a dropdown menu of your camera's saved hardware presets. Select a preset to move the camera to that position instantly.
5.  **Stop**: Releasing any button sends a mandatory `Stop` command to prevent the camera from moving indefinitely.

### 🧠 Intelligent Capability Detection

VibeNVR does not simply "guess" if your camera supports PTZ based on the presence of a PTZ service. Instead, it performs a **Deep Capability Probe** that inspects the actual ONVIF Vector Spaces defined by the camera manufacturer.

- **Selective UI**: PTZ buttons (Pan/Tilt, Zoom, and Home) are only displayed if the camera explicitly supports their corresponding movements. For example, if a camera supports panning but has no optical zoom, the Zoom buttons will automatically hide.
- **Home Fallbacks**: VibeNVR implements a 3-stage fallback for Home positions. If the camera rejects the native ONVIF command, the system will attempt to use presets named "Home" or "1", or even create a new "Home" preset if one is missing.
- **Centralized Probing**: Configuration details and hardware capabilities are refreshed by clicking the **"Test ONVIF Connection"** button in the camera settings modal. This removes setup clutter from the Live View while ensuring capabilities are always synchronized.

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

---
2: 
3: ## 🤖 ONVIF Edge Motion Detection
4: 
5: VibeNVR can subscribe to camera-side motion events via the **ONVIF PullPoint** service. This allows the camera's hardware to decide when motion is occurring, bypassing the NVR's CPU-intensive image analysis.
6: 
7: ### Benefits
8: - **CPU Efficiency**: The NVR server does not need to decode and analyze video frames for motion, drastically reducing overall system load.
9: - **Native Accuracy**: Take advantage of manufacturer-specific tuned sensors and onboard AI algorithms.
10: - **Bypass Bounding Boxes**: Reduces false triggers by using the camera's internal logic.
11: 
12: ### Configuration & Logic
13: 
14: 1.  Go to **Camera Settings** -> **Motion** tab.
15: 2.  Select **"ONVIF Edge (Camera-side Hardware)"** in the **Detection Engine** dropdown.
16:     - *Note: This option is only available if an ONVIF Host is configured and the camera supports event subscriptions.*
17: 3.  **Intelligent UI**: When ONVIF Edge is active, the **Motion Zones** tab is automatically hidden from the interface. Since the camera hardware handles the detection, local NVR exclusion zones are ignored.
18: 4.  **Privacy**: Privacy masks are still respected as they are burned into the stream before recording.
19: 
20: ---
21: 
22: 
