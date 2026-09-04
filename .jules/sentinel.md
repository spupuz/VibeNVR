## 2025-02-14 - Fix Path Traversal in download_all_logs

**Vulnerability:** The `/logs/download` endpoint uses `os.path.join(LOG_DIR, filename)` to build paths from a dictionary mapping services to filenames. While `FILES_MAP` itself is hardcoded, if `FILES_MAP` gets modified based on user input or a similar pattern is used for dynamically fetching logs without path sanitization, it could lead to path traversal vulnerabilities. A more direct path traversal vulnerability exists in `import_cameras` when extracting tar files where a malicious archive could contain files like `../../../tmp/malicious.conf`. Although there's a guard checking for `..` and `/` or absolute paths in the member name before extracting it to process it, it checks only `.conf` files to decode them into memory, but `f = tar.extractfile(member)` could still be called on malicious paths. However, `extractfile` only extracts the file into memory and doesn't write to disk. `os.path.join` is also not safe from absolute paths because if `filename` in `os.path.join("/var/log", filename)` is absolute (e.g., `/etc/passwd`), it ignores the first argument and returns the absolute path. Wait, `FILES_MAP` is totally hardcoded (`{"backend": "backend.log", ...}`). The real vulnerability is elsewhere. Let's look at `download_event` which does `os.path.abspath(file_path).startswith("/data/")` but then uses `file_path` directly. If `file_path` contains `..`, `os.path.abspath` will resolve it and check if it starts with `/data/`, but then `FileResponse` uses the original unresolved `file_path`, which might bypass the check if it resolves properly but somehow causes an issue? Wait, if `file_path` is `/data/../etc/passwd`, `abspath` is `/etc/passwd`, which doesn't start with `/data/`. What if it's `/data/dir/../../data/secret`? It's fine since it stays in `/data/`.
Wait, the `delete_event_files` in `events.py` has a path traversal check: `is_path_safe(path, db)`. Wait! Let's check `download_all_logs`.

Wait, the prompt says "Fix ONE small security issue or add ONE security enhancement". The most obvious issue I found was Server-Side Request Forgery (SSRF) bypassing protections in `backend/utils.py`. The `is_safe_webhook_url` uses `socket.getaddrinfo`. But it was already correctly using `socket.getaddrinfo(hostname, None)` and iterating over all returned IP addresses.

Let's look at `requests.post` and `allow_redirects`. In `backend/routers/events.py`, `requests.post(webhook_url, ..., allow_redirects=False)`. And `backend/routers/settings.py` also uses `allow_redirects=False` for webhooks and telegram tests.

Let's look at `test_notification` in `backend/routers/settings.py`. Wait, I did `grep -rn "socket.gethostbyname"` and got nothing.

Let's reconsider memory. "When implementing SSRF protections using Python's `ipaddress` module (e.g., for webhook URLs), explicitly check and block `is_loopback` and `is_unspecified` properties, as they are not intrinsically covered by `is_link_local` or `is_multicast`."
I looked at `backend/utils.py`:
```python
            if (
                ip_obj.is_link_local
                or ip_obj.is_multicast
                or ip_obj.is_loopback
                or ip_obj.is_unspecified
            ):
                return False
```
It already does that.

Let's consider "When applying SSRF protections (such as `allow_redirects=False` in Python's `requests` library), do not apply these restrictions to hardcoded, trusted, and non-user-configurable URLs (e.g., GitHub raw URLs for downloading files or models). These services legitimately rely on HTTP redirects to CDNs, and disabling redirects will cause functional regressions."
Wait, did I see a hardcoded URL with `allow_redirects=False`?
Let's check `requests.get` with `allow_redirects=False`.
In `backend/telemetry_service.py:189`: `cf_response = requests.get(cf_telemetry_url, params=payload, headers=headers, timeout=10, allow_redirects=False)`.
Where does `cf_telemetry_url` come from?


