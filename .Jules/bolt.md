
## 2025-06-16 - Prevent unnecessary react render cycles in grids
**Learning:** React grids (especially with Sortable/Drag and Drop components like `SortableCameraCard` wrapping `CameraCard`) can suffer from massive re-render storms if the parent updates its state (e.g. tracking drag positions) but child components are not memoized.
**Action:** When a parent lists many complex children, wrap the individual child components and any HOC wrappers (like Sortable wrappers) with `React.memo` to prevent O(n) re-renders when a single item is interacted with.
