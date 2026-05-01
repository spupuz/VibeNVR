# Multiple Storage Profiles

VibeNVR allows you to map different cameras to different storage locations on your host system. This enables flexible storage strategies, such as manually separating recordings based on performance needs:
- **SSD**: Use for cameras requiring fast access or high-res snapshots.
- **NAS/HDD**: Use for cameras with high-volume, long-term recordings.

## Concepts

### Default Storage
By default, all recordings are stored in `/var/lib/vibe/recordings` (mapped to `./data/recordings` or similar in docker-compose).

### Storage Profile
A Storage Profile defines:
- **Name**: A friendly label (e.g., "NAS Primary").
- **Path**: An absolute path inside the VibeNVR containers (e.g., `/storage/nas`).
- **Quota**: A maximum capacity in GB. When exceeded, the oldest events *across all cameras* using this profile are purged first.

## Setup Guide

### 1. Mount the External Volume
Before creating a profile in the UI, you must ensure the external storage is mounted into the VibeNVR containers in your `docker-compose.yml`.

Example:
```yaml
services:
  backend:
    volumes:
      - /mnt/synology/nvr:/storage/nas
  engine:
    volumes:
      - /mnt/synology/nvr:/storage/nas
```

### 2. Create the Profile
1. Navigate to **Settings** -> **Storage Management**.
2. Click **Add Profile**.
3. Enter the name and the **absolute container path** (e.g., `/storage/nas`).
4. Set an optional quota (GB).

### 3. Assign Cameras
1. Edit a **Camera** configuration.
2. In the **General** tab, select the desired **Storage Profile**.
3. Save the camera settings. The engine will automatically begin saving new recordings to the new path.

## How Quotas Work
VibeNVR employs a hierarchical, **reactive** cleanup strategy:
1. **Camera Limit**: First, it checks if the individual camera's `Max Storage (GB)` or `Retention (Days)` is exceeded.
2. **Profile Limit**: Then, it checks if the Storage Profile's total quota is exceeded, purging the oldest events from any camera using that profile.
3. **Global Limit**: Finally, it ensures the total disk usage across the entire system remains within the `Global Max Storage` defined in Settings.

> [!NOTE]
> **Reactive Monitoring**: Cleanup tasks run every **10 minutes** for quota violations and emergency disk space checks. This is independent of the full retention cycle (Every Hour/Day), ensuring the system remains responsive to rapid disk usage spikes.

## Disk Safety
If the total free space on the `/data` volume falls below **5%**, VibeNVR triggers an **Emergency Cleanup**. It will purge the oldest events from the system regardless of quotas or retention settings until at least 10% free space is recovered. This protects the database and OS from filesystem exhaustion.

## Technical Notes
- **Path Traversal**: For security, paths cannot contain `..` and must start with `/`.
- **Engine Sync**: When a camera's profile is changed, a new configuration is pushed to the VibeEngine, which immediately redirects its write streams.
- **Backups**: Storage profiles are included in system backups. If you restore a backup to a new system, ensure the same paths are mounted in Docker.
