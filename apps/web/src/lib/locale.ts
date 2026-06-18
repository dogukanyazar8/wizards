import {
  interpolateMessage,
  type AppLocale,
  type TranslationDictionary,
  type TranslationValues,
} from "@/lib/locale/core";
import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

export {
  APP_LOCALE_COOKIE_NAME,
  APP_LOCALE_STORAGE_KEY,
  APP_LOCALES,
  DEFAULT_APP_LOCALE,
  detectBrowserLocale,
  interpolateMessage,
  normalizeAppLocale,
  type AppLocale,
  type TranslationDictionary,
  type TranslationValues,
} from "@/lib/locale/core";

export const APP_MESSAGES: Record<AppLocale, TranslationDictionary> = {
  en: EN_MESSAGES,
  tr: TR_MESSAGES,
};

export function getMessagesForLocale(locale: AppLocale): TranslationDictionary {
  return APP_MESSAGES[locale] ?? APP_MESSAGES.en;
}

export function translate(locale: AppLocale, key: string, values?: TranslationValues): string {
  const template = APP_MESSAGES[locale][key] ?? APP_MESSAGES.en[key] ?? key;
  return interpolateMessage(template, values);
}

export function getMessage(locale: AppLocale, key: string): string | undefined {
  return APP_MESSAGES[locale][key] ?? APP_MESSAGES.en[key];
}
