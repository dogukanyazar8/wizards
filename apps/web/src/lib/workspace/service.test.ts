import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { setSocketServer, type AppSocketServer } from "@/lib/socket/runtime";
import { setServerRoomIdsCacheRedisForTest } from "@/lib/socket/server-room-cache";
import { setPermissionCacheRedisForTest } from "@/lib/workspace/permission-cache";
import { PermissionBits } from "@/lib/workspace/permissions";
import {
  setServerMemberPresenceRedisForTest,
  setServerMemberVisibilityResolverForTest,
} from "@/lib/workspace/server-query-helpers";
import { setOnlineServerMemberCountRedisForTest } from "@/lib/workspace/unread-service";
import { updateWorkspaceChannelPermissions } from "./channel-permission-service";
import {
  clearWorkspaceChannelHistory,
  deleteWorkspaceChannel,
  updateWorkspaceChannel,
} from "./channel-service";
import {
  buildMobileInviteShareUrl,
  createWorkspaceInvite,
  createWorkspaceInviteWithDetails,
  joinWorkspaceServerByInvite,
  listMobileWorkspaceInvites,
  listWorkspaceInvites,
} from "./invite-service";
import {
  addWorkspaceServerMemberByUsername,
  assertCanActOnMember,
  kickWorkspaceMember,
  leaveWorkspaceServer,
  updateWorkspaceMemberRoles,
} from "./member-service";
import {
  createWorkspaceServer,
  deleteWorkspaceServer,
  getMobileWorkspaceServerDetailWithAccess,
  getWorkspaceServerDetail,
  getWorkspaceServerDetailWithAccess,
  listMobileWorkspaceServerMembersWithAccess,
  listWorkspaceServerMembers,
  listWorkspaceServerMembersWithAccess,
  updateWorkspaceServer,
} from "./server-service";

type Restore = () => void;
type UnknownRecord = Record<string, unknown>;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as UnknownRecord;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

async function withPatchedEnvironment(run: (restores: Restore[]) => Promise<void>) {
  const restores: Restore[] = [];
  const originalPermissionCacheEnabled = process.env.PERMISSION_CACHE_ENABLED;
  const originalPermissionCacheDisabled = process.env.PERMISSION_CACHE_DISABLED;
  process.env.PERMISSION_CACHE_ENABLED = "true";
  delete process.env.PERMISSION_CACHE_DISABLED;
  setPermissionCacheRedisForTest(createPermissionRedis([]) as never);
  setServerMemberPresenceRedisForTest(createPresenceRedis() as never);
  setServerMemberVisibilityResolverForTest(
    async (_viewerId, subjectIds) =>
      new Map(
        subjectIds.map((subjectId) => [subjectId, { canViewPresence: true, canViewProfile: true }]),
      ),
  );
  setOnlineServerMemberCountRedisForTest({ status: "wait" } as never);

  try {
    await run(restores);
  } finally {
    for (const restore of restores.reverse()) {
      restore();
    }
    setPermissionCacheRedisForTest(null);
    setServerMemberPresenceRedisForTest(null);
    setServerMemberVisibilityResolverForTest(null);
    setServerRoomIdsCacheRedisForTest(null);
    setOnlineServerMemberCountRedisForTest(null);
    setSocketServer(null as unknown as AppSocketServer);
    if (originalPermissionCacheEnabled === undefined) {
      delete process.env.PERMISSION_CACHE_ENABLED;
    } else {
      process.env.PERMISSION_CACHE_ENABLED = originalPermissionCacheEnabled;
    }
    if (originalPermissionCacheDisabled === undefined) {
      delete process.env.PERMISSION_CACHE_DISABLED;
    } else {
      process.env.PERMISSION_CACHE_DISABLED = originalPermissionCacheDisabled;
    }
  }
}

function createPermissionRedis(operations: string[]) {
  return {
    mget: async (...keys: string[]) => keys.map(() => null),
    pipeline() {
      const keys: string[] = [];
      return {
        exec: async () => {
          if (keys.some((key) => key.includes("permission:member:"))) {
            operations.push("permission-cache.member");
          } else if (keys.some((key) => key.includes("permission:server:"))) {
            operations.push("permission-cache.server");
          } else {
            operations.push("permission-cache.write");
          }
          return [];
        },
        expire() {
          return this;
        },
        incr(key: string) {
          keys.push(key);
          return this;
        },
        set() {
          return this;
        },
      };
    },
    status: "ready",
  };
}

function createServerRoomRedis(operations: string[]) {
  return {
    del: async (key: string) => {
      operations.push(`server-room-cache.del:${key}`);
      return 1;
    },
    get: async () => null,
    set: async () => "OK",
    status: "ready" as const,
  };
}

function createPresenceRedis() {
  return {
    pipeline() {
      return {
        exec: async () => null,
        type() {
          return this;
        },
        zcard() {
          return this;
        },
        zremrangebyscore() {
          return this;
        },
      };
    },
  };
}

function createFakeSocket(operations: string[], label: string) {
  return {
    data: {
      voiceStateViewerChannelsByServer: new Map([["server-1", new Set(["voice-1"])]]),
    },
    join: async (room: string) => {
      operations.push(`socket.join:${label}:${room}`);
    },
    leave: async (room: string) => {
      operations.push(`socket.leave:${label}:${room}`);
    },
  };
}

function createFakeSocketServer(
  operations: string[],
  socketsByRoom: Record<string, Array<ReturnType<typeof createFakeSocket>>> = {},
) {
  return {
    in(room: string) {
      return {
        fetchSockets: async () => {
          operations.push(`socket.fetch:${room}`);
          return socketsByRoom[room] ?? [];
        },
        socketsLeave: (leftRoom: string | string[]) => {
          operations.push(`socket.rooms-leave:${room}:${[leftRoom].flat().join(",")}`);
        },
      };
    },
    to(room: string | string[]) {
      const rooms = [room].flat();
      return {
        emit: (event: string, payload?: { reason?: string }) => {
          operations.push(
            `socket.emit:${rooms.join(",")}:${event}${payload?.reason ? `:${payload.reason}` : ""}`,
          );
        },
      };
    },
  } as unknown as AppSocketServer;
}

function defaultRole(permissions = 0n) {
  return {
    color: 0,
    id: "role-everyone",
    isDefault: true,
    name: "@everyone",
    permissions,
  };
}

function accessMembership(args: {
  ownerId?: string;
  permissions?: bigint;
  serverId?: string;
  userId: string;
}) {
  const serverId = args.serverId ?? "server-1";
  return {
    id: `member-${args.userId}`,
    roles: [
      {
        role: {
          color: 1,
          id: `role-${args.userId}`,
          isDefault: false,
          name: "Manager",
          permissions: args.permissions ?? 0n,
        },
      },
    ],
    server: {
      id: serverId,
      name: "Guild",
      ownerId: args.ownerId ?? args.userId,
      roles: [defaultRole()],
    },
  };
}

function indexOfOperation(operations: string[], operation: string) {
  const index = operations.indexOf(operation);
  assert.notEqual(index, -1, `Expected operation not found: ${operation}`);
  return index;
}

type MemberRoleTestRole = {
  id: string;
  isDefault: boolean;
  managed: boolean;
  name: string;
  permissions: bigint;
};

