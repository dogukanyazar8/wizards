import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, prisma } from "@wizards/db";
import {
  readCachedChannelPermissionSnapshot,
  setPermissionCacheRedisForTest,
} from "./permission-cache";
import {
  CHANNEL_PERMISSION_FILTER_BATCH_SIZE,
  filterUserIdsByChannelPermission,
  listChannelIdsByServerForUserWithPermission,
  listChannelIdsForUsersWithPermission,
} from "./permission-service";
import { PermissionBits } from "./permissions";

type AsyncMethod = (args?: unknown) => Promise<unknown>;

function getUserIdInClause(args: unknown) {
  const userIds = (args as { where?: { userId?: { in?: unknown } } }).where?.userId?.in;
  assert.ok(Array.isArray(userIds));
  return userIds as string[];
}

describe("workspace permission service", () => {
  it("does not cache a batch snapshot after a sampled revision advances", async () => {
    const values = new Map<string, string>();
    const redis = {
      mget: async (...keys: string[]) => keys.map((key) => values.get(key) ?? null),
      pipeline() {
        const writes: Array<() => void> = [];
        const pipeline = {
          exec: async () => {
            writes.forEach((write) => write());
            return [];
          },
          expire: () => pipeline,
          eval: () => pipeline,
          incr: () => pipeline,
          set: (key: string, value: string) => {
            writes.push(() => values.set(key, value));
            return pipeline;
          },
        };
        return pipeline;
      },
      status: "ready" as const,
    };
    const channelDelegate = prisma.channel as unknown as { findUnique: AsyncMethod };
    const serverDelegate = prisma.server as unknown as { findUnique: AsyncMethod };
    const memberDelegate = prisma.serverMember as unknown as { findMany: AsyncMethod };
    const banDelegate = prisma.serverBan as unknown as { findMany: AsyncMethod };
    const originalChannelFindUnique = channelDelegate.findUnique;
    const originalServerFindUnique = serverDelegate.findUnique;
    const originalMemberFindMany = memberDelegate.findMany;
    const originalBanFindMany = banDelegate.findMany;
    const originalPermissionCacheDisabled = process.env.PERMISSION_CACHE_DISABLED;
    const originalPermissionCacheEnabled = process.env.PERMISSION_CACHE_ENABLED;
    process.env.PERMISSION_CACHE_ENABLED = "true";
    delete process.env.PERMISSION_CACHE_DISABLED;
    setPermissionCacheRedisForTest(redis as never);

    serverDelegate.findUnique = async () => ({
      authorizationRevision: 0n,
      authorizationSubjectRevisions: [],
    });

    channelDelegate.findUnique = async (args?: unknown) => {
      const select = (args as { select?: { id?: boolean } }).select;
      if (!select?.id) {
        return { serverId: "server-1" };
      }
      return {
        id: "channel-1",
        locked: false,
        name: "general",
        permissionOverrides: [],
        server: {
          features: [],
          messageCharacterLimit: 2000,
          ownerId: "owner",
          roles: [
            {
              id: "everyone",
              isDefault: true,
              name: "@everyone",
              permissions: PermissionBits.VIEW_CHANNEL,
            },
          ],
        },
        serverId: "server-1",
        type: ChannelType.TEXT,
      };
    };
    memberDelegate.findMany = async () => {
      values.set("permission:server:server-1:v", "1");
      return [{ id: "member-user-1", roles: [], userId: "user-1" }];
    };
    banDelegate.findMany = async () => [];

    try {
      assert.deepEqual(
        await filterUserIdsByChannelPermission(
          "channel-1",
          ["user-1"],
          PermissionBits.VIEW_CHANNEL,
        ),
        ["user-1"],
      );
      assert.equal(await readCachedChannelPermissionSnapshot("user-1", "channel-1"), null);
    } finally {
      channelDelegate.findUnique = originalChannelFindUnique;
      serverDelegate.findUnique = originalServerFindUnique;
      memberDelegate.findMany = originalMemberFindMany;
      banDelegate.findMany = originalBanFindMany;
      setPermissionCacheRedisForTest(null);
      if (originalPermissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originalPermissionCacheDisabled;
      }
      if (originalPermissionCacheEnabled === undefined) {
        delete process.env.PERMISSION_CACHE_ENABLED;
      } else {
        process.env.PERMISSION_CACHE_ENABLED = originalPermissionCacheEnabled;
      }
    }
  });

  it("filters channel permission fanout with bounded DB IN clauses", async () => {
    const calls = {
      channelFindUnique: 0,
      serverBanFindMany: 0,
      serverMemberFindMany: 0,
    };
    const memberBatchSizes: number[] = [];
    const banBatchSizes: number[] = [];
    const userIds = Array.from(
      { length: CHANNEL_PERMISSION_FILTER_BATCH_SIZE * 2 + 1 },
      (_, index) => `user-${index + 1}`,
    );
    const channelDelegate = prisma.channel as unknown as { findUnique: AsyncMethod };
    const serverDelegate = prisma.server as unknown as { findUnique: AsyncMethod };
    const memberDelegate = prisma.serverMember as unknown as { findMany: AsyncMethod };
    const banDelegate = prisma.serverBan as unknown as { findMany: AsyncMethod };
    const originalChannelFindUnique = channelDelegate.findUnique;
    const originalServerFindUnique = serverDelegate.findUnique;
    const originalMemberFindMany = memberDelegate.findMany;
    const originalBanFindMany = banDelegate.findMany;
    const originalPermissionCacheDisabled = process.env.PERMISSION_CACHE_DISABLED;
    process.env.PERMISSION_CACHE_DISABLED = "true";

    serverDelegate.findUnique = async () => ({
      authorizationRevision: 0n,
      authorizationSubjectRevisions: [],
    });

    channelDelegate.findUnique = async () => {
      calls.channelFindUnique += 1;

      return {
        id: "channel-1",
        locked: false,
        name: "general",
        permissionOverrides: [],
        server: {
          features: [],
          messageCharacterLimit: 2000,
          ownerId: "owner",
          roles: [
            {
              id: "everyone",
              isDefault: true,
              name: "@everyone",
              permissions: PermissionBits.VIEW_CHANNEL,
            },
          ],
        },
        serverId: "server-1",
        type: ChannelType.TEXT,
      };
    };
    memberDelegate.findMany = async (args?: unknown) => {
      calls.serverMemberFindMany += 1;
      const batchUserIds = getUserIdInClause(args);
      memberBatchSizes.push(batchUserIds.length);

      return batchUserIds.map((userId) => ({
        id: `member-${userId}`,
        roles: [],
        userId,
      }));
    };
    banDelegate.findMany = async (args?: unknown) => {
      calls.serverBanFindMany += 1;
      const batchUserIds = getUserIdInClause(args);
      banBatchSizes.push(batchUserIds.length);

      return [];
    };

    try {
      const allowedUserIds = await filterUserIdsByChannelPermission(
        "channel-1",
        [...userIds, userIds[0] ?? ""],
        PermissionBits.VIEW_CHANNEL,
      );

      assert.deepEqual(allowedUserIds, userIds);
      assert.equal(calls.channelFindUnique, 2);
      assert.equal(calls.serverMemberFindMany, 3);
      assert.equal(calls.serverBanFindMany, 3);
      assert.deepEqual(memberBatchSizes, [
        CHANNEL_PERMISSION_FILTER_BATCH_SIZE,
        CHANNEL_PERMISSION_FILTER_BATCH_SIZE,
        1,
      ]);
      assert.deepEqual(banBatchSizes, [
        CHANNEL_PERMISSION_FILTER_BATCH_SIZE,
        CHANNEL_PERMISSION_FILTER_BATCH_SIZE,
        1,
      ]);
    } finally {
      channelDelegate.findUnique = originalChannelFindUnique;
      serverDelegate.findUnique = originalServerFindUnique;
      memberDelegate.findMany = originalMemberFindMany;
      banDelegate.findMany = originalBanFindMany;
      if (originalPermissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originalPermissionCacheDisabled;
      }
    }
  });

  it("resolves visible channels for uncached users in one DB batch", async () => {
    const calls = {
      channelFindMany: 0,
      serverBanFindMany: 0,
      serverFindUnique: 0,
      serverMemberFindMany: 0,
    };
    const serverDelegate = prisma.server as unknown as { findUnique: AsyncMethod };
    const channelDelegate = prisma.channel as unknown as { findMany: AsyncMethod };
    const memberDelegate = prisma.serverMember as unknown as { findMany: AsyncMethod };
    const banDelegate = prisma.serverBan as unknown as { findMany: AsyncMethod };
    const originalServerFindUnique = serverDelegate.findUnique;
    const originalChannelFindMany = channelDelegate.findMany;
    const originalMemberFindMany = memberDelegate.findMany;
    const originalBanFindMany = banDelegate.findMany;
    const originalPermissionCacheDisabled = process.env.PERMISSION_CACHE_DISABLED;
    process.env.PERMISSION_CACHE_DISABLED = "true";

    serverDelegate.findUnique = async () => {
      calls.serverFindUnique += 1;

      return {
        authorizationRevision: 0n,
        authorizationSubjectRevisions: [],
        ownerId: "owner",
        roles: [
          {
            id: "everyone",
            isDefault: true,
            name: "@everyone",
            permissions: PermissionBits.VIEW_CHANNEL,
          },
        ],
      };
    };
    channelDelegate.findMany = async () => {
      calls.channelFindMany += 1;

      return [
        {
          id: "public",
          permissionOverrides: [],
        },
        {
          id: "vip",
          permissionOverrides: [
            {
              allow: 0n,
              deny: PermissionBits.VIEW_CHANNEL,
              targetId: "everyone",
              targetType: "ROLE",
            },
            {
              allow: PermissionBits.VIEW_CHANNEL,
              deny: 0n,
              targetId: "vip-role",
              targetType: "ROLE",
            },
          ],
        },
      ];
    };
    memberDelegate.findMany = async () => {
      calls.serverMemberFindMany += 1;

      return [
        {
          id: "member-1",
          roles: [],
          userId: "user-1",
        },
        {
          id: "member-2",
          roles: [
            {
              role: {
                id: "vip-role",
                isDefault: false,
                name: "VIP",
                permissions: 0n,
              },
            },
          ],
          userId: "user-2",
        },
        {
          id: "member-3",
          roles: [],
          userId: "user-3",
        },
      ];
    };
    banDelegate.findMany = async () => {
      calls.serverBanFindMany += 1;

      return [{ userId: "user-3" }];
    };

    try {
      const channelIdsByUser = await listChannelIdsForUsersWithPermission(
        ["user-1", "user-2", "user-3", "missing-user", "user-1"],
        "server-1",
        PermissionBits.VIEW_CHANNEL,
        ChannelType.TEXT,
      );

      assert.deepEqual(channelIdsByUser.get("user-1"), ["public"]);
      assert.deepEqual(channelIdsByUser.get("user-2"), ["public", "vip"]);
      assert.deepEqual(channelIdsByUser.get("user-3"), []);
      assert.deepEqual(channelIdsByUser.get("missing-user"), []);
      assert.equal(channelIdsByUser.size, 4);
      assert.deepEqual(calls, {
        channelFindMany: 1,
        serverBanFindMany: 1,
        // Revision-before-read plus compare-before-write add two fixed server
        // reads for the whole batch, never one read per user/channel.
        serverFindUnique: 3,
        serverMemberFindMany: 1,
      });
    } finally {
      serverDelegate.findUnique = originalServerFindUnique;
      channelDelegate.findMany = originalChannelFindMany;
      memberDelegate.findMany = originalMemberFindMany;
      banDelegate.findMany = originalBanFindMany;
      if (originalPermissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originalPermissionCacheDisabled;
      }
    }
  });

  it("resolves visible channels across servers for one user in one DB batch", async () => {
    const calls = {
      channelFindMany: 0,
      roleFindMany: 0,
      serverBanFindMany: 0,
      serverFindMany: 0,
      serverMemberFindMany: 0,
    };
    const channelDelegate = prisma.channel as unknown as { findMany: AsyncMethod };
    const serverDelegate = prisma.server as unknown as { findMany: AsyncMethod };
    const roleDelegate = prisma.role as unknown as { findMany: AsyncMethod };
    const memberDelegate = prisma.serverMember as unknown as { findMany: AsyncMethod };
    const banDelegate = prisma.serverBan as unknown as { findMany: AsyncMethod };
    const originalChannelFindMany = channelDelegate.findMany;
    const originalServerFindMany = serverDelegate.findMany;
    const originalRoleFindMany = roleDelegate.findMany;
    const originalMemberFindMany = memberDelegate.findMany;
    const originalBanFindMany = banDelegate.findMany;
    const originalPermissionCacheDisabled = process.env.PERMISSION_CACHE_DISABLED;
    process.env.PERMISSION_CACHE_DISABLED = "true";

    serverDelegate.findMany = async () => {
      calls.serverFindMany += 1;
      return [
        {
          authorizationRevision: 0n,
          authorizationSubjectRevisions: [],
          id: "server-1",
        },
        {
          authorizationRevision: 0n,
          authorizationSubjectRevisions: [],
          id: "server-2",
        },
        {
          authorizationRevision: 0n,
          authorizationSubjectRevisions: [],
          id: "server-3",
        },
      ];
    };

    memberDelegate.findMany = async () => {
      calls.serverMemberFindMany += 1;

      return [
        {
          id: "member-1",
          roles: [],
          server: { ownerId: "owner-1" },
          serverId: "server-1",
        },
        {
          id: "member-2",
          roles: [
            {
              role: {
                id: "vip-role",
                isDefault: false,
                name: "VIP",
                permissions: 0n,
              },
            },
          ],
          server: { ownerId: "owner-2" },
          serverId: "server-2",
        },
      ];
    };
    roleDelegate.findMany = async () => {
      calls.roleFindMany += 1;

      return [
        {
          id: "everyone-1",
          isDefault: true,
          name: "@everyone",
          permissions: PermissionBits.VIEW_CHANNEL,
          serverId: "server-1",
        },
        {
          id: "everyone-2",
          isDefault: true,
          name: "@everyone",
          permissions: PermissionBits.VIEW_CHANNEL,
          serverId: "server-2",
        },
      ];
    };
    banDelegate.findMany = async () => {
      calls.serverBanFindMany += 1;

      return [{ serverId: "server-3" }];
    };
    channelDelegate.findMany = async () => {
      calls.channelFindMany += 1;

      return [
        {
          id: "server-1-public",
          permissionOverrides: [],
          serverId: "server-1",
        },
        {
          id: "server-2-public",
          permissionOverrides: [],
          serverId: "server-2",
        },
        {
          id: "server-2-vip",
          permissionOverrides: [
            {
              allow: 0n,
              deny: PermissionBits.VIEW_CHANNEL,
              targetId: "everyone-2",
              targetType: "ROLE",
            },
            {
              allow: PermissionBits.VIEW_CHANNEL,
              deny: 0n,
              targetId: "vip-role",
              targetType: "ROLE",
            },
          ],
          serverId: "server-2",
        },
      ];
    };

    try {
      const channelIdsByServer = await listChannelIdsByServerForUserWithPermission(
        "user-1",
        ["server-1", "server-2", "server-3", "server-1"],
        PermissionBits.VIEW_CHANNEL,
        ChannelType.TEXT,
      );

      assert.deepEqual(channelIdsByServer.get("server-1"), ["server-1-public"]);
      assert.deepEqual(channelIdsByServer.get("server-2"), ["server-2-public", "server-2-vip"]);
      assert.deepEqual(channelIdsByServer.get("server-3"), []);
      assert.equal(channelIdsByServer.size, 3);
      assert.deepEqual(calls, {
        channelFindMany: 1,
        roleFindMany: 1,
        serverBanFindMany: 1,
        serverFindMany: 2,
        serverMemberFindMany: 1,
      });
    } finally {
      channelDelegate.findMany = originalChannelFindMany;
      serverDelegate.findMany = originalServerFindMany;
      roleDelegate.findMany = originalRoleFindMany;
      memberDelegate.findMany = originalMemberFindMany;
      banDelegate.findMany = originalBanFindMany;
      if (originalPermissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originalPermissionCacheDisabled;
      }
    }
  });
});
