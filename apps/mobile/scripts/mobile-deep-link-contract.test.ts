import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMobileWebRegisterUrl,
  buildMobileWebSignInUrl,
  buildMobileWebSocialSignInUrl,
  normalizeSafeMobileRoutePath,
  parseMobileDeepLink,
} from "../src/deep-link/mobile-deep-links";
import { resolveMobileRoutePathIntent } from "../src/navigation/mobile-linking";
import {
  MOBILE_BADGES_ROUTE_PATH,
  buildMobileBadgesRouteIntent,
} from "../src/social/profile-badges/mobile-badges-route";

const webUrl = "https://whispr.team";
const handoffToken = "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-"; // gitleaks:allow -- deterministic invalid fixture
const oauthState = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // gitleaks:allow -- deterministic invalid fixture

describe("mobile deep link contract", () => {
  it("builds web sign-in URLs without embedding native secrets", () => {
    const url = new URL(buildMobileWebSignInUrl(webUrl, oauthState, "/channels/@me"));

    assert.equal(url.origin, webUrl);
    assert.equal(url.pathname, "/login");
    assert.equal(url.searchParams.get("client"), "mobile");
    assert.equal(
      url.searchParams.get("callbackUrl"),
      `/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me&state=${oauthState}`,
    );
    assert.equal(url.searchParams.has("token"), false);
    assert.equal(url.searchParams.has("access_token"), false);
  });

  it("builds web registration URLs through the same safe mobile handoff contract", () => {
    const url = new URL(buildMobileWebRegisterUrl(webUrl, oauthState, "/channels/@me"));

    assert.equal(url.origin, webUrl);
    assert.equal(url.pathname, "/register");
    assert.equal(url.searchParams.get("client"), "mobile");
    assert.equal(
      url.searchParams.get("callbackUrl"),
      `/mobile/oauth/complete?callbackUrl=%2Fchannels%2F%40me&state=${oauthState}`,
    );
    assert.equal(url.searchParams.has("token"), false);
    assert.equal(url.searchParams.has("password"), false);
  });

  it("starts the Google provider flow on the mobile oauth start route", () => {
    const url = new URL(
      buildMobileWebSocialSignInUrl(webUrl, "google", oauthState, "/channels/@me"),
    );

    assert.equal(url.origin, webUrl);
    assert.equal(url.pathname, "/mobile/oauth/start");
    assert.equal(url.searchParams.get("provider"), "google");
    assert.equal(url.searchParams.get("client"), "mobile");
    assert.equal(url.searchParams.get("callbackUrl"), "/channels/@me");
    assert.equal(url.searchParams.get("state"), oauthState);
    assert.equal(url.searchParams.has("token"), false);
    assert.equal(url.searchParams.has("id_token"), false);
  });

  it("falls back to the default callback when the social callback path is unsafe", () => {
    const url = new URL(
      buildMobileWebSocialSignInUrl(webUrl, "google", oauthState, "https://evil.test/steal"),
    );

    assert.equal(url.pathname, "/mobile/oauth/start");
    assert.equal(url.searchParams.get("callbackUrl"), "/channels/@me");
  });

  it("parses whispr auth handoff links as one-time token intents", () => {
    const result = parseMobileDeepLink(
      `whispr://oauth/${handoffToken}?callbackUrl=%2Fchannels%2F%40me&state=${oauthState}`,
      { webUrl },
    );

    assert.deepEqual(result, {
      intent: {
        callbackPath: "/channels/@me",
        state: oauthState,
        token: handoffToken,
        type: "auth-handoff",
      },
      ok: true,
    });
  });

  it("rejects auth handoffs without a valid OAuth state", () => {
    assert.deepEqual(
      parseMobileDeepLink(`whispr://oauth/${handoffToken}?callbackUrl=%2Fchannels%2F%40me`, {
        webUrl,
      }),
      { ok: false, reason: "invalid-auth-handoff" },
    );
    assert.deepEqual(
      parseMobileDeepLink(
        `whispr://oauth/${handoffToken}?callbackUrl=%2Fchannels%2F%40me&state=short`,
        { webUrl },
      ),
      { ok: false, reason: "invalid-auth-handoff" },
    );
  });

  it("parses future web-origin mobile handoff links without trusting other origins", () => {
    assert.equal(
      parseMobileDeepLink(
        `https://whispr.team/mobile/oauth/complete?handoff=${handoffToken}&callbackUrl=%2Fchannels&state=${oauthState}`,
        { webUrl },
      ).ok,
      true,
    );

    assert.deepEqual(
      parseMobileDeepLink(`https://evil.example/mobile/oauth/complete?handoff=${handoffToken}`, {
        webUrl,
      }),
      { ok: false, reason: "external-origin" },
    );
  });

  it("rejects URLs that carry OAuth or session secrets in query strings", () => {
    assert.deepEqual(parseMobileDeepLink("whispr://channels/@me?access_token=secret", { webUrl }), {
      ok: false,
      reason: "sensitive-query",
    });

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

  it("parses Android call notification answer taps", () => {
    assert.deepEqual(
      parseMobileDeepLink("whispr://channels/@me/conv-1?call=answer&from=user-9&type=video", {
        webUrl,
      }),
      {
        intent: {
          callType: "video",
          conversationId: "conv-1",
          fromUserId: "user-9",
          type: "dm-call-answer",
        },
        ok: true,
      },
    );

    // Missing or unknown call type falls back to voice.
    assert.deepEqual(
      parseMobileDeepLink("whispr://channels/@me/conv-1?call=answer&from=user-9", { webUrl }),
      {
        intent: {
          callType: "voice",
          conversationId: "conv-1",
          fromUserId: "user-9",
          type: "dm-call-answer",
        },
        ok: true,
      },
    );
  });

  it("parses bounded mobile performance automation commands", () => {
    assert.deepEqual(parseMobileDeepLink("whispr://performance/reset?runId=run-06_a", { webUrl }), {
      intent: { command: "reset", runId: "run-06_a", type: "performance-automation" },
      ok: true,
    });
    assert.deepEqual(
      parseMobileDeepLink(
        "whispr://performance/purge?runId=run-08&scope=dm&targetId=a2190c2f-bc49-4cf0-862f-bbd0f8724e26",
        { webUrl },
      ),
      {
        intent: {
          command: "purge",
          runId: "run-08",
          scope: "dm",
          targetId: "a2190c2f-bc49-4cf0-862f-bbd0f8724e26",
          type: "performance-automation",
        },
        ok: true,
      },
    );
    assert.deepEqual(
      parseMobileDeepLink(
        "whispr://performance/prefetch?runId=run-11&scope=channel&targetId=521474f4-111a-4654-bffb-41e41450dd29",
        { webUrl },
      ),
      {
        intent: {
          command: "prefetch",
          runId: "run-11",
          scope: "channel",
          targetId: "521474f4-111a-4654-bffb-41e41450dd29",
          type: "performance-automation",
        },
        ok: true,
      },
    );
    assert.deepEqual(parseMobileDeepLink("whispr://performance/export?runId=run-14", { webUrl }), {
      intent: { command: "export", runId: "run-14", type: "performance-automation" },
      ok: true,
    });
  });

  it("rejects malformed or over-broad performance automation commands", () => {
    for (const url of [
      "whispr://performance/reset?runId=bad%20run",
      "whispr://performance/purge?runId=run-1&scope=all&targetId=target-1",
      "whispr://performance/prefetch?runId=run-1&scope=dm&targetId=../target",
      "whispr://performance/export?runId=run-1&targetId=target-1",
      "whispr://performance/wipe?runId=run-1",
    ]) {
      assert.deepEqual(parseMobileDeepLink(url, { webUrl }), {
        ok: false,
        reason: "invalid-performance-command",
      });
    }
  });

  it("falls back to the plain DM route when an answer link is incomplete", () => {
    // No "from" and non-answer actions must still open the conversation.
    assert.deepEqual(parseMobileDeepLink("whispr://channels/@me/conv-1?call=answer", { webUrl }), {
      intent: { path: "/channels/@me/conv-1?call=answer", type: "route" },
      ok: true,
    });

    assert.deepEqual(
      parseMobileDeepLink("whispr://channels/@me/conv-1?call=bogus&from=user-9", { webUrl }),
      {
        intent: { path: "/channels/@me/conv-1?call=bogus&from=user-9", type: "route" },
        ok: true,
      },
    );
  });

  it("routes the seven About destinations", () => {
    assert.deepEqual(resolveMobileRoutePathIntent("/settings/about/whats-new"), {
      name: "AboutWhatsNew",
      params: undefined,
      type: "route",
    });
    assert.deepEqual(resolveMobileRoutePathIntent("/settings/about/releases"), {
      name: "AboutReleaseHistory",
      params: undefined,
      type: "route",
    });
    assert.deepEqual(resolveMobileRoutePathIntent("/settings/about/releases/0.8.15"), {
      name: "AboutReleaseNote",
      params: { version: "0.8.15" },
      type: "route",
    });
    assert.deepEqual(resolveMobileRoutePathIntent("/settings/about/channel"), {
      name: "AboutUpdateChannel",
      params: undefined,
      type: "route",
    });
    assert.deepEqual(resolveMobileRoutePathIntent("/help"), {
      name: "HelpCenter",
      params: undefined,
      type: "route",
    });
    assert.deepEqual(resolveMobileRoutePathIntent("/help/report"), {
      name: "BugReport",
      params: undefined,
      type: "route",
    });
    assert.deepEqual(resolveMobileRoutePathIntent("/invite/whispr-community"), {
      name: "CommunityInvite",
      params: { slug: "whispr-community" },
      type: "route",
    });
  });

  it("opens Rozetlerim, with or without the badge a notification names", () => {
    // 07 §2 deep link. The section is a free string on `SettingsDetail`, so the
    // screen is reached through the same `settings/:section` branch every other
    // settings destination uses.
    assert.deepEqual(resolveMobileRoutePathIntent("/settings/badges"), {
      name: "SettingsDetail",
      params: { section: "badges" },
      type: "route",
    });
    assert.deepEqual(resolveMobileRoutePathIntent("/settings/badges?badge=streak"), {
      name: "SettingsDetail",
      params: { badgeId: "streak", section: "badges" },
      type: "route",
    });
  });

  it("routes a BADGE notification on its type, not on its action URL", () => {
    // 07 §4: the row opens "Rozetlerim" whether or not it carries a URL, and an
    // id that is not in the catalog is dropped rather than carried through.
    assert.deepEqual(buildMobileBadgesRouteIntent("streak"), {
      name: "SettingsDetail",
      params: { badgeId: "streak", section: "badges" },
      type: "route",
    });
    assert.deepEqual(buildMobileBadgesRouteIntent(null), {
      name: "SettingsDetail",
      params: { section: "badges" },
      type: "route",
    });
    assert.deepEqual(buildMobileBadgesRouteIntent("not-a-badge"), {
      name: "SettingsDetail",
      params: { section: "badges" },
      type: "route",
    });
    assert.equal(MOBILE_BADGES_ROUTE_PATH, "/settings/badges");
  });

  it("keeps the two-segment About paths off the single-segment settings branch", () => {
    // `settings/:section` must not claim `/settings/about/channel` as a section
    // named "about" — the About paths are matched before it.
    assert.deepEqual(resolveMobileRoutePathIntent("/settings/about"), {
      name: "SettingsDetail",
      params: { section: "about" },
      type: "route",
    });
    assert.equal(resolveMobileRoutePathIntent("/settings/about/nope"), null);
    // §4.17 lets 2e enter the form with the category already chosen.
    assert.deepEqual(resolveMobileRoutePathIntent("/help/report?category=voice"), {
      name: "BugReport",
      params: { category: "voice" },
      type: "route",
    });
  });

  it("leaves whispr://invite/<code> on the existing server-invite command flow", () => {
    // 2g is reachable by path, but an inbound invite link is still the
    // auto-accept intent it has always been; the community screen does not get
    // to intercept a server invite.
    assert.deepEqual(parseMobileDeepLink("whispr://invite/ABC_def-123?mobile=1", { webUrl }), {
      intent: { autoAccept: true, code: "ABC_def-123", type: "invite" },
      ok: true,
    });
  });

  it("normalizes only safe in-app mobile route paths", () => {
    assert.equal(normalizeSafeMobileRoutePath("/channels/@me"), "/channels/@me");
    assert.equal(normalizeSafeMobileRoutePath("/settings?panel=voice"), "/settings?panel=voice");
    assert.equal(normalizeSafeMobileRoutePath("https://evil.example/channels"), "/channels");
    // F7 put `/admin` on the routable list so a MODERATION notification can open
    // the case file. It stays an allowlist decision only: the screen and every
    // endpoint under it still ask the server whether this account may look.
    assert.equal(
      normalizeSafeMobileRoutePath("/admin/moderation/case-1"),
      "/admin/moderation/case-1",
    );
    assert.equal(normalizeSafeMobileRoutePath("/administration"), "/channels");
    // 2e/2f are routable, so a `/help` link survives normalization instead of
    // collapsing to the channel list.
    assert.equal(normalizeSafeMobileRoutePath("/help"), "/help");
    assert.equal(
      normalizeSafeMobileRoutePath("/help/report?category=voice"),
      "/help/report?category=voice",
    );
    assert.equal(
      normalizeSafeMobileRoutePath("/settings/about/releases/0.8.15"),
      "/settings/about/releases/0.8.15",
    );
    assert.equal(normalizeSafeMobileRoutePath("/helpdesk"), "/channels");
    assert.equal(normalizeSafeMobileRoutePath("/desktop/voice-mini"), "/channels");
    assert.equal(normalizeSafeMobileRoutePath("/channels?refresh_token=secret"), "/channels");
  });
});
