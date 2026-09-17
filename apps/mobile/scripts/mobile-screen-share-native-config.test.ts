import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
test("Android share service keeps the microphone foreground type and is idempotent", async () => {
  const plugin = require("../plugins/withScreenShare.js");
  const config = plugin({});
  let manifest = { manifest: { application: [{}] } };
  for (let iteration = 0; iteration < 2; iteration++) {
    manifest = (
      await config.mods.android.manifest({
        ...config,
        modResults: manifest,
        modRequest: { platform: "android", modName: "manifest", projectRoot: process.cwd() },
      })
    ).modResults;
  }
  const android = manifest.manifest as {
    application: Array<{ service: Array<{ $: Record<string, string> }> }>;
    "uses-permission"?: Array<{ $: Record<string, string> }>;
  };
  assert.equal(android.application[0]?.service.length, 1);
  assert.equal(
    android.application[0]?.service[0]?.$["android:foregroundServiceType"],
    "mediaProjection|microphone",
  );
  assert.equal(android.application[0]?.service[0]?.$["android:exported"], "false");
  assert.equal(
    android["uses-permission"]?.filter(
      (permission) =>
        permission.$["android:name"] === "android.permission.FOREGROUND_SERVICE_MICROPHONE",
    ).length,
    1,
  );
  const packageRoot = path.dirname(require.resolve("@livekit/react-native-webrtc/package.json"));
  const service = readFileSync(
    path.join(
      packageRoot,
      "android/src/main/java/com/oney/WebRTCModule/MediaProjectionService.java",
    ),
    "utf8",
  );
  assert.match(service, /FOREGROUND_SERVICE_TYPE_MICROPHONE/);
  assert.match(service, /checkSelfPermission\(Manifest.permission.RECORD_AUDIO\)/);
});

test("iOS plugin assigns the same App Group to the app and extension transport", async () => {
  const plugin = require("../plugins/withIosBroadcastExtension.js");
  const config = plugin({ ios: { bundleIdentifier: "team.whispr.test" } });
  const request = { platform: "ios", projectRoot: process.cwd() };
  const info = await config.mods.ios.infoPlist({
    ...config,
    modResults: {},
    modRequest: { ...request, modName: "infoPlist" },
  });
  const entitlements = await config.mods.ios.entitlements({
    ...config,
    modResults: {},
    modRequest: { ...request, modName: "entitlements" },
  });
  assert.equal(info.modResults.RTCAppGroupIdentifier, "group.team.whispr.test");
  assert.equal(info.modResults.RTCScreenSharingSocketFD, "rtc_SSFD");
  assert.equal(info.modResults.RTCScreenSharingExtension, "team.whispr.test.broadcast");
  assert.deepEqual(entitlements.modResults["com.apple.security.application-groups"], [
    "group.team.whispr.test",
  ]);
  const configBuilder = require("../app.config.js");
  const appConfig = configBuilder({ config: {} });
  assert.equal(appConfig.extra.iosBroadcastValidated, false);
  assert.deepEqual(appConfig.extra.eas.build.experimental.ios.appExtensions, [
    {
      targetName: "WhisprBroadcast",
      bundleIdentifier: `${appConfig.ios.bundleIdentifier}.broadcast`,
      entitlements: {
        "com.apple.security.application-groups": [`group.${appConfig.ios.bundleIdentifier}`],
      },
    },
  ]);
});
