import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildContentSecurityPolicy,
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
});

describe("auth middleware fail-closed contract", () => {
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
});
