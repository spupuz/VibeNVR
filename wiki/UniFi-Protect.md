# UniFi Protect Integration 🛡️

VibeNVR provides "first-class" support for UniFi Protect cameras, handling both secure (RSTSPS) and standard (RTSP) streams automatically.

## 📡 Supported Protocols & Ports

UniFi Protect typically provides stream URLs in the following formats:

| Protocol | Port | Description | Recommendation |
|----------|------|-------------|----------------|
| **RSTSPS** | `7441` | Secure RTSP over TLS | **Recommended** for maximum security. |
| **RTSPS**  | `7441` | Standard Secure RTSP | Supported as an alias to RSTSPS. |
| **RTSP**   | `7447` | Standard RTSP (Unencrypted) | Use if hardware resources are very limited. |

## 🚀 How to Add UniFi Cameras

1. **Get the URL**:
   - Open your UniFi Protect dashboard.
   - Select a camera -> Settings -> High Quality (or other) -> **RTSPS URL**.
   - Copy the full URL (e.g., `rtsps://192.168.1.1:7441/abcd?token=...`).

2. **Paste in VibeNVR**:
   - Go to **Cameras** -> **Add Camera**.
   - Paste the full URL into the **RTSP Host & Path** field.
   - VibeNVR will automatically:
     - Detect the `rtsps` / `rstsps` protocol.
     - Extract the credentials if present.
     - Enable the **Secure Connection** mode (Blue Shield icon).
     - Disable TLS certificate verification (to handle UniFi's self-signed certificates).

3. **Scanner Discovery**:
   - The **Network Scanner** in VibeNVR is pre-configured to look for ports `7441` and `7447`.
   - If a UniFi camera is found, it will be labeled as **RTSPS** or **RTSP** with a quick-add button.

---

## 🔒 Security Note: TLS Verification
For `rstsps://` and `rtsps://` streams, VibeNVR intentionally disables TLS certificate verification (`tls_verify=0`). This is necessary because UniFi Protect controllers use self-signed certificates that browsers and standard tools would otherwise block. The stream remains **encrypted** and secure during transit.
