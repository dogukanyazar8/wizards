import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const plugin = require("../plugins/withWhisprCallNotifications.js") as {
  FIREBASE_MESSAGING_DEPENDENCY: string;
  ensureActionReceiver(manifest: AndroidManifest, name: string): void;
  ensureFirebaseMessagingDependency(appBuildGradle: string): string;
  ensureMainActivityCallFlags(manifest: AndroidManifest): void;
  ensureMessagingService(manifest: AndroidManifest, name: string): void;
  ensureUsesPermission(manifest: AndroidManifest, permission: string): void;
};
const sources = require("../plugins/whispr-call-notification-sources.js") as Record<
  string,
  (androidPackage: string) => string
>;

type ManifestNode = { $?: Record<string, string>; [key: string]: unknown };
type AndroidManifest = {
  manifest: {
    "uses-permission"?: ManifestNode[];
    application?: Array<{
      activity?: ManifestNode[];
      receiver?: ManifestNode[];
      service?: ManifestNode[];
    }>;
  };
};

function createManifest(): AndroidManifest {
  return {
    manifest: {
      "uses-permission": [{ $: { "android:name": "android.permission.INTERNET" } }],
      application: [
        {
          activity: [{ $: { "android:name": ".MainActivity", "android:exported": "true" } }],
        },
      ],
    },
  };
}

describe("withWhisprCallNotifications manifest transforms", () => {
  it("adds the full-screen intent permission exactly once across repeat runs", () => {
    const manifest = createManifest();

    plugin.ensureUsesPermission(manifest, "android.permission.USE_FULL_SCREEN_INTENT");
    plugin.ensureUsesPermission(manifest, "android.permission.USE_FULL_SCREEN_INTENT");

    const matches = (manifest.manifest["uses-permission"] ?? []).filter(
      (entry) => entry.$?.["android:name"] === "android.permission.USE_FULL_SCREEN_INTENT",
    );
    assert.equal(matches.length, 1);
  });

  it("registers the messaging service without a priority so it outranks expo-notifications", () => {
    const manifest = createManifest();
    const serviceName = "team.whispr.mobile.calls.WhisprMessagingService";

    plugin.ensureMessagingService(manifest, serviceName);
    plugin.ensureMessagingService(manifest, serviceName);

    const services = manifest.manifest.application?.[0]?.service ?? [];
    assert.equal(services.length, 1);
    const service = services[0]!;
    assert.equal(service.$?.["android:name"], serviceName);
    assert.equal(service.$?.["android:exported"], "false");
    assert.equal(service.$?.["android:priority"], undefined);

    const filters = service["intent-filter"] as Array<{ action: ManifestNode[] }>;
    assert.equal(filters.length, 1);
    assert.equal(filters[0]!.action[0]?.$?.["android:name"], "com.google.firebase.MESSAGING_EVENT");
  });

  it("registers the decline receiver and keeps it unexported", () => {
    const manifest = createManifest();
    const receiverName = "team.whispr.mobile.calls.WhisprCallActionReceiver";

    plugin.ensureActionReceiver(manifest, receiverName);
    plugin.ensureActionReceiver(manifest, receiverName);

    const receivers = manifest.manifest.application?.[0]?.receiver ?? [];
    assert.equal(receivers.length, 1);
    assert.equal(receivers[0]?.$?.["android:exported"], "false");
  });

  it("lets MainActivity show over the lock screen and wake the display", () => {
    const manifest = createManifest();

    plugin.ensureMainActivityCallFlags(manifest);

    const activity = manifest.manifest.application?.[0]?.activity?.[0];
    assert.equal(activity?.$?.["android:showWhenLocked"], "true");
    assert.equal(activity?.$?.["android:turnScreenOn"], "true");
    // Existing attributes must survive.
    assert.equal(activity?.$?.["android:exported"], "true");
  });

  it("fails loudly when MainActivity is missing", () => {
    const manifest: AndroidManifest = { manifest: { application: [{}] } };
    assert.throws(() => plugin.ensureMainActivityCallFlags(manifest), /MainActivity/);
  });
});

describe("withWhisprCallNotifications Gradle transforms", () => {
  it("adds Firebase Messaging directly to the app classpath exactly once", () => {
    const appBuildGradle = `dependencies {
  implementation("com.facebook.react:react-android")
}`;

    const once = plugin.ensureFirebaseMessagingDependency(appBuildGradle);
    const twice = plugin.ensureFirebaseMessagingDependency(once);

    assert.match(once, /implementation\("com\.google\.firebase:firebase-messaging:25\.0\.1"\)/);
    assert.equal(twice.match(/com\.google\.firebase:firebase-messaging/g)?.length, 1);
  });

  it("keeps the direct dependency aligned with Expo Notifications", () => {
    const expoNotificationsBuildGradle = readFileSync(
      new URL("../node_modules/expo-notifications/android/build.gradle", import.meta.url),
      "utf8",
    );
    const expoDependency = expoNotificationsBuildGradle.match(
      /com\.google\.firebase:firebase-messaging:([\d.]+)/,
    )?.[0];

    assert.equal(plugin.FIREBASE_MESSAGING_DEPENDENCY, expoDependency);
  });

  it("fails loudly if the generated app Gradle file has no dependencies block", () => {
    assert.throws(
      () => plugin.ensureFirebaseMessagingDependency('apply plugin: "com.android.application"'),
      /dependencies block/,
    );
  });
});

describe("emitted Kotlin sources", () => {
  it("renders all three classes into the app package", () => {
    assert.deepEqual(Object.keys(sources).sort(), [
      "WhisprCallActionReceiver.kt",
      "WhisprCallNotifier.kt",
      "WhisprMessagingService.kt",
    ]);

    for (const render of Object.values(sources)) {
      assert.match(render("team.whispr.mobile"), /^package team\.whispr\.mobile\.calls$/m);
    }
  });

  it("keeps the payload and deep-link contract in sync with the JS side", () => {
    const notifier = sources["WhisprCallNotifier.kt"]!("team.whispr.mobile");
    const service = sources["WhisprMessagingService.kt"]!("team.whispr.mobile");

    // Matches apps/web/src/lib/socket/handlers/dm.ts push data.
    assert.match(service, /optString\("kind"\) == "dm-call"/);
    assert.match(service, /"conversationId"/);
    assert.match(service, /"fromUserId"/);
    assert.match(service, /"ringTtlMs"/);
    // Falls back to Expo for everything else.
    assert.match(service, /super\.onMessageReceived\(remoteMessage\)/);

    // Matches parseDMCallAnswerIntent in src/deep-link/mobile-deep-links.ts.
    assert.match(notifier, /\?call=answer&from=/);
    assert.match(notifier, /"&type=" \+ \(if \(isVideo\) "video" else "voice"\)/);
    assert.match(notifier, /CallStyle\.forIncomingCall/);
    assert.match(notifier, /CHANNEL_ID = "whispr-calls"/);
  });
});
