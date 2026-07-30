## 2025-02-27 - Added Focus States for Form Control Icon Buttons
**Learning:** Certain custom icon-only UI elements (like form tooltips and password show/hide buttons) have `focus:outline-none` set without a `focus-visible` fallback, rendering them completely invisible to keyboard-only and screen reader users when navigating.
**Action:** When creating or fixing custom form elements, always ensure `focus:outline-none` is paired with accessible fallbacks like `focus-visible:ring-2 focus-visible:ring-primary rounded-sm` to maintain a visual focus indicator for keyboard navigation.
