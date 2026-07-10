import { mobileCopy, type MobileLocale } from "./mobile-copy";

export type { MobileLocale };

export interface MobileLocalePreferenceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export const DEFAULT_MOBILE_LOCALE: MobileLocale = "tr";
export const MOBILE_LOCALE_STORAGE_KEY = "team.whispr.mobile.locale";

export const MOBILE_LOCALE_OPTIONS: ReadonlyArray<{
  id: MobileLocale;
  label: string;
  shortLabel: string;
}> = [
  { id: "tr", label: mobileCopy.tr.settingsLanguageTurkishValue, shortLabel: "TR" },
  { id: "en", label: mobileCopy.en.settingsLanguageEnglishValue, shortLabel: "EN" },
];

let activeMobileLocale: MobileLocale = DEFAULT_MOBILE_LOCALE;

type MobileCopyMessages = typeof mobileCopy.tr;

export const activeMobileCopy = new Proxy({} as MobileCopyMessages, {
  get(_target, property: string | symbol) {
    return (mobileCopy[activeMobileLocale] as Record<PropertyKey, unknown>)[property];
  },
  getOwnPropertyDescriptor(_target, property: string | symbol) {
    const value = (mobileCopy[activeMobileLocale] as Record<PropertyKey, unknown>)[property];

    if (typeof value === "undefined") {
      return undefined;
    }

    return {
      configurable: true,
      enumerable: true,
      value,
    };
  },
  has(_target, property: string | symbol) {
    return property in mobileCopy[activeMobileLocale];
  },
  ownKeys() {
    return Reflect.ownKeys(mobileCopy[activeMobileLocale]);
  },
});

export function getActiveMobileLocale(): MobileLocale {
  return activeMobileLocale;
}

export function getMobileIntlLocale(locale: MobileLocale): "en-US" | "tr-TR" {
  return locale === "en" ? "en-US" : "tr-TR";
}

export function normalizeMobileLocale(value: unknown): MobileLocale {
  return value === "en" || value === "tr" ? value : DEFAULT_MOBILE_LOCALE;
}

export function setActiveMobileLocale(locale: MobileLocale): MobileLocale {
  activeMobileLocale = normalizeMobileLocale(locale);
  return activeMobileLocale;
}

export async function loadMobileLocalePreference(
  storage: MobileLocalePreferenceStorage,
): Promise<MobileLocale> {
  return normalizeMobileLocale(await storage.getItemAsync(MOBILE_LOCALE_STORAGE_KEY));
}

export async function saveMobileLocalePreference(
  storage: MobileLocalePreferenceStorage,
  locale: MobileLocale,
): Promise<void> {
  await storage.setItemAsync(MOBILE_LOCALE_STORAGE_KEY, normalizeMobileLocale(locale));
}
