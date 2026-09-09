import { useFonts } from "expo-font";
import { Text, TextInput } from "react-native";

import { mobileTypography } from "./tokens";

type FontDefaultTarget = {
  defaultProps?: {
    style?: unknown;
  };
};

let defaultsInstalled = false;

/**
 * Uygulamanın yüzleri.
 *
 * `WhisprJakarta_*` ürünün geneli; `WhisprOutfit_*` ve `WhisprFigtree_*` yalnız
 * açılış ekranının tipografisi (SPEC-SPLASH §1). İkincisi Google'dan çekilmez:
 * ikili dosyalar depodaki `apps/web/src/app/fonts/*.woff2` değişken yüzlerinden
 * sabit ağırlıklara indirgenerek üretildi (`fontTools.varLib.instancer`), böylece
 * web ve mobil tek kaynaktan aynı çizimi alıyor ve çalışma anında ağ isteği yok.
 * Kaynak, ağırlık ve SHA-256 karşılıkları `assets/fonts/manifest.json`'da.
 */
export function useMobileFonts(): readonly [boolean, Error | null] {
  return useFonts({
    WhisprFigtree_400Regular: require("../../assets/fonts/Figtree-Regular.ttf"),
    WhisprFigtree_500Medium: require("../../assets/fonts/Figtree-Medium.ttf"),
    WhisprFigtree_600SemiBold: require("../../assets/fonts/Figtree-SemiBold.ttf"),
    WhisprFigtree_700Bold: require("../../assets/fonts/Figtree-Bold.ttf"),
    WhisprJakarta_400Regular: require("../../assets/fonts/PlusJakartaSans-Regular.ttf"),
    WhisprJakarta_500Medium: require("../../assets/fonts/PlusJakartaSans-Medium.ttf"),
    WhisprJakarta_600SemiBold: require("../../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    WhisprJakarta_700Bold: require("../../assets/fonts/PlusJakartaSans-Bold.ttf"),
    WhisprJakarta_800ExtraBold: require("../../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    WhisprOutfit_600SemiBold: require("../../assets/fonts/Outfit-SemiBold.ttf"),
    WhisprOutfit_700Bold: require("../../assets/fonts/Outfit-Bold.ttf"),
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
