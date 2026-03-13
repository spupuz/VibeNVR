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
- **[System Architecture](Architecture.md)** - Deep dive into VibeEngine, PyAV/OpenCV, and microservices.

## ⚠️ Important Notes

- **Language Policy**: English is the official and only supported language for all VibeNVR documentation, interfaces, issues, and code. 
- **Security First**: VibeNVR is designed to be secure by default. Always ensure your `.env` secrets are strong (especially `SECRET_KEY` and `WEBHOOK_SECRET`) and never expose internal container ports directly to the internet without a properly configured reverse proxy.
- **Contribute**: Read our [CONTRIBUTING.md](https://github.com/spupuz/VibeNVR/blob/main/CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](https://github.com/spupuz/VibeNVR/blob/main/CODE_OF_CONDUCT.md) guidelines if you want to help improve VibeNVR.

---
*Use the sidebar on the right to navigate through the available Wiki pages.*