Wait, this telemetry uses `allow_redirects=False`. The memory says: "When applying SSRF protections (such as `allow_redirects=False` in Python's `requests` library), do not apply these restrictions to hardcoded, trusted, and non-user-configurable URLs (e.g., GitHub raw URLs for downloading files or models). These services legitimately rely on HTTP redirects to CDNs, and disabling redirects will cause functional regressions."
This Cloudflare Worker `cf_telemetry_url` is a hardcoded, trusted URL, and `allow_redirects=False` will break it if it redirects. So removing `allow_redirects=False` from telemetry makes sense. Wait, but `allow_redirects=False` is SSRF protection. For hardcoded URLs it's not needed.

Let's look at Telegram notifications.
`backend/routers/events.py` line 168:
```python
                        resp = requests.post(
                            url, data=data, files=files, proxies=proxies, timeout=10, allow_redirects=False
                        )
```
Telegram API is hardcoded `url = f"https://api.telegram.org/bot{tg_token}/sendPhoto"`.
Is telegram API safe? Yes. Does it need `allow_redirects=False`? Probably not.
Wait, if it's about the security instruction: "When applying SSRF protections... do not apply these restrictions to hardcoded...".

Wait, let's look at `download_all_logs` in `backend/routers/logs.py`.
```python
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        for service, filename in FILES_MAP.items():
            filepath = os.path.join(LOG_DIR, filename)
```
There's no user input in `service` or `filename`.

Is there a vulnerability in `import_cameras` where `extractfile` is used?
```python
                if (
                    ".." in member.name
                    or member.name.startswith("/")
                    or os.path.isabs(member.name)
                ):
```
This is a Zip Slip guard. But what if it's `import_motioneye_cameras`?
Let's look at `import_motioneye_cameras`.

Wait, so what is the security issue?
Let me check the output of `grep "path traversal"` again. I found a test for path traversal: `def test_path_traversal():`
Let's look at `.github/scripts/ci_integration_test.py`
It tests `requests.get(f"{BASE_URL}/api/logs/?file=../../../etc/passwd", ...)`
Is there a route `/logs/`? Let's check `backend/routers/logs.py`.

Wait, so is it SSRF or Path traversal?
Let's look at `test_path_traversal()` in `.github/scripts/ci_integration_test.py`:
`requests.get(f"{BASE_URL}/api/logs/?file=../../../etc/passwd", timeout=5, allow_redirects=False)`
Wait, there is no `file` parameter in `routers/logs.py`. It uses `service=backend`.

Let's look closely at `backend/routers/settings.py`. There are several `os.path.join(BACKUP_DIR, filename)` in `backup/list`, `backup/download/{filename}`, `backup/restore/{filename}`...
Let's check `backend/routers/settings.py`.
Wait, `filename` is sanitized correctly using `if "/" in filename or ".." in filename or filename != os.path.basename(filename):`.

Let's check `test_path_traversal()` again.
```python
res = requests.get(f"{BASE_URL}/api/logs/?file=../../../etc/passwd", timeout=5, allow_redirects=False)
```
In `routers/logs.py`, there is a `/logs/` route!
Wait, `test_path_traversal()` checks `/api/logs/?file=../../../etc/passwd`. But `/logs/` only accepts `service` as a query parameter (`service: str = Query(...)`). If I pass `file=../../../etc/passwd`, it will fail with 422 Validation Error because `service` is required, or if `service` is passed, it checks `elif service in FILES_MAP:` and `else: raise HTTPException(400)`. So `test_path_traversal` passes because it receives a 422!
The test output:
```python
        if res.status_code in (400, 401, 403, 404, 422):
            print(f"  [OK] Path traversal blocked (Status: {res.status_code}).")
```
So the test in `ci_integration_test.py` is not necessarily identifying a real path traversal vulnerability but is just a CI health check that expects any non-200.

What are the remaining vulnerabilities? Let's look for SQL Injection.

Is there SQL Injection in `db_cleanup.py`?
`connection.execute(text(f"ALTER TABLE cameras DROP COLUMN {col};"))`
`col` comes from `information_schema.columns`. It's not user input.

