## 2026-07-06 - Add semantic dialog roles to custom modals
**Learning:** Custom modal components built with Portals need explicit `role="dialog"`, `aria-modal="true"`, and aria labels (`aria-labelledby`/`aria-describedby`) mapped to their title/description elements to be correctly announced by screen readers when they open.
**Action:** Always ensure custom dialog/modal components include these semantic ARIA attributes.
