## 2026-07-16 - Custom Interactive Elements Need Explicit Accessibility

**Learning:** When turning standard semantic divs (like timeline event cards or selection boxes) into clickable interactive elements using `onClick`, native accessibility features are lost. Keyboard users cannot focus on them or activate them with Enter/Space, and screen readers do not announce them as buttons or checkboxes.
**Action:** When adding interactivity to non-native UI elements, always explicitly define `role`, `tabIndex`, add `onKeyDown` handlers for Enter/Space key triggers, and ensure proper `focus-visible` styling is included for keyboard navigation.
