import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMobileOAuthCompletePath,
  buildMobileOAuthHandoffUrl,
  buildMobileOAuthStartPath,
  getSafeMobileOAuthState,
  getMobileOAuthGoogleAuthorizationParams,
  getSafeMobileOAuthProvider,
} from "./mobile-oauth-start";

const oauthState = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const handoffToken = "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-"; // gitleaks:allow -- deterministic invalid fixture

describe("mobile OAuth start paths", () => {
  it("builds safe browser-start and mobile-complete paths", () => {
    assert.equal(
      buildMobileOAuthStartPath("/channels/@me", "google", oauthState),
      `/mobile/oauth/start?callbackUrl=%2Fchannels%2F%40me&provider=google&state=${oauthState}`,
    );
    assert.equal(
      buildMobileOAuthCompletePath("/channels/@me", oauthState),
      `/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me&state=${oauthState}`,
    );
    assert.equal(
      buildMobileOAuthHandoffUrl(handoffToken, "/channels/@me", oauthState),
      `whispr://oauth/${handoffToken}?callbackUrl=%2Fchannels%2F%40me&state=${oauthState}`,
    );
  });

  it("sanitizes unsafe callback targets before putting them in URLs", () => {
    assert.equal(
      buildMobileOAuthStartPath("https://evil.example/channels", "google", oauthState),
      `/mobile/oauth/start?callbackUrl=%2Fchannels%2F%40me&provider=google&state=${oauthState}`,
    );
    assert.equal(
      buildMobileOAuthCompletePath("//evil.example/channels", oauthState),
      `/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me&state=${oauthState}`,
    );
  });

  it("accepts only the fixed-width state emitted by the mobile app", () => {
    assert.equal(getSafeMobileOAuthState(oauthState), oauthState);
    assert.equal(getSafeMobileOAuthState("short"), null);
    assert.equal(getSafeMobileOAuthState(undefined), null);
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
