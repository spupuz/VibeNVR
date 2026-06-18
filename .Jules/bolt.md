## 2024-06-18 - [React Re-Renders in Timeline]
**Learning:** `Timeline.jsx` lists all events using `EventCard` components. When the selection state changes (e.g. clicking on an event or hovering over an element), the entire timeline re-renders if components aren't memoized. Using `React.memo` on `EventCard` is a significant performance boost in lists.
**Action:** Wrap `EventCard` in `React.memo` and provide a custom comparison function if necessary to prevent unnecessary re-renders of the entire event list when a single event is selected.
