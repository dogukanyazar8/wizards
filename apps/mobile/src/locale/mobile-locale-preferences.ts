import { mobileCopy, type MobileLocale } from "./mobile-copy";

export type { MobileLocale };

export interface MobileLocalePreferenceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface MobileLocaleOption {
  readonly code: string;
  readonly direction: "ltr" | "rtl";
  readonly id: MobileLocale;
  readonly label: string;
  readonly nativeName: string;
  readonly shortLabel: string;
  readonly turkishName: string;
}

export type MobileLocalePreference =
  | { readonly locale: MobileLocale; readonly mode: "manual" }
  | { readonly manualLocale: MobileLocale; readonly mode: "device" };

export const DEFAULT_MOBILE_LOCALE: MobileLocale = "tr";
export const MOBILE_LOCALE_STORAGE_KEY = "team.whispr.mobile.locale";

export const MOBILE_LOCALE_OPTIONS = [
  {
    code: "EN",
    direction: "ltr",
    id: "en",
    label: mobileCopy.en.settingsLanguageEnglishValue,
    nativeName: "English",
    shortLabel: "EN",
    turkishName: mobileCopy.tr.settingsLanguageEnglishValue,
  },
  {
    code: "TR",
    direction: "ltr",
    id: "tr",
    label: mobileCopy.tr.settingsLanguageTurkishValue,
    nativeName: "Türkçe",
    shortLabel: "TR",
    turkishName: mobileCopy.tr.settingsLanguageTurkishValue,
  },
] as const satisfies ReadonlyArray<MobileLocaleOption>;

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

function isMobileLocale(value: unknown): value is MobileLocale {
  return value === "en" || value === "tr";
}

export function normalizeMobileLocale(value: unknown): MobileLocale {
  return isMobileLocale(value) ? value : DEFAULT_MOBILE_LOCALE;
}

export function normalizeMobileLocalePreference(value: unknown): MobileLocalePreference {
  if (value === "device") {
    return { manualLocale: DEFAULT_MOBILE_LOCALE, mode: "device" };
  }

  if (typeof value === "string" && value.startsWith("device:")) {
    return { manualLocale: normalizeMobileLocale(value.slice("device:".length)), mode: "device" };
  }

  return { locale: normalizeMobileLocale(value), mode: "manual" };
}

export function resolveMobileLocaleFromDeviceLocales(
  locales: readonly { readonly languageCode: string | null }[],
): MobileLocale {
  const supportedLocale = locales
    .map((locale) => locale.languageCode?.toLowerCase())
    .find((locale): locale is MobileLocale => isMobileLocale(locale));

  return supportedLocale ?? DEFAULT_MOBILE_LOCALE;
}

export function setActiveMobileLocale(locale: MobileLocale): MobileLocale {
  activeMobileLocale = normalizeMobileLocale(locale);
  return activeMobileLocale;
}

export async function loadMobileLocalePreference(
  storage: MobileLocalePreferenceStorage,
): Promise<MobileLocalePreference> {
  return normalizeMobileLocalePreference(await storage.getItemAsync(MOBILE_LOCALE_STORAGE_KEY));
}

export async function saveMobileLocalePreference(
  storage: MobileLocalePreferenceStorage,
  preference: MobileLocalePreference,
): Promise<void> {
  const value =
    preference.mode === "device"
      ? `device:${normalizeMobileLocale(preference.manualLocale)}`
      : normalizeMobileLocale(preference.locale);
  await storage.setItemAsync(MOBILE_LOCALE_STORAGE_KEY, value);
}
