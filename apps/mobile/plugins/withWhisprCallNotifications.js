"use strict";

/**
 * Native Android incoming-call notifications.
 *
 * expo-notifications cannot render `CallStyle`, `CATEGORY_CALL`, or a full-screen
 * intent, so DM call pushes are intercepted before it sees them. Expo registers
 * its FCM service at `android:priority="-1"`, which means a service registered at
 * the default priority receives the message first; ours subclasses Expo's service
 * and delegates everything that is not a DM call straight back to it, so feed
 * notifications keep their existing behavior.
 */

const fs = require("node:fs");
const path = require("node:path");

const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const FULL_SCREEN_INTENT_PERMISSION = "android.permission.USE_FULL_SCREEN_INTENT";
const CALLS_SUBPACKAGE = "calls";
const MESSAGING_SERVICE_CLASS = "WhisprMessagingService";
const ACTION_RECEIVER_CLASS = "WhisprCallActionReceiver";
const FIREBASE_MESSAGING_EVENT = "com.google.firebase.MESSAGING_EVENT";

function ensureUsesPermission(androidManifest, permissionName) {
  const permissions = androidManifest.manifest["uses-permission"] ?? [];
  const hasPermission = permissions.some(
    (permission) => permission.$?.["android:name"] === permissionName,
  );

  if (!hasPermission) {
    permissions.push({ $: { "android:name": permissionName } });
  }

  androidManifest.manifest["uses-permission"] = permissions;
}

function getMainApplication(androidManifest) {
  const application = androidManifest.manifest.application?.[0];
  if (!application) {
    throw new Error("AndroidManifest.xml is missing the main application node.");
  }

  return application;
}

function ensureMessagingService(androidManifest, serviceName) {
  const application = getMainApplication(androidManifest);
  const services = application.service ?? [];
  let service = services.find((entry) => entry.$?.["android:name"] === serviceName);

  if (!service) {
    service = { $: { "android:name": serviceName } };
    services.push(service);
  }

  service.$ = {
    ...service.$,
    "android:exported": "false",
  };
  // No android:priority: the default (0) outranks expo-notifications' -1, so this
  // service wins the MESSAGING_EVENT dispatch.
  service["intent-filter"] = [
    {
      action: [{ $: { "android:name": FIREBASE_MESSAGING_EVENT } }],
    },
  ];
  application.service = services;
}

function ensureActionReceiver(androidManifest, receiverName) {
  const application = getMainApplication(androidManifest);
  const receivers = application.receiver ?? [];
  let receiver = receivers.find((entry) => entry.$?.["android:name"] === receiverName);

  if (!receiver) {
    receiver = { $: { "android:name": receiverName } };
    receivers.push(receiver);
  }

  receiver.$ = {
    ...receiver.$,
    "android:enabled": "true",
    "android:exported": "false",
  };
  application.receiver = receivers;
}

/** Lets the full-screen ring show over the lock screen and wake the display. */
function ensureMainActivityCallFlags(androidManifest) {
  const application = getMainApplication(androidManifest);
  const activity = (application.activity ?? []).find(
    (entry) => entry.$?.["android:name"] === ".MainActivity",
  );

  if (!activity) {
    throw new Error("AndroidManifest.xml is missing the .MainActivity node.");
  }

  activity.$ = {
    ...activity.$,
    "android:showWhenLocked": "true",
    "android:turnScreenOn": "true",
  };
}

function withWhisprCallNotificationsManifest(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const androidPackage = configWithManifest.android?.package;
    if (!androidPackage) {
      throw new Error("android.package must be set before the call notification plugin runs.");
    }

    const manifest = configWithManifest.modResults;
    ensureUsesPermission(manifest, FULL_SCREEN_INTENT_PERMISSION);
    ensureMessagingService(
      manifest,
      `${androidPackage}.${CALLS_SUBPACKAGE}.${MESSAGING_SERVICE_CLASS}`,
    );
    ensureActionReceiver(
      manifest,
      `${androidPackage}.${CALLS_SUBPACKAGE}.${ACTION_RECEIVER_CLASS}`,
    );
    ensureMainActivityCallFlags(manifest);

    return configWithManifest;
  });
}

function withWhisprCallNotificationSources(config) {
  return withDangerousMod(config, [
    "android",
    (configWithMod) => {
      const androidPackage = configWithMod.android?.package;
      if (!androidPackage) {
        throw new Error("android.package must be set before the call notification plugin runs.");
      }

      const sourceRoot = path.join(
        configWithMod.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...androidPackage.split("."),
        CALLS_SUBPACKAGE,
      );
      fs.mkdirSync(sourceRoot, { recursive: true });

      const sources = require("./whispr-call-notification-sources");
      for (const [fileName, render] of Object.entries(sources)) {
        fs.writeFileSync(path.join(sourceRoot, fileName), render(androidPackage), "utf8");
      }

      return configWithMod;
    },
  ]);
}

function withWhisprCallNotifications(config) {
  return withWhisprCallNotificationSources(withWhisprCallNotificationsManifest(config));
}

module.exports = withWhisprCallNotifications;
module.exports.ensureActionReceiver = ensureActionReceiver;
module.exports.ensureMainActivityCallFlags = ensureMainActivityCallFlags;
module.exports.ensureMessagingService = ensureMessagingService;
module.exports.ensureUsesPermission = ensureUsesPermission;
