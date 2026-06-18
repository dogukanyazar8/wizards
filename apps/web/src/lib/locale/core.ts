export const APP_LOCALES = ["en", "tr"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = "en";
export const APP_LOCALE_STORAGE_KEY = "wizards.locale";
export const APP_LOCALE_COOKIE_NAME = "wizards.locale";

export type TranslationValues = Record<string, number | string>;
export type TranslationDictionary = Record<string, string>;

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  if (!value) {
    return DEFAULT_APP_LOCALE;
  }

  const normalized = value.toLowerCase();

  if (normalized.startsWith("tr")) {
    return "tr";
  }

  return "en";
}

export function detectBrowserLocale(): AppLocale {
  if (typeof window === "undefined") {
    return DEFAULT_APP_LOCALE;
  }

  const browserLocale = window.navigator.languages?.[0] ?? window.navigator.language;
  return normalizeAppLocale(browserLocale);
}

export function interpolateMessage(template: string, values?: TranslationValues): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
    const value = values[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}
