import { darkTheme, lightTheme, type MobileTheme } from "./themes";

export const MOBILE_THEME_PREFERENCE_KEY = "whispr.mobile.theme-preference";

export type MobileThemeMode = "dark" | "light" | "system";
export type MobileResolvedTheme = "dark" | "light";
export type MobileSystemColorScheme = "dark" | "light" | "unspecified" | null | undefined;

export function normalizeMobileThemeMode(value: unknown): MobileThemeMode {
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}

export function resolveMobileTheme(
  mode: MobileThemeMode,
  systemScheme: MobileSystemColorScheme,
): MobileResolvedTheme {
  if (mode !== "system") {
    return mode;
  }

  return systemScheme === "dark" ? "dark" : "light";
}

export function getMobileTheme(
  mode: MobileThemeMode,
  systemScheme: MobileSystemColorScheme,
): MobileTheme {
  return resolveMobileTheme(mode, systemScheme) === "dark" ? darkTheme : lightTheme;
}
