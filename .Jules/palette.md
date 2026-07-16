## 2026-06-22 - Accessible Custom Form Controls
**Learning:** Custom UI components like toggles or icon-only buttons lack semantic meaning for screen readers by default. Relying solely on visual cues (e.g., icons, custom styling) makes forms inaccessible. Specifically, `role="switch"` combined with `aria-checked` should be used for toggle controls rather than just styling a `div` or generic `button`. Tooltips should use `aria-expanded` and password toggles should use `aria-pressed`.
**Action:** Whenever creating a custom interactive form element, explicitly implement the appropriate ARIA roles (`role="switch"`, etc.) and states (`aria-checked`, `aria-expanded`, `aria-pressed`, `aria-label`) to maintain parity with native HTML elements.
## 2024-06-27 - [Add ARIA labels to icon-only buttons]
**Learning:** When making UX accessibility improvements, avoid the anti-pattern of adding an `aria-label` that is exactly identical to the visible text content of an interactive element (e.g., a button), as screen readers natively announce text content, and duplicate labels cause redundant announcements. However, for buttons that only have an icon, or text that might be hidden or visually truncated, `aria-label`s are still necessary.
**Action:** Add `aria-label` attributes to icon-only buttons for better screen reader accessibility.
## 2025-03-02 - Ensure Proper Label Linking
**Learning:** React forms using custom components often fail to properly link labels to inputs, which impacts screen reader users. Using unlinked `span` elements for labels breaks semantic meaning.
**Action:** Always wrap label text in `<label htmlFor={id}>` and apply the matching `id` to the target input element (e.g. using React's `useId()` hook).
