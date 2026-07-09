import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { postFriendRequestRoute } from "./route-logic";

function jsonRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/friends/request", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function routeDependencies(overrides: Partial<Parameters<typeof postFriendRequestRoute>[1]> = {}) {
  return {
    enforceApiRateLimit: async () => undefined,
    jsonError,
    parseJsonBody,
    requireApiUserId: async () => "user-1",
    sendFriendRequest: async (userId: string, username: string) => ({
      id: "request-1",
      receiverId: "target-1",
      senderId: userId,
      status: "PENDING" as const,
      targetUsername: username,
    }),
    ...overrides,
  };
}

describe("friend request API route", () => {
  it("requires auth, rate limits the action, validates JSON, and creates the request", async () => {
    const calls: string[] = [];

    const response = await postFriendRequestRoute(
      jsonRequest({ username: "ada" }),
      routeDependencies({
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        requireApiUserId: async () => {
          calls.push("auth");
          return "user-1";
        },
        sendFriendRequest: async (userId, username) => {
          calls.push(`send:${userId}:${username}`);
          return {
            id: "request-1",
            receiverId: "target-1",
            senderId: userId,
            status: "PENDING" as const,
          };
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      request: {
        id: "request-1",
        receiverId: "target-1",
        senderId: "user-1",
        status: "PENDING",
      },
    });
    assert.deepEqual(calls, ["auth", "rate:user-1:friend:request", "send:user-1:ada"]);
  });

  it("returns the shared 401 envelope before parsing unauthenticated bodies", async () => {
    const response = await postFriendRequestRoute(
      jsonRequest({}),
      routeDependencies({
        requireApiUserId: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "UNAUTHORIZED",
      error: "Unauthorized",
    });
  });

  it("returns the shared 400 envelope for invalid friend request bodies", async () => {
    const response = await postFriendRequestRoute(
      jsonRequest({}),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Required",
    });
  });

  it("returns the shared 429 envelope when friend requests are rate limited", async () => {
    const response = await postFriendRequestRoute(
      jsonRequest({ username: "ada" }),
      routeDependencies({
        enforceApiRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
  });
});
