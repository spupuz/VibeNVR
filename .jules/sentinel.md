
## 2024-05-28 - [CRITICAL] Prevent Path Traversal on File Deletion Endpoints
**Vulnerability:** The avatar deletion endpoint allowed user-supplied input (`old_avatar` path fetched from the DB, which could potentially be manipulated by a malicious user setting their own avatar path) to be passed directly into `os.path.join("/data", old_avatar)` and then subsequently deleted.
**Learning:** Due to how `os.path.join` works, absolute paths passed into the second parameter override the first parameter. A malicious string like `../../../../etc/passwd` or `/etc/passwd` would resolve outside the intended directory and allow deletion of arbitrary system files.
**Prevention:** Always sanitize paths before filesystem operations. Use `os.path.abspath` to resolve the full intended path, and enforce strict boundary checking (e.g., `if path.startswith("/data/avatars/"):`) before performing any deletion or read operations.
