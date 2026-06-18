## 2025-02-23 - Accessibility Issues
**Learning:** Found several buttons in 'frontend/src/components/StorageProfileManager.jsx' and 'frontend/src/components/CameraScanner.jsx' that only contain icons and no `aria-label`. These include buttons for editing, deleting, or cancelling operations.
**Action:** Always include `aria-label` for icon-only buttons to ensure they are accessible to screen reader users.
## 2025-02-23 - Layout Components Missing ARIA Labels
**Learning:** Discovered icon-only buttons (like menu toggles and close buttons) and icon-only links (GitHub, Buy Me a Coffee) in global layout components (`Sidebar.jsx`, `Layout.jsx`) lacking `aria-label`s. Additionally, any added `aria-label` or `title` in these global components must be wrapped in `t()` for proper internationalization support.
**Action:** Always add translated `aria-label` attributes to icon-only buttons and links in global layouts to guarantee screen reader accessibility across all languages.
