## 2024-05-23 - Prevent OOM crashes by streaming massive tables
**Learning:** In backend background tasks (like `cleanup_orphans.py`, `fix_thumbnails.py`, and `repair_timestamps.py`), querying millions of rows using `.all()` fetches everything into Python memory simultaneously, causing memory spikes and OOM crashes.
**Action:** Always stream massive datasets in SQLAlchemy background tasks using `.yield_per(1000)`. When full object models are not needed, combine this with `.with_entities()` to fetch only the required columns and further reduce memory footprint.
## 2024-05-24 - N+1 Queries in Backup Restoration
**Learning:** During system recovery operations like importing configuration backups, looping over objects (Groups, API Tokens, etc.) and performing `.first()` queries for each entity causes severe N+1 database bottlenecks.
**Action:** Always pre-fetch the necessary entities outside the loop using `.all()` and construct O(1) lookup dictionaries or sets in Python to check for existing records.

## 2024-05-23 - Prevent DB Locks when chunking I/O workloads
**Learning:** Using `.yield_per()` to stream massive datasets during operations that involve slow file I/O or intermediate `db.commit()` statements causes long-lived database cursors to remain open. This leads to connection pool exhaustion and transaction timeouts. Furthermore, for SQLite compatibility, chunk sizes involving `IN` clauses must stay below the default 999 variable limit.
**Action:** For bulk processing requiring slow I/O or incremental commits, use application-level chunking with `.limit(900).all()` inside a `while` loop rather than relying on `.yield_per()`.

## 2024-05-24 - Extract Heavy Historical Data Fetching from High-Frequency Polling
**Learning:** Polling heavy aggregated historical database endpoints (like `/api/stats/history`) in the same high-frequency loop as live status endpoints (like `/api/stats`) causes massive unnecessary overhead and N+1-like database bottlenecks.
**Action:** Always extract rarely-changing data fetches out of high-frequency polling intervals and fetch them on a significantly slower interval (e.g. 5 minutes) or only on component mount to prevent severe backend overload.

## 2024-11-20 - N+1 Queries in High-Frequency Polling
**Learning:** During periodic background polling by the frontend (like the `LiveView`, `Dashboard`, and `Cameras` pages polling `/api/cameras`), the backend eagerly loaded heavy relationships (`groups`, `storage_profile`) on every call. This resulted in significant memory bloat, extra DB load, and unnecessary serialization overhead for data the frontend often just used for simple `id -> name` mapping.
**Action:** Implemented a `?lightweight=true` parameter on the backend `GET /api/cameras` route that uses a separate query skipping eager loading. Updated UI components that don't need relational data (like Dashboard mapping logic and Timeline views) to use the lightweight flag to avoid database bottlenecks.
## $(date +%Y-%m-%d) - Optimize Dashboard Federation Node Fetching
**Learning:** Sequential `await fetch` inside a `for...of` loop creates an O(N) latency bottleneck on the dashboard, blocking subsequent requests until the previous one finishes.
**Action:** Use `Promise.all` with `Array.map()` to fetch data concurrently across multiple nodes.
