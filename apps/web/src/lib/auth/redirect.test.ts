import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_AUTH_REDIRECT_PATH, getSafeAuthRedirectPath } from "./redirect";

describe("auth redirect safety", () => {
  it("allows the desktop OAuth completion callback without broadening desktop routes", () => {
    assert.equal(
      getSafeAuthRedirectPath("/desktop/oauth/complete?callbackUrl=%2Fchannels%2F%40me"),
      "/desktop/oauth/complete?callbackUrl=%2Fchannels%2F%40me",
    );

    assert.equal(
      getSafeAuthRedirectPath("/desktop/oauth/claim/token"),
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    assert.equal(
      getSafeAuthRedirectPath("/desktop/oauth/start?callbackUrl=%2Fchannels"),
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    assert.equal(getSafeAuthRedirectPath("/desktop/start"), DEFAULT_AUTH_REDIRECT_PATH);
  });

  it("rejects external and scheme-relative redirect targets", () => {
    assert.equal(
      getSafeAuthRedirectPath("https://evil.example/channels"),
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    assert.equal(getSafeAuthRedirectPath("//evil.example/channels"), DEFAULT_AUTH_REDIRECT_PATH);
    assert.equal(getSafeAuthRedirectPath("whispr://channels/@me"), DEFAULT_AUTH_REDIRECT_PATH);
  });
});
