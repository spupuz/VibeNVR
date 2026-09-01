# Decentralized Federation (Multi-Site Management)

VibeNVR supports a decentralized federation model, allowing you to link multiple independent VibeNVR instances (nodes) together and manage them from a single "Master" pane of glass.

## Key Capabilities

- **Single Pane of Glass**: View live streams, timelines, and manage configurations across multiple physical sites without needing to open multiple browser tabs or memorize different IPs.
- **Decentralized Architecture**: Each node remains fully independent. If the Master node goes offline, the child nodes continue recording and operating normally. There is no single point of failure for recording integrity.
- **Zero-Trust Proxying**: The Master node securely proxies API and WebSocket requests to the child nodes. Clients (browsers) only need to communicate with the Master node, simplifying firewall and reverse proxy configurations (only the Master needs to be exposed externally).
- **Graceful Degradation**: The system actively polls the health of federated nodes every 30 seconds. If a remote node goes offline (due to network failure or maintenance), the UI instantly reflects the "Offline" status and safely falls back to the Master node to prevent application crashes.

## Setting Up Federation

1. **Obtain API Token**: Log in to the "Child" node (the one you want to add), navigate to **Settings > API Tokens**, and generate a new token with Admin privileges.
2. **Add Node to Master**: Log in to the "Master" node, navigate to **Settings > Federation**, and click "Add Node".
3. **Configure**: Provide a recognizable Name, the Base URL of the Child node (e.g., `http://192.168.1.50:8080`), and paste the API Token.
4. **Validation**: The Master node will perform a pre-flight check to verify the URL and Token. If successful, the node is added to your Federation menu.

## Security & RBAC

The Federation Proxy layer is strictly hardened:
- **Authentication**: All proxied requests require the user to be authenticated on the Master node.
- **Viewer Isolation**: Users with the `Viewer` role on the Master node can only perform read-only actions (GET/HEAD) on federated nodes, even if the underlying backend connection utilizes an Admin API Token. Any attempt by a Viewer to modify settings, delete cameras, or move PTZ on a remote node will be intercepted and blocked with a `403 Forbidden` error by the Master's proxy layer.
- **SSRF Protection**: The system prevents Server-Side Request Forgery by ensuring the Proxy only forwards requests to the pre-validated Base URLs configured by an Administrator.

## UI Integration

Once configured, a Node Switcher dropdown will appear in the main Sidebar. 
- Selecting a node will instantly scope the entire UI (Dashboard, Cameras, Live View, Timeline) to that specific node.
- If a node goes offline while you are viewing it, VibeNVR will display a warning toast and automatically switch your view back to the local Master node.
