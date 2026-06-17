## 2025-02-23 - Accessibility Issues
**Learning:** Found several buttons in 'frontend/src/components/StorageProfileManager.jsx' and 'frontend/src/components/CameraScanner.jsx' that only contain icons and no `aria-label`. These include buttons for editing, deleting, or cancelling operations.
**Action:** Always include `aria-label` for icon-only buttons to ensure they are accessible to screen reader users.
## 2025-02-14 - Nested Interactive Elements in Complex UIs
**Learning:** In dense data interfaces like the Timeline (`EventPreview`), icon-only interactive elements (like Close, Download, and Delete buttons) are prone to missing `aria-label` and `title` attributes, making them inaccessible to screen readers and confusing on hover. Because they are often nested within larger interactive containers or fast-moving flex layouts, this omission is easy to overlook.
**Action:** Always verify that icon-only buttons (`<button>`, `<a>`) within overlay cards or timeline components include descriptive `aria-label` and `title` attributes. When possible, leverage existing i18n hooks (e.g., `t('common.<action>')`) to maintain localization consistency for accessibility labels.
