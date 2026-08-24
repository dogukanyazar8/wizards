import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

const ada = { avatarUrl: null, displayName: "Ada", id: "user-2", username: "ada" };
const dogukan = { avatarUrl: null, displayName: "Dogukan", id: "user-1", username: "dogukan" };
const pendingRequest = {
  createdAt: "2026-07-11T10:00:00.000Z",
  id: "request-1",
  receiver: ada,
  receiverId: ada.id,
  sender: dogukan,
  senderId: dogukan.id,
  status: "PENDING" as const,
  updatedAt: "2026-07-11T10:00:00.000Z",
};
const searchResult = {
  ...ada,
  isMember: false,
  mutualServerCount: 0,
  pendingInviteId: null,
  relationship: "none" as const,
  requestId: null,
};
const adaAsFriend = {
  ...ada,
  allowsGroupInvites: true,
  customStatus: null,
  lastSeenAt: "2026-07-11T09:00:00.000Z",
  presence: { customStatus: null, status: "ONLINE" as const },
  status: "ONLINE" as const,
  voiceRoom: null,
};

function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`https://whispr.test${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

/** Every enrichment field the response schema defaults in for a friend row. */
const friendEnrichmentDefaults = { device: null, voiceRoom: null };
/** ...and for a pending request row. */
const requestEnrichmentDefaults = {
  mutualFriendCount: 0,
  mutualServerCount: 0,
  mutualServerName: null,
  viaUsername: null,
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    listFriendSuggestions: async () => [],
    resolveFriendActivity: async () => new Map(),
    resolveFriendRequestContext: async () => new Map(),
    actOnFriendRequest: async (
      _userId: string,
      _requestId: string,
      action: "accept" | "decline",
    ) => ({
      ...pendingRequest,
      status: action === "accept" ? ("ACCEPTED" as const) : ("DECLINED" as const),
    }),
    authenticate: async () => "user-1",
    blockUser: async () => ada,
    cancelFriendRequest: async () => undefined,
    enforceRateLimit: async () => undefined,
    listBlockedUsers: async () => [ada],
    listFriends: async () => [adaAsFriend],
    listPendingFriendRequests: async () => ({ incoming: [pendingRequest], outgoing: [] }),
    parseBody: parseJsonBody,
    removeFriend: async () => undefined,
    searchUsers: async () => [searchResult],
    sendFriendRequest: async () => pendingRequest,
    unblockUser: async () => undefined,
    ...overrides,
  };
}

describe("mobile friends route logic", () => {
  it("authenticates, rate limits, and returns the combined friends overview", async () => {
    const { mobileFriendsListRoute } = await routes;
    const calls: string[] = [];
    const response = await mobileFriendsListRoute(
      new Request("https://whispr.test/api/v1/mobile/friends"),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) =>
          calls.push(`rate:${userId}:${action}`),
        listBlockedUsers: async (userId: string) => {
          calls.push(`blocked:${userId}`);
          return [ada];
        },
        listFriends: async (userId: string) => {
          calls.push(`friends:${userId}`);
          return [adaAsFriend];
        },
        listPendingFriendRequests: async (userId: string) => {
          calls.push(`pending:${userId}`);
          return { incoming: [pendingRequest], outgoing: [] };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      blocked: [ada],
      friends: [{ ...adaAsFriend, ...friendEnrichmentDefaults }],
      pending: {
        incoming: [{ ...pendingRequest, ...requestEnrichmentDefaults }],
        outgoing: [],
      },
    });
    assert.equal(calls[0], "auth");
    assert.equal(calls[1], "rate:user-1:mobile:friends:list");
    assert.deepEqual(
      new Set(calls.slice(2)),
      new Set(["blocked:user-1", "friends:user-1", "pending:user-1"]),
    );
  });

  it("creates and acts on friend requests with strict mobile contracts", async () => {
    const {
      mobileFriendRequestAcceptRoute,
      mobileFriendRequestCreateRoute,
      mobileFriendRequestRejectRoute,
    } = await routes;
    const calls: string[] = [];
    const deps = dependencies({
      actOnFriendRequest: async (userId: string, requestId: string, action: string) => {
        calls.push(`${action}:${userId}:${requestId}`);
        return { ...pendingRequest, status: action === "accept" ? "ACCEPTED" : "DECLINED" };
      },
      enforceRateLimit: async (_userId: string, action: string) => calls.push(action),
      sendFriendRequest: async (userId: string, username: string) => {
        calls.push(`send:${userId}:${username}`);
        return pendingRequest;
      },
    });

    const createResponse = await mobileFriendRequestCreateRoute(
      jsonRequest("/api/v1/mobile/friends/requests", "POST", { username: "  ada  " }),
      deps,
    );
    const acceptResponse = await mobileFriendRequestAcceptRoute(
      jsonRequest("/api/v1/mobile/friends/requests/request-1/accept", "POST"),
      context({ id: "request-1" }),
      deps,
    );
    const rejectResponse = await mobileFriendRequestRejectRoute(
      jsonRequest("/api/v1/mobile/friends/requests/request-1/reject", "POST"),
      context({ id: "request-1" }),
      deps,
    );

    assert.equal(createResponse.status, 201);
    assert.equal(acceptResponse.status, 200);
    assert.equal(rejectResponse.status, 200);
    assert.deepEqual(calls, [
      "mobile:friends:request",
      "send:user-1:ada",
      "mobile:friends:request-action",
      "accept:user-1:request-1",
      "mobile:friends:request-action",
      "decline:user-1:request-1",
    ]);
  });

  it("removes, blocks, and unblocks only after params validation and rate limiting", async () => {
    const { mobileFriendBlockRoute, mobileFriendRemoveRoute, mobileFriendUnblockRoute } =
      await routes;
    const calls: string[] = [];
    const deps = dependencies({
      blockUser: async (userId: string, targetId: string) => {
        calls.push(`block:${userId}:${targetId}`);
        return ada;
      },
      enforceRateLimit: async (_userId: string, action: string) => calls.push(action),
      removeFriend: async (userId: string, targetId: string) =>
        calls.push(`remove:${userId}:${targetId}`),
      unblockUser: async (userId: string, targetId: string) =>
        calls.push(`unblock:${userId}:${targetId}`),
    });

    const remove = await mobileFriendRemoveRoute(
      new Request("https://whispr.test"),
      context({ userId: "user-2" }),
      deps,
    );
    const block = await mobileFriendBlockRoute(
      new Request("https://whispr.test"),
      context({ userId: "user-2" }),
      deps,
    );
    const unblock = await mobileFriendUnblockRoute(
      new Request("https://whispr.test"),
      context({ userId: "user-2" }),
      deps,
    );

    assert.deepEqual(await remove.json(), { success: true });
    assert.deepEqual(await block.json(), { blocked: ada });
    assert.deepEqual(await unblock.json(), { success: true });
    assert.deepEqual(calls, [
      "mobile:friends:remove",
      "remove:user-1:user-2",
      "mobile:friends:block",
      "block:user-1:user-2",
      "mobile:friends:block",
      "unblock:user-1:user-2",
    ]);
  });

  it("searches users behind auth, a rate limit and the bounded query contract", async () => {
    const { mobileFriendUserSearchRoute } = await routes;
    const calls: string[] = [];
    const deps = dependencies({
      enforceRateLimit: async (_userId: string, action: string) => calls.push(action),
      searchUsers: async (userId: string, term: string, limit: number, serverId?: string) => {
        calls.push(`search:${userId}:${term}:${limit}:${serverId ?? "-"}`);
        return [
          searchResult,
          {
            ...dogukan,
            isMember: false,
            mutualServerCount: 0,
            pendingInviteId: null,
            relationship: "outgoing" as const,
            requestId: "request-1",
          },
        ];
      },
    });

    const response = await mobileFriendUserSearchRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/search?q=%20ada%20&limit=5"),
      deps,
    );
    const defaultLimit = await mobileFriendUserSearchRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/search?q=ad"),
      deps,
    );
    const tooShort = await mobileFriendUserSearchRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/search?q=a"),
      dependencies(),
    );
    const overLimit = await mobileFriendUserSearchRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/search?q=ada&limit=500"),
      dependencies(),
    );

    // Invite sheet 2b scopes the same search to one server; global search does not.
    const scoped = await mobileFriendUserSearchRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/search?q=ada&serverId=server-1"),
      deps,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      results: [
        searchResult,
        {
          ...dogukan,
          isMember: false,
          mutualServerCount: 0,
          pendingInviteId: null,
          relationship: "outgoing",
          requestId: "request-1",
        },
      ],
    });
    assert.equal(defaultLimit.status, 200);
    assert.equal(scoped.status, 200);
    assert.equal(tooShort.status, 400);
    assert.equal(overLimit.status, 400);
    assert.deepEqual(calls, [
      "mobile:friends:search",
      "search:user-1:ada:5:-",
      "mobile:friends:search",
      "search:user-1:ad:20:-",
      "mobile:friends:search",
      "search:user-1:ada:20:server-1",
    ]);
  });

  it("cancels an outgoing request only for the sender", async () => {
    const { mobileFriendRequestCancelRoute } = await routes;
    const calls: string[] = [];
    const cancelled = await mobileFriendRequestCancelRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/requests/request-1", {
        method: "DELETE",
      }),
      context({ id: "request-1" }),
      dependencies({
        cancelFriendRequest: async (userId: string, requestId: string) =>
          void calls.push(`cancel:${userId}:${requestId}`),
        enforceRateLimit: async (_userId: string, action: string) => calls.push(action),
      }),
    );
    const forbidden = await mobileFriendRequestCancelRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/requests/request-1", {
        method: "DELETE",
      }),
      context({ id: "request-1" }),
      dependencies({
        cancelFriendRequest: async () => {
          throw new ApiError("Only the sender can cancel this request", 403);
        },
      }),
    );

    assert.equal(cancelled.status, 200);
    assert.deepEqual(await cancelled.json(), { success: true });
    assert.deepEqual(calls, ["mobile:friends:request-action", "cancel:user-1:request-1"]);
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), {
      error: "Only the sender can cancel this request",
    });
  });

  it("returns bounded shared errors before calling domain services", async () => {
    const { mobileFriendRequestCreateRoute, mobileFriendRemoveRoute } = await routes;
    const unauthorized = await mobileFriendRequestCreateRoute(
      jsonRequest("/api/v1/mobile/friends/requests", "POST", { username: "ada" }),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    const invalid = await mobileFriendRemoveRoute(
      new Request("https://whispr.test"),
      context({ userId: "" }),
      dependencies(),
    );

    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      error: "String must contain at least 1 character(s)",
    });
  });

  it("attaches 1b activity to friends and 1c context to the counterpart of each request", async () => {
    const { mobileFriendsListRoute } = await routes;
    const seen: unknown[] = [];
    const response = await mobileFriendsListRoute(
      new Request("https://whispr.test/api/v1/mobile/friends"),
      dependencies({
        resolveFriendActivity: async (viewerId: string, userIds: string[]) => {
          seen.push({ activity: { userIds, viewerId } });
          return new Map([
            [
              ada.id,
              {
                device: "MOBILE",
                voiceRoom: {
                  channelId: "channel-1",
                  channelName: "live-room",
                  serverId: "server-1",
                  serverName: "paycore",
                },
              },
            ],
          ]);
        },
        resolveFriendRequestContext: async (viewerId: string, userIds: string[]) => {
          seen.push({ context: { userIds, viewerId } });
          return new Map([
            [
              // The fixture request was sent *by* the viewer, so the counterpart
              // the context is keyed by is the receiver.
              ada.id,
              {
                mutualFriendCount: 4,
                mutualServerCount: 2,
                mutualServerName: "paycore",
                viaUsername: "selin_qa",
              },
            ],
          ]);
        },
      }),
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      friends: { device: string; voiceRoom: { serverName: string } }[];
      pending: { incoming: { mutualServerName: string; viaUsername: string }[] };
    };
    assert.equal(body.friends[0]!.device, "MOBILE");
    assert.equal(body.friends[0]!.voiceRoom.serverName, "paycore");
    assert.equal(body.pending.incoming[0]!.mutualServerName, "paycore");
    assert.equal(body.pending.incoming[0]!.viaUsername, "selin_qa");
    assert.deepEqual(seen, [
      { activity: { userIds: [ada.id], viewerId: "user-1" } },
      { context: { userIds: [ada.id], viewerId: "user-1" } },
    ]);
  });

  it("authenticates, rate limits and bounds the friend suggestions endpoint", async () => {
    const { mobileFriendSuggestionsRoute } = await routes;
    const calls: unknown[] = [];
    const response = await mobileFriendSuggestionsRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/suggestions?limit=3"),
      dependencies({
        enforceRateLimit: async (userId: string, action: string) =>
          calls.push(`rate:${userId}:${action}`),
        listFriendSuggestions: async (userId: string, limit: number) => {
          calls.push({ limit, userId });
          return [
            {
              avatarUrl: null,
              displayName: "Maestro",
              id: "user-9",
              mutualFriendCount: 4,
              mutualServerCount: 0,
              mutualServerName: null,
              username: "maestro",
            },
          ];
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "rate:user-1:mobile:friends:suggestions",
      { limit: 3, userId: "user-1" },
    ]);
    assert.deepEqual(await response.json(), {
      suggestions: [
        {
          avatarUrl: null,
          displayName: "Maestro",
          id: "user-9",
          mutualFriendCount: 4,
          mutualServerCount: 0,
          mutualServerName: null,
          username: "maestro",
        },
      ],
    });
  });

  it("rejects an out-of-range suggestion limit instead of silently widening it", async () => {
    const { mobileFriendSuggestionsRoute } = await routes;
    const response = await mobileFriendSuggestionsRoute(
      new Request("https://whispr.test/api/v1/mobile/friends/suggestions?limit=500"),
      dependencies(),
    );

    assert.equal(response.status, 400);
  });
});
