import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServerPublicProfile } from "@wizards/types";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/profile");
}

function context(params: Record<string, string>, onRead: () => void = () => undefined) {
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
    channelCount: 1,
    channels: [
      {
        categoryId: null,
        categoryName: null,
        id: "channel-1",
        isPrivate: false,
        lastActivityAt: null,
        liveCount: 14,
        name: "topluluk-sesli",
        participants: [],
        readOnly: false,
        type: "voice",
      },
    ],
    createdAt: "2026-01-02T03:04:05.000Z",
    description: "Yol haritasını burada tartışıyoruz.",
    discoverable: true,
    iconUrl: null,
    inviteAddress: "whispr.gg/whispr-community",
    isPublic: true,
    joined: true,
    joinedAt: "2026-02-03T04:05:06.000Z",
    memberCount: 12_400,
    muted: false,
    mutualFriendCount: 1,
    mutualFriends: [{ avatarUrl: null, displayName: "Ada", id: "friend-1" }],
    name: "Whispr Topluluk",
    notificationLevel: "all",
    onlineCount: 1_200,
    serverId: "server-1",
    shortName: null,
    starred: false,
    tags: ["sohbet"],
    type: "COMMUNITY",
    upcomingEvent: null,
    verified: true,
    voiceActiveCount: 14,
    weeklyMessageCount: 480,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: async () => "user-1",
    getProfile: async () => profileFixture(),
    ...overrides,
  };
}

describe("mobile server profile route logic", () => {
  it("authorizes, resolves params, and returns the profile as the viewer", async () => {
    const { mobileServerProfileRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerProfileRoute(
      request(),
      context({ serverId: "  server-1  " }, () => calls.push("params")),
      dependencies({
        authorize: async (_request: Request, action: string) => {
          calls.push(`authorize:${action}`);
          return "user-1";
        },
        getProfile: async (serverId: string, viewerId: string | null) => {
          calls.push(`profile:${serverId}:${viewerId}`);
          return profileFixture();
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), profileFixture());
    assert.deepEqual(calls, [
      "authorize:mobile:server:profile",
      "params",
      "profile:server-1:user-1",
    ]);
  });

  it("returns 404 when the server is hidden from this viewer", async () => {
    const { mobileServerProfileRoute } = await routes;

    const response = await mobileServerProfileRoute(
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

  it("rejects an unauthenticated request before reading params", async () => {
    const { mobileServerProfileRoute } = await routes;
    let paramsRead = false;

    const response = await mobileServerProfileRoute(
      request(),
      context({ serverId: "server-1" }, () => {
        paramsRead = true;
      }),
      dependencies({
        authorize: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(paramsRead, false);
  });

  it("rejects a malformed serverId param", async () => {
    const { mobileServerProfileRoute } = await routes;
    let profileCalled = false;

    const response = await mobileServerProfileRoute(
      request(),
      context({ serverId: "" }),
      dependencies({
        getProfile: async () => {
          profileCalled = true;
          return profileFixture();
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(profileCalled, false);
  });
});