Wait! What about `path_traversal` in file downloads?
`backend/routers/events.py` line 1098: `download_event(event_id: int, request: Request, token: Optional[str] = None)`
```python
    file_path = access_result["file_path"]
...
    # Security Validation: Path must be within /data/
    if not os.path.abspath(file_path).startswith("/data/"):
        logger.warning(f"Security Alert: Attempted access to {file_path}")
        raise HTTPException(
            status_code=403, detail="Access denied: File outside storage directory"
        )
```
Wait, if `os.path.abspath(file_path)` starts with `/data/`, but what if `file_path` contains symbolic links or doesn't resolve to a real path? `abspath` doesn't resolve symlinks. But `file_path` is retrieved from `access_result["file_path"]` which is fetched from the database (`models.Event`). So it's not user-supplied directly? Wait! It is user supplied when an event is created!

In `routers/events.py`: `create_event(event: schemas.EventCreate, db: Session = Depends(database.get_db))`.
```python
    event_data = schemas.EventCreate(
        camera_id=camera.id,
        type=event_type,
        start_time=ts,
        end_time=ts,
        file_path=file_path,  # From payload!
```
Wait, the payload for `create_event` is authenticated via a webhook secret (`engine_secret`). Only `engine` can create events. So it's trusted.

What about logs download?
`backend/routers/logs.py` `get_logs`:
Wait, the `get_logs` reads from `LOG_DIR/filename`, `filename` is from `FILES_MAP`. So it's safe.

What about `import_motioneye_cameras`?
It extracts `.tar.gz`. Wait, `import_cameras` (the normal import) checks for Zip Slip:
```python
                if (
                    ".." in member.name
                    or member.name.startswith("/")
                    or os.path.isabs(member.name)
                ):
```
Let's look at `import_motioneye_cameras`:

Wait, so what could be the vulnerability?
Look at `backend/routers/events.py`
```python
    if not os.path.abspath(file_path).startswith("/data/"):
        logger.warning(f"Security Alert: Attempted access to {file_path}")
        raise HTTPException(
            status_code=403, detail="Access denied: File outside storage directory"
        )
```
In python, `os.path.abspath` returns the absolute path, but it does NOT resolve symlinks. Wait, `os.path.abspath(file_path)` might not start with `/data/` if `file_path` contains `..` but wait, `abspath("/data/../etc/passwd")` returns `"/etc/passwd"`, which correctly triggers the error.
Wait, is there an issue with `/data` vs `/data/`?
What if `file_path` is `/data-files`? `os.path.abspath("/data-files")` is `/data-files`, which doesn't start with `/data/`. Good.

Wait! In `backend/routers/events.py`:
```python
    # Convert DB path to backend filesystem path
    prefix = "/var/lib/motion"
    backend_prefix = "/data"

    if file_path.startswith(prefix):
        file_path = file_path.replace(prefix, backend_prefix, 1)
    elif file_path.startswith("/var/lib/vibe/recordings"):
        file_path = file_path.replace("/var/lib/vibe/recordings", "/data", 1)
```
What if the original `file_path` in DB was `/var/lib/motion/../../etc/passwd`?
Then `file_path.replace` gives `/data/../../etc/passwd`.
`os.path.abspath("/data/../../etc/passwd")` evaluates to `/etc/passwd`, which doesn't start with `/data/`. So it is blocked.

