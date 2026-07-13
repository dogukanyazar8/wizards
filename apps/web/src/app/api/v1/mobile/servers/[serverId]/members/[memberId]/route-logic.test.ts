import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import { mobileServerMemberKickRoute } from "./route-logic";

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/members/member-1", {
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

type Dependencies = NonNullable<Parameters<typeof mobileServerMemberKickRoute>[2]>;

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticate: async () => "actor-1",
    enforceRateLimit: async () => undefined,
    kickMember: async () => undefined,
    ...overrides,
  };
}

describe("mobile server member kick route logic", () => {
  it("authenticates, rate limits, validates both path ids, and delegates kick unchanged", async () => {
    const calls: string[] = [];
    const response = await mobileServerMemberKickRoute(
      request(),
      context({ memberId: "member-1", serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "actor-1";
        },
        enforceRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        kickMember: async (userId, serverId, memberId) => {
          calls.push(`service:${userId}:${serverId}:${memberId}`);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:actor-1:mobile:server:member:kick",
      "params",
      "service:actor-1:server-1:member-1",
    ]);
  });

  it("rejects invalid or non-strict server/member bindings before kick service I/O", async () => {
    for (const params of [
      { memberId: "", serverId: "server-1" },
      { memberId: "m".repeat(129), serverId: "server-1" },
      { memberId: "member-1", serverId: "" },
      { memberId: "member-1", serverId: "s".repeat(129) },
      { extra: "value", memberId: "member-1", serverId: "server-1" },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerMemberKickRoute(
        request(),
        context(params),
        dependencies({
          kickMember: async () => {
            serviceCalled = true;
          },
        }),
      );

      assert.equal(response.status, 400, JSON.stringify(params));
      assert.equal(serviceCalled, false, JSON.stringify(params));
    }
  });

  it("returns auth and rate-limit errors before reading params or calling the service", async () => {
    let paramsRead = false;
    let serviceCalled = false;
    const routeContext = context({ memberId: "member-1", serverId: "server-1" }, () => {
      paramsRead = true;
    });

    const unauthorized = await mobileServerMemberKickRoute(
      request(),
      routeContext,
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        enforceRateLimit: async () => {
          throw new Error("rate limit must not run");
        },
        kickMember: async () => {
          serviceCalled = true;
        },
      }),
    );

    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
    assert.equal(paramsRead, false);
    assert.equal(serviceCalled, false);

    const rateLimited = await mobileServerMemberKickRoute(
      request(),
      routeContext,
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
        kickMember: async () => {
          serviceCalled = true;
        },
      }),
    );

    assert.equal(rateLimited.status, 429);
    assert.deepEqual(await rateLimited.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
    assert.equal(paramsRead, false);
    assert.equal(serviceCalled, false);
  });

  it("preserves self, owner, and hierarchy denials from the authoritative service", async () => {
    const denials = [
      new ApiError("Use leave server instead of kicking yourself", 400),
      new ApiError("The server owner cannot be kicked", 403, "OWNER_PROTECTED"),
      new ApiError("You cannot kick a member with an elevated role.", 403, "ROLE_HIERARCHY"),
    ];

    for (const denial of denials) {
      const response = await mobileServerMemberKickRoute(
        request(),
        context({ memberId: "member-1", serverId: "server-1" }),
        dependencies({
          kickMember: async () => {
            throw denial;
          },
        }),
      );

      assert.equal(response.status, denial.status);
      assert.deepEqual(
        await response.json(),
        denial.code ? { code: denial.code, error: denial.message } : { error: denial.message },
      );
    }
  });

  it("bounds unexpected kick service errors", async () => {
    const response = await mobileServerMemberKickRoute(
      request(),
      context({ memberId: "member-1", serverId: "server-1" }),
      dependencies({
        kickMember: async () => {
          throw new Error("database secret");
        },
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal server error" });
  });
});
