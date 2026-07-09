"use strict";

const { withAndroidManifest } = require("expo/config-plugins");

const FOREGROUND_SERVICE_PERMISSION = "android.permission.FOREGROUND_SERVICE";
const MEDIA_PROJECTION_PERMISSION = "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION";
const MEDIA_PROJECTION_SERVICE = "com.oney.WebRTCModule.MediaProjectionService";

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

function ensureMediaProjectionService(androidManifest) {
  const application = getMainApplication(androidManifest);
  const services = application.service ?? [];
  let service = services.find((entry) => entry.$?.["android:name"] === MEDIA_PROJECTION_SERVICE);

  if (!service) {
    service = { $: { "android:name": MEDIA_PROJECTION_SERVICE } };
    services.push(service);
  }

  service.$ = {
    ...service.$,
    "android:exported": "false",
    "android:foregroundServiceType": "mediaProjection",
  };
  application.service = services;
}

function withScreenShare(config) {
  config = withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults;
    ensureUsesPermission(manifest, FOREGROUND_SERVICE_PERMISSION);
    ensureUsesPermission(manifest, MEDIA_PROJECTION_PERMISSION);
    ensureMediaProjectionService(manifest);
    return configWithManifest;
  });

  return config;
}

module.exports = withScreenShare;