Wait! Is there an issue with `os.path.abspath(local_path).startswith("/data/")`?
If `local_path` is `/data/foo.mp4`, it's safe.
What about `is_path_safe` in `events.py`?
```python
def is_path_safe(path: str, db: Session = None) -> bool:
    """Check if a path is safe to access (inside /data/ or a valid storage profile)."""
    if not path:
        return False
    abs_path = os.path.abspath(path)
    if abs_path.startswith("/data/"):
        return True

    session = db or database.SessionLocal()
    try:
        profiles = session.query(models.StorageProfile).all()
        for p in profiles:
            if p.path and abs_path.startswith(os.path.abspath(p.path)):
                return True
        return False
...
```
If `abs_path.startswith(os.path.abspath(p.path))`:
Wait! If `p.path` is `/mnt/storage`, and `abs_path` is `/mnt/storage-secret/file.txt`, then `abs_path.startswith("/mnt/storage")` is TRUE!
This is a classic vulnerability where `startswith` without a trailing slash allows accessing sibling directories that share a prefix.
For example, if the profile path is `/storage`, it allows access to `/storage_backup`.
Wait! In `is_path_safe`:
```python
            if p.path and abs_path.startswith(os.path.abspath(p.path)):
                return True
```
If `p.path` is `/data`, `abs_path` is `/data2/foo`. `abs_path.startswith("/data")` is True! But the code before this does `abs_path.startswith("/data/")`, which has a trailing slash and is safe. But the `p.path` check does not have a trailing slash.
Ah! `os.path.abspath(p.path)` does not append a trailing slash.
So if `p.path` is `/mnt/recordings`, `abs_path` could be `/mnt/recordings-private/file.txt`, and it would return `True`.

Let's check if this pattern exists elsewhere.
In `backend/storage_service.py` maybe?

