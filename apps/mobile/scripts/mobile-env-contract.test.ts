import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  buildMobileEnvironmentConfig,
  normalizeMobileEnvironment,
} from "../src/config/environment";

describe("mobile environment contract", () => {
  const releaseEnvironmentInputs = {
    canary: {
      publicApiUrl: "https://whispr.team",
      publicSocketUrl: "https://whispr.team",
      publicWebUrl: "https://whispr.team",
    },
    production: {
      publicApiUrl: "https://whispr.team",
      publicSocketUrl: "https://whispr.team",
      publicWebUrl: "https://whispr.team",
    },
    uat: {
      publicApiUrl: "https://wizardsweb-uat.up.railway.app",
      publicSocketUrl: "https://wizardsweb-uat.up.railway.app",
      publicWebUrl: "https://wizardsweb-uat.up.railway.app",
    },
  } as const;

  it("normalizes unknown environments to development", () => {
    assert.equal(normalizeMobileEnvironment(undefined), "development");
    assert.equal(normalizeMobileEnvironment("staging"), "development");
    assert.equal(normalizeMobileEnvironment("uat"), "uat");
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

  it("rejects non-HTTPS release endpoints", () => {
    assert.throws(
      () =>
        buildMobileEnvironmentConfig({
          mobileEnvironment: "uat",
          publicApiUrl: "http://wizardsweb-uat.up.railway.app",
          publicTurnstileSiteKey: "public-example-turnstile-site-key",
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
          publicTurnstileSiteKey: "public-example-turnstile-site-key",
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
        publicTurnstileSiteKey: "public-example-turnstile-site-key",
        publicWebUrl: "https://wizardsweb-uat.up.railway.app/",
      }).apiUrl,
      "https://wizardsweb-uat.up.railway.app",
    );

    assert.equal(
      buildMobileEnvironmentConfig({
        mobileEnvironment: "production",
        publicApiUrl: "https://whispr.team/",
        publicSocketUrl: "https://whispr.team/",
        publicTurnstileSiteKey: "public-example-turnstile-site-key",
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
      publicTurnstileSiteKey: "public-example-turnstile-site-key",
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

  it("trims and retains a configured public Turnstile site key", () => {
    const config = buildMobileEnvironmentConfig({
      mobileEnvironment: "uat",
      ...releaseEnvironmentInputs.uat,
      publicTurnstileSiteKey: " public-example-turnstile-site-key ",
    });

    assert.equal(config.turnstileSiteKey, "public-example-turnstile-site-key");
  });

  it("accepts a configured public Turnstile site key for canary", () => {
    const config = buildMobileEnvironmentConfig({
      mobileEnvironment: "canary",
      ...releaseEnvironmentInputs.canary,
      publicTurnstileSiteKey: "public-example-turnstile-site-key",
    });

    assert.equal(config.turnstileSiteKey, "public-example-turnstile-site-key");
  });

  it("uses null for an unset Turnstile site key in development", () => {
    const config = buildMobileEnvironmentConfig({
      mobileEnvironment: "development",
      publicApiUrl: "http://localhost:3000",
      publicSocketUrl: "http://localhost:3000",
      publicWebUrl: "http://localhost:3000",
    });

    assert.equal(config.turnstileSiteKey, null);
  });

  for (const [environment, endpoints] of Object.entries(releaseEnvironmentInputs)) {
    it(`rejects missing or whitespace-only Turnstile site keys for ${environment}`, () => {
      assert.throws(
        () =>
          buildMobileEnvironmentConfig({
            mobileEnvironment: environment,
            ...endpoints,
          }),
        /EXPO_PUBLIC_WHISPR_TURNSTILE_SITE_KEY is required/,
      );

      assert.throws(
        () =>
          buildMobileEnvironmentConfig({
            mobileEnvironment: environment,
            ...endpoints,
            publicTurnstileSiteKey: "   ",
          }),
        /EXPO_PUBLIC_WHISPR_TURNSTILE_SITE_KEY is required/,
      );
    });
  }

  it("validates UAT config without echoing the configured Turnstile site key", () => {
    const sentinel = "turnstile-public-key-sentinel";
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/validate-mobile-env.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          EXPO_PUBLIC_WHISPR_API_URL: "https://wizardsweb-uat.up.railway.app",
          EXPO_PUBLIC_WHISPR_SOCKET_URL: "https://wizardsweb-uat.up.railway.app",
          EXPO_PUBLIC_WHISPR_TURNSTILE_SITE_KEY: sentinel,
          EXPO_PUBLIC_WHISPR_WEB_URL: "https://wizardsweb-uat.up.railway.app",
          NODE_ENV: "test",
          WHISPR_MOBILE_ENV: "uat",
        },
      },
    );

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.includes(sentinel), false);

    const config = JSON.parse(result.stdout) as Record<string, unknown>;

    assert.equal(config.apiUrl, "https://wizardsweb-uat.up.railway.app");
    assert.equal(config.environment, "uat");
    assert.equal(config.releaseChannel, "uat");
    assert.equal(config.socketUrl, "https://wizardsweb-uat.up.railway.app");
    assert.equal(config.webUrl, "https://wizardsweb-uat.up.railway.app");
    assert.equal(Object.hasOwn(config, "turnstileSiteKey"), false);
  });
});
