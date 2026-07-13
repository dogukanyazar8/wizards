import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

import { mobileServerMemberRolesUpdateRoute } from "./route-logic";

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/members/member-1/roles", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
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

type Dependencies = NonNullable<Parameters<typeof mobileServerMemberRolesUpdateRoute>[2]>;

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticate: async () => "actor-1",
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    updateMemberRoles: async () => ({ success: true as const }),
    ...overrides,
  };
}

describe("mobile server member role replacement route logic", () => {
  it("authenticates, rate limits, validates, and delegates the complete server-produced role set", async () => {
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileServerMemberRolesUpdateRoute(
      request({ roleIds: ["role-existing", "role-managed-current", "role-added"] }),
      context({ memberId: "member-1", serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "actor-1";
        },
        enforceRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
        updateMemberRoles: async (userId, serverId, memberId, input) => {
          calls.push(`service:${userId}:${serverId}:${memberId}:${input.roleIds.join(",")}`);
          return { success: true as const };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:actor-1:mobile:server:member-roles:update",
      "params",
      "body",
      "service:actor-1:server-1:member-1:role-existing,role-managed-current,role-added",
    ]);
  });

  it("carries an existing managed role through unchanged and leaves managed-role authz to the service", async () => {
    let delegatedRoleIds: string[] = [];
    const response = await mobileServerMemberRolesUpdateRoute(
      request({ roleIds: ["role-ordinary", "role-managed-current"] }),
      context({ memberId: "member-1", serverId: "server-1" }),
      dependencies({
        updateMemberRoles: async (_userId, _serverId, _memberId, input) => {
          delegatedRoleIds = input.roleIds;
          return { success: true as const };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(delegatedRoleIds, ["role-ordinary", "role-managed-current"]);

    const denied = await mobileServerMemberRolesUpdateRoute(
      request({ roleIds: ["role-managed-new"] }),
      context({ memberId: "member-1", serverId: "server-1" }),
      dependencies({
        updateMemberRoles: async () => {
          throw new ApiError("Protected roles cannot be assigned manually.", 403, "PROTECTED_ROLE");
        },
      }),
    );

    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), {
      code: "PROTECTED_ROLE",
      error: "Protected roles cannot be assigned manually.",
    });
  });

  it("rejects invalid or non-strict path params before parsing the body or calling the service", async () => {
    const cases = [
      { memberId: "", serverId: "server-1" },
      { memberId: "m".repeat(129), serverId: "server-1" },
      { memberId: "member-1", serverId: "" },
      { memberId: "member-1", serverId: "s".repeat(129) },
      { extra: "value", memberId: "member-1", serverId: "server-1" },
    ];

    for (const params of cases) {
      let bodyParsed = false;
      let serviceCalled = false;
      const trackedParseBody: typeof parseJsonBody = async (inputRequest, schema) => {
        bodyParsed = true;
        return parseJsonBody(inputRequest, schema);
      };
      const response = await mobileServerMemberRolesUpdateRoute(
        request({ roleIds: ["role-1"] }),
        context(params),
        dependencies({
          parseBody: trackedParseBody,
          updateMemberRoles: async () => {
            serviceCalled = true;
            return { success: true as const };
          },
        }),
      );

      assert.equal(response.status, 400, JSON.stringify(params));
      assert.equal(bodyParsed, false, JSON.stringify(params));
      assert.equal(serviceCalled, false, JSON.stringify(params));
    }
  });

  it("rejects malformed, duplicate, oversized, and non-strict complete role sets", async () => {
    const roleIds26 = Array.from({ length: 26 }, (_, index) => `role-${index}`);
    const cases: unknown[] = [
      { roleIds: "role-1" },
      { roleIds: ["role-1", "role-1"] },
      { roleIds: roleIds26 },
      { roleIds: ["r".repeat(129)] },
      { roleIds: ["role-1"], unexpected: true },
    ];

    for (const body of cases) {
      let serviceCalled = false;
      const response = await mobileServerMemberRolesUpdateRoute(
        request(body),
        context({ memberId: "member-1", serverId: "server-1" }),
        dependencies({
          updateMemberRoles: async () => {
            serviceCalled = true;
            return { success: true as const };
          },
        }),
      );

      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(serviceCalled, false, JSON.stringify(body));
    }
  });

  it("returns auth and rate-limit errors before reading params, bodies, or services", async () => {
    let paramsRead = false;
    let bodyParsed = false;
    let serviceCalled = false;
    const trackedParseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      bodyParsed = true;
      return parseJsonBody(inputRequest, schema);
    };
    const laterDependencies = {
      parseBody: trackedParseBody,
      updateMemberRoles: async () => {
        serviceCalled = true;
        return { success: true as const };
      },
    };

    const unauthorized = await mobileServerMemberRolesUpdateRoute(
      request({ roleIds: ["role-1"] }),
      context({ memberId: "member-1", serverId: "server-1" }, () => {
        paramsRead = true;
      }),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        enforceRateLimit: async () => {
          throw new Error("rate limit must not run");
        },
        ...laterDependencies,
      }),
    );

    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
    assert.equal(paramsRead, false);
    assert.equal(bodyParsed, false);
    assert.equal(serviceCalled, false);

    const rateLimited = await mobileServerMemberRolesUpdateRoute(
      request({ roleIds: ["role-1"] }),
      context({ memberId: "member-1", serverId: "server-1" }, () => {
        paramsRead = true;
      }),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
        ...laterDependencies,
      }),
    );

    assert.equal(rateLimited.status, 429);
    assert.deepEqual(await rateLimited.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
    assert.equal(paramsRead, false);
    assert.equal(bodyParsed, false);
    assert.equal(serviceCalled, false);
  });

  it("preserves owner and hierarchy denials from the authoritative service", async () => {
    for (const denial of [
      new ApiError("The server owner cannot be role-modified.", 403, "OWNER_PROTECTED"),
      new ApiError("You cannot modify a member with an elevated role.", 403, "ROLE_HIERARCHY"),
    ]) {
      const response = await mobileServerMemberRolesUpdateRoute(
        request({ roleIds: [] }),
        context({ memberId: "member-1", serverId: "server-1" }),
        dependencies({
          updateMemberRoles: async () => {
            throw denial;
          },
        }),
      );

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { code: denial.code, error: denial.message });
    }
  });

  it("validates success responses and bounds unexpected service errors", async () => {
    const invalid = await mobileServerMemberRolesUpdateRoute(
      request({ roleIds: [] }),
      context({ memberId: "member-1", serverId: "server-1" }),
      dependencies({
        updateMemberRoles: async () => ({ success: false }) as never,
      }),
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(Object.keys((await invalid.json()) as Record<string, unknown>), ["error"]);

    const failed = await mobileServerMemberRolesUpdateRoute(
      request({ roleIds: [] }),
      context({ memberId: "member-1", serverId: "server-1" }),
      dependencies({
        updateMemberRoles: async () => {
          throw new Error("database secret");
        },
      }),
    );
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: "Internal server error" });
  });
});
