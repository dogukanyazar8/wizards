import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/invites/whispr-community/preview");
}

function context(params: Record<string, string>, onRead: () => void = () => undefined) {
  return {
    get params() {
      onRead();
      return Promise.resolve(params);
    },
  };
}

function previewFixture() {
  return {
    bannerUrl: null,
    channels: [
      { liveCount: null, name: "duyurular", readOnly: true, type: "text" as const },
      { liveCount: 14, name: "topluluk-sesli", readOnly: false, type: "voice" as const },
    ],
    description: "Yol haritasını burada tartışıyoruz.",
    iconUrl: null,
    joined: true,
    memberCount: 12_400,
    mutualFriendCount: 1,
    mutualFriends: [
      {
        avatarUrl: "https://cdn.whispr.test/avatar.png",
        displayName: "Ada",
        id: "friend-1",
      },
    ],
    name: "Whispr Topluluk",
    onlineCount: 1_200,
    serverId: "server-1",
    slug: "whispr-community",
    verified: true,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    getInvitePreview: async () => previewFixture(),
    ...overrides,
  };
}

describe("mobile invite preview route logic", () => {
  it("authenticates, rate limits, validates the slug, and preserves the joined flag", async () => {
    const { mobileInvitePreviewRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileInvitePreviewRoute(
      request(),
      context({ code: "  whispr-community  " }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        getInvitePreview: async (userId: string, slug: string) => {
          calls.push(`preview:${userId}:${slug}`);
          return previewFixture();
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), previewFixture());
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:invite:preview",
      "params",
      "preview:user-1:whispr-community",
    ]);
  });

  it("returns 404 when the invite service rejects an invalid or expired code", async () => {
    const { mobileInvitePreviewRoute } = await routes;
    const response = await mobileInvitePreviewRoute(
      request(),
      context({ code: "expired-code" }),
      dependencies({
        getInvitePreview: async () => {
          throw new ApiError("Invite not found", 404, "INVITE_NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      code: "INVITE_NOT_FOUND",
      error: "Invite not found",
    });
  });

  it("rejects a malformed code before the preview service runs", async () => {
    const { mobileInvitePreviewRoute } = await routes;
    let previewCalled = false;

    const response = await mobileInvitePreviewRoute(
      request(),
      context({ code: "../admin" }),
      dependencies({
        getInvitePreview: async () => {
          previewCalled = true;
          return previewFixture();
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(previewCalled, false);
  });

  // The "never projects a channel the invite viewer cannot see" case moved to
  // server-public-profile-service.test.ts ("hides channels the default role
  // cannot view") when Task 9 collapsed the invite preview's own permission
  // pass into the shared `buildServerPublicProfile`. The local
  // `buildMobileInvitePreviewResponse` it exercised had no production caller
  // left afterwards.

  it("stops at the rate limit before reading route params", async () => {
    const { mobileInvitePreviewRoute } = await routes;
    let paramsRead = false;

    const response = await mobileInvitePreviewRoute(
      request(),
      context({ code: "whispr-community" }, () => {
        paramsRead = true;
      }),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.equal(paramsRead, false);
  });
});
