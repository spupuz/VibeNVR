## 2025-02-23 - Hardcoded JWT Secret Vulnerability
**Vulnerability:** The application used a predictable, hardcoded string (`"vibenvr-super-secret-key-change-me"`) as a fallback for the JWT `SECRET_KEY` when it was not set in the environment.
**Learning:** Hardcoded secrets in open-source applications lead to immediate token forgery if users deploy without properly configuring their environment variables, allowing complete authentication bypass.
**Prevention:** Always use `secrets.token_urlsafe()` or similar cryptographically secure random generators as a fallback for missing secrets. This ensures instances without configuration fail securely (ephemeral sessions) rather than failing open (vulnerable to known keys).
