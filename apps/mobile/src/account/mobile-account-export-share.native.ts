import { Platform, Share } from "react-native";

import { shareMobileAccountExport } from "./mobile-account-export-share";

export function shareMobileAccountExportFile(fileUri: string): Promise<void> {
  return shareMobileAccountExport(fileUri, {
    getContentUri: async (uri) => {
      const fileSystem =
        require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
      return fileSystem.getContentUriAsync(uri);
    },
    platform: Platform.OS === "android" ? "android" : "ios",
    shareIos: async (uri) => {
      await Share.share({ url: uri });
    },
    startAndroidActivity: async (action, params) => {
      const intentLauncher =
        require("expo-intent-launcher") as typeof import("expo-intent-launcher");
      await intentLauncher.startActivityAsync(action, params);
    },
  });
}
