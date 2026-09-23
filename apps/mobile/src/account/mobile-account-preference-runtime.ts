import {
  ACCOUNT_PREFERENCES_DEFAULT,
  formatAccountTime,
  getSystemTimeZone,
  type AccountPreferences,
} from "@wizards/types";

interface MobileAccountPreferenceRuntimeConfig {
  readonly locale: string;
  readonly preferences: AccountPreferences;
  readonly systemTimeZone: string;
}

let runtimeConfig: MobileAccountPreferenceRuntimeConfig | null = null;
const densityListeners = new Set<() => void>();

function emitDensityChange(previous: AccountPreferences["interfaceDensity"]): void {
  if (previous !== getMobileAccountRuntimeDensity()) {
    for (const listener of densityListeners) listener();
  }
}

export function configureMobileAccountPreferenceRuntime(
  config: MobileAccountPreferenceRuntimeConfig,
): void {
  const previous = getMobileAccountRuntimeDensity();
  runtimeConfig = config;
  emitDensityChange(previous);
}

export function resetMobileAccountPreferenceRuntime(): void {
  const previous = getMobileAccountRuntimeDensity();
  runtimeConfig = null;
  emitDensityChange(previous);
}

export function getMobileAccountRuntimeDensity(): AccountPreferences["interfaceDensity"] {
  return (
    runtimeConfig?.preferences.interfaceDensity ?? ACCOUNT_PREFERENCES_DEFAULT.interfaceDensity
  );
}

export function subscribeMobileAccountRuntimeDensity(listener: () => void): () => void {
  densityListeners.add(listener);
  return () => densityListeners.delete(listener);
}

function resolvedConfig(fallbackLocale = "tr-TR"): MobileAccountPreferenceRuntimeConfig {
  return (
    runtimeConfig ?? {
      locale: fallbackLocale,
      preferences: ACCOUNT_PREFERENCES_DEFAULT,
      systemTimeZone: getSystemTimeZone(),
    }
  );
}

export function formatMobileAccountRuntimeTime(
  value: Date | number | string,
  fallbackLocale?: string,
): string {
  const config = resolvedConfig(fallbackLocale);
  const formatted = formatAccountTime(value, {
    locale: config.locale,
    systemTimeZone: config.systemTimeZone,
    timeFormat: config.preferences.timeFormat,
    timeZone: config.preferences.timeZone,
  });
  return formatted === "—" ? "" : formatted;
}
