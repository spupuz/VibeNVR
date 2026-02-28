# Welcome to the VibeNVR Wiki! 📹

VibeNVR is a modern, modular, and containerized video surveillance system designed to manage IP cameras, recordings, motion detection, and a unified event timeline. 

This Wiki serves as the extended documentation hub for advanced configurations, troubleshooting guides, maintenance procedures, and deep dives into the system's architecture.

## 📖 Quick Links

- **[Main Repository & Installation](https://github.com/spupuz/VibeNVR)** - Start here if you are new to VibeNVR!
- **[Installation & Configuration Guide](Installation-and-Configuration)** - Detailed setup guide: Docker installation, complete `.env` reference for all variables, production security checklist, hardware acceleration, and troubleshooting.
- **[API Documentation](API)** - Detailed reference for integrating with the VibeNVR backend. Learn about the multi-layered authentication (JWT, API Tokens with TTL, and HttpOnly cookies).
- **[Access Recovery Guide](Access-Recovery)** - Learn how to securely regain access to your admin account directly from the host terminal if you ever lose your password or 2FA device.

## ⚠️ Important Notes

- **Language Policy**: English is the official and only supported language for all VibeNVR documentation, interfaces, issues, and code. 
- **Security First**: VibeNVR is designed to be secure by default. Always ensure your `.env` secrets are strong (especially `SECRET_KEY` and `WEBHOOK_SECRET`) and never expose internal container ports directly to the internet without a properly configured reverse proxy.

---
*Use the sidebar on the right to navigate through the available Wiki pages.*
