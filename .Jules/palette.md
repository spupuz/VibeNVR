## 2024-06-12 - Added ARIA labels to Timeline Event Preview and Card
**Learning:** Icon-only buttons without `aria-label` or `title` attributes are prevalent, specifically missing translations and accessibility hints. Found missing localizations in `EventCard.jsx` which required adding `useTranslation` hook.
**Action:** When working on components featuring unlabelled buttons/links, especially those that only render an icon, remember to use the `useTranslation` hook to provide a localized accessible name (`aria-label`) and tooltip (`title`).
