<truncated... I need to do sed or something safer>
## 2024-05-24 - Fix SSRF validation bypass and MitM vulnerability
**Vulnerability:** Webhook SSRF validation failed open. The federation proxy explicitly disabled TLS verification.
**Learning:** Exception handling during validation logic (like `socket.getaddrinfo`) must fail securely (e.g. raise `ValueError`) rather than failing open (`pass` or `return self`).
**Prevention:** In security checks, always default to denial on exception. Avoid global `verify=False` flags in HTTP clients unless absolutely necessary for local untrusted endpoints.
## 2025-01-21 - SSRF Prevention in Federation Node Proxy
**Vulnerability:** The federation router accepted arbitrary URLs for remote nodes without validation, leading to potential Server-Side Request Forgery (SSRF) when verifying nodes (and proxying requests), which could be used by an admin to probe internal services (e.g. localhost, loopback).
**Learning:** We must apply existing SSRF validations (`utils.is_safe_webhook_url`) to all user-provided endpoints, even in administrative interfaces (defense in depth). The proxy functionality relies on node URLs, so verifying them safely prevents internal network scanning.
**Prevention:** Apply strict SSRF validation (blocking loopback, link-local, multicast, unspecified IPs) on any user-provided URL before making HTTP requests. Ensure internal validations (like `is_safe_webhook_url`) are reused effectively.
## 2024-05-17 - SSRF Validation Blocking Local Networks
**Vulnerability:** Overly strict SSRF validation blocked private IP addresses.
**Learning:** In NVR systems, webhooks must be able to target private IPs (like 192.168.x.x) for local Home Assistant integrations, so blocking them breaks functionality.
**Prevention:** Use `ip.is_loopback`, `is_unspecified`, `is_link_local`, and `is_multicast` to prevent SSRF against internal host/cloud metadata without breaking local network features.
## 2026-01-20 - SSRF Vulnerability in Test Endpoints
**Vulnerability:** The `test_notification` endpoint allowed arbitrary internal SMTP connections (SSRF) because it lacked the loopback/link-local validation used for webhooks.
**Learning:** SSRF protections were tightly coupled inside the webhook validation function rather than being a reusable network security utility, leading to gaps in coverage for other network calls (like SMTP/SFTP).
**Prevention:** Abstracted IP validation into a centralized `utils.is_safe_host()` function to enforce consistent defense-in-depth across all outbound network connections in the application.
