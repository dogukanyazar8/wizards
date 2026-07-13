import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  mapMobileServerMemberRoleIds,
  resolveMobileServerMemberActions,
} from "@/lib/workspace/mobile-capabilities";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { AccessContext } from "@/lib/workspace/workspace-types";

const routes = import("./route-logic");

const actorAccess = {
  accessLevel: "OWNER",
  memberId: "member-actor",
  ownerId: "actor",
  roles: [],
  serverId: "server-1",
  serverName: "Guild",
  userId: "actor",
} satisfies AccessContext;

const publicMember = {
  accessLevel: "MEMBER" as const,
  avatarUrl: "https://cdn.whispr.test/target.png",
  customStatus: "Available",
  displayName: "Target",
  id: "member-target",
  roles: [
    {
      color: 0x123456,
      id: "role-ordinary",
      name: "Helper",
    },
  ],
  status: "ONLINE" as const,
  userId: "target",
  username: "target",
};

const authorizationRoles = [
  {
    id: "role-default",
    isDefault: true,
    managed: false,
    permissions: PermissionBits.VIEW_CHANNEL,
  },
  {
    id: "role-managed",
    isDefault: false,
    managed: true,
    permissions: 0n,
  },
  {
    id: "role-ordinary",
    isDefault: false,
    managed: false,
    permissions: 0n,
  },
  {
    id: "role-managed",
    isDefault: false,
    managed: true,
    permissions: 0n,
  },
];

function request(query = "") {
  return new Request(`https://whispr.test/api/v1/mobile/servers/server-1/members${query}`);
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
    listMembersWithAccess: async () => ({
      access: actorAccess,
      memberPage: { limit: 50, nextCursor: null },
      members: [{ authorizationRoles, member: publicMember }],
    }),
    mapRoleIds: mapMobileServerMemberRoleIds,
    resolveActions: resolveMobileServerMemberActions,
    ...overrides,
  };
}

describe("mobile server members route logic", () => {
  it("authenticates, rate limits, validates pagination, and maps only the bounded public member DTO", async () => {
    const { mobileServerMembersListRoute } = await routes;
    const calls: string[] = [];
    const privateMember = {
      ...publicMember,
      permissionMatrix: { administrator: true },
      permissions: ["ADMINISTRATOR"],
      roles: [
        {
          ...publicMember.roles[0]!,
          permissions: ["MANAGE_ROLES"],
        },
      ],
    };

    const response = await mobileServerMembersListRoute(
      request("?cursor=cursor-1&limit=2"),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "actor";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        listMembersWithAccess: async (
          userId: string,
          serverId: string,
          options: { cursor?: string; limit?: number },
        ) => {
          calls.push(`service:${userId}:${serverId}:${options.cursor}:${options.limit}`);
          return {
            access: actorAccess,
            memberPage: { limit: 2, nextCursor: "member-next" },
            members: [{ authorizationRoles, member: privateMember }],
          };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), {
      memberPage: { limit: 2, nextCursor: "member-next" },
      members: [
        {
          ...publicMember,
          actions: { canKick: true, canManageRoles: true },
          roleIds: ["role-managed", "role-ordinary"],
        },
      ],
    });
    assert.deepEqual(calls, [
      "auth",
      "rate:actor:mobile:server:members:list",
      "params",
      "service:actor:server-1:cursor-1:2",
    ]);
  });

  it("computes each target action from actor access and its private authorization roles", async () => {
    const { mobileServerMembersListRoute } = await routes;
    const actor = {
      ...actorAccess,
      accessLevel: "MEMBER" as const,
      ownerId: "owner",
      roles: [
        {
          color: 0,
          id: "actor-moderator",
          isDefault: false,
          managed: false,
          name: "Moderator",
          permissions: PermissionBits.KICK_MEMBERS | PermissionBits.MANAGE_ROLES,
        },
      ],
    };
    const protectedRoles = [
      {
        id: "managed-target-role",
        isDefault: false,
        managed: true,
        permissions: 0n,
      },
    ];

    const response = await mobileServerMembersListRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        listMembersWithAccess: async () => ({
          access: actor,
          memberPage: { limit: 50, nextCursor: null },
          members: [
            { authorizationRoles: [], member: publicMember },
            {
              authorizationRoles: protectedRoles,
              member: { ...publicMember, id: "member-protected", userId: "protected" },
            },
            {
              authorizationRoles: [],
              member: { ...publicMember, id: "member-self", userId: "actor" },
            },
          ],
        }),
      }),
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      members: Array<{ actions: { canKick: boolean; canManageRoles: boolean } }>;
    };
    assert.deepEqual(
      payload.members.map((member) => member.actions),
      [
        { canKick: true, canManageRoles: true },
        { canKick: true, canManageRoles: false },
        { canKick: false, canManageRoles: true },
      ],
    );
  });

  it("rejects non-strict or out-of-range params and pagination before member service I/O", async () => {
    const { mobileServerMembersListRoute } = await routes;
    const cases = [
      { params: { serverId: "" }, query: "" },
      { params: { serverId: "s".repeat(129) }, query: "" },
      { params: { extra: "value", serverId: "server-1" }, query: "" },
      { params: { serverId: "server-1" }, query: "?cursor=" },
      { params: { serverId: "server-1" }, query: `?cursor=${"c".repeat(129)}` },
      { params: { serverId: "server-1" }, query: "?limit=0" },
      { params: { serverId: "server-1" }, query: "?limit=101" },
      { params: { serverId: "server-1" }, query: "?limit=1.5" },
      { params: { serverId: "server-1" }, query: "?unknown=value" },
    ];

    for (const testCase of cases) {
      let serviceCalled = false;
      const response = await mobileServerMembersListRoute(
        request(testCase.query),
        context(testCase.params),
        dependencies({
          listMembersWithAccess: async () => {
            serviceCalled = true;
            throw new Error("must not run");
          },
        }),
      );

      assert.equal(response.status, 400, JSON.stringify(testCase));
      assert.equal(serviceCalled, false, JSON.stringify(testCase));
    }
  });

  it("returns bounded rate-limit and service errors without touching later dependencies", async () => {
    const { mobileServerMembersListRoute } = await routes;
    let paramsRead = false;
    let serviceCalled = false;
    const limited = await mobileServerMembersListRoute(
      request("?limit=1"),
      context({ serverId: "server-1" }, () => {
        paramsRead = true;
      }),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
        listMembersWithAccess: async () => {
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

    const failed = await mobileServerMembersListRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        listMembersWithAccess: async () => {
          throw new Error("database secret");
        },
      }),
    );
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: "Internal server error" });
  });

  it("fails closed when the service exceeds response bounds instead of truncating", async () => {
    const { mobileServerMembersListRoute } = await routes;
    const response = await mobileServerMembersListRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        listMembersWithAccess: async () => ({
          access: actorAccess,
          memberPage: { limit: 101, nextCursor: null },
          members: Array.from({ length: 101 }, (_, index) => ({
            authorizationRoles: [],
            member: {
              ...publicMember,
              id: `member-${index}`,
              userId: `user-${index}`,
            },
          })),
        }),
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys((await response.json()) as Record<string, unknown>), ["error"]);
  });
});
