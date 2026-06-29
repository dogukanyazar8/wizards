import * as SecureStore from "expo-secure-store";
import {
  createMobileSessionRepository,
  type MobileSecureKeyValueStorage,
} from "./session-store";

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "team.whispr.mobile.session",
  requireAuthentication: false,
};

const expoSecureStoreAdapter: MobileSecureKeyValueStorage = {
  async deleteItemAsync(key) {
    await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
  },
  async getItemAsync(key) {
    return SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  },
  async setItemAsync(key, value) {
    await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
  },
};

export const mobileSecureSessionRepository =
  createMobileSessionRepository(expoSecureStoreAdapter);
