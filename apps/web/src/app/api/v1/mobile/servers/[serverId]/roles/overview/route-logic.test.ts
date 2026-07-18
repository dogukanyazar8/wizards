import assert from "node:assert/strict";
import { describe, it } from "node:test";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/roles/overview");
}

describe("mobile server role overview route", () => {
  it("returns the protected read-only overview with real role metadata", async () => {
    const { mobileServerRoleOverviewListRoute } = await routes;
    const calls: string[] = [];
    const response = await mobileServerRoleOverviewListRoute(
      request(),
      { params: Promise.resolve({ serverId: "server-1" }) },
      {
        authenticate: async () => "actor",
        enforceRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        listRoleOverview: async (userId, serverId) => {
          calls.push(`roles:${userId}:${serverId}`);
          return [
            {
              color: 0x4f46e5,
              id: "role-1",
              isDefault: false,
              managed: false,
              memberCount: 4,
              name: "Moderator",
              permissionKeys: ["MANAGE_MESSAGES"],
              position: 1,
            },
          ];
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), {
      roles: [
        {
          color: 0x4f46e5,
          id: "role-1",
          isDefault: false,
          managed: false,
          memberCount: 4,
          name: "Moderator",
          permissionKeys: ["MANAGE_MESSAGES"],
          position: 1,
        },
      ],
    });
    assert.deepEqual(calls, [
      "rate:actor:mobile:server:roles:overview:list",
      "roles:actor:server-1",
    ]);
  });
});
