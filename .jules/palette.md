## 2024-10-01 - Accessible drag handle in SortableCameraCard
**Learning:** Custom interactive elements like drag handles often lack proper accessibility attributes (e.g. ARIA labels and roles) making them unusable or invisible to screen readers, especially in complex repeated components like mapped camera cards.
**Action:** When implementing custom interactive elements like drag handles using generic tags (e.g., `<div>`), always include `role="button"` and an appropriate `aria-label` to ensure screen reader accessibility.
