## 2024-07-26 - Health Check N+1 Optimization
**Learning:** In periodic backend tasks involving iterations over all active cameras (like `check_camera_health`), processing each camera individually using standard `camera_id` lookups triggers O(N) database reads.
**Action:** Always fetch the bulk collection of entities outside the loop and update helper functions to accept the fully resolved entity object rather than an ID to eliminate redundant lazy-loaded database queries.
## 2024-07-31 - Background Task Query Optimization
**Learning:** Reusing API-oriented CRUD functions (like `crud.get_cameras`) that eagerly load relationships (`selectinload`) in tight background loops (like `health_service`) causes unnecessary memory bloat and database load.
**Action:** Create lightweight queries (e.g., `crud.get_active_cameras_lightweight`) tailored to fetch only the required models for performance-sensitive background tasks.
