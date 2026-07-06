import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts,
} from "@expo-google-fonts/outfit";
import { Text, TextInput } from "react-native";

import { mobileTypography } from "./tokens";

type FontDefaultTarget = {
  defaultProps?: {
    style?: unknown;
  };
};

let defaultsInstalled = false;

export function useOutfitFonts(): readonly [boolean, Error | null] {
  return useFonts({
    Outfit: Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
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
