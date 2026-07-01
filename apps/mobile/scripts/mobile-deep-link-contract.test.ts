import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMobileWebRegisterUrl,
  buildMobileWebSignInUrl,
  normalizeSafeMobileRoutePath,
  parseMobileDeepLink,
} from "../src/deep-link/mobile-deep-links";

const webUrl = "https://whispr.team";
const handoffToken = "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-";

describe("mobile deep link contract", () => {
  it("builds web sign-in URLs without embedding native secrets", () => {
    const url = new URL(buildMobileWebSignInUrl(webUrl, "/channels/@me"));

    assert.equal(url.origin, webUrl);
    assert.equal(url.pathname, "/login");
    assert.equal(url.searchParams.get("client"), "mobile");
    assert.equal(
      url.searchParams.get("callbackUrl"),
      "/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me",
    );
    assert.equal(url.searchParams.has("token"), false);
    assert.equal(url.searchParams.has("access_token"), false);
  });

  it("builds web registration URLs through the same safe mobile handoff contract", () => {
    const url = new URL(buildMobileWebRegisterUrl(webUrl, "/channels/@me"));

    assert.equal(url.origin, webUrl);
    assert.equal(url.pathname, "/register");
    assert.equal(url.searchParams.get("client"), "mobile");
    assert.equal(
      url.searchParams.get("callbackUrl"),
      "/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me",
    );
    assert.equal(url.searchParams.has("token"), false);
    assert.equal(url.searchParams.has("password"), false);
  });

  it("parses whispr auth handoff links as one-time token intents", () => {
    const result = parseMobileDeepLink(
      `whispr://oauth/${handoffToken}?callbackUrl=%2Fchannels%2F%40me`,
      { webUrl },
    );

    assert.deepEqual(result, {
      intent: {
        callbackPath: "/channels/@me",
        token: handoffToken,
        type: "auth-handoff",
      },
      ok: true,
    });
  });

  it("parses future web-origin mobile handoff links without trusting other origins", () => {
    assert.equal(
      parseMobileDeepLink(
        `https://whispr.team/mobile/oauth/complete?handoff=${handoffToken}&callbackUrl=%2Fchannels`,
        { webUrl },
      ).ok,
      true,
    );

    assert.deepEqual(
      parseMobileDeepLink(
        `https://evil.example/mobile/oauth/complete?handoff=${handoffToken}`,
        { webUrl },
      ),
      { ok: false, reason: "external-origin" },
    );
  });

  it("rejects URLs that carry OAuth or session secrets in query strings", () => {
    assert.deepEqual(
      parseMobileDeepLink("whispr://channels/@me?access_token=secret", { webUrl }),
      { ok: false, reason: "sensitive-query" },
    );

    assert.deepEqual(
      parseMobileDeepLink("https://whispr.team/channels?code=oauth-code", { webUrl }),
      { ok: false, reason: "sensitive-query" },
    );
  });

  it("parses safe invite links and rejects traversal-like codes", () => {
    assert.deepEqual(parseMobileDeepLink("whispr://invite/ABC_def-123?mobile=1", { webUrl }), {
      intent: {
        autoAccept: true,
        code: "ABC_def-123",
        type: "invite",
      },
      ok: true,
    });

    assert.deepEqual(parseMobileDeepLink("whispr://invite/..%5Csettings", { webUrl }), {
      ok: false,
      reason: "invalid-invite-code",
    });
  });

  it("normalizes only safe in-app mobile route paths", () => {
    assert.equal(normalizeSafeMobileRoutePath("/channels/@me"), "/channels/@me");
    assert.equal(normalizeSafeMobileRoutePath("/settings?panel=voice"), "/settings?panel=voice");
    assert.equal(normalizeSafeMobileRoutePath("https://evil.example/channels"), "/channels");
    assert.equal(normalizeSafeMobileRoutePath("/admin"), "/channels");
    assert.equal(normalizeSafeMobileRoutePath("/channels?refresh_token=secret"), "/channels");
  });
});
