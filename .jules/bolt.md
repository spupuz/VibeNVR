## 2024-05-23 - Prevent OOM crashes by streaming massive tables
**Learning:** In backend background tasks (like `cleanup_orphans.py`, `fix_thumbnails.py`, and `repair_timestamps.py`), querying millions of rows using `.all()` fetches everything into Python memory simultaneously, causing memory spikes and OOM crashes.
**Action:** Always stream massive datasets in SQLAlchemy background tasks using `.yield_per(1000)`. When full object models are not needed, combine this with `.with_entities()` to fetch only the required columns and further reduce memory footprint.
