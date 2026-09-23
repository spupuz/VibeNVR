# Multiple Storage Profiles

VibeNVR allows you to map different cameras to different storage locations on your host system. This enables flexible storage strategies, such as manually separating recordings based on performance needs:
- **SSD**: Use for cameras requiring fast access or high-res snapshots.
- **NAS/HDD**: Use for cameras with high-volume, long-term recordings.
- **SFTP / Remote Storage**: Connect directly to remote SSH/SFTP servers without complex OS-level mounts, ideal for off-site backups or distributed archival.

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


### 3. Remote SFTP Volumes (New)
Instead of relying on OS-level mounts or Docker volumes (which can be fragile over unreliable networks), VibeNVR natively supports connecting to remote SFTP servers. This can be used for **Primary Storage**, **Tiered Archival**, or specific Routing (e.g., saving only Snapshots to SFTP).

**How it works under the hood**:
1. **Zero-Loss Local Buffer**: The VibeEngine is built for extreme performance. To prevent network bottlenecks from causing dropped frames on 4K cameras, the Engine *always* writes the live, in-progress recording to the fast local SSD first, even if an SFTP profile is assigned.
2. **Post-Processing Upload (Primary Mode)**: If an SFTP profile is assigned as the *Primary*, *Continuous*, or *Motion* profile, VibeNVR activates an **Upload Bypass**. The moment a recording segment finishes, the Backend immediately extracts the thumbnail/duration, uploads the finalized clip securely to the SFTP server, and deletes the local temporary file. This provides the exact experience of "saving to SFTP directly" without risking live stream stability.
3. **Background Archival (Tiering Mode)**: If the SFTP profile is assigned exclusively as the *Archive Profile*, files remain on the local disk until they reach the "Archive After" threshold, at which point the `StorageService` gracefully moves them to the remote server.
4. **Smart Caching for Playback**: When viewing a remote recording on the Timeline, the Backend dynamically pulls the requested MP4 file from the SFTP server into a temporary local cache (`/data/cache/sftp`), hashing it with SHA-256. Once cached, the video is streamed via HTTP Range Requests, ensuring flawless playback and scrubbing without buffering.
5. **Security First**: To prevent Server-Side Request Forgery (SSRF) attacks, the SFTP configuration actively rejects connections to internal or loopback IP addresses (like `127.0.0.1` or `localhost`). Only legitimate remote hosts are allowed.

**Setup Instructions**:
1. Navigate to **Settings** -> **Storage Management** -> **Add Profile**.
2. Select **SFTP** as the Storage Type.
3. Provide the Host (IP or domain), Port (default 22), Username, Password, and the Remote Path (e.g., `/mnt/backup/vibenvr`).
4. **Mandatory**: Use the **Test Connection** button to verify connectivity, permissions, and SSRF compliance securely before saving.

> [!TIP]
> Since the SFTP upload acts as a post-processing step, short network outages won't affect your live recording. The local buffer will simply hold the files until the webhook successfully completes the upload.

### 4. Assign Cameras
1. Edit a **Camera** configuration.
2. In the **General** tab, select the desired **Storage Profile**.
3. Save the camera settings. The engine will automatically begin saving new recordings to the new path.

## How Quotas Work
VibeNVR employs a hierarchical, **reactive** cleanup strategy. The system automatically calculates the **Effective Limit** for each camera to ensure compliance with both local and global policies:

1. **Effective Limit Calculation**: The UI and Backend prioritize the most restrictive value between the individual camera setting and the global quota. 
   - *Example*: If a Camera is set to 10GB but the Global Quota is 5GB, the Effective Limit is **5GB**.
2. **Camera-Level Controls**: Users can define specific `Max Storage (GB)` and `Retention` (Preset intervals like 1 week, or a Custom number of days) per camera.
3. **Profile/Global Limit**: The system ensures the total disk usage across all cameras remains within the defined profile or global quota, purging the oldest events from any camera as needed.

## Storage Maintenance & Breakdown
The **Storage Management** section in Settings provides a detailed breakdown of space usage:
- **Profile Breakdown**: A dedicated table showing the total storage quota, used space, and remaining capacity *per Storage Profile*.
- **Camera Metrics**: See exactly how many GBs of Video and Snapshots each camera is consuming.
- **Granular Cleanup**: Use the dedicated **Cleanup** buttons (Trash icons) in the breakdown table to manually purge only videos or only snapshots for a specific camera.
- **Global Reset**: The "Eliminazione di Massa" (Bulk Delete) buttons act at a global level, clearing all videos or all snapshots across *all cameras and all storage profiles* simultaneously.
- **Action Targets**: Maintenance buttons are optimized with large (44x44px) hit targets for high precision on both Desktop and Mobile.

> [!TIP]
> Use the **Breakdown Table** to identify "storage-hungry" cameras and adjust their individual retention settings or assign them to a dedicated Storage Profile.

> [!NOTE]
> **Reactive Monitoring**: Cleanup tasks run every **10 minutes** for quota violations and emergency disk space checks. This is independent of the full retention cycle (Every Hour/Day), ensuring the system remains responsive to rapid disk usage spikes.

## Tiered Storage Archival
VibeNVR supports an automated archival subsystem, allowing you to gracefully move oldest events to a secondary storage layer (e.g., a mounted NAS or cloud-backed volume) instead of permanently deleting them during routine cleanup.

- **Archival Enabled**: A global toggle that instructs the `StorageService` to attempt archival *before* purging events.
- **Archival Interval**: An independent background scheduler (e.g., every 24 hours) that sweeps for archivable events, preventing blocking on the main cleanup loop.

If an event reaches its retention limit and archival is enabled, it will be moved to the assigned archival path. If archival fails or the archival volume is full, the system falls back to standard deletion to preserve primary disk space.

## Disk Safety
If the total free space on the `/data` volume falls below **5%**, VibeNVR triggers an **Emergency Cleanup**. It will purge the oldest events from the system regardless of quotas or retention settings until at least 10% free space is recovered. This protects the database and OS from filesystem exhaustion.

## Technical Notes
- **Path Traversal**: For security, media paths are dynamically validated against configured `StorageProfile` directories (`is_path_safe`). Paths cannot contain `..` and must start with `/`. This replaces legacy strict `/data/` checks and allows custom storage profiles (like SSD/NAS) to function securely.
- **Engine Sync**: When a camera's profile is changed, a new configuration is pushed to the VibeEngine, which immediately redirects its write streams.
- **Backups**: Storage profiles are included in system backups. If you restore a backup to a new system, ensure the same paths are mounted in Docker.
