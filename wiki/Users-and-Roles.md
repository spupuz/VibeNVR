# Users and Roles (RBAC)

VibeNVR implements a strict Role-Based Access Control (RBAC) architecture to secure your surveillance data. Every account is assigned a specific role that determines its privileges across both the user interface and the underlying REST/WebSocket APIs.

## Available Roles

### 1. Admin
The `admin` role grants unrestricted access to all system features.
- **Privileges:**
  - Create, modify, or delete cameras and camera groups.
  - Access system settings, engine debug statuses, and storage profiles.
  - Manage user accounts, enforce 2FA policies, and configure API tokens.
  - Perform system backups and restorations.
  - Bulk delete events from the timeline.
  - Execute Pan-Tilt-Zoom (PTZ) commands and configure ONVIF presets.

### 2. Viewer (Standard User)
The `viewer` role is designed for standard monitoring purposes and is strictly **Read-Only** regarding system state.
- **Privileges:**
  - View live camera streams via WebSockets or MJPEG.
  - Browse the event timeline and download recorded media.
  - Manage their own personal profile and configure 2FA for their account.
- **Restrictions:**
  - Cannot modify system settings, create cameras, or delete media. Any attempt to access state-altering APIs will result in an HTTP 403 Forbidden.

---

## Granular Restricted Viewer Access

By default, Viewers can see all cameras configured in the system. However, Admins can explicitly restrict a Viewer's access using a granular permissions model per Camera or per Group.

### Granular Permissions

When restricting a user, you can assign three specific levels of access per camera or group:
- **VIEW**: The user can see the live stream (Live View, Dashboard, Groups).
- **REPLAY**: The user can access the Event Timeline, view past recordings, and download media for this camera.
- **CONTROL (PTZ)**: The user is allowed to execute Pan-Tilt-Zoom commands and trigger manual snapshots.

### How it Works

When a Viewer is restricted:
- **UI Masking**: Interfaces will dynamically hide cameras or features based on the assigned permissions. If a user lacks `REPLAY` access for a camera, it won't appear in their Timeline. If they lack `CONTROL`, the PTZ and snapshot buttons are hidden.
- **API Security**: Restrictions are strictly enforced at the core API level. Any direct attempt to access unauthorized media endpoints (`/frame`, `/events`) or execute state-altering commands (`/ptz`) for an unauthorized camera ID will result in a `403 Forbidden` error.
- **API Tokens**: If a restricted Viewer generates an API token for a 3rd party integration, that token inherits the exact granular restrictions assigned to the user.

### Configuration

To restrict a viewer's access:
1. Log in as an **Admin**.
2. Navigate to **Settings** -> **Users**.
3. Click the **Edit** (pencil) icon next to the target Viewer account.
4. Toggle the **Restrict Camera Access** switch to **ON**.
5. Use the provided interface to toggle **VIEW**, **REPLAY**, and **CONTROL** checkboxes for specific **Cameras** and/or **Camera Groups**.
   > **Note:** Granting access to a Camera Group automatically cascades those specific permissions to all cameras currently assigned to that group.
6. Click **Save Changes**. The restrictions take effect immediately.

### Best Practices
- **Groups vs Individual Cameras**: For larger deployments, assign cameras to Groups (e.g., "Exterior", "Lobby") and grant users access to the Group. If you add a new camera to "Exterior" later, all users with access to that group will automatically inherit access to the new camera, saving administrative overhead.
