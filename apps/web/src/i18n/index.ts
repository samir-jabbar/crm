import { LANGUAGES, type Language } from '@hanjing/shared';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from '@/locales/ar/common.json';
import en from '@/locales/en/common.json';
import fr from '@/locales/fr/common.json';

const STORAGE_KEY = 'hj.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Before sign-in: remembered choice → browser language → English. After sign-in the account's language wins. */
function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* storage unavailable (private mode) */
  }
  const browser = typeof navigator !== 'undefined' ? navigator.languages : [];
  for (const tag of browser ?? []) {
    const base = tag.slice(0, 2).toLowerCase();
    if (isLanguage(base)) return base;
  }
  return 'en';
}

function applyToDocument(lng: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lng;
  document.documentElement.dir = i18next.dir(lng);
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { common: en },
    fr: { common: fr },
    ar: { common: ar },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  ns: ['common'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  initAsync: false,
});

i18next.on('languageChanged', (lng) => {
  applyToDocument(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
});
applyToDocument(i18next.language);

export default i18next;
