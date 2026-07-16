import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
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

test("build-only Android APK scripts do not require or mutate a connected device", () => {
  for (const [name, script] of Object.entries(packageJson.scripts).filter(([name]) =>
    name.startsWith("android:uat:local:apk"),
  )) {
    assert.match(script, /-SkipInstall\b/, `${name} must skip device installation.`);
    assert.match(script, /-SkipUninstall\b/, `${name} must skip device uninstallation.`);
    assert.match(
      script,
      /-AndroidArchitectures\s+\S+/,
      `${name} must select architectures without querying a device.`,
    );
  }

  const buildScript = readFileSync(join(root, "scripts", "build-android-uat.ps1"), "utf8");
  assert.match(
    buildScript,
    /\$requiresConnectedDevice\s*=\s*-not \(\$SkipInstall -and \$SkipUninstall\)/,
  );
  assert.match(buildScript, /"react-native-reanimated"/);
  assert.match(buildScript, /Join-Path \$androidDir "\.cxx"/);
  assert.match(
    buildScript,
    /\[string\]\$BuildHome\s*=\s*"C:\\wm"/,
  );
  assert.match(
    buildScript,
    /\[string\]\$ManagedBuildRoot\s*=\s*"C:\\whispr_dev\\whispr_uat\\whispr_mobile"/,
  );
  assert.match(buildScript, /function Initialize-WhisprUatBuildHome/);
  assert.match(buildScript, /function Ensure-WhisprUatManagedRootLink/);
  assert.match(buildScript, /New-Item -ItemType Junction/);
  assert.match(buildScript, /ManagedBuildRoot must use the same drive as BuildHome/);
  assert.match(buildScript, /-not \(Test-Path -LiteralPath \$managedRootParent\)/);
  assert.match(buildScript, /function Invoke-PnpmInstallWithRecovery/);
  assert.match(buildScript, /function Get-WhisprUatPnpmVirtualStoreDir/);
  assert.match(buildScript, /function Test-WhisprUatPnpmLayout/);
  assert.match(buildScript, /Managed pnpm layout is stale or incomplete/);
  assert.match(buildScript, /Test-WhisprUatPnpmLayout -WorkingDirectory \$WorkingDirectory -ExpectedVirtualStoreDir \$PhysicalVirtualStoreDir/);
  assert.match(buildScript, /apps\\mobile\\node_modules\\tsx/);
  assert.match(buildScript, /Join-Path \$tsxTarget "package\.json"/);
  assert.match(buildScript, /function Use-WhisprMobileUatBuildMutex/);
  assert.match(buildScript, /"store-dir"\s*=\s*\$StoreDir/);
  assert.match(buildScript, /\[int\]\$PnpmVirtualStoreMaxLength\s*=\s*40/);
  assert.match(buildScript, /"virtual-store-dir-max-length"\s*=\s*\$VirtualStoreMaxLength/);
  assert.match(buildScript, /"--config\.store-dir=\$PhysicalStoreDir"/);
  assert.match(buildScript, /"--config\.virtual-store-dir=\$PhysicalVirtualStoreDir"/);
  assert.match(buildScript, /\$env:GRADLE_USER_HOME\s*=\s*\$gradleUserHome/);
  assert.match(buildScript, /"--force",\s*"--frozen-lockfile"/);
  assert.match(buildScript, /\$env:CI\s*=\s*"true"/);
});
