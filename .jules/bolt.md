## 2024-07-26 - Health Check N+1 Optimization
**Learning:** In periodic backend tasks involving iterations over all active cameras (like `check_camera_health`), processing each camera individually using standard `camera_id` lookups triggers O(N) database reads.
**Action:** Always fetch the bulk collection of entities outside the loop and update helper functions to accept the fully resolved entity object rather than an ID to eliminate redundant lazy-loaded database queries.
## 2024-05-15 - N+1 optimization in Bulk Export Endpoints
**Learning:** In bulk export operations (like `export_bulk_cameras`), iterating through a list of IDs and fetching each entity individually creates an N+1 query bottleneck. While `selectinload` is used in `get_cameras`, it's not leveraged if fetching each entity independently.
**Action:** Created `get_cameras_by_ids` which leverages `selectinload` for relationships (like `groups`, `storage_profile`) and uses a bulk `.in_()` query to fetch all relevant entities in a single O(1) query before iterating.
