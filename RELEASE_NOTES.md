# VibeNVR v1.4.0 Release Notes

## New Features

### 📅 Advanced Motion Scheduling
- Introduced granular, day-by-day scheduling for motion detection.
- Users can now specify exact start and end times for each day of the week.
- "Copy Monday to All Days" quick action for rapid configuration.

### 💾 Backup & Restore System
- **Full Configuration Export**: Download a single JSON file containing all system settings, camera configurations, and group definitions.
- **Smart Import**: Restore configurations with automatic merging and updating of existing records.
- Accessible via the Settings page.

### 🔔 Global Notification Settings
- Centralized configuration for SMTP (Email) and Telegram.
- Set global defaults that can be overridden per camera.
- **Snapshot Attachments**: Email and Telegram notifications now include the snapshot image of the event.

### 👥 Enhanced Group Management
- **Unified Motion Toggle**: Quickly enable or disable motion detection for an entire group of cameras with a single click.
- Improved UI for managing group members and actions.

### ⚙️ Camera Management
- **Dynamic Export/Import**: Camera exports now include all advanced schedule and notification fields.
- **Copy Settings**: improved "Copy to..." functionality to replicate complex schedules across multiple cameras.

## UI Improvements
- **Settings Page**: Redesigned Layout with dedicated sections for Notifications and Backup.
- **Visual Feedback**: Added icons and clearer status indicators for camera activities.

## Technical
- Backend JSON Export updated to dynamically reflect database schema.
- Added endpoints for bulk Import/Export.
- Docker environment stability improvements.
