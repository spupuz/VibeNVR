## 2024-06-22 - [Optimize get_cameras API with selectinload]
**Learning:** To resolve SQLAlchemy N+1 query lazy loading issues over 1-to-many or nested relationships (e.g., `camera.groups`, `camera.storage_profile`), prefer using `sqlalchemy.orm.selectinload` over `joinedload` for collections. `joinedload` on collections can cause a Cartesian explosion leading to massive result sets and slow queries.
**Action:** Always use `selectinload` for optimizing collection loads in SQLAlchemy queries to prevent performance degradation from Cartesian products.