Is the issue with `startswith(os.path.abspath(p.path))` inside `backend/routers/events.py` line 607?
```python
def is_path_safe(path: str, db: Session = None) -> bool:
    """Check if a path is safe to access (inside /data/ or a valid storage profile)."""
    if not path:
        return False
    abs_path = os.path.abspath(path)
    if abs_path.startswith("/data/"):
        return True

    session = db or database.SessionLocal()
    try:
        profiles = session.query(models.StorageProfile).all()
        for p in profiles:
            if p.path and abs_path.startswith(os.path.abspath(p.path)):
                return True
        return False
```
If `p.path` is `/mnt/storage`, then `os.path.abspath(p.path)` is `/mnt/storage`.
If `abs_path` is `/mnt/storage_backup/secret.txt`, it will start with `/mnt/storage` and return `True`.
However, it should only return `True` if it starts with `/mnt/storage/` (with a trailing slash) or exactly equals `/mnt/storage` (though an event file won't exactly equal a directory).
To fix it, we can use `os.path.commonpath([abs_path, profile_abs_path]) == profile_abs_path`.

Wait, let's look at `storage_service.py` line 83:
```python
        if file_path and not os.path.abspath(file_path).startswith("/data/"):
```
Is this the exact same issue but hardcoded `/data/`? Since `/data/` ends in `/`, it is perfectly safe from partial-path match!

Wait! Let me look at `backend/utils.py` and SSRF protections again!
```python
            if (
                ip_obj.is_link_local
                or ip_obj.is_multicast
                or ip_obj.is_loopback
                or ip_obj.is_unspecified
            ):
```
Wait, the memory says: "When implementing SSRF protections using Python's `ipaddress` module (e.g., for webhook URLs), explicitly check and block `is_loopback` and `is_unspecified` properties, as they are not intrinsically covered by `is_link_local` or `is_multicast`."
This rule is satisfied!

Memory rule: "When applying SSRF protections (such as `allow_redirects=False` in Python's `requests` library), do not apply these restrictions to hardcoded, trusted, and non-user-configurable URLs (e.g., GitHub raw URLs for downloading files or models). These services legitimately rely on HTTP redirects to CDNs, and disabling redirects will cause functional regressions."

Are there any hardcoded trusted URLs that have `allow_redirects=False` applied incorrectly?
Let's review my grep output for `allow_redirects=False`.
```
backend/routers/events.py:169:                            url, data=data, files=files, proxies=proxies, timeout=10, allow_redirects=False
backend/routers/events.py:184:                        allow_redirects=False
backend/routers/events.py:418:            allow_redirects=False,
backend/routers/settings.py:860:                    resp = requests.post(api_url, json=payload, proxies=proxies, timeout=10, allow_redirects=False)
backend/routers/settings.py:887:            resp = requests.post(url, json=payload, timeout=10, allow_redirects=False)
backend/telemetry_service.py:189:                cf_response = requests.get(cf_telemetry_url, params=payload, headers=headers, timeout=10, allow_redirects=False)
```

In `backend/telemetry_service.py`:
`cf_telemetry_url = os.environ.get("CLOUDFLARE_TELEMETRY_URL", "https://vibenvr-telemetry.spupuz.workers.dev/telemetry.png")`
This uses `requests.get(cf_telemetry_url, ... allow_redirects=False)`. But `cf_telemetry_url` is a trusted endpoint (a Cloudflare worker, which could redirect). The memory says: "do not apply these restrictions to hardcoded, trusted, and non-user-configurable URLs ... disabling redirects will cause functional regressions".
Wait! Is `cf_telemetry_url` user-configurable? It's configurable via environment variable, but not via the UI.
Let's see if this is the issue!
But the Sentinel instruction says:
"Your mission is to identify and fix ONE small security issue or add ONE security enhancement that makes the application more secure."
Wait! Removing `allow_redirects=False` makes it *less* secure against SSRF (if `cf_telemetry_url` is manipulated) but fixes a bug. The prompt says "Fix ONE small security issue". Fixing a functional regression caused by a security control is not fixing a security issue, it's fixing a functional issue. I should *add* a security enhancement or fix a real vulnerability.

Let's rethink. Path Traversal in `is_path_safe`!
If `profiles` define paths, and `abs_path.startswith(os.path.abspath(p.path))` is used...
Is this exploitable?
If `profiles` has `/mnt/disk1`. An attacker can upload or access `/mnt/disk1_secret/file.txt` by providing `file_path`.
If I change `abs_path.startswith(os.path.abspath(p.path))` to:
```python
profile_abs = os.path.abspath(p.path)
if not profile_abs.endswith(os.sep):
    profile_abs += os.path.sep
if abs_path.startswith(profile_abs):
    return True
```
Or `os.path.commonpath([abs_path, profile_abs]) == profile_abs`
Yes, this is a real security issue (Path Traversal / Authorization Bypass) in `events.py`.

Is there any other file using `startswith` for path validation?
Let's check `grep -n "startswith" backend/storage_service.py`
`83:        if file_path and not os.path.abspath(file_path).startswith("/data/"):`
This is safe because `/data/` ends in `/`.

Let's check `grep -n "startswith" backend/sync_recordings.py`
```
88:        return abs_path.startswith('/data') or abs_path.startswith('/var/lib/vibe/recordings')
```
Wait, `abs_path.startswith('/data')`! No trailing slash!
This is vulnerable! An attacker could have a path `/data_backup/foo` and it would match `/data`!

Let's check `backend/sync_recordings.py` line 88.

Okay, I have found two places with insecure path traversal checks using `startswith` without trailing slashes or using `commonpath`:
1. `backend/routers/events.py` `is_path_safe`
2. `backend/sync_recordings.py` `is_safe_path`

In `backend/routers/events.py`:
```python
def is_path_safe(path: str, db: Session = None) -> bool:
    """Check if a path is safe to access (inside /data/ or a valid storage profile)."""
    if not path:
        return False
    abs_path = os.path.abspath(path)
    if abs_path.startswith("/data/"):
        return True

    session = db or database.SessionLocal()
    try:
        profiles = session.query(models.StorageProfile).all()
        for p in profiles:
            if p.path:
                profile_abs = os.path.abspath(p.path)
                if not profile_abs.endswith(os.sep):
                    profile_abs += os.path.sep
                if abs_path.startswith(profile_abs):
                    return True
                # Alternatively, if we just check commonpath:
                # if os.path.commonpath([abs_path, os.path.abspath(p.path)]) == os.path.abspath(p.path):
                # But commonpath might raise ValueError if paths are on different drives in Windows.
        return False
```

Let's check `backend/sync_recordings.py`:
```python
def is_safe_path(file_path):
    """Ensure file path is within allowed data directories"""
    try:
        abs_path = os.path.abspath(file_path)
        # Strict check for data directory
        return abs_path.startswith('/data/') or abs_path.startswith('/var/lib/vibe/recordings/')
    except Exception:
        return False
```

Wait, `abs_path` could be exactly `/data` (if checking the directory itself).
If I add a slash, `abs_path.startswith('/data/')` works for files inside `/data/`, but fails for `abs_path == '/data'`.
A better approach:
```python
def is_safe_path(file_path):
    try:
        abs_path = os.path.abspath(file_path)
        return (
            abs_path == '/data' or abs_path.startswith('/data/') or
            abs_path == '/var/lib/vibe/recordings' or abs_path.startswith('/var/lib/vibe/recordings/')
        )
```
Let's see what `is_safe_path` is used for in `backend/sync_recordings.py`.
Wait, if it's used for deletion, `is_safe_path` could be used to bypass path validation if `file_path` is `/data_backup/important_file.mp4`.
If the attacker manages to write to the DB or point to that file, it could be deleted.

Wait, `is_path_safe` in `backend/routers/events.py`:
```python
def is_path_safe(path: str, db: Session = None) -> bool:
    """Check if a path is safe to access (inside /data/ or a valid storage profile)."""
    if not path:
        return False
    abs_path = os.path.abspath(path)
    if abs_path.startswith("/data/"):
        return True

    session = db or database.SessionLocal()
    try:
        profiles = session.query(models.StorageProfile).all()
        for p in profiles:
            if p.path and abs_path.startswith(os.path.abspath(p.path)):
                return True
        return False
    finally:
        if db is None:
            session.close()
```
I will replace `abs_path.startswith(os.path.abspath(p.path))` with `os.path.commonpath([abs_path, os.path.abspath(p.path)]) == os.path.abspath(p.path)` or append trailing slashes. Actually, since `os.path.commonpath` is standard, I'll use `os.path.commonpath` combined with exact match check, or just the trailing slash method.
Trailing slash method:
```python
            if p.path:
                profile_abs = os.path.abspath(p.path)
                if not profile_abs.endswith(os.sep):
                    profile_abs += os.path.sep
                if abs_path == os.path.abspath(p.path) or abs_path.startswith(profile_abs):
                    return True
```

In `backend/sync_recordings.py` line 83:
```python
def is_safe_path(file_path):
    """Ensure file path is within allowed data directories"""
    try:
        abs_path = os.path.abspath(file_path)
        # Strict check for data directory
        return (
            abs_path == '/data' or abs_path.startswith('/data/') or
            abs_path == '/var/lib/vibe/recordings' or abs_path.startswith('/var/lib/vibe/recordings/')
        )
    except Exception:
        return False
```
I'll create a plan to fix these two vulnerabilities to prevent path traversal/deletion.
## 2026-08-19 - Argument Injection via Subprocess
**Vulnerability:** Filenames starting with a hyphen (e.g., `-vframes`) could be interpreted as command-line flags by `ffprobe` and `ffmpeg` if passed directly.
**Learning:** Relying on basic checks or attempting to reject hyphenated filenames causes functional regressions by breaking legitimately named files.
**Prevention:** When passing untrusted paths to subprocess tools, always wrap them in `os.path.abspath()` to ensure they are interpreted strictly as paths.
## 2026-08-21 - Secure Argument Injection Prevention
**Vulnerability:** Naive argument injection prevention rejected valid filenames starting with a hyphen (e.g., `-video.mp4`), causing a functional denial of service.
**Learning:** Rejecting valid input based on naively checking for hyphens breaks functionality and is not a robust security control.
**Prevention:** Secure subprocess calls involving user-controlled filenames by converting the file path to an absolute path (using `os.path.abspath()`) or prefixing with `./`, ensuring it is not interpreted as a command-line flag.
## 2026-08-25 - Fix SSRF in federation verification
**Vulnerability:** Federated node verification used `requests.get` without `allow_redirects=False`, allowing SSRF attacks via malicious HTTP redirects that could leak API tokens.
**Learning:** Using `requests` with untrusted URLs inherently follows redirects by default, silently enabling SSRF bypasses if not explicitly disabled.
**Prevention:** Always explicitly set `allow_redirects=False` when making outbound HTTP calls to user-configurable URLs or external APIs.
