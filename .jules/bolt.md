## 2024-06-21 - [Optimize camera access authorization queries]
**Learning:** `get_allowed_camera_ids_for_user` was causing massive N+1 queries when accessing nested group/camera relationships by iterating over lazy-loaded relationships in Python.
**Action:** Used direct SQL `union` queries with `getattr(Model, col_name).is_(True)` for authorization checks instead of iterating over lazy-loaded relationships in Python.
