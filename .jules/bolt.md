## 2024-07-26 - O(N) Updates in Reordering
**Learning:** Iterating over a list of IDs and running `db.query().filter().update()` for each item creates an N+1 query bottleneck during bulk operations like camera reordering.
**Action:** Use `db.bulk_update_mappings()` with a list of dictionaries to perform all updates in a single, batched O(1) database query.
