## 2025-02-14 - Contextual ARIA labels in repeated components
**Learning:** When improving accessibility for buttons inside repeated UI components (e.g., mapped cards or lists), using a static generic `aria-label` like "Delete camera" causes screen readers to repeat generic text without distinguishing the item.
**Action:** Dynamically include the item's specific context or name in the `aria-label` (e.g., `aria-label={t('...', { name: item.name })}`) to provide specific context for each button.
