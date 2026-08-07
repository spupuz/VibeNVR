## 2024-07-26 - Health Check N+1 Optimization
**Learning:** In periodic backend tasks involving iterations over all active cameras (like `check_camera_health`), processing each camera individually using standard `camera_id` lookups triggers O(N) database reads.
**Action:** Always fetch the bulk collection of entities outside the loop and update helper functions to accept the fully resolved entity object rather than an ID to eliminate redundant lazy-loaded database queries.
## 2024-05-15 - N+1 optimization in Bulk Export Endpoints
**Learning:** In bulk export operations (like `export_bulk_cameras`), iterating through a list of IDs and fetching each entity individually creates an N+1 query bottleneck. While `selectinload` is used in `get_cameras`, it's not leveraged if fetching each entity independently.
**Action:** Created `get_cameras_by_ids` which leverages `selectinload` for relationships (like `groups`, `storage_profile`) and uses a bulk `.in_()` query to fetch all relevant entities in a single O(1) query before iterating.

## 2024-07-31 - Background Task Query Optimization
**Learning:** Reusing API-oriented CRUD functions (like `crud.get_cameras`) that eagerly load relationships (`selectinload`) in tight background loops (like `health_service`) causes unnecessary memory bloat and database load.
**Action:** Create lightweight queries (e.g., `crud.get_active_cameras_lightweight`) tailored to fetch only the required models for performance-sensitive background tasks.

## 2024-08-25 - Pagination and Authorization Filtering
**Learning:** In paginated endpoints (like fetching events with a `limit`), performing role-based authorization filtering (e.g., checking `allowed_ids`) in memory via a Python list comprehension *after* the DB fetch causes severe issues: it loads potentially thousands of useless records into memory (O(N) memory bloat), and more importantly, it causes implicit data truncation (returning fewer than `limit` events even if more authorized events exist in the database).
**Action:** Always pass authorized entity IDs (like `allowed_camera_ids`) down to the DB query layer (CRUD function) to filter natively via `.in_()` before `.limit()` is applied.
