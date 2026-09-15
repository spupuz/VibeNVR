## 2024-05-23 - Prevent OOM crashes by streaming massive tables
**Learning:** In backend background tasks (like `cleanup_orphans.py`, `fix_thumbnails.py`, and `repair_timestamps.py`), querying millions of rows using `.all()` fetches everything into Python memory simultaneously, causing memory spikes and OOM crashes.
**Action:** Always stream massive datasets in SQLAlchemy background tasks using `.yield_per(1000)`. When full object models are not needed, combine this with `.with_entities()` to fetch only the required columns and further reduce memory footprint.

## 2024-05-23 - Prevent DB Locks when chunking I/O workloads
**Learning:** Using `.yield_per()` to stream massive datasets during operations that involve slow file I/O or intermediate `db.commit()` statements causes long-lived database cursors to remain open. This leads to connection pool exhaustion and transaction timeouts. Furthermore, for SQLite compatibility, chunk sizes involving `IN` clauses must stay below the default 999 variable limit.
**Action:** For bulk processing requiring slow I/O or incremental commits, use application-level chunking with `.limit(900).all()` inside a `while` loop rather than relying on `.yield_per()`.
