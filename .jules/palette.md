## 2024-05-24 - Context-Specific Accessibility for Repeated Actions
**Learning:** In list and mapped card views, generic screen reader text like "Select Group" repeated multiple times becomes unhelpful and noisy. Dynamic interpolation is required to map actions to their specific contexts.
**Action:** Always inject specific item names or contexts (e.g., `t('key', { name: groupName })`) into `aria-label` attributes for buttons within mapped arrays or iterative components.
