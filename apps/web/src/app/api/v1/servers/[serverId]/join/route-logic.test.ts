import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/servers/server-1/join", { method: "POST" });
}

function context(serverId = "server-1") {
  return { params: Promise.resolve({ serverId }) };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    joinServer: async () => ({ alreadyMember: false, name: "Whispr", serverId: "server-1" }),
    ...overrides,
  };
}

describe("server join route logic", () => {
  it("authenticates, rate limits by user, then joins the server from the path", async () => {
    const { serverJoinRoute } = await routes;
    const calls: string[] = [];

    const response = await serverJoinRoute(
      request(),
      context(),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        joinServer: async (userId: string, serverId: string) => {
          calls.push(`service:${userId}:${serverId}`);
          return { alreadyMember: false, name: "Whispr", serverId };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      name: "Whispr",
      serverId: "server-1",
      success: true,
    });
    assert.deepEqual(calls, ["auth", "rate:user-1:server:join-public", "service:user-1:server-1"]);
  });

  it("returns success for an already-a-member join without a distinct status", async () => {
    const { serverJoinRoute } = await routes;

    const response = await serverJoinRoute(
      request(),
      context(),
      dependencies({
        joinServer: async () => ({ alreadyMember: true, name: "Whispr", serverId: "server-1" }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      name: "Whispr",
      serverId: "server-1",
      success: true,
    });
  });

  it("maps a banned-user error from the service to its status and code", async () => {
    const { serverJoinRoute } = await routes;

    const response = await serverJoinRoute(
      request(),
      context(),
      dependencies({
        joinServer: async () => {
          throw new ApiError("You are banned from this server", 403, "SERVER_BANNED");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "SERVER_BANNED",
      error: "You are banned from this server",
    });
  });

  it("maps a non-public server to 404 rather than 403", async () => {
    const { serverJoinRoute } = await routes;

    const response = await serverJoinRoute(
      request(),
      context(),
      dependencies({
        joinServer: async () => {
          throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
  });

  it("maps authentication errors to a bounded shared error response", async () => {
    const { serverJoinRoute } = await routes;

    const response = await serverJoinRoute(
      request(),
      context(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401);
        },
      }),
    );

    assert.equal(response.status, 401);
  });
});
