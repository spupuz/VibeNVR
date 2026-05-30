# Localization (i18n)

VibeNVR supports multiple languages natively through `react-i18next`. All user-facing strings in the React frontend are wrapped in the `t()` hook and mapped to localized JSON dictionaries.

## Supported Languages
Currently, VibeNVR ships with 10 supported languages:
- English (EN) - Default
- Italian (IT)
- French (FR)
- German (DE)
- Spanish (ES)
- Portuguese (PT)
- Russian (RU)
- Chinese (ZH)
- Japanese (JA)
- Ukrainian (UK)

## For Developers: Adding New Strings
When building new React components, **never** hardcode English text directly into the JSX. Always use the `t()` translation hook:

```javascript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  // Good ✅
  return <h1>{t('mycomponent.title', 'My Awesome Component')}</h1>;
  
  // Bad ❌
  // return <h1>My Awesome Component</h1>;
}
```

The second argument acts as the English fallback. This ensures the codebase remains readable even without looking at the JSON dictionaries.

## Automated Translation Tools
To avoid manually maintaining 10 different language JSON files, VibeNVR provides two Python scripts located in `frontend/scripts/`.

### 1. `update_locales.py`
This script scans all `.jsx` and `.js` files in the `src/` directory, extracts every string wrapped in `t('key', 'Default Value')`, and builds a comprehensive `en/translation.json` file. It automatically merges new keys, updates changed fallbacks, and cleans up orphaned keys.

```bash
cd frontend
python3 scripts/update_locales.py
```

### 2. `auto_translate.py`
Once the English dictionary is up-to-date, this script uses Google Translate's API to automatically translate all missing strings across the other 9 language dictionaries. It includes intelligent skipping for technical terms (e.g., "WebCodecs", "ONVIF Edge") and system badges (e.g., "ENABLED").

```bash
cd frontend
python3 scripts/auto_translate.py
```

Both scripts run natively in the background and use batching to prevent API rate limits.

## Manual Overrides
Machine translations might occasionally lack context (e.g., translating "Dashboard" as a literal instrument panel). You can manually edit any value in the respective `frontend/src/locales/{lang}/translation.json` file. The `auto_translate.py` script will respect your manual edits and will only translate keys that are completely missing or exactly match the English string.

## User Preference Persistence
When a user selects a language from the Login page or their Profile settings, the selection is synchronized with the backend. 
- If the user is authenticated, a `PATCH /api/auth/me/language` request immediately updates the preference in the database.
- If the user selects a language on the Login page *before* authenticating, the choice is temporarily stored in `sessionStorage` and automatically synced to their profile upon a successful login.

This architecture ensures a seamless and consistent localized experience across all devices.
