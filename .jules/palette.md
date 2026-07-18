## 2026-07-06 - Add semantic dialog roles to custom modals
**Learning:** Custom modal components built with Portals need explicit `role="dialog"`, `aria-modal="true"`, and aria labels (`aria-labelledby`/`aria-describedby`) mapped to their title/description elements to be correctly announced by screen readers when they open.
**Action:** Always ensure custom dialog/modal components include these semantic ARIA attributes.
## 2026-07-13 - [Accessible Labels for Inline Filters and Selects]
**Learning:** Compact inline filter bars and media controls often omit visible text labels (using only icons or placeholder text) to save space. While this visually works, it leaves form elements like `<select>` and `<input>` without accessible names for screen readers, breaking accessibility.
**Action:** Always provide explicitly descriptive `aria-label` attributes to form elements (like selects and inputs) that lack an associated visible `<label>`, ensuring screen readers can correctly announce their purpose.

## 2024-05-22 - Interactive custom timeline elements require explicit keyboard and screen reader support
**Learning:** When building custom interactive elements (like the hour filter `div`s in the timeline) instead of using native `<button>`s, it's critical to add `role="button"`, `tabIndex={0}`, `onKeyDown` listeners for 'Enter'/'Space', and clear `aria-label`s and focus indicators (`focus-visible`). Otherwise, these elements are completely inaccessible to keyboard and screen reader users.
**Action:** Always verify keyboard navigability and semantic ARIA roles for custom clickable UI components, especially in complex interfaces like timelines.
