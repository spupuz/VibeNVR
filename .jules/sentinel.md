## 2025-02-28 - Missing Default Security Headers in FastAPI
**Vulnerability:** The application was missing basic defense-in-depth security headers (like X-Frame-Options: DENY, Strict-Transport-Security, X-Content-Type-Options: nosniff, and X-XSS-Protection) on its HTTP responses.
**Learning:** By default, FastAPI/Starlette does not inject these standard security headers. Since the app might be exposed directly or via proxies that don't enforce them, it's essential to add them at the application level.
**Prevention:** A custom middleware `add_security_headers` should be added to the `FastAPI` instance to ensure all responses globally get these headers without having to configure a reverse proxy.
