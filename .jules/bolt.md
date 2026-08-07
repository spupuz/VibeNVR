## 2024-07-26 - Health Check N+1 Optimization
**Learning:** In periodic backend tasks involving iterations over all active cameras (like `check_camera_health`), processing each camera individually using standard `camera_id` lookups triggers O(N) database reads.
**Action:** Always fetch the bulk collection of entities outside the loop and update helper functions to accept the fully resolved entity object rather than an ID to eliminate redundant lazy-loaded database queries.
## 2024-05-15 - N+1 optimization in Bulk Export Endpoints
**Learning:** In bulk export operations (like `export_bulk_cameras`), iterating through a list of IDs and fetching each entity individually creates an N+1 query bottleneck. While `selectinload` is used in `get_cameras`, it's not leveraged if fetching each entity independently.
**Action:** Created `get_cameras_by_ids` which leverages `selectinload` for relationships (like `groups`, `storage_profile`) and uses a bulk `.in_()` query to fetch all relevant entities in a single O(1) query before iterating.

## 2024-07-31 - Background Task Query Optimization
**Learning:** Reusing API-oriented CRUD functions (like `crud.get_cameras`) that eagerly load relationships (`selectinload`) in tight background loops (like `health_service`) causes unnecessary memory bloat and database load.
**Action:** Create lightweight queries (e.g., `crud.get_active_cameras_lightweight`) tailored to fetch only the required models for performance-sensitive background tasks.

## 2024-08-05 - Vectorized Polygon Scaling for Masks
**Learning:** In high-frequency, per-frame video processing loops (like `apply_masks` or `_filter_ai_results_by_zones`), parsing normalized JSON polygons and calculating absolute pixel coordinates point-by-point via Python list comprehensions (`[[int(p[0] * w), int(p[1] * h)] for p in poly]`) creates an O(N) bottleneck that severely delays frame processing and increases CPU load.
**Action:** Pre-cache normalized coordinates as `numpy.ndarray` (`dtype=np.float32`) during initial parsing and use vectorized NumPy array multiplication (e.g., `(poly * wh_scalar).astype(np.int32).reshape((-1, 1, 2))`) in the main loop to perform the scaling across all points simultaneously in O(1) time.
