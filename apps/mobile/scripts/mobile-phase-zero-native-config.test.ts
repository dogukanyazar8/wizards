import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};

test("phase zero dependencies and SDK 56 native configuration stay aligned", () => {
  for (const dependency of [
    "@react-navigation/native",
    "@react-navigation/native-stack",
    "@react-navigation/bottom-tabs",
    "@tanstack/react-query",
    "zustand",
    "react-native-screens",
    "react-native-gesture-handler",
    "react-native-reanimated",
    "react-native-worklets",
    "@shopify/flash-list",
    "expo-image",
  ]) {
    assert.ok(packageJson.dependencies[dependency], `Missing ${dependency}`);
  }

  const appConfig = readFileSync(join(root, "app.config.js"), "utf8");
  const appSource = readFileSync(join(root, "App.tsx"), "utf8");
  const babelSource = readFileSync(join(root, "babel.config.js"), "utf8");
  const activityPath = join(
    root,
    "android",
    "app",
    "src",
    "main",
    "java",
    "team",
    "whispr",
    "mobile",
    "MainActivity.kt",
  );
  const manifestPath = join(root, "android", "app", "src", "main", "AndroidManifest.xml");

  assert.match(appConfig, /["']expo-image["']/);
  assert.match(appConfig, /predictiveBackGestureEnabled:\s*true/);
  assert.match(appSource, /GestureHandlerRootView/);
  assert.doesNotMatch(babelSource, /react-native-(reanimated|worklets)\/plugin/);

  if (existsSync(activityPath)) {
    const activitySource = readFileSync(activityPath, "utf8");
    assert.match(activitySource, /super\.onCreate\(null\)/);
    assert.doesNotMatch(activitySource, /RNScreensFragmentFactory/);
  }
  if (existsSync(manifestPath)) {
    const manifestSource = readFileSync(manifestPath, "utf8");
    assert.match(manifestSource, /android:enableOnBackInvokedCallback="true"/);
  }
});