function setupMemberRoleMutation(
  restores: Restore[],
  args: {
    actorId?: string;
    actorPermissions?: bigint;
    availableRoles?: MemberRoleTestRole[];
    currentRoles?: MemberRoleTestRole[];
    targetUserId?: string;
  } = {},
) {
  const actorId = args.actorId ?? "owner";
  const targetUserId = args.targetUserId ?? "target";
  const availableRoles = args.availableRoles ?? [];
  let createData: Array<{ memberId: string; roleId: string }> | null = null;
  let deleteRoleIds: string[] | null = null;
  let transactionCount = 0;
  let auditData: Record<string, unknown> | null = null;

  patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
  patchMethod(
    prisma.serverMember,
    "findFirst",
    async (query?: unknown) => {
      const where = (query as { where?: { id?: string; userId?: string } }).where;
      if (where?.userId) {
        return accessMembership({
          ownerId: "owner",
          permissions: args.actorPermissions ?? PermissionBits.MANAGE_ROLES,
          userId: actorId,
        });
      }
      if (where?.id === "member-target") {
        return {
          id: "member-target",
          roles: (args.currentRoles ?? []).map((role) => ({ role })),
          user: { locale: "en" },
          userId: targetUserId,
        };
      }
      return null;
    },
    restores,
  );
  patchMethod(
    prisma.role,
    "findMany",
    async (query?: unknown) => {
      const requestedIds = (query as { where?: { id?: { in?: string[] } } }).where?.id?.in ?? [];
      return availableRoles.filter((role) => requestedIds.includes(role.id));
    },
    restores,
  );
  patchMethod(
    prisma.memberRole,
    "deleteMany",
    (query?: unknown) => {
      deleteRoleIds = (query as { where?: { roleId?: { in?: string[] } } }).where?.roleId?.in ?? [];
      return { operation: "delete" };
    },
    restores,
  );
  patchMethod(
    prisma.memberRole,
    "createMany",
    (query?: unknown) => {
      createData = (query as { data?: Array<{ memberId: string; roleId: string }> }).data ?? [];
      return { operation: "create" };
    },
    restores,
  );
  patchMethod(
    prisma,
    "$transaction",
    async (work: unknown) => {
      transactionCount += 1;
      if (Array.isArray(work)) {
        return [];
      }

      const tx = {
        auditLog: {
          create: async (query: { data: Record<string, unknown> }) => {
            auditData = query.data;
            return {};
          },
        },
        memberRole: {
          createMany: async (query: { data: Array<{ memberId: string; roleId: string }> }) => {
            createData = query.data;
            return { count: query.data.length };
          },
          deleteMany: async (query: { where?: { roleId?: { in?: string[] } } }) => {
            deleteRoleIds = query.where?.roleId?.in ?? [];
            return { count: deleteRoleIds.length };
          },
        },
      };
      return (work as (transaction: typeof tx) => Promise<unknown>)(tx);
    },
    restores,
  );
  patchMethod(
    prisma.notification,
    "create",
    async () => ({
      actionUrl: "/channels/server-1",
      body: "Role assigned",
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
      id: "notification-1",
      imageUrl: null,
      metadata: null,
      read: false,
      readAt: null,
      title: "Roles updated",
      type: "MODERATION",
      userId: targetUserId,
    }),
    restores,
  );

  return {
    get auditData() {
      return auditData;
    },
    get createData() {
      return createData;
    },
    get deleteRoleIds() {
      return deleteRoleIds;
    },
    get transactionCount() {
      return transactionCount;
    },
  };
}

