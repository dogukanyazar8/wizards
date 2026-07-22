import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { resolveMobileAndroidNavigationBarStyle } from "../src/app/providers/mobile-android-navigation-bar";
import { darkTheme, lightTheme } from "../src/design/themes";

type BuildExpoConfig = (context: { config: Record<string, unknown> }) => {
  plugins?: unknown[];
};

const require = createRequire(import.meta.url);
const buildExpoConfig = require("../app.config.js") as BuildExpoConfig;

test("navigation bar buttons contrast with the theme drawn behind the transparent bar", () => {
  // expo-navigation-bar names `style` after the bar content: "dark" asks for dark
  // buttons on a light background, which is what the light theme paints.
  assert.equal(resolveMobileAndroidNavigationBarStyle(lightTheme), "dark");
  assert.equal(resolveMobileAndroidNavigationBarStyle(darkTheme), "light");
});

test("the navigation bar token matches the root background the app actually paints", () => {
  // Edge-to-edge SDK 56 has no API left to colour the bar, so the token is only
  // honoured through the root view background behind the transparent bar.
  assert.equal(lightTheme.systemBars.androidNavigationBar, lightTheme.surface.base);
  assert.equal(darkTheme.systemBars.androidNavigationBar, darkTheme.surface.base);
});

test("the Android contrast scrim is disabled so the theme reaches the navigation bar", () => {
  const plugins = buildExpoConfig({ config: {} }).plugins ?? [];
  const navigationBarPlugin = plugins.find(
    (plugin): plugin is [string, { enforceContrast?: boolean }] =>
      Array.isArray(plugin) && plugin[0] === "expo-navigation-bar",
  );

  assert.ok(navigationBarPlugin, "expo-navigation-bar plugin is not configured");
  assert.equal(navigationBarPlugin[1].enforceContrast, false);
});
