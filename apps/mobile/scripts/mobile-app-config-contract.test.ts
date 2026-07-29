import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "node:test";
import {
  getWhisprMobileAndroidPermissions,
  getWhisprMobileIosInfoPlistUsageDescriptions,
  WHISPR_MOBILE_APP_IDENTITY,
} from "../src/release/mobile-store-contract";

type BuildExpoConfig = (context: { config: Record<string, unknown> }) => {
  android?: {
    package?: string;
    permissions?: string[];
  };
  extra?: {
    whispr?: {
      apiUrl?: string;
      buildId?: string;
      environment?: string;
    };
  };
  ios?: {
    bundleIdentifier?: string;
    infoPlist?: Record<string, string>;
  };
  name?: string;
  plugins?: unknown[];
  scheme?: string;
  slug?: string;
};

const originalEnv = { ...process.env };
const require = createRequire(import.meta.url);
const buildExpoConfig = require("../app.config.js") as BuildExpoConfig;

afterEach(() => {
  process.env = { ...originalEnv };
});

function buildTestExpoConfig() {
  return buildExpoConfig({ config: {} });
}

describe("mobile app config contract", () => {
  it("emits native identity, permissions, and public UAT endpoints from contracts", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    process.env.WHISPR_MOBILE_BUILD_ID = "0123456789abcdef0123456789abcdef01234567";

    const config = buildTestExpoConfig();

    assert.equal(config.name, WHISPR_MOBILE_APP_IDENTITY.name);
    assert.equal(config.slug, WHISPR_MOBILE_APP_IDENTITY.slug);
    assert.equal(config.scheme, WHISPR_MOBILE_APP_IDENTITY.scheme);
    assert.equal(config.android?.package, WHISPR_MOBILE_APP_IDENTITY.androidPackage);
    assert.equal(config.ios?.bundleIdentifier, WHISPR_MOBILE_APP_IDENTITY.iosBundleIdentifier);
    assert.deepEqual(config.android?.permissions, getWhisprMobileAndroidPermissions());
    assert.deepEqual(config.ios?.infoPlist, getWhisprMobileIosInfoPlistUsageDescriptions());
    assert.ok(config.plugins?.includes("./plugins/withWebRtc"));
    assert.equal(config.plugins?.includes("@config-plugins/react-native-webrtc"), false);
    assert.ok(config.plugins?.includes("./plugins/withScreenShare"));
    assert.ok(config.android?.permissions?.includes("FOREGROUND_SERVICE_MEDIA_PROJECTION"));
    assert.ok(config.android?.permissions?.includes("USE_BIOMETRIC"));
    assert.match(config.ios?.infoPlist?.NSFaceIDUsageDescription ?? "", /only when you choose/i);
    assert.equal(
      Object.hasOwn(config.ios?.infoPlist ?? {}, "NSScreenCaptureUsageDescription"),
      false,
    );
    assert.ok(config.extra?.whispr);
    assert.equal(config.extra.whispr.buildId, "0123456789abcdef0123456789abcdef01234567");
    assert.equal(config.extra.whispr.environment, "uat");
    assert.match(config.extra.whispr.apiUrl ?? "", /^https:\/\//);
  });

  it("rejects production-like mobile builds with local endpoints", () => {
    process.env.WHISPR_MOBILE_ENV = "production";
    process.env.EXPO_PUBLIC_WHISPR_API_URL = "http://localhost:3000";

    assert.throws(() => buildTestExpoConfig(), /EXPO_PUBLIC_WHISPR_API_URL must use HTTPS/);
  });

  it("rejects a UAT build whose API origin is not the canonical UAT endpoint", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    process.env.EXPO_PUBLIC_WHISPR_API_URL = "https://wrong-uat.example.test";

    assert.throws(() => buildTestExpoConfig(), /canonical UAT endpoint/i);
  });

  it("rejects a malformed embedded release build identity", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    process.env.WHISPR_MOBILE_BUILD_ID = "not-a-git-sha";

    assert.throws(() => buildTestExpoConfig(), /WHISPR_MOBILE_BUILD_ID must be a full Git SHA/);
  });
});
