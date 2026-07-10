import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { useTheme } from "./mobile-theme-provider";

export function MobileThemeSystemSurfaces() {
  const theme = useTheme();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.surface.base).catch(() => undefined);
  }, [theme]);

  return (
    <>
      <StatusBar animated style={theme.systemBars.statusBar} />
      <NavigationBar style={theme.dark ? "dark" : "light"} />
    </>
  );
}
