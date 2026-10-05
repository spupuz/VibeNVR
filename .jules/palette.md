## 2025-02-16 - Add missing aria-label to custom checkboxes
**Learning:** Custom interactive elements (like `div`s with `role="checkbox"`) used as list items or categories need an explicit `aria-label` to provide accessible names for assistive technologies, as their text content might not always be perfectly associated with the checkbox state by screen readers.
**Action:** When implementing custom checkboxes using generic tags like `div`, explicitly bind the textual label to the `aria-label` attribute (e.g. `aria-label={cat.label}`).
