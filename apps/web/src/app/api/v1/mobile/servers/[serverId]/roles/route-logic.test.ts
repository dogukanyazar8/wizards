import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/roles");
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
    authenticate: async () => "actor",
    enforceRateLimit: async () => undefined,
    listAssignableRoles: async () => [
      { color: 0x123456, id: "role-1", name: "Helper", position: 2 },
    ],
    ...overrides,
  };
}

describe("mobile assignable server roles route logic", () => {
  it("authenticates, rate limits, validates server binding, and exposes only assignable role fields", async () => {
    const { mobileAssignableRolesListRoute } = await routes;
    const calls: string[] = [];
    const response = await mobileAssignableRolesListRoute(
      request(),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "actor";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        listAssignableRoles: async (userId: string, serverId: string) => {
          calls.push(`service:${userId}:${serverId}`);
          return [
            {
              color: 0x123456,
              id: "role-1",
              isDefault: false,
              managed: false,
              mentionable: true,
              name: "Helper",
              permissions: ["MANAGE_MESSAGES"],
              position: 2,
            },
          ];
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), {
      roles: [{ color: 0x123456, id: "role-1", name: "Helper", position: 2 }],
    });
    assert.deepEqual(calls, [
      "auth",
      "rate:actor:mobile:server:roles:list",
      "params",
      "service:actor:server-1",
    ]);
  });

  it("rejects invalid and non-strict server params before role service I/O", async () => {
    const { mobileAssignableRolesListRoute } = await routes;

    for (const params of [
      { serverId: "" },
      { serverId: "s".repeat(129) },
      { extra: "value", serverId: "server-1" },
    ]) {
      let serviceCalled = false;
      const response = await mobileAssignableRolesListRoute(
        request(),
        context(params),
        dependencies({
          listAssignableRoles: async () => {
            serviceCalled = true;
            throw new Error("must not run");
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("returns bounded rate-limit and unexpected errors", async () => {
    const { mobileAssignableRolesListRoute } = await routes;
    let paramsRead = false;
    let serviceCalled = false;
    const limited = await mobileAssignableRolesListRoute(
      request(),
      context({ serverId: "server-1" }, () => {
        paramsRead = true;
      }),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
        listAssignableRoles: async () => {
          serviceCalled = true;
          throw new Error("must not run");
        },
      }),
    );

    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
    assert.equal(paramsRead, false);
    assert.equal(serviceCalled, false);

    const failed = await mobileAssignableRolesListRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        listAssignableRoles: async () => {
          throw new Error("database secret");
        },
      }),
    );
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: "Internal server error" });
  });

  it("fails closed when the assignable-role service exceeds the public response bound", async () => {
    const { mobileAssignableRolesListRoute } = await routes;
    const response = await mobileAssignableRolesListRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        listAssignableRoles: async () =>
          Array.from({ length: 101 }, (_, index) => ({
            color: index,
            id: `role-${index}`,
            name: `Role ${index}`,
            position: index,
          })),
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys((await response.json()) as Record<string, unknown>), ["error"]);
  });
});
