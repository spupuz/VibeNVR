## 2025-02-23 - Accessibility Issues
**Learning:** Found several buttons in 'frontend/src/components/StorageProfileManager.jsx' and 'frontend/src/components/CameraScanner.jsx' that only contain icons and no `aria-label`. These include buttons for editing, deleting, or cancelling operations.
**Action:** Always include `aria-label` for icon-only buttons to ensure they are accessible to screen reader users.## 2026-06-15 - Added missing aria-labels to icon-only buttons
**Learning:** Icon-only buttons used across the app (in Sidebar, Layout, Timeline EventPreview, EventCard, BulkActionBar, EventFilters) lack appropriate aria-labels and titles making them inaccessible to screen readers.
**Action:** Added aria-label and title attributes to these elements using the useTranslation `t()` function to ensure screen reader accessibility while maintaining i18n support.