describe("workspace service characterization", { concurrency: false }, () => {
  it("allows member actions only below the owner and protected-role boundary", () => {
    const access = { ownerId: "owner", userId: "moderator" };
    const ordinaryRole = {
      color: 0,
      id: "role-member",
      isDefault: false,
      managed: false,
      name: "Member",
      permissions: PermissionBits.VIEW_CHANNEL,
    };
    const protectedRole = {
      ...ordinaryRole,
      id: "role-manager",
      permissions: PermissionBits.MANAGE_SERVER,
    };

    assert.throws(
      () => assertCanActOnMember(access, { roles: [], userId: "owner" }),
      (error) => error instanceof ApiError && error.code === "OWNER_PROTECTED",
    );
    assert.throws(
      () =>
        assertCanActOnMember(access, {
          roles: [{ role: protectedRole }],
          userId: "manager",
        }),
      (error) => error instanceof ApiError && error.code === "ROLE_HIERARCHY",
    );
    assert.doesNotThrow(() =>
      assertCanActOnMember(access, {
        roles: [{ role: defaultRole() }, { role: ordinaryRole }],
        userId: "member",
      }),
    );
  });

  it("rejects kicking a member with a protected role before deletion", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async (query?: unknown) => {
          const where = (query as { where?: { id?: string; userId?: string } }).where;
          if (where?.userId) {
            return accessMembership({
              ownerId: "owner",
              permissions: PermissionBits.KICK_MEMBERS,
              userId: "moderator",
            });
          }
          if (where?.id === "member-target") {
            return { id: "member-target", userId: "manager" };
          }
          return null;
        },
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            serverMember: {
              delete: async () => {
                throw new Error("protected member must not be deleted");
              },
              findFirst: async () => ({
                id: "member-target",
                roles: [
                  {
                    role: {
                      id: "role-manager",
                      isDefault: false,
                      managed: false,
                      permissions: PermissionBits.MANAGE_SERVER,
                    },
                  },
                ],
                userId: "manager",
              }),
            },
          }),
        restores,
      );

      await assert.rejects(
        () => kickWorkspaceMember("moderator", "server-1", "member-target"),
        (error) => error instanceof ApiError && error.code === "ROLE_HIERARCHY",
      );
    });
  });

  it("rechecks protected roles inside the kick transaction", async () => {
    await withPatchedEnvironment(async (restores) => {
      let deleteCalled = false;
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async (query?: unknown) => {
          const where = (query as { where?: { id?: string; userId?: string } }).where;
          if (where?.userId) {
            return accessMembership({
              ownerId: "owner",
              permissions: PermissionBits.KICK_MEMBERS,
              userId: "moderator",
            });
          }
          if (where?.id === "member-target") {
            return { id: "member-target", userId: "member" };
          }
          return null;
        },
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (
          callback: (tx: unknown) => Promise<unknown>,
          options?: { isolationLevel?: string },
        ) => {
          assert.equal(options?.isolationLevel, "Serializable");
          return callback({
            serverMember: {
              delete: async () => {
                deleteCalled = true;
                return {};
              },
              findFirst: async () => ({
                id: "member-target",
                roles: [
                  {
                    role: {
                      id: "role-manager",
                      isDefault: false,
                      managed: false,
                      permissions: PermissionBits.MANAGE_SERVER,
                    },
                  },
                ],
                userId: "member",
              }),
            },
          });
        },
        restores,
      );
      await assert.rejects(
        () => kickWorkspaceMember("moderator", "server-1", "member-target"),
        (error) => error instanceof ApiError && error.code === "ROLE_HIERARCHY",
      );
      assert.equal(deleteCalled, false);
    });
  });

  it("keeps public server detail unchanged while exposing actor access only internally", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverBan, "findMany", async () => [], restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            permissions: PermissionBits.MANAGE_INVITES,
            userId: "owner",
          }),
        restores,
      );
      patchMethod(prisma.serverMember, "findMany", async () => [], restores);
      patchMethod(
        prisma.serverMember,
        "findUnique",
        async () => ({
          id: "member-owner",
          roles: [],
          server: { ownerId: "owner" },
        }),
        restores,
      );
      patchMethod(prisma.serverInvite, "findMany", async () => [], restores);
      patchMethod(
        prisma.role,
        "findMany",
        async () => [defaultRole(PermissionBits.VIEW_CHANNEL)],
        restores,
      );
      patchMethod(prisma.channel, "findMany", async () => [], restores);
      patchMethod(
        prisma.server,
        "findUnique",
        async () => ({
          _count: { members: 0 },
          categories: [],
          channels: [],
          deletedMessageNoticeMinutes: 5,
          description: "Server description",
          features: [],
          iconUrl: null,
          id: "server-1",
          inviteCode: "invite-code",
          members: [],
          messageCharacterLimit: 4096,
          name: "Guild",
          ownerId: "owner",
          roles: [
            {
              ...defaultRole(PermissionBits.VIEW_CHANNEL),
              managed: false,
              mentionable: false,
              position: 0,
            },
          ],
          shortName: null,
          tags: [],
          userServerSettings: [],
        }),
        restores,
      );

      const internal = await getWorkspaceServerDetailWithAccess("owner", "server-1");
      const publicDetail = await getWorkspaceServerDetail("owner", "server-1");

      assert.deepEqual(publicDetail, internal.detail);
      assert.deepEqual(Object.keys(publicDetail).sort(), [
        "categories",
        "invites",
        "memberPage",
        "members",
        "roles",
        "server",
        "ungroupedChannels",
      ]);
      assert.equal("access" in publicDetail, false);
      assert.equal(internal.access.userId, "owner");
      assert.equal(internal.access.serverId, "server-1");
    });
  });

  it("loads the mobile server projection with stable database sentinels and no management collections", async () => {
    await withPatchedEnvironment(async (restores) => {
      let serverQuery: unknown;
      let inviteQueryCount = 0;
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.VIEW_CHANNEL | PermissionBits.SEND_MESSAGES,
            userId: "manager",
          }),
        restores,
      );
      patchMethod(
        prisma.server,
        "findUnique",
        async (query?: unknown) => {
          serverQuery = query;
          return {
            _count: { members: 0 },
            categories: [],
            channels: [],
            deletedMessageNoticeMinutes: 5,
            description: "Server description",
            features: [],
            iconUrl: null,
            id: "server-1",
            inviteCode: "invite-code",
            members: [],
            messageCharacterLimit: 4096,
            name: "Guild",
            ownerId: "owner",
            shortName: null,
            tags: [],
            userServerSettings: [],
          };
        },
        restores,
      );
      patchMethod(
        prisma.serverInvite,
        "findMany",
        async () => {
          inviteQueryCount += 1;
          return [];
        },
        restores,
      );
      patchMethod(
        prisma.channel,
        "findMany",
        async () => {
          throw new Error("mobile detail must not trigger an unbounded channel permission scan");
        },
        restores,
      );
      patchMethod(prisma, "$queryRaw", async () => [], restores);

      const result = await getMobileWorkspaceServerDetailWithAccess("manager", "server-1");
      const select = (serverQuery as { select: UnknownRecord }).select;
      const categories = select.categories as UnknownRecord;
      const categorySelect = categories.select as UnknownRecord;
      const categoryChannels = categorySelect.channels as UnknownRecord;
      const ungroupedChannels = select.channels as UnknownRecord;
      assert.equal(categories.take, 21);
      assert.deepEqual(categories.orderBy, [{ position: "asc" }, { id: "asc" }]);
      assert.equal(categoryChannels.take, 41);
      assert.deepEqual(categoryChannels.orderBy, [{ position: "asc" }, { id: "asc" }]);
      assert.equal(ungroupedChannels.take, 81);
      assert.deepEqual(ungroupedChannels.orderBy, [{ position: "asc" }, { id: "asc" }]);
      assert.equal("members" in select, false);
      assert.equal("roles" in select, false);
      assert.equal(inviteQueryCount, 0);
      assert.equal(result.hasMoreChannels, false);
      assert.deepEqual(result.detail.categories, []);
      assert.equal("invites" in result.detail, false);
      assert.equal("roles" in result.detail, false);
    });
  });

  it("keeps a genuinely empty mobile category but hides one the viewer cannot see into", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.VIEW_CHANNEL | PermissionBits.SEND_MESSAGES,
            userId: "manager",
          }),
        restores,
      );
      patchMethod(
        prisma.server,
        "findUnique",
        async () => ({
          _count: { members: 0 },
          categories: [
            {
              channels: [
                {
                  categoryId: "category-hidden",
                  id: "hidden-1",
                  locked: false,
                  name: "hidden-1",
                  permissionOverrides: [
                    {
                      allow: 0n,
                      deny: PermissionBits.VIEW_CHANNEL,
                      targetId: "manager",
                      targetType: "USER",
                    },
                  ],
                  position: 0,
                  topic: null,
                  type: ChannelType.TEXT,
                },
              ],
              id: "category-hidden",
              name: "Hidden",
              position: 0,
            },
            { channels: [], id: "category-empty", name: "Duyurular", position: 1 },
          ],
          channels: [],
          description: null,
          iconUrl: null,
          id: "server-1",
          members: [],
          name: "Guild",
          ownerId: "owner",
          shortName: null,
          tags: [],
          userServerSettings: [],
        }),
        restores,
      );
      patchMethod(prisma, "$queryRaw", async () => [], restores);

      const result = await getMobileWorkspaceServerDetailWithAccess("manager", "server-1");

      // A category emptied by permissions must not leak; one that is simply
      // empty has to survive, or a newly created category is invisible on mobile.
      assert.deepEqual(
        result.detail.categories.map((category) => [category.id, category.channels.length]),
        [["category-empty", 0]],
      );
    });
  });

  it("turns raw mobile category and channel sentinels into a bounded has-more projection", async () => {
    await withPatchedEnvironment(async (restores) => {
      const channelRow = (id: string, position: number, categoryId: string | null) => ({
        categoryId,
        id,
        locked: false,
        name: id,
        permissionOverrides: [],
        position,
        topic: null,
        type: ChannelType.TEXT,
      });
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.VIEW_CHANNEL | PermissionBits.SEND_MESSAGES,
            userId: "manager",
          }),
        restores,
      );
      patchMethod(
        prisma.server,
        "findUnique",
        async () => ({
          _count: { members: 0 },
          categories: Array.from({ length: 21 }, (_, categoryIndex) => ({
            channels:
              categoryIndex === 0
                ? Array.from({ length: 41 }, (_, channelIndex) =>
                    channelRow(`grouped-${channelIndex}`, channelIndex, "category-0"),
                  )
                : [],
            id: `category-${categoryIndex}`,
            name: `Category ${categoryIndex}`,
            position: categoryIndex,
          })),
          channels: Array.from({ length: 81 }, (_, index) =>
            channelRow(`ungrouped-${index}`, index, null),
          ),
          description: null,
          iconUrl: null,
          id: "server-1",
          members: [],
          name: "Guild",
          ownerId: "owner",
          shortName: null,
          tags: [],
          userServerSettings: [],
        }),
        restores,
      );
      patchMethod(prisma, "$queryRaw", async () => [], restores);

      const result = await getMobileWorkspaceServerDetailWithAccess("manager", "server-1");
      const returnedChannelCount =
        result.detail.ungroupedChannels.length +
        result.detail.categories.reduce((total, category) => total + category.channels.length, 0);

      assert.equal(result.hasMoreChannels, true);
      assert.equal(result.detail.categories.length, 20);
      assert.equal(result.detail.categories[0]?.channels.length, 40);
      assert.equal(result.detail.ungroupedChannels.length, 40);
      assert.equal(returnedChannelCount, 80);
      assert.equal(result.detail.server.defaultChannelId, "grouped-0");
    });
  });

  it("keeps the member list out of the mobile server detail read", async () => {
    await withPatchedEnvironment(async (restores) => {
      let serverQuery: unknown;
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.VIEW_CHANNEL,
            userId: "manager",
          }),
        restores,
      );
      patchMethod(
        prisma.server,
        "findUnique",
        async (query?: unknown) => {
          serverQuery = query;
          return {
            _count: { members: 4 },
            categories: [],
            channels: [],
            description: null,
            features: null,
            iconUrl: null,
            id: "server-1",
            name: "Guild",
            ownerId: "owner",
            shortName: null,
            tags: [],
            userServerSettings: [],
          };
        },
        restores,
      );
      patchMethod(prisma, "$queryRaw", async () => [], restores);

      const result = await getMobileWorkspaceServerDetailWithAccess("manager", "server-1");
      const select = (serverQuery as { select: UnknownRecord }).select;

      // Members, their roles, and their users were three joins on the critical
      // path of opening a server for a list the channel screen never rendered.
      // The member surfaces page through listMobileWorkspaceServerMembersWithAccess,
      // which is where the bounded-role guard is exercised.
      assert.equal("members" in select, false);
      assert.deepEqual(result.detail.members, []);
      assert.equal(result.detail.server.ownerUserId, "owner");
      assert.equal(result.detail.server.memberCount, 4);
    });
  });

  it("bounds nested roles only for the mobile member list and keeps the web list unbounded", async () => {
    await withPatchedEnvironment(async (restores) => {
      let returnedRoles: Array<{
        role: {
          color: number;
          id: string;
          isDefault: boolean;
          managed: boolean;
          name: string;
          permissions: bigint;
        };
      }> = [];
      let capturedQuery: unknown;
      const ordinaryRoles = (count: number) =>
        Array.from({ length: count }, (_, index) => ({
          role: {
            color: index,
            id: `ordinary-${index}`,
            isDefault: false,
            managed: false,
            name: `Ordinary ${index}`,
            permissions: 0n,
          },
        }));
      const defaultRoleEntry = {
        role: {
          color: 0,
          id: "role-default",
          isDefault: true,
          managed: false,
          name: "@everyone",
          permissions: PermissionBits.VIEW_CHANNEL,
        },
      };
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.MANAGE_ROLES,
            userId: "manager",
          }),
        restores,
      );
      patchMethod(
        prisma.serverMember,
        "findMany",
        async (query?: unknown) => {
          capturedQuery = query;
          return [
            {
              id: "member-target",
              nickname: null,
              roles: returnedRoles,
              user: {
                avatarUrl: null,
                customStatus: null,
                displayName: "Target",
                id: "target",
                status: "OFFLINE",
                username: "target",
              },
            },
          ];
        },
        restores,
      );

      returnedRoles = [defaultRoleEntry, ...ordinaryRoles(25)];
      const mobileResult = await listMobileWorkspaceServerMembersWithAccess("manager", "server-1", {
        limit: 50,
      });
      let rolesQuery = (
        capturedQuery as { select: { roles: { orderBy?: unknown; take?: unknown } } }
      ).select.roles;
      assert.equal(rolesQuery.take, 27);
      assert.deepEqual(rolesQuery.orderBy, [{ role: { position: "desc" } }, { roleId: "asc" }]);
      assert.equal(mobileResult.members[0]?.authorizationRoles.length, 26);

      returnedRoles = ordinaryRoles(26);
      await assert.rejects(
        () => listMobileWorkspaceServerMembersWithAccess("manager", "server-1", { limit: 50 }),
        (error) =>
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === "MOBILE_RESPONSE_LIMIT_EXCEEDED",
      );

      const webResult = await listWorkspaceServerMembers("manager", "server-1", { limit: 50 });
      rolesQuery = (capturedQuery as { select: { roles: { orderBy?: unknown; take?: unknown } } })
        .select.roles;
      assert.equal(rolesQuery.take, undefined);
      assert.equal(rolesQuery.orderBy, undefined);
      assert.equal(webResult.members[0]?.roles.length, 26);
    });
  });

  it("keeps public member rows unchanged while exposing raw authorization roles internally", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.MANAGE_ROLES,
            userId: "actor",
          }),
        restores,
      );
      patchMethod(
        prisma.serverMember,
        "findMany",
        async () => [
          {
            id: "member-target",
            nickname: null,
            roles: [
              {
                role: {
                  color: 123,
                  id: "role-default",
                  isDefault: true,
                  managed: false,
                  name: "@everyone",
                  permissions: PermissionBits.VIEW_CHANNEL,
                },
              },
              {
                role: {
                  color: 456,
                  id: "role-managed",
                  isDefault: false,
                  managed: true,
                  name: "Integration",
                  permissions: PermissionBits.MANAGE_MESSAGES,
                },
              },
            ],
            user: {
              avatarUrl: null,
              customStatus: null,
              displayName: "Target",
              id: "target",
              status: "OFFLINE",
              username: "target",
            },
          },
        ],
        restores,
      );

      const internal = await listWorkspaceServerMembersWithAccess("actor", "server-1");
      const publicMembers = await listWorkspaceServerMembers("actor", "server-1");

      assert.deepEqual(publicMembers, {
        memberPage: internal.memberPage,
        members: internal.members.map(({ member }) => member),
      });
      assert.equal("access" in publicMembers, false);
      assert.equal("authorizationRoles" in publicMembers.members[0]!, false);
      assert.deepEqual(internal.members[0]?.authorizationRoles, [
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
          permissions: PermissionBits.MANAGE_MESSAGES,
        },
      ]);
      assert.deepEqual(Object.keys(internal.members[0]?.member ?? {}).sort(), [
        "accessLevel",
        "avatarUrl",
        "customStatus",
        "displayName",
        "id",
        "roles",
        "status",
        "userId",
        "username",
      ]);
    });
  });

  it("creates a workspace server in one transaction and invalidates room membership after commit", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));

      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          operations.push("transaction.begin");
          const tx = {
            channel: {
              create: async (args?: unknown) => {
                const type = (args as { data?: { type?: ChannelType } }).data?.type;
                operations.push(`tx.channel.create:${type}`);
                return type === ChannelType.TEXT
                  ? { id: "channel-general" }
                  : { id: "channel-voice" };
              },
            },
            channelCategory: {
              create: async () => {
                operations.push("tx.channelCategory.create");
                return { id: "category-1" };
              },
            },
            memberRole: {
              create: async () => {
                operations.push("tx.memberRole.create");
                return {};
              },
            },
            role: {
              create: async () => {
                operations.push("tx.role.create");
                return { id: "role-admin" };
              },
              createMany: async () => {
                operations.push("tx.role.createMany");
                return { count: 2 };
              },
            },
            server: {
              create: async () => {
                operations.push("tx.server.create");
                return { id: "server-1" };
              },
              findUnique: async () => {
                operations.push("tx.server.findUnique");
                return null;
              },
              update: async () => {
                operations.push("tx.server.update");
                return {};
              },
            },
            serverInvite: {
              create: async () => {
                operations.push("tx.serverInvite.create");
                return {};
              },
              findUnique: async () => {
                operations.push("tx.serverInvite.findUnique");
                return null;
              },
            },
            serverMember: {
              create: async () => {
                operations.push("tx.serverMember.create");
                return { id: "member-owner" };
              },
            },
          };
          const result = await (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
          operations.push("transaction.commit");
          return result;
        },
        restores,
      );

      const result = await createWorkspaceServer("owner", {
        allowFileUploads: true,
        allowGifs: true,
        allowMemberAdds: true,
        description: null,
        iconUrl: null,
        name: "  Guild  ",
      });

      assert.deepEqual(result, { channelId: "channel-general", serverId: "server-1" });
      assert.ok(
        indexOfOperation(operations, "transaction.commit") <
          indexOfOperation(operations, "server-room-cache.del:socket:v1:user-servers:owner"),
      );
      assert.deepEqual(
        operations.filter((operation) => operation.startsWith("tx.")),
        [
          "tx.serverInvite.findUnique",
          "tx.server.findUnique",
          "tx.server.create",
          "tx.role.create",
          "tx.serverMember.create",
          "tx.role.createMany",
          "tx.memberRole.create",
          "tx.channelCategory.create",
          `tx.channel.create:${ChannelType.TEXT}`,
          `tx.channel.create:${ChannelType.VOICE}`,
          "tx.server.update",
          "tx.serverInvite.create",
        ],
      );
    });
  });

  it("updates member roles before invalidating permission cache and emitting socket events", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async (args?: unknown) => {
          const where = (args as { where?: { id?: string; userId?: string } }).where;
          if (where?.userId) {
            return accessMembership({ userId: "owner" });
          }
          if (where?.id === "member-target") {
            return {
              id: "member-target",
              roles: [],
              user: { locale: "en" },
              userId: "target",
            };
          }
          return null;
        },
        restores,
      );
      patchMethod(
        prisma.role,
        "findMany",
        async () => [
          {
            id: "role-vip",
            isDefault: false,
            managed: false,
            name: "VIP",
            permissions: 0n,
          },
        ],
        restores,
      );
      patchMethod(
        prisma.memberRole,
        "deleteMany",
        () => {
          operations.push("memberRole.deleteMany.prepare");
          return { operation: "delete" };
        },
        restores,
      );
      patchMethod(
        prisma.memberRole,
        "createMany",
        () => {
          operations.push("memberRole.createMany.prepare");
          return { operation: "create" };
        },
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            auditLog: {
              create: async () => {
                operations.push("auditLog.create");
                return {};
              },
            },
            memberRole: {
              createMany: async () => {
                operations.push("memberRole.createMany.prepare");
                return { count: 1 };
              },
              deleteMany: async () => {
                operations.push("memberRole.deleteMany.prepare");
                return { count: 0 };
              },
            },
          };
          const result = await callback(tx);
          operations.push("transaction.commit");
          return result;
        },
        restores,
      );
      patchMethod(
        prisma.notification,
        "create",
        async () => {
          operations.push("notification.create");
          return {
            actionUrl: "/channels/server-1",
            body: "Role assigned",
            createdAt: new Date("2026-05-15T09:00:00.000Z"),
            id: "notification-1",
            imageUrl: null,
            metadata: null,
            read: false,
            readAt: null,
            title: "Roles updated",
            type: "MODERATION",
            userId: "target",
          };
        },
        restores,
      );

      await updateWorkspaceMemberRoles("owner", "server-1", "member-target", {
        roleIds: ["role-vip"],
      });

      assert.ok(
        indexOfOperation(operations, "transaction.commit") <
          indexOfOperation(operations, "permission-cache.member"),
      );
      assert.ok(
        indexOfOperation(operations, "permission-cache.member") <
          indexOfOperation(operations, "socket.emit:server:server-1:server:settings:updated"),
      );
      assert.ok(
        indexOfOperation(operations, "socket.emit:server:server-1:server:settings:updated") <
          indexOfOperation(operations, "notification.create"),
      );
      assert.ok(
        indexOfOperation(operations, "notification.create") <
          indexOfOperation(operations, "socket.emit:user:target:notification:new"),
      );
    });
  });

  it("preserves an existing managed role when omitted from a full replacement", async () => {
    await withPatchedEnvironment(async (restores) => {
      const managedRole = {
        id: "role-managed",
        isDefault: false,
        managed: true,
        name: "Integration",
        permissions: 0n,
      };
      const mutation = setupMemberRoleMutation(restores, {
        availableRoles: [managedRole],
        currentRoles: [managedRole],
      });

      await updateWorkspaceMemberRoles("owner", "server-1", "member-target", { roleIds: [] });

      assert.deepEqual(mutation.deleteRoleIds, []);
      assert.equal(mutation.createData, null);
      assert.equal(mutation.transactionCount, 1);
    });
  });

  it("accepts an existing managed role as immutable carry-through without recreating it", async () => {
    await withPatchedEnvironment(async (restores) => {
      const managedRole = {
        id: "role-managed",
        isDefault: false,
        managed: true,
        name: "Integration",
        permissions: 0n,
      };
      const mutation = setupMemberRoleMutation(restores, {
        availableRoles: [managedRole],
        currentRoles: [managedRole],
      });

      await updateWorkspaceMemberRoles("owner", "server-1", "member-target", {
        roleIds: [managedRole.id],
      });

      assert.deepEqual(mutation.deleteRoleIds, []);
      assert.equal(mutation.createData, null);
      assert.equal(mutation.transactionCount, 1);
    });
  });

  it("rejects a newly requested managed role", async () => {
    await withPatchedEnvironment(async (restores) => {
      const managedRole = {
        id: "role-new-managed",
        isDefault: false,
        managed: true,
        name: "Integration",
        permissions: 0n,
      };
      const mutation = setupMemberRoleMutation(restores, {
        availableRoles: [managedRole],
      });

      await assert.rejects(
        () =>
          updateWorkspaceMemberRoles("owner", "server-1", "member-target", {
            roleIds: [managedRole.id],
          }),
        (error) => error instanceof ApiError && error.code === "PROTECTED_ROLE",
      );
      assert.equal(mutation.transactionCount, 0);
    });
  });

  it("mutates requested ordinary roles without deleting or recreating managed roles", async () => {
    await withPatchedEnvironment(async (restores) => {
      const managedRole = {
        id: "role-managed",
        isDefault: false,
        managed: true,
        name: "Integration",
        permissions: 0n,
      };
      const ordinaryRole = {
        id: "role-ordinary",
        isDefault: false,
        managed: false,
        name: "Ordinary",
        permissions: 0n,
      };
      const mutation = setupMemberRoleMutation(restores, {
        availableRoles: [managedRole, ordinaryRole],
        currentRoles: [managedRole],
      });

      await updateWorkspaceMemberRoles("owner", "server-1", "member-target", {
        roleIds: [managedRole.id, ordinaryRole.id],
      });

      assert.deepEqual(mutation.deleteRoleIds, []);
      assert.deepEqual(mutation.createData, [
        { memberId: "member-target", roleId: ordinaryRole.id },
      ]);
    });
  });

  it("writes role assignment audit data in the member-role transaction", async () => {
    await withPatchedEnvironment(async (restores) => {
      const ordinaryRole = {
        id: "role-ordinary",
        isDefault: false,
        managed: false,
        name: "Ordinary",
        permissions: 0n,
      };
      const mutation = setupMemberRoleMutation(restores, {
        availableRoles: [ordinaryRole],
      });

      await updateWorkspaceMemberRoles("owner", "server-1", "member-target", {
        roleIds: [ordinaryRole.id],
      });

      assert.deepEqual(mutation.auditData, {
        action: "MEMBER_ROLES_UPDATED",
        changes: { addedRoleIds: [ordinaryRole.id], removedRoleIds: [] },
        serverId: "server-1",
        targetId: "target",
        targetType: "USER",
        userId: "owner",
      });
    });
  });

  it("retains default-role, elevated-role, owner, target, and permission denials", async () => {
    const defaultRoleRow = {
      id: "role-default",
      isDefault: true,
      managed: false,
      name: "@everyone",
      permissions: 0n,
    };
    const elevatedRole = {
      id: "role-elevated",
      isDefault: false,
      managed: false,
      name: "Elevated",
      permissions: PermissionBits.MANAGE_SERVER,
    };

    await withPatchedEnvironment(async (restores) => {
      setupMemberRoleMutation(restores, {
        availableRoles: [defaultRoleRow],
      });
      await assert.rejects(
        () =>
          updateWorkspaceMemberRoles("owner", "server-1", "member-target", {
            roleIds: [defaultRoleRow.id],
          }),
        (error) => error instanceof ApiError && error.code === "PROTECTED_ROLE",
      );
    });

    await withPatchedEnvironment(async (restores) => {
      setupMemberRoleMutation(restores, {
        actorId: "manager",
        availableRoles: [elevatedRole],
      });
      await assert.rejects(
        () =>
          updateWorkspaceMemberRoles("manager", "server-1", "member-target", {
            roleIds: [elevatedRole.id],
          }),
        (error) => error instanceof ApiError && error.code === "OWNER_REQUIRED",
      );
    });

    await withPatchedEnvironment(async (restores) => {
      setupMemberRoleMutation(restores, {
        targetUserId: "owner",
      });
      await assert.rejects(
        () => updateWorkspaceMemberRoles("owner", "server-1", "member-target", { roleIds: [] }),
        (error) => error instanceof ApiError && error.code === "OWNER_PROTECTED",
      );
    });

    await withPatchedEnvironment(async (restores) => {
      setupMemberRoleMutation(restores, {
        actorId: "manager",
        currentRoles: [elevatedRole],
      });
      await assert.rejects(
        () => updateWorkspaceMemberRoles("manager", "server-1", "member-target", { roleIds: [] }),
        (error) => error instanceof ApiError && error.code === "ROLE_HIERARCHY",
      );
    });

    await withPatchedEnvironment(async (restores) => {
      setupMemberRoleMutation(restores, {
        actorId: "member",
        actorPermissions: 0n,
      });
      await assert.rejects(
        () => updateWorkspaceMemberRoles("member", "server-1", "member-target", { roleIds: [] }),
        (error) => error instanceof ApiError && error.status === 403,
      );
    });
  });

  it("updates server metadata before permission cache invalidation and socket fanout", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverBan, "findMany", async () => [], restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            permissions: PermissionBits.MANAGE_SERVER,
            userId: "owner",
          }),
        restores,
      );
      patchMethod(prisma.serverMember, "findMany", async () => [], restores);
      patchMethod(
        prisma.serverMember,
        "findUnique",
        async () => ({
          id: "member-owner",
          roles: [],
          server: { ownerId: "owner" },
        }),
        restores,
      );
      patchMethod(prisma.serverInvite, "findMany", async () => [], restores);
      patchMethod(
        prisma.role,
        "findMany",
        async () => [defaultRole(PermissionBits.VIEW_CHANNEL)],
        restores,
      );
      patchMethod(prisma.channel, "findMany", async () => [], restores);
      patchMethod(
        prisma.server,
        "update",
        async () => {
          operations.push("server.update");
          return {};
        },
        restores,
      );
      patchMethod(prisma.server, "findUniqueOrThrow", async () => ({ type: "PERSONAL" }), restores);
      patchMethod(
        prisma.server,
        "findUnique",
        async () => ({
          _count: { members: 0 },
          categories: [],
          channels: [],
          deletedMessageNoticeMinutes: 5,
          description: "Updated server",
          features: [],
          iconUrl: null,
          id: "server-1",
          inviteCode: "invite-code",
          members: [],
          messageCharacterLimit: 4096,
          name: "Renamed",
          ownerId: "owner",
          roles: [
            {
              ...defaultRole(PermissionBits.VIEW_CHANNEL),
              managed: false,
              mentionable: false,
              position: 0,
            },
          ],
          shortName: null,
          tags: [],
          userServerSettings: [],
        }),
        restores,
      );

      await updateWorkspaceServer("owner", "server-1", {
        description: "Updated server",
        iconUrl: null,
        messageCharacterLimit: 4096,
      });

      assert.ok(
        indexOfOperation(operations, "server.update") <
          indexOfOperation(operations, "permission-cache.server"),
      );
      assert.ok(
        indexOfOperation(operations, "permission-cache.server") <
          indexOfOperation(operations, "socket.emit:server:server-1:server:settings:updated"),
      );
      assert.equal(
        operations.filter((operation) => operation === "permission-cache.server").length,
        1,
      );
    });
  });

  it("updates channel permission overrides atomically before cache invalidation and fanout", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            permissions: PermissionBits.MANAGE_CHANNELS,
            userId: "owner",
          }),
        restores,
      );
      patchMethod(
        prisma.channel,
        "findUnique",
        async () => ({
          id: "channel-1",
          locked: false,
          permissionOverrides: [],
          server: {
            roles: [
              {
                id: "role-everyone",
                isDefault: true,
                managed: false,
                permissions: PermissionBits.VIEW_CHANNEL,
              },
              {
                id: "role-vip",
                isDefault: false,
                managed: false,
                permissions: PermissionBits.VIEW_CHANNEL,
              },
            ],
          },
          serverId: "server-1",
          type: ChannelType.TEXT,
        }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          operations.push("transaction.begin");
          const tx = {
            channel: {
              update: async () => {
                operations.push("tx.channel.update");
                return {};
              },
            },
            channelPermissionOverride: {
              deleteMany: async () => {
                operations.push("tx.channelPermissionOverride.deleteMany");
                return { count: 0 };
              },
              upsert: async (args?: unknown) => {
                const targetId = (
                  args as { where?: { channelId_targetId_targetType?: { targetId?: string } } }
                ).where?.channelId_targetId_targetType?.targetId;
                operations.push(`tx.channelPermissionOverride.upsert:${targetId}`);
                return {};
              },
            },
          };
          const result = await (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
          operations.push("transaction.commit");
          return result;
        },
        restores,
      );

      await updateWorkspaceChannelPermissions("owner", "channel-1", {
        allowedRoleIds: ["role-vip"],
        preset: "ROLE_GATED",
      });

      assert.ok(
        indexOfOperation(operations, "transaction.commit") <
          indexOfOperation(operations, "permission-cache.server"),
      );
      assert.ok(
        indexOfOperation(operations, "permission-cache.server") <
          indexOfOperation(operations, "socket.emit:server:server-1:server:settings:updated"),
      );
      assert.ok(operations.includes("tx.channel.update"));
      assert.ok(operations.includes("tx.channelPermissionOverride.upsert:role-everyone"));
      assert.ok(operations.includes("tx.channelPermissionOverride.upsert:role-vip"));
    });
  });

  it("clears text channel history inside one transaction", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            permissions: PermissionBits.CLEAR_CHANNEL_HISTORY,
            userId: "owner",
          }),
        restores,
      );
      patchMethod(
        prisma.channel,
        "findUnique",
        async () => ({
          id: "channel-1",
          serverId: "server-1",
          type: ChannelType.TEXT,
        }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          operations.push("transaction.begin");
          const tx = {
            $executeRaw: async () => {
              operations.push("tx.$executeRaw");
              return 1;
            },
            channel: {
              update: async () => {
                operations.push("tx.channel.update");
                return {};
              },
            },
            channelReadState: {
              updateMany: async () => {
                operations.push("tx.channelReadState.updateMany");
                return { count: 2 };
              },
            },
            message: {
              deleteMany: async () => {
                operations.push("tx.message.deleteMany");
                return { count: 7 };
              },
            },
          };
          const result = await (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
          operations.push("transaction.commit");
          return result;
        },
        restores,
      );

      const result = await clearWorkspaceChannelHistory("owner", "channel-1");

      assert.equal(result.deletedCount, 7);
      assert.deepEqual(operations, [
        "transaction.begin",
        "tx.$executeRaw",
        "tx.message.deleteMany",
        "tx.channelReadState.updateMany",
        "tx.channel.update",
        "transaction.commit",
      ]);
    });
  });

  it("lists workspace invites only with MANAGE_INVITES and maps the public invite shape", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.MANAGE_INVITES,
            userId: "manager",
          }),
        restores,
      );
      patchMethod(
        prisma.serverInvite,
        "findMany",
        async () => [
          {
            channelId: "channel-1",
            code: "INVITE1",
            createdAt: new Date("2026-07-13T10:00:00.000Z"),
            creator: { displayName: "Manager", username: "manager" },
            expiresAt: new Date("2026-07-14T10:00:00.000Z"),
            id: "invite-1",
            maxUses: 5,
            uses: 2,
          },
        ],
        restores,
      );

      assert.deepEqual(await listWorkspaceInvites("manager", "server-1"), [
        {
          channelId: "channel-1",
          code: "INVITE1",
          createdAt: "2026-07-13T10:00:00.000Z",
          createdByDisplayName: "Manager",
          expiresAt: "2026-07-14T10:00:00.000Z",
          id: "invite-1",
          maxUses: 5,
          uses: 2,
        },
      ]);
    });

    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: 0n,
            userId: "member",
          }),
        restores,
      );
      patchMethod(
        prisma.serverInvite,
        "findMany",
        async () => {
          throw new Error("invite listing must not run without permission");
        },
        restores,
      );
      await assert.rejects(
        () => listWorkspaceInvites("member", "server-1"),
        (error) => error instanceof ApiError && error.status === 403,
      );
    });
  });

  it("bounds mobile invites with a stable sentinel and rejects overflow instead of truncating", async () => {
    await withPatchedEnvironment(async (restores) => {
      let requestedCount = 100;
      let capturedQuery: unknown;
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.MANAGE_INVITES,
            userId: "manager",
          }),
        restores,
      );
      patchMethod(
        prisma.serverInvite,
        "findMany",
        async (query?: unknown) => {
          capturedQuery = query;
          return Array.from({ length: requestedCount }, (_, index) => ({
            channelId: null,
            code: `CODE${index}`,
            createdAt: new Date(1_700_000_000_000 - index),
            creator: { displayName: "Manager", username: "manager" },
            expiresAt: null,
            id: `invite-${index}`,
            maxUses: null,
            uses: 0,
          }));
        },
        restores,
      );

      const boundaryResult = await listMobileWorkspaceInvites("manager", "server-1");
      assert.equal(boundaryResult.length, 100);
      const query = capturedQuery as { orderBy?: unknown; take?: unknown };
      assert.equal(query.take, 101);
      assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "asc" }]);

      requestedCount = 101;
      await assert.rejects(
        () => listMobileWorkspaceInvites("manager", "server-1"),
        (error) =>
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === "MOBILE_RESPONSE_LIMIT_EXCEEDED",
      );
    });
  });

  it("keeps createWorkspaceInvite byte-compatible while the internal variant returns details", async () => {
    await withPatchedEnvironment(async (restores) => {
      let createCount = 0;
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: PermissionBits.MANAGE_INVITES,
            userId: "manager",
          }),
        restores,
      );
      patchMethod(prisma.channel, "findFirst", async () => ({ id: "channel-1" }), restores);
      patchMethod(prisma.serverInvite, "findUnique", async () => null, restores);
      patchMethod(prisma.server, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverInvite,
        "create",
        async (query?: unknown) => {
          createCount += 1;
          const data = (
            query as {
              data: {
                channelId: string | null;
                code: string;
                expiresAt: Date | null;
                maxUses: number | null;
              };
            }
          ).data;
          return {
            channelId: data.channelId,
            code: data.code,
            createdAt: new Date(`2026-07-13T1${createCount}:00:00.000Z`),
            creator: { displayName: "Manager", username: "manager" },
            expiresAt: data.expiresAt,
            id: `invite-${createCount}`,
            maxUses: data.maxUses,
            uses: 0,
          };
        },
        restores,
      );

      const input = { channelId: "channel-1", expiresInHours: null, maxUses: 5 };
      const publicResult = await createWorkspaceInvite("manager", "server-1", input);
      const internalResult = await createWorkspaceInviteWithDetails("manager", "server-1", input);

      assert.deepEqual(Object.keys(publicResult), ["code"]);
      assert.equal(JSON.stringify(publicResult), `{"code":"${publicResult.code}"}`);
      assert.deepEqual(internalResult, {
        channelId: "channel-1",
        code: internalResult.code,
        createdAt: "2026-07-13T12:00:00.000Z",
        createdByDisplayName: "Manager",
        expiresAt: null,
        id: "invite-2",
        maxUses: 5,
        uses: 0,
      });
    });
  });

  it("builds encoded canonical invite URLs from the first configured origin", () => {
    assert.equal(
      buildMobileInviteShareUrl("code/with space", {
        APP_URL: " https://app.example.test/base ",
        AUTH_URL: "https://auth.example.test",
        NEXTAUTH_URL: "https://legacy.example.test",
        NODE_ENV: "production",
      }),
      "https://app.example.test/invite/code%2Fwith%20space",
    );
    assert.equal(
      buildMobileInviteShareUrl("DEV_CODE", {
        APP_URL: "http://127.0.0.1:3000",
        NODE_ENV: "development",
      }),
      "http://127.0.0.1:3000/invite/DEV_CODE",
    );
  });

  it("fails closed with a bounded configuration error for missing, invalid, or insecure origins", () => {
    const invalidEnvironments: NodeJS.ProcessEnv[] = [
      { NODE_ENV: "production" },
      { APP_URL: "not-a-url", AUTH_URL: "https://fallback.example", NODE_ENV: "production" },
      { APP_URL: "http://app.example.test", NODE_ENV: "production" },
    ];

    for (const env of invalidEnvironments) {
      assert.throws(
        () => buildMobileInviteShareUrl("INVITE1", env),
        (error) =>
          error instanceof ApiError &&
          error.status === 500 &&
          error.code === "CONFIGURATION_ERROR" &&
          error.message.length <= 120,
      );
    }
  });

  it("fails invite join on optimistic max-use race before creating membership", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(
        prisma.serverInvite,
        "findUnique",
        async () => ({
          channelId: null,
          expiresAt: null,
          id: "invite-1",
          maxUses: 1,
          server: {
            id: "server-1",
            ownerId: "owner",
            roles: [defaultRole()],
          },
          uses: 1,
        }),
        restores,
      );
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({
          displayName: "Ada",
          isBanned: false,
          username: "ada",
        }),
        restores,
      );
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          operations.push("transaction.begin");
          const tx = {
            serverBan: {
              findUnique: async () => null,
            },
            serverInvite: {
              updateMany: async () => {
                operations.push("tx.serverInvite.updateMany");
                return { count: 0 };
              },
            },
            serverMember: {
              create: async () => {
                operations.push("tx.serverMember.create");
                return { id: "member-joiner" };
              },
            },
          };
          return (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
        },
        restores,
      );

      await assert.rejects(
        () => joinWorkspaceServerByInvite("joiner", "INVITE1"),
        (error) => error instanceof ApiError && error.status === 400,
      );

      assert.ok(operations.includes("tx.serverInvite.updateMany"));
      assert.ok(!operations.includes("tx.serverMember.create"));
      assert.ok(!operations.some((operation) => operation.startsWith("server-room-cache.del")));
      assert.ok(!operations.some((operation) => operation.startsWith("socket.emit")));
    });
  });

  it("reports existing invite members without consuming the invite again", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];

      patchMethod(
        prisma.serverInvite,
        "findUnique",
        async () => ({
          channelId: "channel-1",
          expiresAt: null,
          id: "invite-1",
          maxUses: 1,
          server: {
            id: "server-1",
            ownerId: "owner",
            roles: [defaultRole()],
          },
          uses: 1,
        }),
        restores,
      );
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({
          displayName: "Ada",
          isBanned: false,
          username: "ada",
        }),
        restores,
      );
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findUnique",
        async () => ({ id: "member-existing" }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          operations.push("transaction.begin");
          throw new Error("existing invite members should not create memberships");
        },
        restores,
      );

      const result = await joinWorkspaceServerByInvite("joiner", "INVITE1");

      assert.deepEqual(result, {
        alreadyMember: true,
        channelId: "channel-1",
        serverId: "server-1",
      });
      assert.deepEqual(operations, []);
    });
  });

  it("resolves a configured community vanity slug through the existing join service", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverInvite, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverInvite,
        "findFirst",
        async (input: UnknownRecord) => {
          assert.deepEqual(input.where, {
            server: { vanityUrlCode: "whispr-community" },
            targetUserId: null,
          });
          return {
            channelId: "channel-1",
            createdById: "owner",
            expiresAt: null,
            id: "invite-1",
            maxUses: null,
            server: {
              id: "server-1",
              ownerId: "owner",
              roles: [defaultRole()],
            },
            targetUserId: null,
            uses: 0,
          };
        },
        restores,
      );
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({
          displayName: "Ada",
          isBanned: false,
          username: "ada",
        }),
        restores,
      );
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findUnique",
        async () => ({ id: "member-existing" }),
        restores,
      );

      const result = await joinWorkspaceServerByInvite("joiner", "whispr-community");

      assert.deepEqual(result, {
        alreadyMember: true,
        channelId: "channel-1",
        serverId: "server-1",
      });
    });
  });

  it("checks MANAGE_CHANNELS before channel updates", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(
        prisma.channel,
        "findUnique",
        async () => ({
          categoryId: null,
          id: "channel-1",
          locked: false,
          serverId: "server-1",
          type: ChannelType.TEXT,
        }),
        restores,
      );
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: 0n,
            userId: "member",
          }),
        restores,
      );
      patchMethod(
        prisma.channel,
        "update",
        async () => {
          throw new Error("channel update should not run without permission");
        },
        restores,
      );

      await assert.rejects(
        () => updateWorkspaceChannel("member", "channel-1", { name: "staff", topic: null }),
        (error) => error instanceof ApiError && error.status === 403,
      );
    });
  });

  it("treats an update channel from another expected server as not found", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(
        prisma.channel,
        "findUnique",
        async () => ({
          categoryId: null,
          id: "channel-1",
          locked: false,
          serverId: "server-other",
          type: ChannelType.TEXT,
        }),
        restores,
      );
      patchMethod(
        prisma.serverBan,
        "findUnique",
        async () => {
          throw new Error("cross-server channel must fail before access lookup");
        },
        restores,
      );
      patchMethod(
        prisma.channel,
        "update",
        async () => {
          throw new Error("cross-server channel must not be updated");
        },
        restores,
      );

      await assert.rejects(
        () =>
          updateWorkspaceChannel(
            "manager",
            "channel-1",
            { name: "renamed", topic: null },
            { expectedServerId: "server-expected" },
          ),
        (error) =>
          error instanceof ApiError &&
          error.status === 404 &&
          error.message === "Channel not found",
      );
    });
  });

  it("treats a delete channel from another expected server as not found", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(
        prisma.channel,
        "findUnique",
        async () => ({
          id: "channel-1",
          serverId: "server-other",
        }),
        restores,
      );
      patchMethod(
        prisma.serverBan,
        "findUnique",
        async () => {
          throw new Error("cross-server channel must fail before access lookup");
        },
        restores,
      );
      patchMethod(
        prisma.channel,
        "delete",
        async () => {
          throw new Error("cross-server channel must not be deleted");
        },
        restores,
      );

      await assert.rejects(
        () =>
          deleteWorkspaceChannel("manager", "channel-1", {
            expectedServerId: "server-expected",
          }),
        (error) =>
          error instanceof ApiError &&
          error.status === 404 &&
          error.message === "Channel not found",
      );
    });
  });

  it("disconnects unauthorized voice participants after lock metadata cache invalidation", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(
        prisma.channel,
        "findUnique",
        async () => ({
          categoryId: null,
          id: "voice-1",
          locked: false,
          serverId: "server-1",
          type: ChannelType.VOICE,
        }),
        restores,
      );
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            permissions: PermissionBits.MANAGE_CHANNELS,
            userId: "owner",
          }),
        restores,
      );
      patchMethod(
        prisma.channel,
        "update",
        async () => {
          operations.push("channel.update");
          return {};
        },
        restores,
      );
      patchMethod(
        prisma.voiceState,
        "findMany",
        async () => {
          operations.push("voiceState.findMany");
          return [];
        },
        restores,
      );

      await updateWorkspaceChannel("owner", "voice-1", { locked: true, topic: null });

      assert.deepEqual(
        operations.filter(
          (operation) =>
            operation === "permission-cache.server" ||
            operation === "channel.update" ||
            operation === "voiceState.findMany" ||
            operation === "socket.emit:server:server-1:server:settings:updated",
        ),
        [
          "channel.update",
          "permission-cache.server",
          "voiceState.findMany",
          "socket.emit:server:server-1:server:settings:updated",
        ],
      );
    });
  });

  it("leaves a workspace server with DB delete, cache invalidation, socket detach, then unread fanout", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      const leavingSocket = createFakeSocket(operations, "leaver");
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(
        createFakeSocketServer(operations, {
          "server:server-1": [],
          "user:member": [leavingSocket],
        }),
      );

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            ownerId: "owner",
            permissions: 0n,
            userId: "member",
          }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: async () => {
              operations.push("server.memberCount.decrement");
              return 1;
            },
            serverMember: {
              delete: async () => {
                operations.push("serverMember.delete");
                return {};
              },
            },
          };
          const result = await callback(tx);
          operations.push("transaction.commit");
          return result;
        },
        restores,
      );
      patchMethod(prisma.channel, "findMany", async () => [{ id: "voice-1" }], restores);
      patchMethod(prisma.voiceState, "findUnique", async () => null, restores);

      await leaveWorkspaceServer("member", "server-1");

      assert.deepEqual(
        operations.filter(
          (operation) =>
            operation === "serverMember.delete" ||
            operation === "server.memberCount.decrement" ||
            operation === "transaction.commit",
        ),
        ["serverMember.delete", "server.memberCount.decrement", "transaction.commit"],
      );
      assert.ok(
        indexOfOperation(operations, "serverMember.delete") <
          indexOfOperation(operations, "permission-cache.member"),
      );
      assert.ok(
        indexOfOperation(operations, "serverMember.delete") <
          indexOfOperation(operations, "server-room-cache.del:socket:v1:user-servers:member"),
      );
      assert.ok(
        indexOfOperation(operations, "permission-cache.member") <
          indexOfOperation(operations, "socket.leave:leaver:server:server-1"),
      );
      assert.ok(
        indexOfOperation(operations, "socket.leave:leaver:voice-viewers:voice-1") <
          indexOfOperation(operations, "socket.emit:server:server-1:server:settings:updated"),
      );
      assert.equal(operations.includes("socket.fetch:server:server-1"), false);
    });
  });

  it("kicks a member with permission cache invalidation before detach and membership events", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      const targetSocket = createFakeSocket(operations, "target");
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(
        createFakeSocketServer(operations, {
          "server:server-1": [],
          "user:target": [targetSocket],
        }),
      );

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async (args?: unknown) => {
          const where = (args as { where?: { id?: string; userId?: string } }).where;
          if (where?.userId) {
            return accessMembership({
              permissions: PermissionBits.KICK_MEMBERS,
              userId: "owner",
            });
          }
          if (where?.id === "member-target") {
            return { id: "member-target", roles: [], userId: "target" };
          }
          return null;
        },
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (
          callback: (tx: unknown) => Promise<unknown>,
          options?: { isolationLevel?: string },
        ) => {
          assert.equal(options?.isolationLevel, "Serializable");
          const tx = {
            $executeRaw: async () => {
              operations.push("server.memberCount.decrement");
              return 1;
            },
            auditLog: {
              create: async (query: { data: Record<string, unknown> }) => {
                operations.push("auditLog.create");
                assert.deepEqual(query.data, {
                  action: "MEMBER_KICKED",
                  changes: { memberId: "member-target" },
                  serverId: "server-1",
                  targetId: "target",
                  targetType: "USER",
                  userId: "owner",
                });
                return {};
              },
            },
            serverMember: {
              delete: async () => {
                operations.push("serverMember.delete");
                return {};
              },
              findFirst: async () => ({
                id: "member-target",
                roles: [{ role: defaultRole() }],
                userId: "target",
              }),
            },
          };
          const result = await callback(tx);
          operations.push("transaction.commit");
          return result;
        },
        restores,
      );
      patchMethod(prisma.channel, "findMany", async () => [{ id: "voice-1" }], restores);
      patchMethod(prisma.voiceState, "findUnique", async () => null, restores);

      await kickWorkspaceMember("owner", "server-1", "member-target");

      assert.deepEqual(
        operations.filter(
          (operation) =>
            operation === "serverMember.delete" ||
            operation === "server.memberCount.decrement" ||
            operation === "auditLog.create" ||
            operation === "transaction.commit",
        ),
        [
          "serverMember.delete",
          "server.memberCount.decrement",
          "auditLog.create",
          "transaction.commit",
        ],
      );
      assert.ok(
        indexOfOperation(operations, "serverMember.delete") <
          indexOfOperation(operations, "permission-cache.member"),
      );
      assert.ok(
        indexOfOperation(operations, "permission-cache.member") <
          indexOfOperation(operations, "socket.leave:target:server:server-1"),
      );
      assert.ok(
        indexOfOperation(operations, "socket.leave:target:voice-viewers:voice-1") <
          indexOfOperation(operations, "socket.emit:user:target:server:membership:removed:kicked"),
      );
      assert.equal(operations.includes("socket.fetch:server:server-1"), false);
    });
  });

  it("deletes a workspace server before invalidating every member room cache and detaching sockets", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(
        createFakeSocketServer(operations, {
          "user:member-a": [createFakeSocket(operations, "member-a")],
          "user:member-b": [createFakeSocket(operations, "member-b")],
        }),
      );

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            userId: "owner",
          }),
        restores,
      );
      patchMethod(
        prisma.serverMember,
        "findMany",
        async () => [{ userId: "member-a" }, { userId: "member-b" }],
        restores,
      );
      patchMethod(
        prisma.server,
        "delete",
        async () => {
          throw new Error("server deletion must use the scheduling transaction");
        },
        restores,
      );
      patchMethod(prisma.server, "findUniqueOrThrow", async () => ({ type: "PERSONAL" }), restores);
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          operations.push("transaction.begin");
          const tx = {
            mobileMediaUpload: {
              updateMany: async (args?: unknown) => {
                operations.push("mobileMediaUpload.schedule");
                const input = args as {
                  data?: { cleanupAfter?: unknown };
                  where?: {
                    purpose?: string;
                    storageDeletedAt?: null;
                    targetServerId?: string;
                  };
                };
                assert.ok(input.data?.cleanupAfter instanceof Date);
                assert.deepEqual(input.where, {
                  purpose: "SERVER_ICON",
                  storageDeletedAt: null,
                  targetServerId: "server-1",
                });
                return { count: 2 };
              },
            },
            server: {
              delete: async () => {
                operations.push("server.delete");
                return {};
              },
            },
          };
          const result = await (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
          operations.push("transaction.commit");
          return result;
        },
        restores,
      );

      await deleteWorkspaceServer("owner", "server-1", { confirmationName: "Guild" });

      assert.ok(
        indexOfOperation(operations, "mobileMediaUpload.schedule") <
          indexOfOperation(operations, "server.delete"),
      );
      assert.ok(
        indexOfOperation(operations, "server.delete") <
          indexOfOperation(operations, "transaction.commit"),
      );
      assert.ok(
        indexOfOperation(operations, "transaction.commit") <
          indexOfOperation(operations, "permission-cache.server"),
      );
      assert.ok(
        indexOfOperation(operations, "permission-cache.server") <
          indexOfOperation(operations, "server-room-cache.del:socket:v1:user-servers:member-a"),
      );
      // Room detachment is now one cluster-aware call instead of one
      // `fetchSockets()` round trip per member.
      assert.deepEqual(
        operations.filter((operation) => operation.startsWith("socket.fetch:")),
        [],
      );
      assert.ok(
        indexOfOperation(operations, "server-room-cache.del:socket:v1:user-servers:member-b") <
          indexOfOperation(operations, "socket.rooms-leave:server:server-1:server:server-1"),
      );
      // One broadcast carries every member room, and it lands after the room
      // detachment so a client cannot receive further server events between
      // the two.
      assert.ok(
        indexOfOperation(operations, "socket.rooms-leave:server:server-1:server:server-1") <
          indexOfOperation(
            operations,
            "socket.emit:user:member-a,user:member-b:server:membership:removed:deleted",
          ),
      );
      assert.equal(
        operations.filter((operation) => operation.includes("membership:removed")).length,
        1,
      );
    });
  });

  it("detaches a large server with bounded broadcasts instead of a call per member", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      const members = Array.from({ length: 1_200 }, (_, index) => ({
        userId: `member-${index}`,
      }));
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () => accessMembership({ userId: "owner" }),
        restores,
      );
      patchMethod(prisma.serverMember, "findMany", async () => members, restores);
      patchMethod(prisma.server, "findUniqueOrThrow", async () => ({ type: "PERSONAL" }), restores);
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) =>
          (callback as (transaction: unknown) => Promise<unknown>)({
            mobileMediaUpload: { updateMany: async () => ({ count: 0 }) },
            server: { delete: async () => ({}) },
          }),
        restores,
      );

      await deleteWorkspaceServer("owner", "server-1", { confirmationName: "Guild" });

      // The behaviour that matters: cluster work stays constant-ish in the
      // member count. 1200 members used to mean 1200 awaited `fetchSockets()`
      // round trips; it is now one room detachment plus ceil(1200 / 500)
      // broadcasts.
      assert.deepEqual(
        operations.filter((operation) => operation.startsWith("socket.fetch:")),
        [],
      );
      assert.equal(
        operations.filter((operation) => operation.startsWith("socket.rooms-leave:")).length,
        1,
      );

      const broadcasts = operations.filter((operation) => operation.includes("membership:removed"));
      assert.equal(broadcasts.length, 3);
      // Room names contain colons, so count the `user:` prefixes rather than
      // splitting the operation label.
      assert.equal(
        broadcasts.reduce(
          (total, broadcast) => total + (broadcast.match(/user:member-/g)?.length ?? 0),
          0,
        ),
        members.length,
      );
    });
  });

  it("does not run add-member fanout when the membership transaction fails", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(
        prisma.serverMember,
        "findFirst",
        async () =>
          accessMembership({
            userId: "owner",
          }),
        restores,
      );
      patchMethod(
        prisma.server,
        "findUnique",
        async () => ({
          features: ["allow-member-adds"],
          id: "server-1",
          name: "Guild",
          roles: [defaultRole()],
          systemChannelId: "channel-system",
        }),
        restores,
      );
      patchMethod(
        prisma.user,
        "findFirst",
        async () => ({
          avatarUrl: null,
          displayName: "Target",
          id: "target",
          isBanned: false,
          locale: "en",
          username: "target",
        }),
        restores,
      );
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({
          displayName: "Owner",
          username: "owner",
        }),
        restores,
      );
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          const tx = {
            channel: {
              findFirst: async () => ({ id: "channel-system" }),
            },
            memberRole: {
              create: async () => {
                operations.push("tx.memberRole.create");
                return {};
              },
            },
            message: {
              create: async () => {
                operations.push("tx.message.create");
                return { createdAt: new Date(), id: "message-1" };
              },
            },
            notification: {
              create: async () => {
                operations.push("tx.notification.create");
                return {};
              },
            },
            serverBan: {
              findUnique: async () => null,
            },
            serverMember: {
              create: async () => {
                operations.push("tx.serverMember.create");
                throw new Error("membership insert failed");
              },
            },
          };
          return (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
        },
        restores,
      );

      await assert.rejects(
        () => addWorkspaceServerMemberByUsername("owner", "server-1", { username: "target" }),
        /membership insert failed/,
      );

      assert.deepEqual(operations, ["tx.serverMember.create"]);
      assert.ok(!operations.some((operation) => operation.startsWith("server-room-cache.del")));
      assert.ok(!operations.some((operation) => operation.startsWith("socket.emit")));
    });
  });
});
