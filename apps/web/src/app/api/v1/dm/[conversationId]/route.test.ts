import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, jsonError } from "@/lib/api";
import {
  deleteDirectMessageConversationRoute,
  getDirectMessageConversationRoute,
} from "./route-logic";

function request() {
  return new Request("https://whispr.test/api/v1/dm/conversation-1");
}

function context(conversationId = "conversation-1") {
  return {
    params: Promise.resolve({ conversationId }),
  };
}

function routeDependencies(
  overrides: Partial<Parameters<typeof getDirectMessageConversationRoute>[2]> &
    Partial<Parameters<typeof deleteDirectMessageConversationRoute>[2]> = {},
) {
  return {
    enforceApiRateLimit: async () => undefined,
    getDirectMessageConversationForUser: async (conversationId: string, userId: string) => ({
      id: conversationId,
      participants: [{ userId }],
    }),
    hideDirectMessage: async () => undefined,
    jsonError,
    requireApiUserId: async () => "user-1",
    ...overrides,
  };
}

describe("DM conversation API route", () => {
  it("requires auth, rate limits reads, validates params, and returns the conversation", async () => {
    const calls: string[] = [];

    const response = await getDirectMessageConversationRoute(
      request(),
      context(),
      routeDependencies({
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        getDirectMessageConversationForUser: async (conversationId, userId) => {
          calls.push(`get:${conversationId}:${userId}`);
          return {
            id: conversationId,
            participants: [{ userId }],
          };
        },
        requireApiUserId: async () => {
          calls.push("auth");
          return "user-1";
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: "conversation-1",
      participants: [{ userId: "user-1" }],
    });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:dm:conversation:read",
      "get:conversation-1:user-1",
    ]);
  });

  it("returns the shared 401 envelope before resolving params for anonymous users", async () => {
    const response = await getDirectMessageConversationRoute(
      request(),
      context(""),
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

  it("returns the shared not-found envelope from the participant service boundary", async () => {
    const response = await getDirectMessageConversationRoute(
      request(),
      context(),
      routeDependencies({
        getDirectMessageConversationForUser: async () => {
          throw new ApiError("Not found", 404, "NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      code: "NOT_FOUND",
      error: "Not found",
    });
  });

  it("returns the shared 400 envelope for invalid route params", async () => {
    const response = await getDirectMessageConversationRoute(
      request(),
      context(""),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "String must contain at least 1 character(s)",
    });
  });

  it("returns the shared 429 envelope when DM reads are rate limited", async () => {
    const response = await getDirectMessageConversationRoute(
      request(),
      context(),
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

  it("requires auth, rate limits hides, validates params, and hides the conversation", async () => {
    const calls: string[] = [];

    const response = await deleteDirectMessageConversationRoute(
      request(),
      context(),
      routeDependencies({
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        hideDirectMessage: async (userId, conversationId) => {
          calls.push(`hide:${conversationId}:${userId}`);
        },
        requireApiUserId: async () => {
          calls.push("auth");
          return "user-1";
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, ["auth", "rate:user-1:dm:hide", "hide:conversation-1:user-1"]);
  });

  it("returns the shared 429 envelope when DM hides are rate limited", async () => {
    const response = await deleteDirectMessageConversationRoute(
      request(),
      context(),
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
