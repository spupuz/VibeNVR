## 2024-05-30 - [Missing Rate Limit on Setup]
**Vulnerability:** The `/setup` endpoint in `backend/routers/auth.py`, used to create the first admin user, was publicly accessible without rate limiting.
**Learning:** Even one-time use initialization endpoints that check for existing setup completion (`if existing_user: raise HTTPException`) are vulnerable to brute-force or DoS attacks during the initial setup window if unconstrained.
**Prevention:** Ensure all public-facing endpoints, including initial setup routes, use `@limiter.limit` and explicitly require the `request: Request` parameter for slowapi to function.

## 2024-05-30 - [Weak PRNG for Identifiers]
**Vulnerability:** Weak PRNG (`Math.random()`) used for generating unique Toast IDs in the frontend.
**Learning:** Using `Math.random` combined with string truncation (`substr(2, 9)`) for ID generation is prone to collisions and is not cryptographically secure, even for UI components.
**Prevention:** Always use `crypto.randomUUID()` to guarantee uniqueness and strong entropy when generating client-side unique identifiers.
## 2025-02-27 - Webhook Validation SSRF Protection
**Vulnerability:** The webhook URL validation logic explicitly blocked link-local and multicast IPs but failed to block loopback (`127.0.0.1`) and unspecified (`0.0.0.0`) addresses.
**Learning:** This omission allowed potential SSRF attacks targeting internal services running on the loopback interface, bypassing external network controls.
**Prevention:** Ensure all non-routable, non-private internal address ranges (loopback, unspecified, link-local, multicast) are explicitly blocked when validating external URLs provided by users.
## 2024-05-24 - Missing SSRF protection in Telemetry requests
**Vulnerability:** The telemetry service in the backend uses `requests.get` to send data to a user-configurable URL (`CLOUDFLARE_TELEMETRY_URL` from env variables) but fails to explicitly disable HTTP redirects (`allow_redirects=False`).
**Learning:** `requests.get` follows HTTP redirects by default, which can be exploited by an attacker to bypass basic SSRF checks (like checking the initial URL) by having the external server redirect the request to internal addresses (e.g. `127.0.0.1` or `169.254.169.254`).
**Prevention:** Always set `allow_redirects=False` on `requests.get` and `requests.post` calls to external or user-configurable URLs, regardless of if they are parsed or validated beforehand.
