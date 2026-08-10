import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import { mobileServerLeaveRoute } from "./route-logic";

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/members/me", {
    method: "DELETE",
  });
}

function context(params: Record<string, string>, onRead: () => void = () => undefined) {
  return {
    get params() {
      onRead();
      return Promise.resolve(params);
    },
  };
}

type Dependencies = NonNullable<Parameters<typeof mobileServerLeaveRoute>[2]>;

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    leaveServer: async () => undefined,
    ...overrides,
  };
}

describe("mobile server leave route logic", () => {
  it("authenticates and rate limits before it reads the path", async () => {
    const calls: string[] = [];
    const response = await mobileServerLeaveRoute(
      request(),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        leaveServer: async (userId, serverId) => {
          calls.push(`service:${userId}:${serverId}`);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:leave",
      "params",
      "service:user-1:server-1",
    ]);
  });

  /**
   * The membership removed is the caller's own, always. A body — or a user id
   * in the path — would be a way to ask the endpoint to remove somebody else.
   */
  it("leaves the session's own membership and never reads a body", async () => {
    let leftUserId: string | null = null;
    const body = new Request("https://whispr.test/x", {
      body: JSON.stringify({ userId: "victim" }),
      method: "DELETE",
    });

    const response = await mobileServerLeaveRoute(body, context({ serverId: "server-1" }), {
      authenticate: async () => "user-1",
      enforceRateLimit: async () => undefined,
      leaveServer: async (userId) => {
        leftUserId = userId;
      },
    });

    assert.equal(response.status, 200);
    assert.equal(leftUserId, "user-1");
    assert.equal(body.bodyUsed, false);
  });

  it("rejects an unknown path parameter instead of ignoring it", async () => {
    const response = await mobileServerLeaveRoute(
      request(),
      context({ memberId: "member-9", serverId: "server-1" }),
      dependencies({
        leaveServer: async () => {
          throw new Error("must not run for an invalid path");
        },
      }),
    );

    assert.equal(response.status, 400);
  });

  // The owner refusal is the service's rule; the route must not soften it.
  it("passes the service's owner refusal through unchanged", async () => {
    const response = await mobileServerLeaveRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        leaveServer: async () => {
          throw new ApiError("Transfer ownership or delete the server instead", 400);
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "Transfer ownership or delete the server instead");
  });
});
