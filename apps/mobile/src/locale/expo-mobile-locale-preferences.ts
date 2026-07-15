import * as SecureStore from "expo-secure-store";
import {
  loadMobileLocalePreference,
  saveMobileLocalePreference,
  type MobileLocalePreference,
  type MobileLocalePreferenceStorage,
} from "./mobile-locale-preferences";

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "team.whispr.mobile.preferences",
  requireAuthentication: false,
};

const expoMobileLocalePreferenceStorage: MobileLocalePreferenceStorage = {
  async getItemAsync(key) {
    return SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  },
  async setItemAsync(key, value) {
    await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
  },
};

export const mobileLocalePreferenceRepository = {
  load() {
    return loadMobileLocalePreference(expoMobileLocalePreferenceStorage);
  },
  save(preference: MobileLocalePreference) {
    return saveMobileLocalePreference(expoMobileLocalePreferenceStorage, preference);
  },
};
