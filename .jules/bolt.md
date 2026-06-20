
## 2024-06-20 - [SQLAlchemy N+1 Serialization Bottleneck]
**Learning:** Pydantic serialization of SQLAlchemy models (`schemas.Camera.model_validate(c)`) with default lazy-loaded relationships inside a list triggers severe N+1 query problems. Iterating over `crud.get_cameras()` generated 52 queries for 50 cameras because `groups` and `storage_profile` relationships were lazily accessed during validation.
**Action:** When querying collections of models that will be serialized with nested relationships in FastAPI/Pydantic, proactively apply `sqlalchemy.orm.selectinload()` to the query options. This eagerly loads the 1-to-many/many-to-many relationships in a minimal number of batched queries, completely eliminating the N+1 behavior during serialization.
