import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMobileDeepLink } from "../src/deep-link/mobile-deep-links";
import {
  MOBILE_SOCIAL_AUTH_REDIRECT_URL,
  runMobileSocialAuthSession,
  type MobileSocialAuthSessionRawResult,
} from "../src/auth/mobile-social-auth-session";

const webUrl = "https://whispr.team";
const oauthState = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // gitleaks:allow -- deterministic invalid fixture
const startUrl = `${webUrl}/mobile/oauth/start?callbackUrl=%2Fchannels%2F%40me&provider=google&state=${oauthState}`;
const handoffToken = "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-"; // gitleaks:allow -- deterministic invalid fixture

function createSession(
  open: (url: string, redirectUrl: string) => Promise<MobileSocialAuthSessionRawResult>,
) {
  return runMobileSocialAuthSession({
    openAuthSession: open,
    parseDeepLink: (url) => parseMobileDeepLink(url, { webUrl }),
    startUrl,
  });
}

describe("mobile in-app social auth session", () => {
  it("completes inside the app and returns only the one-time handoff token", async () => {
    const calls: Array<[string, string]> = [];
    const outcome = await createSession(async (url, redirectUrl) => {
      calls.push([url, redirectUrl]);
      return {
        type: "success",
        url: `whispr://oauth/${handoffToken}?callbackUrl=%2Fchannels%2F%40me&state=${oauthState}`,
      };
    });

    assert.deepEqual(calls, [[startUrl, MOBILE_SOCIAL_AUTH_REDIRECT_URL]]);
    assert.deepEqual(outcome, {
      callbackPath: "/channels/@me",
      handoffToken,
      state: oauthState,
      type: "completed",
    });
  });

  it("treats a closed consent sheet as a cancellation rather than a failure", async () => {
    for (const type of ["cancel", "dismiss"] as const) {
      assert.deepEqual(await createSession(async () => ({ type })), { type: "cancelled" });
    }
  });

  it("rejects redirect URLs that are not a valid auth handoff", async () => {
    const outcome = await createSession(async () => ({
      type: "success",
      url: "whispr://oauth/short?callbackUrl=%2Fchannels",
    }));

    assert.deepEqual(outcome, { reason: "invalid-callback", type: "failed" });
  });

  it("rejects redirect URLs that smuggle provider secrets back into the app", async () => {
    const outcome = await createSession(async () => ({
      type: "success",
      url: `whispr://oauth/${handoffToken}?id_token=leaked`,
    }));

    assert.deepEqual(outcome, { reason: "invalid-callback", type: "failed" });
  });

  it("reports the browser as unavailable so the caller can fall back", async () => {
    const thrown = await createSession(async () => {
      throw new Error("no custom tabs");
    });
    const missingUrl = await createSession(async () => ({ type: "success", url: null }));

    assert.deepEqual(thrown, { reason: "unavailable", type: "failed" });
    assert.deepEqual(missingUrl, { reason: "unavailable", type: "failed" });
  });
});
