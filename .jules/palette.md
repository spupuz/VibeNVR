## 2026-07-06 - Add semantic dialog roles to custom modals
**Learning:** Custom modal components built with Portals need explicit `role="dialog"`, `aria-modal="true"`, and aria labels (`aria-labelledby`/`aria-describedby`) mapped to their title/description elements to be correctly announced by screen readers when they open.
**Action:** Always ensure custom dialog/modal components include these semantic ARIA attributes.
## 2026-07-13 - [Accessible Labels for Inline Filters and Selects]
**Learning:** Compact inline filter bars and media controls often omit visible text labels (using only icons or placeholder text) to save space. While this visually works, it leaves form elements like `<select>` and `<input>` without accessible names for screen readers, breaking accessibility.
**Action:** Always provide explicitly descriptive `aria-label` attributes to form elements (like selects and inputs) that lack an associated visible `<label>`, ensuring screen readers can correctly announce their purpose.
