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
      environment?: string;
    };
  };
  ios?: {
    bundleIdentifier?: string;
    infoPlist?: Record<string, string>;
  };
  name?: string;
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

    const config = buildTestExpoConfig();

    assert.equal(config.name, WHISPR_MOBILE_APP_IDENTITY.name);
    assert.equal(config.slug, WHISPR_MOBILE_APP_IDENTITY.slug);
    assert.equal(config.scheme, WHISPR_MOBILE_APP_IDENTITY.scheme);
    assert.equal(config.android?.package, WHISPR_MOBILE_APP_IDENTITY.androidPackage);
    assert.equal(config.ios?.bundleIdentifier, WHISPR_MOBILE_APP_IDENTITY.iosBundleIdentifier);
    assert.deepEqual(config.android?.permissions, getWhisprMobileAndroidPermissions());
    assert.deepEqual(config.ios?.infoPlist, getWhisprMobileIosInfoPlistUsageDescriptions());
    assert.ok(config.extra?.whispr);
    assert.equal(config.extra.whispr.environment, "uat");
    assert.match(config.extra.whispr.apiUrl ?? "", /^https:\/\//);
  });

  it("rejects production-like mobile builds with local endpoints", () => {
    process.env.WHISPR_MOBILE_ENV = "production";
    process.env.EXPO_PUBLIC_WHISPR_API_URL = "http://localhost:3000";

    assert.throws(() => buildTestExpoConfig(), /EXPO_PUBLIC_WHISPR_API_URL must use HTTPS/);
  });
});
