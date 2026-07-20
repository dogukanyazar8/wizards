import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMobileOAuthCompletePath,
  buildMobileOAuthStartPath,
  getMobileOAuthGoogleAuthorizationParams,
  getSafeMobileOAuthProvider,
} from "./mobile-oauth-start";

describe("mobile OAuth start paths", () => {
  it("builds safe browser-start and mobile-complete paths", () => {
    assert.equal(
      buildMobileOAuthStartPath("/channels/@me", "google"),
      "/mobile/oauth/start?callbackUrl=%2Fchannels%2F%40me&provider=google",
    );
    assert.equal(
      buildMobileOAuthCompletePath("/channels/@me"),
      "/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me",
    );
  });

  it("sanitizes unsafe callback targets before putting them in URLs", () => {
    assert.equal(
      buildMobileOAuthStartPath("https://evil.example/channels", "google"),
      "/mobile/oauth/start?callbackUrl=%2Fchannels%2F%40me&provider=google",
    );
    assert.equal(
      buildMobileOAuthCompletePath("//evil.example/channels"),
      "/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me",
    );
  });

  it("falls back to Google for unknown provider query values", () => {
    assert.equal(getSafeMobileOAuthProvider("google"), "google");
    assert.equal(getSafeMobileOAuthProvider("discord"), "google");
    assert.equal(getSafeMobileOAuthProvider(undefined), "google");
  });

  it("asks Google to show the account chooser for mobile sign-in", () => {
    assert.deepEqual(getMobileOAuthGoogleAuthorizationParams(), {
      prompt: "select_account",
    });
  });
});
