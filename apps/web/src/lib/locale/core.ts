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

/**
 * Çoğul biçim eki — sözlükte `"<anahtar>_one"` varsa `count === 1` iken o seçilir.
 *
 * Taban anahtar **çoğul** biçimdir; `_one` yalnız bir override'dır. Bu yön mevcut sözlüğün
 * 40+ sayaç anahtarını olduğu gibi bırakır: çoğul çifti yazılmamış bir anahtar `count = 1`de de
 * taban metnini döndürür, yani hiçbir mevcut metin bu mekanizmayla değişmez.
 *
 * Türkçede çoğul eki sayıyla değişmediği için TR tarafında `_one` yazılmaz.
 */
const PLURAL_ONE_SUFFIX = "_one";
const PLURAL_OTHER_SUFFIX = "_other";

/**
 * `key` için okunacak şablonu seçer. Sıra: sayıya uyan çoğul biçim → taban anahtar → anahtarın
 * kendisi (eksik çeviri ekranda görünür kalsın diye).
 */
export function resolveMessageTemplate(
  messages: TranslationDictionary | undefined,
  key: string,
  values?: TranslationValues,
): string {
  if (!messages) {
    return key;
  }

  const count = values?.count;

  if (typeof count === "number") {
    const pluralKey = `${key}${count === 1 ? PLURAL_ONE_SUFFIX : PLURAL_OTHER_SUFFIX}`;
    const pluralTemplate = messages[pluralKey];

    if (pluralTemplate !== undefined) {
      return pluralTemplate;
    }
  }

  return messages[key] ?? key;
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
