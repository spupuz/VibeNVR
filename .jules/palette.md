## 2024-10-04 - Improve GroupsManager Button Accessibility
**Learning:** React buttons inside maps or forms that act as toggles or generic actions should explicitly set `type="button"`, and non-descriptive icon-only or generic-text buttons (like "All", "None") benefit significantly from context-specific `aria-label`s for screen readers (e.g. "Select all categories").
**Action:** Always add explicit `type="button"` to non-submit buttons in React to prevent form submission issues, and provide clear `aria-label`s when the visible text lacks sufficient context.
