## 2026-06-18 - [Fix path traversal vulnerability in avatar deletion]
**Vulnerability:** Arbitrary file deletion due to missing path traversal protection in backend/routers/users.py when deleting an old avatar.
**Learning:** The old_avatar variable was concatenated using os.path.join without verifying if the resulting absolute path stays within the intended /data/avatars directory. An attacker who could manipulate the db_user.avatar_path could exploit this to delete any file the backend process has permissions for.
**Prevention:** Always use os.path.abspath and check if the resulting path startswith the intended directory (e.g. /data/avatars/) before calling os.remove.
