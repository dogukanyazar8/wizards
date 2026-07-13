import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadMobileVoiceInputModePreference,
  saveMobileVoiceInputModePreference,
  type MobileVoiceInputMode,
  type MobileVoiceInputModePreferenceStorage,
} from "./mobile-voice-ptt-contract";
import {
  loadMobileVoiceDevicePreferences,
  saveMobileVoiceDevicePreferences,
  type MobileVoiceDevicePreferences,
  type MobileVoicePreferenceStorage,
} from "./mobile-voice-device-contract";

const expoMobileVoicePreferenceStorage: MobileVoiceInputModePreferenceStorage &
  MobileVoicePreferenceStorage = {
  async getItemAsync(key) {
    return AsyncStorage.getItem(key);
  },
  async setItemAsync(key, value) {
    await AsyncStorage.setItem(key, value);
  },
};

export const mobileVoicePreferenceRepository = {
  loadDevicePreferences() {
    return loadMobileVoiceDevicePreferences(expoMobileVoicePreferenceStorage);
  },
  loadInputMode() {
    return loadMobileVoiceInputModePreference(expoMobileVoicePreferenceStorage);
  },
  saveInputMode(mode: MobileVoiceInputMode) {
    return saveMobileVoiceInputModePreference(expoMobileVoicePreferenceStorage, mode);
  },
  saveDevicePreferences(preferences: MobileVoiceDevicePreferences) {
    return saveMobileVoiceDevicePreferences(expoMobileVoicePreferenceStorage, preferences);
  },
};
