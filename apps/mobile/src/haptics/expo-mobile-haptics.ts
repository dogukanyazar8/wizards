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

export const mobileHapticsPreferenceRepository = {
  load: () => loadMobileHapticsPreference(storage),
  save: (enabled: boolean) => saveMobileHapticsPreference(storage, enabled),
};

export const expoMobileHaptics = {
  impact: async () => {
    const Haptics = await import("expo-haptics");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  notification: async (tone: "error" | "success" | "warning") => {
    const Haptics = await import("expo-haptics");
    await Haptics.notificationAsync(
      tone === "success"
        ? Haptics.NotificationFeedbackType.Success
        : tone === "warning"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error,
    );
  },
  selection: async () => {
    const Haptics = await import("expo-haptics");
    await Haptics.selectionAsync();
  },
};
