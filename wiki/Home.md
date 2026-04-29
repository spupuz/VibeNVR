# Welcome to the VibeNVR Wiki! 📹

VibeNVR is a modern, modular, and containerized video surveillance system designed to manage IP cameras, recordings, motion detection, and a unified event timeline. 

This Wiki serves as the extended documentation hub for advanced configurations, troubleshooting guides, maintenance procedures, and deep dives into the system's architecture.

## 📖 Quick Links

- **[Installation Guide](Installation.md)** - Step-by-step instructions for Docker-based deployment.
- **[Configuration Reference](Configuration.md)** - Complete `.env` variable reference and production checklist.
- **[Network & Proxy Setup](Network.md)** - Port forwarding and reverse proxy configurations.
- **[Troubleshooting Guide](Troubleshooting.md)** - Solutions for common issues and bug reporting.
- **[WebCodecs Streaming](WebCodecs-Streaming.md)** - Low-latency streaming tech and secure context requirements.
- **[API Documentation](API.md)** - Detailed reference for integrating with the VibeNVR backend.
- **[Access Recovery Guide](Access-Recovery.md)** - Securely regaining account access from the host terminal.
- **[Storage Profiles](Storage-Profiles.md)** - Managing quotas and recording retention.
- **[Camera Settings](Camera-Settings.md)** - Logic and behavior of the Bulk "Copy Settings" feature.
- **[AI Object Detection](AI-Detection.md)** - Coral Edge TPU setup, Docker and LXC passthrough, and AI configuration.
- **[System Architecture](Architecture.md)** - Deep dive into VibeEngine, PyAV/OpenCV, and microservices.
- **[Privacy Masking](Privacy-Masking.md)** - Configuring obscured areas and motion exclusion zones.
- **[Backup & Restore](Backups.md)** - System snapshots and configuration management.
- **[UniFi Protect Integration](UniFi-Protect.md)** - Native support for RSTSPS and UniFi ports.
- **[ONVIF Management](ONVIF-Management.md)** - Pan-Tilt-Zoom (PTZ) controls and hardware probing.
- **[2FA & Trusted Devices](MFA-Trusted-Devices.md)** - Two-Factor Authentication, recovery codes, and security tokens.
- **[MQTT Integration](MQTT-Integration.md)** - Home Assistant Discovery, real-time reporting, and AI metadata publishing.
- **[External Integrations](Integrations.md)** - Detailed guide for Homepage, Home Assistant, and API widgets.

## 🚀 Featured Capabilities

- **Bulk Timeline Operations**: Multi-select events (with Shift+Click support) for rapid deletion and storage cleanup.
- **AI Object Detection**: Hardware-accelerated ML inference via **Google Coral Edge TPU** or CPU. Detect people, vehicles, animals, and filter Timeline events by object type.
- **UniFi First-Class Support**: Native RSTSPS streaming with automatic TLS verification bypass for UniFi controllers.
- **WebCodecs Performance**: Ultra low-latency streaming with hardware acceleration and intelligent keyframe caching.
- **Dual-Stream Optimization**: Dedicated sub-streams for lightweight dashboard grids, saving CPU and bandwidth.
- **Advanced PTZ**: Native ONVIF support for low-latency Pan, Tilt, Zoom, and **Home Positions** with resident hardware fallbacks.
- **MQTT & Home Automation**: Native integration with Home Assistant via **MQTT Discovery**. Instant motion sensors and AI object metadata reporting.
- **System Integrity Assurance**: Integrated security, RBAC, and path-sanitization audits running on every release.

## ⚠️ Important Notes

- **Language Policy**: English is the official and only supported language for all VibeNVR documentation, interfaces, issues, and code. 
- **Security First**: VibeNVR is designed to be secure by default. Always ensure your `.env` secrets are strong (especially `SECRET_KEY` and `WEBHOOK_SECRET`) and never expose internal container ports directly to the internet without a properly configured reverse proxy.
- **Contribute**: Read our [CONTRIBUTING.md](https://github.com/spupuz/VibeNVR/blob/main/CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](https://github.com/spupuz/VibeNVR/blob/main/CODE_OF_CONDUCT.md) guidelines if you want to help improve VibeNVR.

---
*Use the sidebar on the right to navigate through the available Wiki pages.*
