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

## 2025-02-12 - [Optimize bulk deletions in storage cleanup]
**Learning:** In backend loops processing storage cleanup deletions, querying the database for the oldest item individually inside a `while` loop with `.first()` causes severe N+1 query performance degradation.
**Action:** Always refactor iterative single-record fetches in deletion loops to batched queries using `.limit(100).all()` and defer `db.commit()` outside the inner batch loop to execute as a single efficient transaction.

## 2025-03-05 - N+1 query in backend bulk deletion endpoints
**Learning:** In backend endpoints processing a list of items for bulk action (e.g. `bulk_delete_cameras`, `bulk_delete_groups`), querying the database and deleting items via external crud functions for each item individually inside a `for` loop causes an N+1 query issue, hurting performance and creating multiple transactions instead of one.
**Action:** Use an `.in_()` filter (e.g., `db.query(Model).filter(Model.id.in_(ids)).all()`) to pre-fetch all records in a single query and process them via an in-memory dictionary map, delete the records with `db.delete`, and commit once using `db.commit()` at the end, reducing database queries from O(N) to O(1) and making it a single transaction.

## 2026-07-06 - N+1 query in backend orphan recording sync
**Learning:** During backend orphan recording synchronization, performing DB lookups or inserts for individual records causes significant N+1 overhead and latency.
**Action:** Pre-fetch relevant database file paths into a Python set for O(1) lookups, and replace individual DB inserts with batched `db.add_all()` arrays to reduce execution latency.

## 2026-07-16 - [Fix blocking sleep in FastAPI lifespan]
**Learning:** When refactoring blocking calls (e.g., `time.sleep`) to async equivalents (e.g., `asyncio.sleep`) in FastAPI lifespan or other async contexts, carefully check for nested synchronous functions or background threads (like `run_orphan_recovery`) in the same file that still rely on the original synchronous module before removing their imports.
**Action:** Ensure synchronous functions inside async files correctly import and use synchronous versions of blocking operations.
## 2024-05-24 - Batch Query Optimization in Camera Import
When processing bulk creation or updates (like importing cameras), always lift repeated database queries out of loops. We improved `import_cameras` by hoisting `crud.get_cameras` out of the loop and batch-fetching existing `CameraGroup` instances using `.in_()`. This significantly reduced N+1 database queries, improving batch import times from ~10.8s to ~7.7s in our benchmarks.

## 2026-07-17 - Optimize Backup Restore N+1 Query
Optimized the 'Restore Users' loop in settings.py which suffered from an N+1 query issue during the backup restoration process. By pre-fetching all users mentioned in the backup using a single `in_` query and performing O(1) Python lookups, the process time was significantly reduced (roughly 25x faster in benchmarks for 1000 users). Found that using `usernames = [u['username'] for u in data['users']]; db.query(models.User).filter(models.User.username.in_(usernames)).all()` is a safe, effective, and zero-regression strategy for these backup restore iterations.

## 2026-07-17 - Avoid N+1 issues in batch operations
When dealing with bulk deletions (e.g. `_cleanup_corrupted_videos` removing missing videos), avoid calling single-record operations (like `db.delete()`) inside a loop. This generates an N+1 query execution bottleneck. Instead, collect the primary keys in a Python list and execute a batched delete using an `.in_()` clause with `synchronize_session=False` (e.g. `db.query(Event).filter(Event.id.in_(batch)).delete(synchronize_session=False)`). SQLite limits the max number of variables, so batching deletions (e.g. chunks of 900) ensures stability.

## 2025-02-12 - [Optimize async FastAPI routes handling sync DB calls]
**Learning:** In FastAPI, asynchronous endpoints (`async def`) run on the main event loop. If these routes contain synchronous SQLAlchemy database operations (like `crud.get_camera(db)`), they directly block the entire event loop, causing poor concurrency and degraded performance for all incoming API requests.
**Action:** Offload synchronous database calls to worker threads using `fastapi.concurrency.run_in_threadpool`. Crucially, to preserve thread-safety with SQLAlchemy (since passing `Session` objects or lazy-loaded models across threads is an anti-pattern and often leads to detached instance errors), encapsulate the database fetch and serialization into a single synchronous wrapper function that spins up its own `SessionLocal` context manager and maps the ORM model into a thread-safe plain Python dictionary or dataclass schema.
## 2024-11-20 - Hoisting DB Queries from Import Loops
**Learning:** Performing database queries like `crud.get_cameras()` inside loops (like tarball extraction processing) causes a massive O(N) performance bottleneck and N+1 query patterns.
**Action:** Always hoist table-wide data retrieval operations outside of loops into O(1) structures like dictionaries or sets to check for existence/duplicates.

## 2025-05-18 - Avoid full table scans when replacing multiple Count queries
**Learning:** When attempting to consolidate multiple SQLAlchemy count queries into a single query using conditional aggregations (`func.sum(case(...))`), ensure you do not inadvertently remove `.filter()` clauses on indexed columns (like timestamps). Removing the `WHERE` clause forces a full table scan and causes severe performance regressions.
**Action:** When trying to optimize multiple queries, only combine them if they share the same filter criteria, or if avoiding the full table scan is impossible. Otherwise, executing multiple queries that leverage database indexes is much faster than one query with a full table scan.

## 2025-05-18 - Hoist database aggregates out of loops for large tables
**Learning:** Performing `db.query(func.sum(...))` or other aggregates inside a loop (like `for camera in cameras:` in `run_cleanup`) causes an N+1 query issue. If the aggregate query does not depend on data changing within the loop, it's highly inefficient to run it repeatedly.
**Action:** Hoist the aggregate query out of the loop using a SQL `GROUP BY` clause. Fetch all required sums or counts in a single O(1) query upfront, store them in a Python dictionary mapped by the grouping key (e.g., `camera_id`), and pass these pre-calculated values into the loop functions to prevent database hammering.
