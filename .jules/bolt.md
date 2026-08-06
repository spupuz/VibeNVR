## 2024-07-26 - Health Check N+1 Optimization
**Learning:** In periodic backend tasks involving iterations over all active cameras (like `check_camera_health`), processing each camera individually using standard `camera_id` lookups triggers O(N) database reads.
**Action:** Always fetch the bulk collection of entities outside the loop and update helper functions to accept the fully resolved entity object rather than an ID to eliminate redundant lazy-loaded database queries.
## 2024-05-15 - N+1 optimization in Bulk Export Endpoints
**Learning:** In bulk export operations (like `export_bulk_cameras`), iterating through a list of IDs and fetching each entity individually creates an N+1 query bottleneck. While `selectinload` is used in `get_cameras`, it's not leveraged if fetching each entity independently.
**Action:** Created `get_cameras_by_ids` which leverages `selectinload` for relationships (like `groups`, `storage_profile`) and uses a bulk `.in_()` query to fetch all relevant entities in a single O(1) query before iterating.

## 2024-07-31 - Background Task Query Optimization
**Learning:** Reusing API-oriented CRUD functions (like `crud.get_cameras`) that eagerly load relationships (`selectinload`) in tight background loops (like `health_service`) causes unnecessary memory bloat and database load.
**Action:** Create lightweight queries (e.g., `crud.get_active_cameras_lightweight`) tailored to fetch only the required models for performance-sensitive background tasks.
## 2026-08-06 - Python Function Redefinition Regression
**Learning:** When cleaning up seemingly duplicate function definitions in Python files (e.g., in `crud.py`), Python binds the function name to the final definition. If earlier definitions had a different signature, keeping an early one and deleting the later ones can cause `TypeError` regressions in the codebase.
**Action:** Always retain the signature and implementation of the *last* defined version when removing duplicate definitions.
