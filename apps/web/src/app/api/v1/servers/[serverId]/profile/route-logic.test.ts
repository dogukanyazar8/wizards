import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServerPublicProfile } from "@wizards/types";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/servers/server-1/profile");
}

function context(params: { serverId: string }, onRead: () => void = () => undefined) {
  return {
    get params() {
      onRead();
      return Promise.resolve(params);
    },
  };
}

function profileFixture(): ServerPublicProfile {
  return {
    accessLevel: "public",
    admins: [],
    bannerUrl: null,
    canManageServer: false,
    category: null,
    channelCount: 1,
    channels: [
      {
        categoryId: null,
        categoryName: null,
        id: "channel-1",
        isPrivate: false,
        lastActivityAt: null,
        liveCount: null,
        name: "duyurular",
        participants: [],
        readOnly: true,
        type: "text",
      },
    ],
    createdAt: "2026-01-02T03:04:05.000Z",
    description: "Yol haritasını burada tartışıyoruz.",
    discoverable: true,
    iconColor: null,
    iconUrl: null,
    inviteAddress: "whispr.gg/whispr-community",
    isPublic: true,
    joined: false,
    joinedAt: null,
    languages: [],
    memberCount: 12_400,
    muted: false,
    mutualFriendCount: 0,
    mutualFriends: [],
    name: "Whispr Topluluk",
    notificationLevel: "all",
    onlineCount: 1_200,
    serverId: "server-1",
    shortName: null,
    starred: false,
    tags: [],
    type: "COMMUNITY",
    upcomingEvent: null,
    verified: true,
    voiceActiveCount: 0,
    voiceRoomCount: 0,
    weeklyMessageCount: null,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    enforceRateLimit: async () => undefined,
    getProfile: async () => profileFixture(),
    resolveViewerId: async () => "viewer-1",
    ...overrides,
  };
}

describe("web server profile route logic", () => {
  it("resolves the viewer, rate limits by their id, and returns the profile", async () => {
    const { serverProfileRoute } = await routes;
    const calls: string[] = [];

    const response = await serverProfileRoute(
      request(),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        enforceRateLimit: async (key: string, action: string) => {
          calls.push(`rate:${key}:${action}`);
        },
        getProfile: async (serverId: string, viewerId: string | null) => {
          calls.push(`profile:${serverId}:${viewerId}`);
          return profileFixture();
        },
        resolveViewerId: async () => {
          calls.push("viewer");
          return "viewer-1";
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), profileFixture());
    assert.deepEqual(calls, [
      "viewer",
      "rate:viewer-1:server:profile",
      "params",
      "profile:server-1:viewer-1",
    ]);
  });

  it("passes a null viewerId through to the profile lookup when there is no session", async () => {
    const { serverProfileRoute } = await routes;
    let receivedViewerId: string | null | undefined;

    const response = await serverProfileRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        resolveViewerId: async () => null,
        getProfile: async (_serverId: string, viewerId: string | null) => {
          receivedViewerId = viewerId;
          return profileFixture();
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(receivedViewerId, null);
  });

  it("rate limits an anonymous caller by a hashed client identity, not a shared key", async () => {
    const { serverProfileRoute } = await routes;
    let observedKey: string | undefined;

    await serverProfileRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        enforceRateLimit: async (key: string) => {
          observedKey = key;
        },
        resolveViewerId: async () => null,
      }),
    );

    assert.ok(
      observedKey === "untrusted",
      `expected the shared untrusted identity, got ${observedKey}`,
    );
  });

  it("returns 404 when the server is hidden from this viewer", async () => {
    const { serverProfileRoute } = await routes;

    const response = await serverProfileRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        getProfile: async () => {
          throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Server not found",
      code: "SERVER_NOT_FOUND",
    });
  });

  it("stops at the rate limit before reading route params", async () => {
    const { serverProfileRoute } = await routes;
    let paramsRead = false;

    const response = await serverProfileRoute(
      request(),
      context({ serverId: "server-1" }, () => {
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
