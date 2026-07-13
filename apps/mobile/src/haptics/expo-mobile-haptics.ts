import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  loadMobileHapticsPreference,
  saveMobileHapticsPreference,
  type MobileHapticsPreferenceStorage,
} from "./mobile-haptics-contract";

const storage: MobileHapticsPreferenceStorage = {
  getItemAsync: (key) => AsyncStorage.getItem(key),
  setItemAsync: async (key, value) => {
    await AsyncStorage.setItem(key, value);
  },
};

function getExpoHapticsModule(): typeof import("expo-haptics") {
  return require("expo-haptics") as typeof import("expo-haptics");
}

export const mobileHapticsPreferenceRepository = {
  load: () => loadMobileHapticsPreference(storage),
  save: (enabled: boolean) => saveMobileHapticsPreference(storage, enabled),
};

export const expoMobileHaptics = {
  impact: async () => {
    const Haptics = getExpoHapticsModule();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  notification: async (tone: "error" | "success" | "warning") => {
    const Haptics = getExpoHapticsModule();
    await Haptics.notificationAsync(
      tone === "success"
        ? Haptics.NotificationFeedbackType.Success
        : tone === "warning"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error,
    );
  },
  selection: async () => {
    const Haptics = getExpoHapticsModule();
    await Haptics.selectionAsync();
  },
};
