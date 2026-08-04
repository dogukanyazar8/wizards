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
      communityInviteSlug?: string;
      environment?: string;
    };
  };
  ios?: {
    bundleIdentifier?: string;
    infoPlist?: Record<string, string>;
  };
  name?: string;
  plugins?: unknown[];
  runtimeVersion?: {
    policy?: string;
  };
  scheme?: string;
  slug?: string;
  updates?: {
    checkAutomatically?: string;
    codeSigningCertificate?: string;
    codeSigningMetadata?: {
      alg?: string;
      keyid?: string;
    };
    enabled?: boolean;
    fallbackToCacheTimeout?: number;
    requestHeaders?: Record<string, string>;
    url?: string;
  };
};

const originalEnv = { ...process.env };
const require = createRequire(import.meta.url);
const buildExpoConfig = require("../app.config.js") as BuildExpoConfig;

afterEach(() => {
  process.env = { ...originalEnv };
});

function buildTestExpoConfig() {
  if (
    process.env.WHISPR_MOBILE_ENV !== "development" &&
    !process.env.EXPO_PUBLIC_WHISPR_BUILD_ID &&
    !process.env.WHISPR_MOBILE_BUILD_ID
  ) {
    process.env.WHISPR_MOBILE_BUILD_ID = "558f05bcce84";
  }
  return buildExpoConfig({ config: {} });
}

describe("mobile app config contract", () => {
  it("emits native identity, permissions, and public UAT endpoints from contracts", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";

    const config = buildTestExpoConfig();

    assert.equal(config.name, WHISPR_MOBILE_APP_IDENTITY.name);
    assert.equal(config.slug, WHISPR_MOBILE_APP_IDENTITY.slug);
    assert.equal(config.scheme, WHISPR_MOBILE_APP_IDENTITY.scheme);
    assert.equal(config.android?.package, WHISPR_MOBILE_APP_IDENTITY.androidPackage);
    assert.equal(config.ios?.bundleIdentifier, WHISPR_MOBILE_APP_IDENTITY.iosBundleIdentifier);
    assert.deepEqual(
      config.android?.permissions,
      getWhisprMobileAndroidPermissions({ includeStoreBlockers: true }),
    );
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
    assert.equal(config.extra.whispr.environment, "uat");
    assert.match(config.extra.whispr.apiUrl ?? "", /^https:\/\//);
    assert.equal(config.extra.whispr.communityInviteSlug, "whispr-community");
  });

  /**
   * The dimension read this field from the day it was written and the config
   * never emitted it, so every measurement taken so far reports its build as
   * `unknown` — the one fact that ties a device percentile to a release.
   */
  it("carries the build's commit into the telemetry dimension", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    process.env.WHISPR_MOBILE_BUILD_ID = "2d6c2c86f0a1";

    assert.equal(buildTestExpoConfig().extra?.whispr?.buildId, "2d6c2c86f0a1");
  });

  it("carries the dirty local UAT build identity into telemetry", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    process.env.WHISPR_MOBILE_BUILD_ID = "52099b986613-dirty";

    assert.equal(buildTestExpoConfig().extra?.whispr?.buildId, "52099b986613-dirty");
  });

  it("keeps production build identities pinned to a clean commit", () => {
    process.env.WHISPR_MOBILE_ENV = "production";
    process.env.WHISPR_MOBILE_BUILD_ID = "52099b986613-dirty";

    assert.throws(() => buildTestExpoConfig(), /valid Git SHA/);
  });

  it("fails UAT config instead of shipping an unrecognisable build id", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    process.env.WHISPR_MOBILE_BUILD_ID = "not a commit; drop table";

    assert.throws(() => buildTestExpoConfig(), /valid Git SHA/);
  });

  it("fails UAT config when the build SHA is missing", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    delete process.env.EXPO_PUBLIC_WHISPR_BUILD_ID;
    delete process.env.WHISPR_MOBILE_BUILD_ID;

    assert.throws(() => buildExpoConfig({ config: {} }), /valid Git SHA/);
  });

  it("uses an explicit local-only build id for development", () => {
    process.env.WHISPR_MOBILE_ENV = "development";
    delete process.env.EXPO_PUBLIC_WHISPR_BUILD_ID;
    delete process.env.WHISPR_MOBILE_BUILD_ID;

    assert.equal(buildTestExpoConfig().extra?.whispr?.buildId, "dev-local");
  });

  it("embeds the UAT OTA trust root only when signed OTA is enabled", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    process.env.WHISPR_MOBILE_OTA_ENABLED = "true";

    const config = buildTestExpoConfig();

    assert.equal(config.updates?.enabled, true);
    assert.equal(
      config.updates?.url,
      "https://wizardsweb-uat.up.railway.app/api/v1/app/updates/manifest",
    );
    assert.equal(config.updates?.checkAutomatically, "NEVER");
    assert.equal(config.updates?.fallbackToCacheTimeout, 0);
    assert.equal(config.updates?.requestHeaders?.["expo-channel-name"], "uat");
    assert.equal(config.updates?.codeSigningCertificate, "./certs/ota/uat/certificate.pem");
    assert.deepEqual(config.updates?.codeSigningMetadata, {
      alg: "rsa-v1_5-sha256",
      keyid: "whispr-mobile-ota-uat-2026-01",
    });
    assert.deepEqual(config.runtimeVersion, { policy: "fingerprint" });
  });

  it("fails closed when signed OTA is enabled without its public certificate", () => {
    process.env.WHISPR_MOBILE_ENV = "uat";
    process.env.WHISPR_MOBILE_OTA_ENABLED = "true";
    process.env.WHISPR_MOBILE_OTA_CERTIFICATE_PATH = "./certs/ota/uat/missing.pem";

    assert.throws(() => buildTestExpoConfig(), /OTA certificate does not exist/);
  });

  it("keeps production store builds outside OTA and APK sideload trust", () => {
    process.env.WHISPR_MOBILE_ENV = "production";
    process.env.WHISPR_MOBILE_OTA_ENABLED = "false";

    const config = buildTestExpoConfig();

    assert.equal(config.updates?.enabled, false);
    assert.equal(config.updates?.codeSigningCertificate, undefined);
    assert.equal(config.android?.permissions?.includes("REQUEST_INSTALL_PACKAGES"), false);
  });

  it("rejects production-like mobile builds with local endpoints", () => {
    process.env.WHISPR_MOBILE_ENV = "production";
    process.env.EXPO_PUBLIC_WHISPR_API_URL = "http://localhost:3000";

    assert.throws(() => buildTestExpoConfig(), /EXPO_PUBLIC_WHISPR_API_URL must use HTTPS/);
  });
});
