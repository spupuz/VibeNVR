## 2024-03-24 - Dynamic ARIA labels for repeated components
**Learning:** For repeated UI components like lists of cards, generic ARIA labels (e.g., "Edit camera") cause screen readers to repeat identical text, creating confusion. Adding dynamic context (e.g., "Edit camera: Front Door") significantly improves accessibility and clarity.
**Action:** Always interpolate item-specific context (like names or IDs) into `aria-label` and `title` attributes for buttons inside mapped lists or cards, using `t('key', { defaultValue: '...', name: item.name })`.
