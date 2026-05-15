import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { setSocketServer, type AppSocketServer } from "@/lib/socket/runtime";
import { setServerRoomIdsCacheRedisForTest } from "@/lib/socket/server-room-cache";
import { setPermissionCacheRedisForTest } from "@/lib/workspace/permission-cache";
import { PermissionBits } from "@/lib/workspace/permissions";
import { updateWorkspaceChannelPermissions } from "./channel-permission-service";
import { clearWorkspaceChannelHistory, updateWorkspaceChannel } from "./channel-service";
import { joinWorkspaceServerByInvite } from "./invite-service";
import {
  addWorkspaceServerMemberByUsername,
  kickWorkspaceMember,
  leaveWorkspaceServer,
  updateWorkspaceMemberRoles,
} from "./member-service";
import { createWorkspaceServer, deleteWorkspaceServer } from "./server-service";

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

  try {
    await run(restores);
  } finally {
    for (const restore of restores.reverse()) {
      restore();
    }
    setPermissionCacheRedisForTest(null);
    setServerRoomIdsCacheRedisForTest(null);
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
          operations.push(
            keys.some((key) => key.includes("permission:member:"))
              ? "permission-cache.member"
              : "permission-cache.server",
          );
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

function createFakeSocket(operations: string[], label: string) {
  return {
    data: {
      voiceStateViewerChannelsByServer: new Map([
        ["server-1", new Set(["voice-1"])],
      ]),
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
      };
    },
    to(room: string) {
      return {
        emit: (event: string, payload?: { reason?: string }) => {
          operations.push(
            `socket.emit:${room}:${event}${payload?.reason ? `:${payload.reason}` : ""}`,
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

describe("workspace service characterization", { concurrency: false }, () => {
  it("creates a workspace server in one transaction and invalidates room membership after commit", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));

      patchMethod(prisma, "$transaction", async (callback: unknown) => {
        operations.push("transaction.begin");
        const tx = {
          channel: {
            create: async (args?: unknown) => {
              const type = (args as { data?: { type?: ChannelType } }).data?.type;
              operations.push(`tx.channel.create:${type}`);
              return type === ChannelType.TEXT ? { id: "channel-general" } : { id: "channel-voice" };
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
      }, restores);

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
      patchMethod(prisma.serverMember, "findFirst", async (args?: unknown) => {
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
      }, restores);
      patchMethod(prisma.role, "findMany", async () => [
        {
          id: "role-vip",
          isDefault: false,
          managed: false,
          name: "VIP",
          permissions: 0n,
        },
      ], restores);
      patchMethod(prisma.memberRole, "deleteMany", () => {
        operations.push("memberRole.deleteMany.prepare");
        return { operation: "delete" };
      }, restores);
      patchMethod(prisma.memberRole, "createMany", () => {
        operations.push("memberRole.createMany.prepare");
        return { operation: "create" };
      }, restores);
      patchMethod(prisma, "$transaction", async (mutations: unknown) => {
        assert.ok(Array.isArray(mutations));
        operations.push("transaction.commit");
        return [];
      }, restores);
      patchMethod(prisma.notification, "create", async () => {
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
      }, restores);

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

  it("updates channel permission overrides atomically before cache invalidation and fanout", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findFirst", async () =>
        accessMembership({
          permissions: PermissionBits.MANAGE_CHANNELS,
          userId: "owner",
        }), restores);
      patchMethod(prisma.channel, "findUnique", async () => ({
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
      }), restores);
      patchMethod(prisma, "$transaction", async (callback: unknown) => {
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
              const targetId = (args as { where?: { channelId_targetId_targetType?: { targetId?: string } } })
                .where?.channelId_targetId_targetType?.targetId;
              operations.push(`tx.channelPermissionOverride.upsert:${targetId}`);
              return {};
            },
          },
        };
        const result = await (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
        operations.push("transaction.commit");
        return result;
      }, restores);

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
      patchMethod(prisma.serverMember, "findFirst", async () =>
        accessMembership({
          permissions: PermissionBits.CLEAR_CHANNEL_HISTORY,
          userId: "owner",
        }), restores);
      patchMethod(prisma.channel, "findUnique", async () => ({
        id: "channel-1",
        serverId: "server-1",
        type: ChannelType.TEXT,
      }), restores);
      patchMethod(prisma, "$transaction", async (callback: unknown) => {
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
      }, restores);

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

  it("fails invite join on optimistic max-use race before creating membership", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(prisma.serverInvite, "findUnique", async () => ({
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
      }), restores);
      patchMethod(prisma.user, "findUnique", async () => ({
        displayName: "Ada",
        isBanned: false,
        username: "ada",
      }), restores);
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(prisma, "$transaction", async (callback: unknown) => {
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
      }, restores);

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

  it("checks MANAGE_CHANNELS before channel updates", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.channel, "findUnique", async () => ({
        categoryId: null,
        id: "channel-1",
        locked: false,
        serverId: "server-1",
        type: ChannelType.TEXT,
      }), restores);
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findFirst", async () =>
        accessMembership({
          ownerId: "owner",
          permissions: 0n,
          userId: "member",
        }), restores);
      patchMethod(prisma.channel, "update", async () => {
        throw new Error("channel update should not run without permission");
      }, restores);

      await assert.rejects(
        () => updateWorkspaceChannel("member", "channel-1", { name: "staff", topic: null }),
        (error) => error instanceof ApiError && error.status === 403,
      );
    });
  });

  it("disconnects unauthorized voice participants after lock metadata cache invalidation", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setSocketServer(createFakeSocketServer(operations));

      patchMethod(prisma.channel, "findUnique", async () => ({
        categoryId: null,
        id: "voice-1",
        locked: false,
        serverId: "server-1",
        type: ChannelType.VOICE,
      }), restores);
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findFirst", async () =>
        accessMembership({
          permissions: PermissionBits.MANAGE_CHANNELS,
          userId: "owner",
        }), restores);
      patchMethod(prisma.channel, "update", async () => {
        operations.push("channel.update");
        return {};
      }, restores);
      patchMethod(prisma.voiceState, "findMany", async () => {
        operations.push("voiceState.findMany");
        return [];
      }, restores);

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
          "permission-cache.server",
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
      setSocketServer(createFakeSocketServer(operations, {
        "server:server-1": [],
        "user:member": [leavingSocket],
      }));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findFirst", async () =>
        accessMembership({
          ownerId: "owner",
          permissions: 0n,
          userId: "member",
        }), restores);
      patchMethod(prisma.serverMember, "delete", async () => {
        operations.push("serverMember.delete");
        return {};
      }, restores);
      patchMethod(prisma.channel, "findMany", async () => [{ id: "voice-1" }], restores);

      await leaveWorkspaceServer("member", "server-1");

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
      assert.ok(operations.includes("socket.fetch:server:server-1"));
    });
  });

  it("kicks a member with permission cache invalidation before detach and membership events", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      const targetSocket = createFakeSocket(operations, "target");
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(createFakeSocketServer(operations, {
        "server:server-1": [],
        "user:target": [targetSocket],
      }));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findFirst", async (args?: unknown) => {
        const where = (args as { where?: { id?: string; userId?: string } }).where;
        if (where?.userId) {
          return accessMembership({
            permissions: PermissionBits.KICK_MEMBERS,
            userId: "owner",
          });
        }
        if (where?.id === "member-target") {
          return { id: "member-target", userId: "target" };
        }
        return null;
      }, restores);
      patchMethod(prisma.serverMember, "delete", async () => {
        operations.push("serverMember.delete");
        return {};
      }, restores);
      patchMethod(prisma.channel, "findMany", async () => [{ id: "voice-1" }], restores);

      await kickWorkspaceMember("owner", "server-1", "member-target");

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
      assert.ok(operations.includes("socket.fetch:server:server-1"));
    });
  });

  it("deletes a workspace server before invalidating every member room cache and detaching sockets", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis(operations));
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis(operations));
      setSocketServer(createFakeSocketServer(operations, {
        "user:member-a": [createFakeSocket(operations, "member-a")],
        "user:member-b": [createFakeSocket(operations, "member-b")],
      }));

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findFirst", async () =>
        accessMembership({
          userId: "owner",
        }), restores);
      patchMethod(prisma.serverMember, "findMany", async () => [
        { userId: "member-a" },
        { userId: "member-b" },
      ], restores);
      patchMethod(prisma.server, "delete", async () => {
        operations.push("server.delete");
        return {};
      }, restores);

      await deleteWorkspaceServer("owner", "server-1", { confirmationName: "Guild" });

      assert.ok(
        indexOfOperation(operations, "server.delete") <
          indexOfOperation(operations, "permission-cache.server"),
      );
      assert.ok(
        indexOfOperation(operations, "permission-cache.server") <
          indexOfOperation(operations, "server-room-cache.del:socket:v1:user-servers:member-a"),
      );
      assert.ok(
        indexOfOperation(operations, "server-room-cache.del:socket:v1:user-servers:member-b") <
          indexOfOperation(operations, "socket.leave:member-a:server:server-1"),
      );
      assert.ok(
        indexOfOperation(operations, "socket.leave:member-b:server:server-1") <
          indexOfOperation(operations, "socket.emit:user:member-b:server:membership:removed:deleted"),
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
      patchMethod(prisma.serverMember, "findFirst", async () =>
        accessMembership({
          userId: "owner",
        }), restores);
      patchMethod(prisma.server, "findUnique", async () => ({
        features: ["allow-member-adds"],
        id: "server-1",
        name: "Guild",
        roles: [defaultRole()],
        systemChannelId: "channel-system",
      }), restores);
      patchMethod(prisma.user, "findFirst", async () => ({
        avatarUrl: null,
        displayName: "Target",
        id: "target",
        isBanned: false,
        locale: "en",
        username: "target",
      }), restores);
      patchMethod(prisma.user, "findUnique", async () => ({
        displayName: "Owner",
        username: "owner",
      }), restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(prisma, "$transaction", async (callback: unknown) => {
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
      }, restores);

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
