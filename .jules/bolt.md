## 2024-06-22 - [Optimize get_cameras API with selectinload]
**Learning:** To resolve SQLAlchemy N+1 query lazy loading issues over 1-to-many or nested relationships (e.g., `camera.groups`, `camera.storage_profile`), prefer using `sqlalchemy.orm.selectinload` over `joinedload` for collections. `joinedload` on collections can cause a Cartesian explosion leading to massive result sets and slow queries.
**Action:** Always use `selectinload` for optimizing collection loads in SQLAlchemy queries to prevent performance degradation from Cartesian products.
## 2025-02-12 - [Optimize get_detailed_storage_stats API with group_by]
**Learning:** To resolve SQLAlchemy N+1 query lazy loading or iterative loop issues when performing aggregations (e.g., getting counts or sizes per element from an event table), prefer utilizing SQL `GROUP BY` logic directly in the query (e.g., `db.query(..., func.count()).group_by(...)`) rather than querying the database repeatedly in a loop for each entity.
**Action:** Always look for O(N) aggregate database querying in backend code and refactor it into a single O(1) query with `group_by`.
## 2025-01-24 - N+1 query in bulk deletion
**Learning:** In backend endpoints processing a list of items for bulk action (e.g. `bulk_delete_events`), querying the database for each item individually inside a `for` loop causes an N+1 query issue, severely hurting performance.
**Action:** Use an `.in_()` filter (e.g., `db.query(Model).filter(Model.id.in_(ids)).all()`) to pre-fetch all records in a single query and process them via an in-memory dictionary map, reducing database lookups from O(N) to O(1).
## 2025-02-12 - [Optimize _generate_backup_data API with selectinload]
**Learning:** In APIs dealing with large exports (like generating full backup dictionaries of the entire database state), accessing lazy-loaded relationships during JSON serialization can trigger thousands of O(N) queries, significantly degrading performance.
**Action:** Always eagerly load relationships using `selectinload` (e.g. `.options(selectinload(Model.relation))`) on bulk API queries that serialize nested components, particularly when assembling large data structures like backups.
## 2025-02-12 - [Optimize get_homepage_stats API with func.count]
**Learning:** When calculating counts of database records in SQLAlchemy (e.g., for dashboards or stats), avoid fetching all records into memory using `len(query.all())` which causes O(N) memory overhead and excessive data transfer.
**Action:** Instead, use database-level aggregations like `query.with_entities(func.count(Model.id)).scalar()` or `db.query(func.count(Model.id)).scalar()` for an efficient O(1) query.
