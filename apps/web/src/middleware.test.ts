import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildContentSecurityPolicy,
  getAuthTokenDisposition,
  getAuthRouteRedirectPath,
  isMutatingApiRequestAllowed,
} from "./proxy";

describe("API CSRF guard", () => {
  const requestOrigin = "https://whispr.team";

  it("allows same-origin mutating API requests", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "POST",
        originHeader: requestOrigin,
        pathname: "/api/v1/servers",
        requestOrigin,
        secFetchSite: "same-origin",
      }),
      true,
    );
  });

  it("blocks cross-site mutating API requests before route handlers run", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "POST",
        originHeader: "https://attacker.example",
        pathname: "/api/v1/servers",
        requestOrigin,
        secFetchSite: "cross-site",
      }),
      false,
    );
  });

  it("blocks mismatched Origin headers even when Fetch Metadata is absent", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "DELETE",
        originHeader: "https://attacker.example",
        pathname: "/api/v1/users/me",
        requestOrigin,
      }),
      false,
    );
  });

  it("blocks mutating API requests when every origin signal is absent", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "POST",
        pathname: "/api/v1/servers",
        requestOrigin,
      }),
      false,
    );
  });

  it("allows signal-less non-browser clients only through Bearer authentication", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        authorizationHeader: "Bearer mobile-access-token",
        method: "POST",
        pathname: "/api/v1/mobile/support/report",
        requestOrigin,
      }),
      true,
    );
    assert.equal(
      isMutatingApiRequestAllowed({
        authorizationHeader: "Bearer ignored-by-web-session-route",
        method: "POST",
        pathname: "/api/v1/servers",
        requestOrigin,
      }),
      false,
    );
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "POST",
        pathname: "/api/v1/mobile/auth/login",
        requestOrigin,
      }),
      true,
    );
  });

  it("does not apply to safe API methods", () => {
    assert.equal(
      isMutatingApiRequestAllowed({
        method: "GET",
        originHeader: "https://attacker.example",
        pathname: "/api/v1/servers",
        requestOrigin,
        secFetchSite: "cross-site",
      }),
      true,
    );
  });
});

describe("Content Security Policy", () => {
  it("allows only the fixed Tauri IPC transports in development and production", () => {
    for (const NODE_ENV of ["development", "production"]) {
      const csp = buildContentSecurityPolicy("ipc-nonce", { NODE_ENV });
      const sources = csp
        .split(";")
        .find((part) => part.trim().startsWith("connect-src "))!
        .trim()
        .split(/\s+/);
      for (const source of ["ipc:", "http://ipc.localhost", "https://ipc.localhost"]) {
        assert.ok(sources.includes(source), `${NODE_ENV}: missing ${source}`);
      }
      assert.ok(!sources.includes("*"));
      assert.ok(!sources.includes("http:"));
      assert.ok(!sources.includes("https:"));
    }
  });
  it("allows Next development inline scripts without carrying invalid sources", () => {
    const csp = buildContentSecurityPolicy("test-nonce", {
      APP_URL: "http://127.0.0.1:3000",
      AUTH_URL: "http://127.0.0.1:3000",
      NEXTAUTH_URL: "http://127.0.0.1:3000",
      NODE_ENV: "test",
    });

    assert.match(csp, /script-src[^;]*'unsafe-inline'/);
    assert.match(csp, /script-src[^;]*'unsafe-eval'/);
    assert.doesNotMatch(csp, /script-src[^;]*nonce-test-nonce/);
    assert.doesNotMatch(csp, /media\*\.giphy\.com/);
  });

  it("keeps production scripts nonce-bound and strict", () => {
    const csp = buildContentSecurityPolicy("production-nonce", {
      APP_URL: "https://whispr.team",
      AUTH_URL: "https://whispr.team",
      NEXTAUTH_URL: "https://whispr.team",
      NODE_ENV: "production",
    });

    assert.match(csp, /script-src[^;]*'nonce-production-nonce'/);
    assert.match(csp, /script-src[^;]*'strict-dynamic'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.match(csp, /upgrade-insecure-requests/);
  });

  it("does not upgrade explicit local production E2E assets to HTTPS", () => {
    const localE2EEnv = {
      APP_URL: "http://127.0.0.1:3000",
      AUTH_URL: "http://127.0.0.1:3000",
      E2E_ALLOW_PRODUCTION_BUILD: "true",
      E2E_TEST_MODE: "true",
      NEXTAUTH_URL: "http://127.0.0.1:3000",
      NODE_ENV: "production",
    };

    assert.doesNotMatch(buildContentSecurityPolicy("e2e-nonce", localE2EEnv), /upgrade-insecure/);
    assert.match(
      buildContentSecurityPolicy("unsafe-e2e-nonce", {
        ...localE2EEnv,
        E2E_ALLOW_PRODUCTION_BUILD: undefined,
      }),
      /upgrade-insecure-requests/,
    );
  });
});

describe("auth middleware fail-closed contract", () => {
  it("lets auth pages validate a signed JWT against the current session before redirecting", () => {
    // A signed cookie can still name a revoked or missing database session.
    // Only auth() in the page may decide whether this user should leave login.
    const disposition = getAuthTokenDisposition({ sub: "user-with-stale-session" });
    assert.equal(disposition.isAuthenticated, true);
    for (const pathname of ["/login", "/register"]) {
      assert.equal(
        getAuthRouteRedirectPath({
          hasAuthSecret: true,
          isAuthenticated: disposition.isAuthenticated,
          pathname,
        }),
        null,
      );
    }
  });
  it("permits only the token-bound Google bridge without a browser session", () => {
    const input = { hasAuthSecret: true, isAuthenticated: false };
    assert.equal(
      getAuthRouteRedirectPath({ ...input, pathname: "/settings/email-change/google" }),
      null,
    );
    for (const pathname of [
      "/settings",
      "/settings/email-change",
      "/settings/email-change/google/other",
    ]) {
      assert.equal(getAuthRouteRedirectPath({ ...input, pathname }), "/login");
    }
  });
  it("redirects protected routes when neither AUTH_SECRET nor NEXTAUTH_SECRET is configured", () => {
    assert.equal(
      getAuthRouteRedirectPath({
        hasAuthSecret: false,
        isAuthenticated: true,
        pathname: "/channels",
      }),
      "/login",
    );
  });

  it("treats revoked and identity-less cookies as anonymous without looping at login", () => {
    for (const token of [{ revoked: true, sub: "user-1" }, { sub: "" }]) {
      const disposition = getAuthTokenDisposition(token);
      assert.deepEqual(disposition, {
        isAuthenticated: false,
        shouldExpireCookies: true,
      });
      assert.equal(
        getAuthRouteRedirectPath({
          hasAuthSecret: true,
          isAuthenticated: disposition.isAuthenticated,
          pathname: "/channels",
        }),
        "/login",
      );
      assert.equal(
        getAuthRouteRedirectPath({
          hasAuthSecret: true,
          isAuthenticated: disposition.isAuthenticated,
          pathname: "/login",
        }),
        null,
      );
    }
  });
});
