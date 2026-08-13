import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  buildMobileEnvironmentConfig,
  normalizeMobileEnvironment,
} from "../src/config/environment";

describe("mobile environment contract", () => {
  it("defaults only development builds and rejects unknown release environments", () => {
    assert.equal(normalizeMobileEnvironment(undefined, true), "development");
    assert.equal(normalizeMobileEnvironment("uat", false), "uat");
    assert.throws(() => normalizeMobileEnvironment(undefined, false), /must be one of/);
    assert.throws(() => normalizeMobileEnvironment("staging", false), /must be one of/);
  });

  it("allows local HTTP only for development builds", () => {
    const config = buildMobileEnvironmentConfig({
      mobileEnvironment: "development",
      publicApiUrl: "http://localhost:3000/",
      publicSocketUrl: "http://localhost:3000/",
      publicWebUrl: "http://localhost:3000/",
    });

    assert.equal(config.apiUrl, "http://localhost:3000");
    assert.equal(config.releaseChannel, "development");
  });

  it("defaults and validates the community invite slug", () => {
    const defaults = buildMobileEnvironmentConfig({
      mobileEnvironment: "development",
      publicApiUrl: "http://localhost:3000",
      publicSocketUrl: "http://localhost:3000",
      publicWebUrl: "http://localhost:3000",
    });
    const configured = buildMobileEnvironmentConfig({
      mobileEnvironment: "development",
      publicApiUrl: "http://localhost:3000",
      publicCommunityInviteSlug: " community_uat ",
      publicSocketUrl: "http://localhost:3000",
      publicWebUrl: "http://localhost:3000",
    });

    assert.equal(defaults.communityInviteSlug, "whispr-community");
    assert.equal(configured.communityInviteSlug, "community_uat");
    assert.throws(
      () =>
        buildMobileEnvironmentConfig({
          mobileEnvironment: "development",
          publicApiUrl: "http://localhost:3000",
          publicCommunityInviteSlug: "../admin",
          publicSocketUrl: "http://localhost:3000",
          publicWebUrl: "http://localhost:3000",
        }),
      /must contain only letters/,
    );
  });

  it("arms the native Google sheet only for a real Google client id", () => {
    const configured = buildMobileEnvironmentConfig({
      mobileEnvironment: "uat",
      publicApiUrl: "https://wizardsweb-uat.up.railway.app",
      publicGoogleWebClientId: " 1234567890-whispr.apps.googleusercontent.com ",
      publicSocketUrl: "https://wizardsweb-uat.up.railway.app",
      publicWebUrl: "https://wizardsweb-uat.up.railway.app",
    });

    assert.equal(configured.googleWebClientId, "1234567890-whispr.apps.googleusercontent.com");

    for (const value of [undefined, "", "   ", "not-a-client-id", "1234567890.example.com"]) {
      const config = buildMobileEnvironmentConfig({
        mobileEnvironment: "uat",
        publicApiUrl: "https://wizardsweb-uat.up.railway.app",
        ...(value === undefined ? {} : { publicGoogleWebClientId: value }),
        publicSocketUrl: "https://wizardsweb-uat.up.railway.app",
        publicWebUrl: "https://wizardsweb-uat.up.railway.app",
      });

      assert.equal(config.googleWebClientId, null);
    }
  });

  it("rejects non-HTTPS release endpoints", () => {
    assert.throws(
      () =>
        buildMobileEnvironmentConfig({
          mobileEnvironment: "uat",
          publicApiUrl: "http://wizardsweb-uat.up.railway.app",
          publicSocketUrl: "https://wizardsweb-uat.up.railway.app",
          publicWebUrl: "https://wizardsweb-uat.up.railway.app",
        }),
      /must use HTTPS/,
    );
  });

  it("rejects local or placeholder hosts for production-like builds", () => {
    assert.throws(
      () =>
        buildMobileEnvironmentConfig({
          mobileEnvironment: "production",
          publicApiUrl: "https://whispr.invalid",
          publicSocketUrl: "https://whispr.team",
          publicWebUrl: "https://whispr.team",
        }),
      /cannot point to local or invalid hosts/,
    );
  });

  it("accepts UAT and production HTTPS endpoints", () => {
    assert.equal(
      buildMobileEnvironmentConfig({
        mobileEnvironment: "uat",
        publicApiUrl: "https://wizardsweb-uat.up.railway.app/",
        publicSocketUrl: "https://wizardsweb-uat.up.railway.app/",
        publicWebUrl: "https://wizardsweb-uat.up.railway.app/",
      }).apiUrl,
      "https://wizardsweb-uat.up.railway.app",
    );

    assert.equal(
      buildMobileEnvironmentConfig({
        mobileEnvironment: "production",
        publicApiUrl: "https://whispr.team/",
        publicSocketUrl: "https://whispr.team/",
        publicWebUrl: "https://whispr.team/",
      }).environment,
      "production",
    );
  });

  it("trims and passes through a configured Sentry DSN", () => {
    const config = buildMobileEnvironmentConfig({
      mobileEnvironment: "uat",
      publicApiUrl: "https://wizardsweb-uat.up.railway.app",
      publicSentryDsn: " https://k@o1.ingest.sentry.io/1 ",
      publicSocketUrl: "https://wizardsweb-uat.up.railway.app",
      publicWebUrl: "https://wizardsweb-uat.up.railway.app",
    });

    assert.equal(config.sentryDsn, "https://k@o1.ingest.sentry.io/1");
  });

  it("defaults sentryDsn to null when unset", () => {
    const config = buildMobileEnvironmentConfig({
      mobileEnvironment: "development",
      publicApiUrl: "http://localhost:3000",
      publicSocketUrl: "http://localhost:3000",
      publicWebUrl: "http://localhost:3000",
    });

    assert.equal(config.sentryDsn, null);
  });

  it("validates UAT config without requiring a human-verification key", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/validate-mobile-env.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          EXPO_PUBLIC_WHISPR_API_URL: "https://wizardsweb-uat.up.railway.app",
          EXPO_PUBLIC_WHISPR_SOCKET_URL: "https://wizardsweb-uat.up.railway.app",
          EXPO_PUBLIC_WHISPR_WEB_URL: "https://wizardsweb-uat.up.railway.app",
          NODE_ENV: "test",
          WHISPR_MOBILE_ENV: "uat",
        },
      },
    );

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    const config = JSON.parse(result.stdout) as Record<string, unknown>;

    assert.equal(config.apiUrl, "https://wizardsweb-uat.up.railway.app");
    assert.equal(config.environment, "uat");
    assert.equal(config.releaseChannel, "uat");
    assert.equal(config.socketUrl, "https://wizardsweb-uat.up.railway.app");
    assert.equal(config.webUrl, "https://wizardsweb-uat.up.railway.app");
    assert.equal(Object.hasOwn(config, "turnstileSiteKey"), false);
  });
});
