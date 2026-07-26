import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/invites/safe_code-1/decline", {
    method: "POST",
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

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    declineInvite: async () => ({ serverId: "server-1" }),
    enforceRateLimit: async () => undefined,
    ...overrides,
  };
}

describe("mobile invite decline route logic", () => {
  it("authenticates, rate limits, validates the code, then declines", async () => {
    const { mobileInviteDeclineRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileInviteDeclineRoute(
      request(),
      context({ code: "safe_code-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        declineInvite: async (userId: string, code: string) => {
          calls.push(`decline:${userId}:${code}`);
          return { serverId: "server-1" };
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { serverId: "server-1", success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:invite:decline",
      "params",
      "decline:user-1:safe_code-1",
    ]);
  });

  it("rejects a traversal or malformed code before touching the invite", async () => {
    const { mobileInviteDeclineRoute } = await routes;
    let declineCalled = false;
    const deps = dependencies({
      declineInvite: async () => {
        declineCalled = true;
        return { serverId: "server-1" };
      },
    });

    for (const code of ["../admin", "code with space", ""]) {
      const response = await mobileInviteDeclineRoute(request(), context({ code }), deps);
      assert.equal(response.status >= 400, true, `${code} must be rejected`);
    }

    assert.equal(declineCalled, false);
  });

  it("passes a wrong-recipient refusal through untouched", async () => {
    const { mobileInviteDeclineRoute } = await routes;
    const response = await mobileInviteDeclineRoute(
      request(),
      context({ code: "safe_code-1" }),
      dependencies({
        declineInvite: async () => {
          throw new ApiError("This invite was sent to someone else", 403, "INVITE_NOT_FOR_USER");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "INVITE_NOT_FOR_USER",
      error: "This invite was sent to someone else",
    });
  });

  it("reports a missing invite as not found rather than a silent success", async () => {
    const { mobileInviteDeclineRoute } = await routes;
    const response = await mobileInviteDeclineRoute(
      request(),
      context({ code: "safe_code-1" }),
      dependencies({
        declineInvite: async () => {
          throw new ApiError("Invite not found", 404);
        },
      }),
    );

    assert.equal(response.status, 404);
  });

  it("stops at the rate limit before reading the route params", async () => {
    const { mobileInviteDeclineRoute } = await routes;
    let paramsRead = false;
    let declineCalled = false;

    const response = await mobileInviteDeclineRoute(
      request(),
      context({ code: "safe_code-1" }, () => {
        paramsRead = true;
      }),
      dependencies({
        declineInvite: async () => {
          declineCalled = true;
          return { serverId: "server-1" };
        },
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.equal(paramsRead, false);
    assert.equal(declineCalled, false);
  });
});
