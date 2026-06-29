## 2024-06-22 - [Optimize get_cameras API with selectinload]
**Learning:** To resolve SQLAlchemy N+1 query lazy loading issues over 1-to-many or nested relationships (e.g., `camera.groups`, `camera.storage_profile`), prefer using `sqlalchemy.orm.selectinload` over `joinedload` for collections. `joinedload` on collections can cause a Cartesian explosion leading to massive result sets and slow queries.
**Action:** Always use `selectinload` for optimizing collection loads in SQLAlchemy queries to prevent performance degradation from Cartesian products.
## 2025-02-12 - [Optimize get_detailed_storage_stats API with group_by]
**Learning:** To resolve SQLAlchemy N+1 query lazy loading or iterative loop issues when performing aggregations (e.g., getting counts or sizes per element from an event table), prefer utilizing SQL `GROUP BY` logic directly in the query (e.g., `db.query(..., func.count()).group_by(...)`) rather than querying the database repeatedly in a loop for each entity.
**Action:** Always look for O(N) aggregate database querying in backend code and refactor it into a single O(1) query with `group_by`.

## 2024-05-18 - Chained selectinload for deeply nested Pydantic serialization
**Learning:** When serializing SQLAlchemy models with Pydantic (e.g., via `model_validate`), accessing nested relationships defined in the Pydantic schema will silently trigger N+1 database queries. For instance, serializing `CameraGroup` fetches its `cameras`, and then fetches each camera's `groups` and `storage_profile`.
**Action:** Always pre-load deeply nested relationships using chained `selectinload` (e.g., `selectinload(models.CameraGroup.cameras).selectinload(models.Camera.groups)`) in the initial SQLAlchemy query to prevent Cartesian explosion and O(N) queries during API response generation.
