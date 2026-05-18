import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import pl from './locales/pl.json';

export const defaultNS = 'translation';
export const resources = {
  en: { translation: en },
  pl: { translation: pl },
} as const;

const getDeviceLanguage = () => {
  const locales = Localization.getLocales();
  if (locales && locales.length > 0) {
    const languageTag = locales[0].languageTag;
    if (languageTag.startsWith('pl')) return 'pl';
    return 'en';
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

export default i18n;
