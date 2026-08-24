import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_AUTH_REDIRECT_PATH } from "./redirect";
import { resolveLoginRedirect } from "./login-redirect";

describe("login redirect resolution", () => {
  it("continues to the mobile OAuth completion callback when a browser session already exists", () => {
    const resolution = resolveLoginRedirect({
      callbackUrl: "/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me",
      hasSession: true,
    });

    assert.equal(resolution.redirectTo, "/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me");
    assert.equal(resolution.callbackUrl, resolution.redirectTo);
    assert.equal(resolution.authError, null);
  });

  it("keeps unauthenticated users on login with the sanitized callback", () => {
    const resolution = resolveLoginRedirect({
      callbackUrl: "/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me",
      hasSession: false,
    });

    assert.equal(resolution.redirectTo, null);
    assert.equal(resolution.callbackUrl, "/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me");
  });

  it("does not hide explicit auth errors behind an authenticated redirect", () => {
    const resolution = resolveLoginRedirect({
      callbackUrl: "/messages",
      error: "OAuthAccountNotLinked",
      hasSession: true,
    });

    assert.equal(resolution.redirectTo, null);
    assert.equal(resolution.callbackUrl, "/messages");
    assert.equal(resolution.authError, "OAuthAccountNotLinked");
  });

  it("never redirects authenticated users to external or native-scheme callback URLs", () => {
    assert.equal(
      resolveLoginRedirect({
        callbackUrl: "https://evil.example/mobile/oauth/complete",
        hasSession: true,
      }).redirectTo,
      DEFAULT_AUTH_REDIRECT_PATH,
    );

    assert.equal(
      resolveLoginRedirect({
        callbackUrl: "whispr://oauth/secret",
        hasSession: true,
      }).redirectTo,
      DEFAULT_AUTH_REDIRECT_PATH,
    );
  });
});
