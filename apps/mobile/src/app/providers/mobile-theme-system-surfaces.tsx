import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { resolveMobileAndroidNavigationBarStyle } from "./mobile-android-navigation-bar";
import { useTheme } from "./mobile-theme-provider";

export function MobileThemeSystemSurfaces() {
  const theme = useTheme();
  const navigationBarColor = theme.systemBars.androidNavigationBar;

  useEffect(() => {
    // Edge-to-edge SDK 56 draws the navigation bar transparent — the config plugin
    // turns the system contrast scrim off — so the root view background is what
    // shows through it. Painting that background with the navigation-bar token is
    // the only non-deprecated way left to theme the bar.
    void SystemUI.setBackgroundColorAsync(navigationBarColor).catch(() => undefined);
  }, [navigationBarColor]);

  return (
    <>
      <StatusBar animated style={theme.systemBars.statusBar} />
      <NavigationBar style={resolveMobileAndroidNavigationBarStyle(theme)} />
    </>
  );
}
