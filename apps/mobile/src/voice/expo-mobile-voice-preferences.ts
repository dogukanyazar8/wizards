import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadMobileVoiceInputModePreference,
  saveMobileVoiceInputModePreference,
  type MobileVoiceInputMode,
  type MobileVoiceInputModePreferenceStorage,
} from "./mobile-voice-ptt-contract";

const expoMobileVoicePreferenceStorage: MobileVoiceInputModePreferenceStorage = {
  async getItemAsync(key) {
    return AsyncStorage.getItem(key);
  },
  async setItemAsync(key, value) {
    await AsyncStorage.setItem(key, value);
  },
};

export const mobileVoicePreferenceRepository = {
  loadInputMode() {
    return loadMobileVoiceInputModePreference(expoMobileVoicePreferenceStorage);
  },
  saveInputMode(mode: MobileVoiceInputMode) {
    return saveMobileVoiceInputModePreference(expoMobileVoicePreferenceStorage, mode);
  },
};
