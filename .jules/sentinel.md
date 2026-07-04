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

## 2025-03-08 - Use Constant-Time Comparison for Webhook Secrets
**Vulnerability:** The `/webhook` endpoint compared the provided `X-Webhook-Secret` against the expected secret using a standard inequality operator (`!=`). This allows timing attacks where an attacker could theoretically deduce the secret byte-by-byte by observing minute differences in response times when the string comparison fails early.
**Learning:** Comparing security-sensitive strings (like API keys, tokens, or webhook secrets) using `==` or `!=` exposes applications to timing side-channels.
**Prevention:** Always use `hmac.compare_digest(provided.encode('utf-8'), expected.encode('utf-8'))` for comparing cryptographic secrets to ensure a constant-time comparison that does not leak length or content information through timing differences.
