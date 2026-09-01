---
name: update-translations
description: Extracts new i18n keys and automatically translates them across all languages.
---

# Update Translations Workflow

This workflow automates the extraction and translation of i18n keys for the VibeNVR frontend.

## 1. Extract Translation Keys
Run the script to parse all `.jsx` files in `frontend/src/` and extract new `t()` keys, appending them to the English dictionary (`frontend/src/locales/en/translation.json`).

```bash
cd frontend
python3 scripts/extract_t.py
```

## 2. Auto-Translate
Run the auto-translation script which reads the English base dictionary and generates translations for all other supported languages using Google Translate. 

```bash
cd frontend
python3 scripts/auto_translate.py
```

## 3. Verify and Commit
Ensure that no errors were generated during the execution, and that the `.json` files in `frontend/src/locales/` were updated successfully.

```bash
git status
```
