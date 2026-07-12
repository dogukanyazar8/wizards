import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";

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

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    actOnFriendRequest: async (_userId: string, _requestId: string, action: "accept" | "decline") => ({
      ...pendingRequest,
      status: action === "accept" ? ("ACCEPTED" as const) : ("DECLINED" as const),
    }),
    authenticate: async () => "user-1",
    blockUser: async () => ada,
    enforceRateLimit: async () => undefined,
    listBlockedUsers: async () => [ada],
    listFriends: async () => [
      { ...ada, customStatus: null, presence: { customStatus: null, status: "ONLINE" as const }, status: "ONLINE" as const },
    ],
    listPendingFriendRequests: async () => ({ incoming: [pendingRequest], outgoing: [] }),
    parseBody: parseJsonBody,
    removeFriend: async () => undefined,
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
        enforceRateLimit: async (userId: string, action: string) => calls.push(`rate:${userId}:${action}`),
        listBlockedUsers: async (userId: string) => {
          calls.push(`blocked:${userId}`);
          return [ada];
        },
        listFriends: async (userId: string) => {
          calls.push(`friends:${userId}`);
          return [{ ...ada, customStatus: null, presence: { customStatus: null, status: "ONLINE" as const }, status: "ONLINE" as const }];
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
      friends: [{ ...ada, customStatus: null, presence: { customStatus: null, status: "ONLINE" }, status: "ONLINE" }],
      pending: { incoming: [pendingRequest], outgoing: [] },
    });
    assert.equal(calls[0], "auth");
    assert.equal(calls[1], "rate:user-1:mobile:friends:list");
    assert.deepEqual(new Set(calls.slice(2)), new Set(["blocked:user-1", "friends:user-1", "pending:user-1"]));
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
    const { mobileFriendBlockRoute, mobileFriendRemoveRoute, mobileFriendUnblockRoute } = await routes;
    const calls: string[] = [];
    const deps = dependencies({
      blockUser: async (userId: string, targetId: string) => {
        calls.push(`block:${userId}:${targetId}`);
        return ada;
      },
      enforceRateLimit: async (_userId: string, action: string) => calls.push(action),
      removeFriend: async (userId: string, targetId: string) => calls.push(`remove:${userId}:${targetId}`),
      unblockUser: async (userId: string, targetId: string) => calls.push(`unblock:${userId}:${targetId}`),
    });

    const remove = await mobileFriendRemoveRoute(new Request("https://whispr.test"), context({ userId: "user-2" }), deps);
    const block = await mobileFriendBlockRoute(new Request("https://whispr.test"), context({ userId: "user-2" }), deps);
    const unblock = await mobileFriendUnblockRoute(new Request("https://whispr.test"), context({ userId: "user-2" }), deps);

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

  it("returns bounded shared errors before calling domain services", async () => {
    const { mobileFriendRequestCreateRoute, mobileFriendRemoveRoute } = await routes;
    const unauthorized = await mobileFriendRequestCreateRoute(
      jsonRequest("/api/v1/mobile/friends/requests", "POST", { username: "ada" }),
      dependencies({ authenticate: async () => { throw new ApiError("Unauthorized", 401, "UNAUTHORIZED"); } }),
    );
    const invalid = await mobileFriendRemoveRoute(
      new Request("https://whispr.test"),
      context({ userId: "" }),
      dependencies(),
    );

    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "String must contain at least 1 character(s)" });
  });
});
