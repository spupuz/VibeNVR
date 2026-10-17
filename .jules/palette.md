## 2024-10-04 - Improve GroupsManager Button Accessibility
**Learning:** React buttons inside maps or forms that act as toggles or generic actions should explicitly set `type="button"`, and non-descriptive icon-only or generic-text buttons (like "All", "None") benefit significantly from context-specific `aria-label`s for screen readers (e.g. "Select all categories").
**Action:** Always add explicit `type="button"` to non-submit buttons in React to prevent form submission issues, and provide clear `aria-label`s when the visible text lacks sufficient context.

## 2025-02-14 - Contextual ARIA labels in repeated components
**Learning:** When improving accessibility for buttons inside repeated UI components (e.g., mapped cards or lists), using a static generic `aria-label` like "Delete camera" causes screen readers to repeat generic text without distinguishing the item.
**Action:** Dynamically include the item's specific context or name in the `aria-label` (e.g., `aria-label={t('...', { name: item.name })}`) to provide specific context for each button.

## 2025-02-16 - Add missing aria-label to custom checkboxes
**Learning:** Custom interactive elements (like `div`s with `role="checkbox"`) used as list items or categories need an explicit `aria-label` to provide accessible names for assistive technologies, as their text content might not always be perfectly associated with the checkbox state by screen readers.
**Action:** When implementing custom checkboxes using generic tags like `div`, explicitly bind the textual label to the `aria-label` attribute (e.g. `aria-label={cat.label}`).
## 2026-10-16 - Add ARIA label to site selector
**Learning:** Added aria-label to the site selector select element in the Sidebar to improve screen reader accessibility.
**Action:** Always add ARIA labels to form elements like select to provide context for screen readers.

## 2025-02-18 - Add contextual aria-labels to custom checkboxes
**Learning:** Custom interactive elements (like `div`s with `role="checkbox"`) that represent dynamic items in a list (e.g. "Select event", "Select group") should use a contextual `aria-label` (e.g. "Select event at 12:34 PM"). A generic, static label causes screen readers to repeat identical text for every item on the page.
**Action:** When creating custom form controls (like `div role="checkbox"`) inside a repeated component like a list or card grid, always dynamically interpolate a unique identifier (like the item name or time) into the `aria-label` attribute via translation functions.
