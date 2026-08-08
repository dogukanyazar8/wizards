import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/join", {
    method: "POST",
  });
}

function context(serverId = "server-1") {
  return { params: Promise.resolve({ serverId }) };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    joinServer: async () => ({ alreadyMember: false, serverId: "server-1" }),
    ...overrides,
  };
}

describe("mobile server join-public route logic", () => {
  it("authenticates, rate limits, validates the path param, and joins", async () => {
    const { mobileServerJoinPublicRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerJoinPublicRoute(
      request(),
      context(),
      dependencies({
        authenticate: async (req: Request) => {
          calls.push(`auth:${req.method}`);
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        joinServer: async (userId: string, serverId: string) => {
          calls.push(`service:${userId}:${serverId}`);
          return { alreadyMember: false, serverId };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth:POST",
      "rate:user-1:mobile:server:join-public",
      "service:user-1:server-1",
    ]);
  });

  it("returns the same success envelope whether or not the caller was already a member", async () => {
    const { mobileServerJoinPublicRoute } = await routes;

    const response = await mobileServerJoinPublicRoute(
      request(),
      context(),
      dependencies({
        joinServer: async () => ({ alreadyMember: true, serverId: "server-1" }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  });

  it("rejects an empty serverId path param before the join service runs", async () => {
    const { mobileServerJoinPublicRoute } = await routes;
    let serviceCalled = false;

    const response = await mobileServerJoinPublicRoute(
      request(),
      context(""),
      dependencies({
        joinServer: async () => {
          serviceCalled = true;
          return { alreadyMember: false, serverId: "server-1" };
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(serviceCalled, false);
  });

  it("maps a full-server error from the service to 403", async () => {
    const { mobileServerJoinPublicRoute } = await routes;

    const response = await mobileServerJoinPublicRoute(
      request(),
      context(),
      dependencies({
        joinServer: async () => {
          throw new ApiError("This server is full", 403, "SERVER_FULL");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "SERVER_FULL",
      error: "This server is full",
    });
  });

  it("maps authentication errors to a bounded shared error response", async () => {
    const { mobileServerJoinPublicRoute } = await routes;

    const response = await mobileServerJoinPublicRoute(
      request(),
      context(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
  });
});
