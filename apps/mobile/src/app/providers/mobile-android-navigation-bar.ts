export type MobileAndroidNavigationBarStyle = "dark" | "light";

/**
 * Icon style for the Android navigation bar.
 *
 * `expo-navigation-bar` names its `style` after the bar *content*, exactly like
 * `expo-status-bar`: the native module maps `"dark"` to
 * `isAppearanceLightNavigationBars = true`, i.e. dark buttons drawn for a light
 * background. Edge-to-edge SDK 56 removed every API that painted the bar itself,
 * so what sits behind the transparent bar is the app's own root background — the
 * buttons have to contrast with that, which makes this the same decision the
 * status bar already makes.
 */
export function resolveMobileAndroidNavigationBarStyle(theme: {
  readonly systemBars: { readonly statusBar: MobileAndroidNavigationBarStyle };
}): MobileAndroidNavigationBarStyle {
  return theme.systemBars.statusBar;
}
