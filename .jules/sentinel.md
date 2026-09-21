<truncated... I need to do sed or something safer>
## 2025-01-21 - SSRF Prevention in Federation Node Proxy
**Vulnerability:** The federation router accepted arbitrary URLs for remote nodes without validation, leading to potential Server-Side Request Forgery (SSRF) when verifying nodes (and proxying requests), which could be used by an admin to probe internal services (e.g. localhost, loopback).
**Learning:** We must apply existing SSRF validations (`utils.is_safe_webhook_url`) to all user-provided endpoints, even in administrative interfaces (defense in depth). The proxy functionality relies on node URLs, so verifying them safely prevents internal network scanning.
**Prevention:** Apply strict SSRF validation (blocking loopback, link-local, multicast, unspecified IPs) on any user-provided URL before making HTTP requests. Ensure internal validations (like `is_safe_webhook_url`) are reused effectively.
