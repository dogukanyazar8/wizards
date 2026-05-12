import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, prisma } from "@wizards/db";
import { listChannelIdsForUsersWithPermission } from "./permission-service";
import { PermissionBits } from "./permissions";

type AsyncMethod = (args?: unknown) => Promise<unknown>;

describe("workspace permission service", () => {
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
        serverFindUnique: 1,
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
});
