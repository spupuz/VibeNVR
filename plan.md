1. **Remove duplicated `get_active_cameras_lightweight` definitions in `backend/crud.py`**
   - The function `get_active_cameras_lightweight` is currently defined 3 times in `crud.py`.
   - Remove the duplicate definitions, keeping a single, clean implementation.
2. **Add `get_cameras_lightweight` in `backend/crud.py`**
   - Create a new `get_cameras_lightweight` function that queries cameras without eagerly loading the `groups` and `storage_profile` relationships, similar to `get_active_cameras_lightweight` but without filtering for `is_active`.
3. **Optimize the `get_stats` endpoint in `backend/routers/stats.py`**
   - In `get_stats()`, change the `crud.get_cameras` call to `crud.get_cameras_lightweight`.
   - Since `get_stats` only needs basic camera metadata (`id`, `is_active`, `status`) to calculate counts, resource estimates, and general health, it doesn't need to load all of the relationship details (`groups` and `storage_profiles`) into memory.
   - This fixes a significant memory overhead on a highly trafficked dashboard endpoint.
4. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run linter and tests via Python to ensure no regressions are introduced by the changes.
5. **Create the PR using `submit` tool.**
   - Title: "⚡ Bolt: Optimize stats endpoint and clean up CRUD"
