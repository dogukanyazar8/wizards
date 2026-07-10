import type { MobileSecureKeyValueStorage } from "./session-store";

export const MOBILE_APP_LOCK_PREFERENCE_KEY = "whispr.mobile.app-lock.enabled.v1";

/**
 * Persistent opt-in preference for the biometric app lock.
 *
 * Unlike the MB-07 device-integrity dismissal (session-only), this preference is
 * a durable user choice stored in SecureStore and must survive app restarts.
 */
export interface MobileAppLockPreferenceStore {
  load(): Promise<boolean>;
  save(enabled: boolean): Promise<void>;
}

interface MobileAppLockPreferenceStoreOptions {
  storageKey?: string;
}

export function createMobileAppLockPreferenceStore(
  storage: MobileSecureKeyValueStorage,
  options: MobileAppLockPreferenceStoreOptions = {},
): MobileAppLockPreferenceStore {
  const storageKey = options.storageKey ?? MOBILE_APP_LOCK_PREFERENCE_KEY;

  return {
    async load() {
      try {
        return (await storage.getItemAsync(storageKey)) === "true";
      } catch {
        // Fail safe: an unreadable preference defaults to OFF (no lock).
        return false;
      }
    },

    async save(enabled) {
      await storage.setItemAsync(storageKey, enabled ? "true" : "false");
    },
  };
}
