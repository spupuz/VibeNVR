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
## 2024-05-25 - SSRF Prevention in Federation Node Health Check
**Vulnerability:** The federation health check in `health_service.py` made HTTP requests to node URLs without verifying if they were safe against SSRF, potentially allowing a compromised database entry to trigger requests to internal services.
**Learning:** We must apply existing SSRF validations (`utils.is_safe_webhook_url`) to all outbound HTTP requests in background tasks, even if the URL was presumably validated at creation time (defense in depth).
**Prevention:** Apply strict SSRF validation on any URL retrieved from the database before making background HTTP requests.
## 2024-05-30 - SSRF Vulnerability in SFTP Client
**Vulnerability:** The SFTP client established socket connections (`socket.create_connection`) directly to user-provided SFTP hostnames/IPs without validating them against a blocklist, leading to a Server-Side Request Forgery (SSRF) vulnerability targeting loopback, multicast, or cloud-metadata endpoints.
**Learning:** `is_safe_webhook_url` in `utils.py` contained the robust SSRF validation logic but was tightly coupled to URL parsing. This restricted its use for cases where only a hostname is provided (like SFTP).
**Prevention:** Extract core SSRF validation logic into a reusable `is_safe_host(hostname)` function and use it universally before establishing outbound connections.
## 2024-10-04 - SSRF vulnerability in federation proxy
**Vulnerability:** The federation service proxies HTTP and WebSocket requests directly to URLs stored in the database without re-validating them for SSRF at the time of connection.
**Learning:** URLs must be validated at the time of use (e.g., using `utils.is_safe_webhook_url`), not just at creation time, to prevent SSRF via database tampering or DNS rebinding.
**Prevention:** Always enforce defense-in-depth by re-validating external URLs immediately before initiating network connections, particularly in proxy-like services.
