export interface MobileHapticsPreferenceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export const DEFAULT_MOBILE_HAPTICS_ENABLED = true;
export const MOBILE_HAPTICS_PREFERENCE_KEY = "whispr.mobile.haptics.enabled.v1";

export function shouldPerformMobileHaptic({
  preferenceEnabled,
  reduceMotion,
}: {
  preferenceEnabled: boolean;
  reduceMotion: boolean;
}): boolean {
  return preferenceEnabled && !reduceMotion;
}

export async function loadMobileHapticsPreference(
  storage: MobileHapticsPreferenceStorage,
): Promise<boolean> {
  const stored = await storage.getItemAsync(MOBILE_HAPTICS_PREFERENCE_KEY);
  return stored === "false" ? false : DEFAULT_MOBILE_HAPTICS_ENABLED;
}

export async function saveMobileHapticsPreference(
  storage: MobileHapticsPreferenceStorage,
  enabled: unknown,
): Promise<boolean> {
  const normalized = enabled === false ? false : true;
  await storage.setItemAsync(MOBILE_HAPTICS_PREFERENCE_KEY, String(normalized));
  return normalized;
}
