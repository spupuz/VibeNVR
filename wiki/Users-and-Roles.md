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

## Restricted Viewer Access

By default, Viewers can see all cameras configured in the system. However, Admins can explicitly restrict a Viewer's access to a specific subset of cameras or groups. This is ideal for scenarios where certain users (e.g., specific staff members, tenants) should only have visibility into specific areas.

### How it Works

When a Viewer is restricted:
- **UI Masking**: The Live View, Dashboard, and Camera Groups interfaces will only display the cameras/groups they have been explicitly granted access to.
- **Timeline Filtering**: The Event Timeline will silently filter out recordings and motion events originating from unauthorized cameras.
- **API Security**: The restriction is enforced at the core API level. Even if a restricted user attempts to manually request a frame, stream, or websocket connection using an unauthorized camera ID, the backend will proactively drop the connection and return a `403 Forbidden` error.
- **API Tokens**: If a restricted Viewer generates an API token for a 3rd party integration, that token inherits the same camera restrictions as the user.

### Configuration

To restrict a viewer's access:
1. Log in as an **Admin**.
2. Navigate to **Settings** -> **Users**.
3. Click the **Edit** (pencil) icon next to the target Viewer account.
4. Toggle the **Restrict Camera Access** switch to **ON**.
5. Use the provided checklist to select the specific **Cameras** and/or **Camera Groups** the user is allowed to view.
   > **Note:** Granting access to a Camera Group automatically grants the user access to all cameras currently assigned to that group.
6. Click **Save Changes**. The restrictions take effect immediately.

### Best Practices
- **Groups vs Individual Cameras**: For larger deployments, assign cameras to Groups (e.g., "Exterior", "Lobby") and grant users access to the Group. If you add a new camera to "Exterior" later, all users with access to that group will automatically inherit access to the new camera, saving administrative overhead.
