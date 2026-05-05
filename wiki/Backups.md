# 💾 Configuration Backup & Restore
 
VibeNVR includes a robust backup and restore system to protect your configuration. **Every setting** configurable via the UI or API is saved in the global backup, including:
- **Cameras**: Full configuration, RTSP URLs, Schedules, Privacy Masks, and Motion Zones.
- **System Settings**: Global options, notifications, storage limits, and optimization presets.
- **Users**: User profiles, hashed passwords, roles, and 2FA secrets.
- **Groups**: Camera groups and their associations.
- **Storage Profiles**: All custom storage paths and size limits.
- **Security**: API Tokens, 2FA Recovery Codes, and Trusted Device tokens.

Backups are stored as JSON files in the `/data/backups/` directory.
 
## ⚙️ How it Works
 
### 🔄 Automated Backups
You can enable automated backups in **Settings > Global Settings**.
- **Frequency**: Configurable in hours (e.g., every 24 hours).
- **Retention**: Only the most recent $N$ automatic backups are kept (default 10). Older automatic backups are deleted to save space.
- **Startup Protection**: On system startup, the background worker checks for any recent automatic backups. If a valid backup was created within the current frequency interval, it **skips** the startup backup to prevent redundant files if you restart the container frequently.
 
### 📝 Manual Backups
Manual backups can be triggered at any time from the UI or the API.
- **Retention**: Manual backups are **NEVER** automatically deleted. They remain on the server until you manually delete them.
- **Naming**: Manual backups are prefixed with `_manual_` for easy identification.
 
## 🛠 Restoration Procedures
 
### 1. Web UI (Recommended)
Navigate to **Settings > System Backups** to see a list of available files.
- **Restore**: Click the Restore icon. The system will apply all settings, cameras, and users from the file. A system reload is usually triggered automatically.
- **Import**: You can upload a `.json` backup file from your computer using the "Import" button.
 
### 2. Manual Recovery (Host Terminal)
If the UI is inaccessible, you can restore a configuration by placing a valid backup file in the `/data/backups/` folder and using the API or database directly. (Advanced users only).
 
## 📂 Storage Location
By default, backups are saved in:
```bash
./data/backups/
```
*(Path may vary depending on your `docker-compose.yml` bind mounts).*

## 🛡️ Zero-Trace Test Fallback
When running automated security or integration tests (e.g., `refactoring_sanity.py`), VibeNVR takes a temporary snapshot of the system state before executing intrusive checks. If a test crashes and fails to restore the state from memory, the system employs an emergency fallback to the most recent automatic backup in `/data/backups/`. 

> [!IMPORTANT]
> **Anti-Time Travel Protection:** To prevent the system from accidentally reverting to a stale configuration (e.g., a backup from weeks ago), the fallback mechanism includes a strict **1-hour expiration limit**. If the most recent automatic backup is older than 60 minutes, the fallback is aborted and the system must be restored manually.
 
## 🛡️ Security Note
Backups contain sensitive data, including **hashed user passwords** and **RTSP URLs with credentials**. 
- Access to backup endpoints is restricted to users with the `admin` role.
- Ensure the `/data/backups/` directory on the host is properly secured with file permissions.
