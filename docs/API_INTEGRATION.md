# API Integration Guide

VibeNVR provides several API endpoints for integration with 3rd party tools (Dashboards, Home Automation, scripts, etc.).

## Authentication
VibeNVR supports two types of authentication:
1.  **JWT (Session)**: Used by the web interface.
2.  **API Tokens**: Used for external integrations.

### Using API Tokens
Tokens can be generated in the **Settings** page (Admin only).
To authenticate a request, include the token in the `X-API-Key` header:

```bash
curl -H "X-API-Key: YOUR_TOKEN_HERE" http://vibenvr-ip:8000/api/v1/stats
```

## Available Endpoints
The following endpoints support API Token authentication (Read-Only):

### 1. System Statistics
- `GET /api/stats`: Comprehensive system stats (storage, cameras, resources).
- `GET /api/stats/history`: Event counts history (last 24h).
- `GET /api/stats/resources-history`: CPU/RAM usage history.
- `GET /api/v1/homepage/stats`: Simplified stats for Homepage dashboard.

### 2. Cameras
- `GET /api/cameras`: List all configured cameras.
- `GET /api/cameras/{id}`: Get specific camera details.

### 3. Events
- `GET /api/events`: List recent motion/health events.
- `GET /api/events/status`: Get current motion status and health cache.

### 4. Camera Groups
- `GET /api/groups`: List all camera groups.
- `GET /api/groups/{id}`: Get details for a specific group.

---

## 3rd Party Integrations

### Homepage (`gethomepage.dev`)
Use the `customapi` widget in your `services.yaml`:

```yaml
- VibeNVR:
    - Stats:
        icon: cctv.png
        href: http://your-vibenvr-ip:8000/
        description: System Status
        widget:
          type: customapi
          url: http://your-vibenvr-ip:8000/api/v1/homepage/stats
          headers:
            X-API-Key: "YOUR_GENERATED_TOKEN_HERE"
          method: GET
          mappings:
            - field: cameras_online
              label: Online
            - field: events_today
              label: Events (24h)
            - field: storage_used_gb
              label: Storage (GB)
```

## Troubleshooting
- **401 Unauthorized**: Ensure the token is valid, active, and passed in the `X-API-Key` header.
- **Permission Denied**: API tokens are currently restricted to **Read-Only** access for major endpoints. Writing operations (Create/Update/Delete) still require Admin JWT session.
