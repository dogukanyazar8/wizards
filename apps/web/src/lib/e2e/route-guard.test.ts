import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import { assertE2EApiRouteEnabled, isLocalE2EHost } from "./route-guard";

describe("E2E API route guard", () => {
  it("allows local loopback hosts when E2E mode is enabled", () => {
    const env = {
      APP_URL: "http://127.0.0.1:3000",
      E2E_TEST_MODE: "true",
      NODE_ENV: "development",
    };

    assert.doesNotThrow(() => assertE2EApiRouteEnabled("http://127.0.0.1:3000/api/e2e", env));
    assert.doesNotThrow(() => assertE2EApiRouteEnabled("http://localhost:3000/api/e2e", env));
    assert.doesNotThrow(() => assertE2EApiRouteEnabled("http://[::1]:3000/api/e2e", env));
  });

  it("rejects production unless the local production-build gate is explicit", () => {
    assert.throws(
      () =>
        assertE2EApiRouteEnabled("http://127.0.0.1:3000/api/e2e", {
          E2E_TEST_MODE: "true",
          NODE_ENV: "production",
        }),
      (error) =>
        error instanceof ApiError &&
        error.status === 404 &&
        error.message === "E2E helper is unavailable in production",
    );
  });

  it("allows a production build only behind both E2E gates and loopback hosts", () => {
    const env = {
      APP_URL: "http://127.0.0.1:3000",
      E2E_ALLOW_PRODUCTION_BUILD: "true",
      E2E_TEST_MODE: "true",
      NODE_ENV: "production",
    };

    assert.doesNotThrow(() => assertE2EApiRouteEnabled("http://127.0.0.1:3000/api/e2e", env));
  });

  it("rejects remote hosts even when E2E mode is enabled outside production", () => {
    assert.throws(
      () =>
        assertE2EApiRouteEnabled("https://uat.whispr.example/api/e2e", {
          E2E_TEST_MODE: "true",
          NODE_ENV: "development",
        }),
      (error) =>
        error instanceof ApiError &&
        error.status === 404 &&
        error.message === "E2E helper is unavailable outside local test hosts",
    );
  });

  it("rejects remote configured app URLs even when the request host is loopback", () => {
    assert.throws(
      () =>
        assertE2EApiRouteEnabled("http://127.0.0.1:3000/api/e2e", {
          APP_URL: "https://uat.whispr.example",
          E2E_TEST_MODE: "true",
          NODE_ENV: "development",
        }),
      (error) =>
        error instanceof ApiError &&
        error.status === 404 &&
        error.message === "E2E helper is unavailable outside local test hosts",
    );
  });

  it("rejects invalid configured app URLs", () => {
    assert.throws(
      () =>
        assertE2EApiRouteEnabled("http://127.0.0.1:3000/api/e2e", {
          APP_URL: "not a url",
          E2E_TEST_MODE: "true",
          NODE_ENV: "development",
        }),
      (error) =>
        error instanceof ApiError &&
        error.status === 404 &&
        error.message === "E2E helper has invalid local test URL configuration",
    );
  });

  it("rejects requests when E2E mode is disabled", () => {
    assert.throws(
      () =>
        assertE2EApiRouteEnabled("http://127.0.0.1:3000/api/e2e", {
          NODE_ENV: "development",
        }),
      (error) =>
        error instanceof ApiError &&
        error.status === 404 &&
        error.message === "E2E helper is disabled",
    );
  });

  it("keeps local-host detection strict", () => {
    assert.equal(isLocalE2EHost("127.10.20.30"), true);
    assert.equal(isLocalE2EHost("[::1]"), true);
    assert.equal(isLocalE2EHost("0.0.0.0"), false);
    assert.equal(isLocalE2EHost("uat.whispr.example"), false);
  });
});
