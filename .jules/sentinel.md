## 2025-02-18 - Standardize RBAC Dependency Injection in Logs Router
**Vulnerability:** Inline authorization check bypass risk in `backend/routers/logs.py`. The `get_logs` and `download_all_logs` endpoints used a manual role check (`if user.role != 'admin'`) rather than the application's standard FastAPI dependency injection (`Depends(auth_service.get_current_active_admin)`).
**Learning:** Manual role checks scattered within route logic are an anti-pattern (as documented in `AGENTS.md`) because they can be easily skipped, bypassed, or incorrectly implemented during refactoring. Furthermore, updating the dependency injection type hint (e.g., from `dict` to `models.User`) without importing the corresponding module (`models`) will cause a `NameError` crash at module load time because Python evaluates type hints dynamically.
**Prevention:** Always use centralized `Depends(...)` decorators for authorization to enforce secure-by-default routing. Always verify that updated type hints have their corresponding modules imported to prevent catastrophic runtime crashes.

## 2025-02-23 - Hardcoded JWT Secret Vulnerability
**Vulnerability:** The application used a predictable, hardcoded string (`"vibenvr-super-secret-key-change-me"`) as a fallback for the JWT `SECRET_KEY` when it was not set in the environment.
**Learning:** Hardcoded secrets in open-source applications lead to immediate token forgery if users deploy without properly configuring their environment variables, allowing complete authentication bypass.
**Prevention:** Always use `secrets.token_urlsafe()` or similar cryptographically secure random generators as a fallback for missing secrets. This ensures instances without configuration fail securely (ephemeral sessions) rather than failing open (vulnerable to known keys).

## 2025-02-28 - Missing Default Security Headers in FastAPI
**Vulnerability:** The application was missing basic defense-in-depth security headers (like X-Frame-Options: DENY, Strict-Transport-Security, X-Content-Type-Options: nosniff, and X-XSS-Protection) on its HTTP responses.
**Learning:** By default, FastAPI/Starlette does not inject these standard security headers. Since the app might be exposed directly or via proxies that don't enforce them, it's essential to add them at the application level.
**Prevention:** A custom middleware `add_security_headers` should be added to the `FastAPI` instance to ensure all responses globally get these headers without having to configure a reverse proxy.

## 2024-05-24 - Prevent Argument Injection in Subprocess Calls
**Vulnerability:** External input (e.g. URLs or file paths) passed directly to `ffmpeg` or `ffprobe` commands via `subprocess.run()` without preceding argument identifiers can be misinterpreted as command-line flags (e.g. if an input starts with `-`), leading to argument/command injection.
**Learning:** Always explicitly mark inputs with the appropriate flag (like `-i`) to guarantee that `ffmpeg`/`ffprobe` correctly interprets the following string as an input source and not an arbitrary, potentially malicious flag, regardless of previous path sanitization.
**Prevention:** Ensure every dynamic path or URL passed to a `subprocess.run` list for `ffmpeg` or `ffprobe` is immediately preceded by the `-i` flag.

## 2024-07-15 - Prevent SSRF in Webhooks
**Vulnerability:** Server-Side Request Forgery (SSRF) was possible via webhook functionality. Webhook URLs were not validated, allowing malicious actors to point webhooks at internal or cloud metadata IP addresses (e.g., `169.254.169.254`). Also, `allow_redirects=False` was missing, which could bypass validation if an attacker set up an external server that redirects to an internal IP.
**Learning:** Even when functionality intentionally allows external connections, IP resolution must occur to block internal or sensitive cloud endpoints. Redirects in HTTP clients can bypass pre-request URL validation.
**Prevention:** Implement an IP resolution check using `socket.gethostbyname` to identify and block link-local and multicast IPs. Additionally, enforce `allow_redirects=False` in network request clients (e.g., `requests.post`) to prevent redirect-based SSRF bypasses.

## 2024-05-18 - [CORS Wildcard with Credentials]
**Vulnerability:** Combining `allow_origins=["*"]` with `allow_credentials=True` in FastAPI/Starlette dynamically reflects the incoming `Origin` header. Also, development localhost origins were falling back into production.
**Learning:** Starlette's `CORSMiddleware` circumvents browser wildcard restrictions when credentials are true and a wildcard is used, creating severe cross-origin vulnerabilities.
**Prevention:** Ensure the `ENVIRONMENT` variable is strictly checked, blocking `*` and `localhost` fallbacks in production when `allow_credentials=True`.

## 2025-06-29 - [Fix Zip Slip and Path Traversal Vulnerabilities]
**Vulnerability:** The codebase had incomplete path traversal checks. `import_motioneye_cameras` allowed Zip Slip attacks because `os.path.isabs` wasn't checked on tar members, which could allow a malicious backup to extract absolute paths. Furthermore, `restore_backup_from_file` and `delete_backup` lacked `os.path.basename(filename) == filename` checks, meaning they only blocked `/` and `..` characters.
**Learning:** Always use `os.path.basename` (or `os.path.abspath`) to safely validate untrusted file names in backup features, and never rely solely on basic substring checks for `..` and `/` as it may fail on different platforms or when handling arbitrary tar extractions.
**Prevention:** Check `filename == os.path.basename(filename)` when handling user-provided file names. For zip/tar extractions, always ensure the file path is explicitly relative and safe against absolute path injection (`os.path.isabs`).

## 2025-02-28 - Fix Webhook Timing Attack
**Vulnerability:** The webhook verification logic in `backend/routers/events.py` used the standard inequality operator `!=` to compare the provided `X-Webhook-Secret` header against the expected secret. This string comparison algorithm usually terminates as soon as a mismatch is found, allowing an attacker to determine the secret character by character by measuring the exact time taken to reject the request (Timing Attack).
**Learning:** Comparing secrets, API keys, or tokens using standard equality operators (`==` or `!=`) exposes the application to timing attacks, regardless of how complex the secret is.
**Prevention:** Always use `hmac.compare_digest(provided_secret.encode('utf-8'), expected_secret.encode('utf-8'))` for comparing sensitive tokens or secrets. This function runs in constant time and prevents timing analysis, ensuring attackers cannot deduce secret values through response time observations.
