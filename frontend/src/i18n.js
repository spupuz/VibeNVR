import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files statically for simplicity in Vite
import en from './locales/en/translation.json';
import it from './locales/it/translation.json';
import fr from './locales/fr/translation.json';
import de from './locales/de/translation.json';
import es from './locales/es/translation.json';
import ru from './locales/ru/translation.json';
import zh from './locales/zh/translation.json';
import pt from './locales/pt/translation.json';
import ja from './locales/ja/translation.json';

const resources = {
  en: { translation: en },
  it: { translation: it },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  ru: { translation: ru },
  zh: { translation: zh },
  pt: { translation: pt },
  ja: { translation: ja }
};

i18n
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    }
  });

export default i18n;
