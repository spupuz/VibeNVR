## 2025-02-14 - Prevent Path Traversal in Avatar Uploads
**Vulnerability:** Arbitrary file deletion vulnerability found in `backend/routers/users.py` where `os.remove(old_full_path)` was called after constructing a path with `os.path.join("/data", old_avatar)`.
**Learning:** `os.path.join` and `os.remove` resolve relative path traversal strings (e.g. `../../etc/passwd`). Because users could update `avatar_path` via a profile update endpoint, they could trick the system into deleting arbitrary files when uploading a new avatar.
**Prevention:** Always use `os.path.abspath()` on the constructed path and verify it `startswith()` the specific, intended directory (e.g. `/data/avatars/`) before passing it to filesystem modification functions.
