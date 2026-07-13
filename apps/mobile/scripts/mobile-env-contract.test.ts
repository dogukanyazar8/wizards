import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMobileEnvironmentConfig,
  normalizeMobileEnvironment,
} from "../src/config/environment";

describe("mobile environment contract", () => {
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
});
