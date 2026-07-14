import { useFonts } from "expo-font";
import { Text, TextInput } from "react-native";

import { mobileTypography } from "./tokens";

type FontDefaultTarget = {
  defaultProps?: {
    style?: unknown;
  };
};

let defaultsInstalled = false;

export function useMobileFonts(): readonly [boolean, Error | null] {
  return useFonts({
    WhisprJakarta_400Regular: require("../../assets/fonts/PlusJakartaSans-Regular.ttf"),
    WhisprJakarta_500Medium: require("../../assets/fonts/PlusJakartaSans-Medium.ttf"),
    WhisprJakarta_600SemiBold: require("../../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    WhisprJakarta_700Bold: require("../../assets/fonts/PlusJakartaSans-Bold.ttf"),
    WhisprJakarta_800ExtraBold: require("../../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
  });
}

export function installMobileFontDefaults() {
  if (defaultsInstalled) {
    return;
  }

  const defaultStyle = { fontFamily: mobileTypography.fontFamily };

  for (const Component of [Text, TextInput]) {
    const target = Component as FontDefaultTarget;
    target.defaultProps = target.defaultProps ?? {};
    target.defaultProps.style = [defaultStyle, target.defaultProps.style].filter(Boolean);
  }

  defaultsInstalled = true;
}
