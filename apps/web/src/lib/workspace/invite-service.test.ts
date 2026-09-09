import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { setSocketServer, type AppSocketServer } from "@/lib/socket/runtime";
import { setServerRoomIdsCacheRedisForTest } from "@/lib/socket/server-room-cache";
import { setPermissionCacheRedisForTest } from "@/lib/workspace/permission-cache";
import {
  createWorkspaceInvite,
  joinPublicWorkspaceServer,
  listPendingWorkspaceInvites,
  revokeWorkspaceInvite,
} from "./invite-service";

/**
 * Mirrors the monkey-patch harness `service.test.ts` uses for
 * `joinWorkspaceServerByInvite`: `invite-service.ts` calls the real `prisma`
 * singleton directly rather than taking an injected client, so a unit test
 * without a database has to patch the specific methods a scenario touches
 * and restore them afterwards, matching this file's existing test style
 * (`0-ortak-baglam.md` S2's "no database in web unit tests" rule, applied the
 * way this particular file already applies it).
 */

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

function createPermissionRedis() {
  return {
    mget: async (...keys: string[]) => keys.map(() => null),
    pipeline() {
      return {
        exec: async () => [],
        expire() {
          return this;
        },
        incr() {
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

function createServerRoomRedis() {
  return {
    del: async () => 1,
    get: async () => null,
    set: async () => "OK",
    status: "ready" as const,
  };
}

function defaultServerRow(overrides: UnknownRecord = {}) {
  return {
    id: "server-1",
    isPublic: true,
    maxMembers: 500_000,
    memberCount: 10,
    name: "Whispr",
    roles: [],
    ...overrides,
  };
}

describe("joinPublicWorkspaceServer", () => {
  it("rejects a banned user on a public server with 403, before opening a transaction", async () => {
    // Visibility resolves first (server load + membership), so a banned
    // caller on a *public* server still reaches this check -- it is the
    // caller on a *private* server who must never reach it undetected. See
    // the "banned + non-public" tests below for that half of the contract.
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => ({ id: "ban-1" }), restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(prisma.server, "findUnique", async () => defaultServerRow(), restores);
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          throw new Error("should not open a transaction once banned");
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) =>
          error instanceof ApiError && error.status === 403 && error.code === "SERVER_BANNED",
      );
    });
  });

  it("is idempotent for an existing member and never opens a transaction", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => ({ id: "member-1" }), restores);
      patchMethod(prisma.server, "findUnique", async () => defaultServerRow(), restores);
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          throw new Error("should not open a transaction for an existing member");
        },
        restores,
      );

      const result = await joinPublicWorkspaceServer("joiner", "server-1");

      assert.deepEqual(result, { alreadyMember: true, name: "Whispr", serverId: "server-1" });
    });
  });

  it("rejects with 403 when the server is at its member cap, before creating a membership", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(
        prisma.server,
        "findUnique",
        async () => defaultServerRow({ maxMembers: 5, memberCount: 5 }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          throw new Error("should not open a transaction once the server is full");
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) =>
          error instanceof ApiError && error.status === 403 && error.code === "SERVER_FULL",
      );
    });
  });

  it("404s a non-public server instead of leaking that it exists", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(
        prisma.server,
        "findUnique",
        async () => defaultServerRow({ isPublic: false }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          throw new Error("should not open a transaction for a non-public server");
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) =>
          error instanceof ApiError && error.status === 404 && error.code === "SERVER_NOT_FOUND",
      );
    });
  });

  it("404s a server that is both full and non-public, instead of leaking SERVER_FULL", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(
        prisma.server,
        "findUnique",
        async () => defaultServerRow({ isPublic: false, maxMembers: 5, memberCount: 5 }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          throw new Error("should not open a transaction for a non-public server");
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) =>
          error instanceof ApiError && error.status === 404 && error.code === "SERVER_NOT_FOUND",
      );
    });
  });

  it("404s a banned non-member probing a non-public server, instead of leaking SERVER_BANNED", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => ({ id: "ban-1" }), restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(
        prisma.server,
        "findUnique",
        async () => defaultServerRow({ isPublic: false }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          throw new Error("should not open a transaction for a non-public server");
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) =>
          error instanceof ApiError && error.status === 404 && error.code === "SERVER_NOT_FOUND",
      );
    });
  });

  it("still rejects a banned member of that same non-public server with 403, because membership makes it visible", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => ({ id: "ban-1" }), restores);
      patchMethod(prisma.serverMember, "findUnique", async () => ({ id: "member-1" }), restores);
      patchMethod(
        prisma.server,
        "findUnique",
        async () => defaultServerRow({ isPublic: false }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          throw new Error("should not open a transaction for a banned member");
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) =>
          error instanceof ApiError && error.status === 403 && error.code === "SERVER_BANNED",
      );
    });
  });

  it("404s a server that does not exist at all with the exact same status and code", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(prisma.server, "findUnique", async () => null, restores);

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "missing-server"),
        (error) =>
          error instanceof ApiError && error.status === 404 && error.code === "SERVER_NOT_FOUND",
      );
    });
  });

  it("rejects an account-banned user with 403 and never opens a transaction, mirroring the invite path's account-ban check", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(prisma.server, "findUnique", async () => defaultServerRow(), restores);
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({ displayName: "Ada", isBanned: true, username: "ada" }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async () => {
          throw new Error("should not open a transaction for an account-banned user");
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) =>
          error instanceof ApiError &&
          error.status === 403 &&
          error.message === "Your account has been suspended",
      );
    });
  });

  it("creates a new membership, bumps the counter once, and attaches the socket room", async () => {
    await withPatchedEnvironment(async (restores) => {
      const operations: string[] = [];
      setPermissionCacheRedisForTest(createPermissionRedis() as never);
      setServerRoomIdsCacheRedisForTest(createServerRoomRedis() as never);
      setSocketServer({
        in(room: string) {
          return {
            fetchSockets: async () => {
              operations.push(`socket.fetch:${room}`);
              return [
                {
                  join: async (joinedRoom: string) => {
                    operations.push(`socket.join:${joinedRoom}`);
                  },
                },
              ];
            },
          };
        },
        to(room: string) {
          return {
            emit: (event: string) => {
              operations.push(`socket.emit:${room}:${event}`);
            },
          };
        },
      } as unknown as AppSocketServer);

      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(prisma.server, "findUnique", async () => defaultServerRow(), restores);
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({ displayName: "Ada", username: "ada" }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          const tx = {
            $executeRaw: async () => {
              operations.push("tx.server.reserve");
              return 1;
            },
            channel: {
              // No channel to post the join message into: proves the
              // shared writer tolerates a channel-less server rather than
              // needing message.create wired up for this fixture.
              findFirst: async () => null,
            },
            outboxJob: {
              upsert: async () => {
                operations.push("tx.outboxJob.upsert");
                return {};
              },
            },
            server: {
              findUnique: async () => {
                operations.push("tx.server.findUnique");
                return { authorizationRevision: 0n };
              },
            },
            serverAuthorizationSubjectRevision: {
              upsert: async () => {
                operations.push("tx.serverAuthorizationSubjectRevision.upsert");
                return { revision: 1n };
              },
            },
            serverBan: {
              findUnique: async () => {
                operations.push("tx.serverBan.findUnique");
                return null;
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

      const result = await joinPublicWorkspaceServer("joiner", "server-1");

      assert.deepEqual(result, { alreadyMember: false, name: "Whispr", serverId: "server-1" });
      assert.deepEqual(operations, [
        "tx.serverBan.findUnique",
        "tx.server.reserve",
        "tx.serverMember.create",
        "tx.serverAuthorizationSubjectRevision.upsert",
        "tx.server.findUnique",
        "tx.outboxJob.upsert",
        "socket.fetch:user:joiner",
        "socket.join:server:server-1",
        "socket.emit:server:server-1:server:settings:updated",
        "socket.emit:user:joiner:server:settings:updated",
      ]);
    });
  });

  // Finding 7: a same-user double submit both passes the pre-transaction
  // `existingMember` read (neither request has committed yet), so both reach
  // `createServerMembership`'s insert inside the transaction. The loser must
  // hit `ServerMember`'s `[userId, serverId]` unique constraint and recover
  // as the same idempotent success the pre-read branch above returns --
  // never an unhandled 500.
  it("recovers from a concurrent duplicate join (P2002 on the unique membership constraint) as the same idempotent success", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      // The pre-transaction read has not seen the other request's insert yet.
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(prisma.server, "findUnique", async () => defaultServerRow(), restores);
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({ displayName: "Ada", username: "ada" }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          const tx = {
            $executeRaw: async () => 1,
            server: {
              update: async () => ({}),
            },
            serverBan: {
              findUnique: async () => null,
            },
            serverMember: {
              create: async () => {
                throw new Prisma.PrismaClientKnownRequestError(
                  "Unique constraint failed on the fields: (`userId`,`serverId`)",
                  { clientVersion: "test", code: "P2002" },
                );
              },
            },
          };
          return (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
        },
        restores,
      );

      const result = await joinPublicWorkspaceServer("joiner", "server-1");

      assert.deepEqual(result, { alreadyMember: true, name: "Whispr", serverId: "server-1" });
    });
  });

  it("lets a non-P2002 error out of the transaction unchanged", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(prisma.server, "findUnique", async () => defaultServerRow(), restores);
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({ displayName: "Ada", username: "ada" }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          const tx = {
            $executeRaw: async () => 1,
            server: {
              update: async () => ({}),
            },
            serverBan: {
              findUnique: async () => null,
            },
            serverMember: {
              create: async () => {
                throw new Error("connection reset");
              },
            },
          };
          return (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) => error instanceof Error && error.message === "connection reset",
      );
    });
  });

  // Two different users can both observe one free slot before their
  // transactions begin. The database mutation, not a second read, owns the
  // decision; a zero-row reservation must reject before any member is created.
  it("rejects with 403 SERVER_FULL when atomic reservation loses a concurrent last slot", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
      patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
      patchMethod(
        prisma.server,
        "findUnique",
        async () => defaultServerRow({ maxMembers: 5, memberCount: 4 }),
        restores,
      );
      patchMethod(
        prisma.user,
        "findUnique",
        async () => ({ displayName: "Ada", username: "ada" }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: unknown) => {
          const tx = {
            $executeRaw: async () => 0,
            server: {
              update: async () => ({}),
            },
            serverBan: {
              findUnique: async () => null,
            },
            serverMember: {
              create: async () => {
                throw new Error(
                  "should not create a membership once the in-transaction recheck sees the server full",
                );
              },
            },
          };
          return (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
        },
        restores,
      );

      await assert.rejects(
        () => joinPublicWorkspaceServer("joiner", "server-1"),
        (error) =>
          error instanceof ApiError && error.status === 403 && error.code === "SERVER_FULL",
      );
    });
  });
});

/**
 * Å3 â€” davet oluÅŸturma, hedefli davet ve bekleyen davetler.
 *
 * AynÄ± yama dÃ¼zeni: `invite-service.ts` gerÃ§ek `prisma` tekilini Ã§aÄŸÄ±rÄ±yor, bu yÃ¼zden her
 * senaryo yalnÄ±z dokunduÄŸu metotlarÄ± yamalar. Davet oluÅŸturma iki ayrÄ± `prisma.server`
 * okumasÄ± yapar (Ã¶zellik bayraklarÄ± ve kod benzersizliÄŸi), o yÃ¼zden yama `where`'e bakar.
 */

const MANAGE_INVITES_BIT = 1n << 18n;

type InviteCreateArgs = {
  data: {
    channelId: string | null;
    code: string;
    createdById: string;
    expiresAt: Date | null;
    maxUses: number | null;
    serverId: string;
    targetUserId?: string;
  };
};

type InviteEnvironmentOptions = {
  channelRow?: { id: string } | null;
  features?: string[];
  ownerId?: string;
  rolePermissions?: bigint;
};

function inviteRow(overrides: Record<string, unknown> = {}) {
  return {
    channelId: "channel-1",
    code: "whspr-a7k2",
    createdAt: new Date("2026-08-25T09:00:00.000Z"),
    creator: { displayName: "DY", username: "dy" },
    expiresAt: null as Date | null,
    id: "invite-1",
    maxUses: null as number | null,
    targetUserId: null as string | null,
    uses: 0,
    ...overrides,
  };
}

/** Yetki baÄŸlamÄ± + kanal + kod benzersizliÄŸi; davet yazÄ±mÄ±nÄ± bilerek yamalamaz. */
function patchInviteEnvironment(
  restores: Restore[],
  userId: string,
  options: InviteEnvironmentOptions = {},
) {
  const {
    channelRow = { id: "channel-1" },
    features = [],
    ownerId = userId,
    rolePermissions = MANAGE_INVITES_BIT,
  } = options;

  patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
  patchMethod(
    prisma.serverMember,
    "findFirst",
    async () => ({
      id: "member-1",
      roles: [
        {
          role: {
            color: 0,
            id: "role-1",
            isDefault: false,
            name: "Davetci",
            permissions: rolePermissions,
          },
        },
      ],
      server: {
        id: "server-1",
        isPublic: true,
        name: "Whispr",
        ownerId,
        roles: [],
        type: "COMMUNITY",
      },
    }),
    restores,
  );
  patchMethod(
    prisma.server,
    "findUnique",
    async (args: { where: Record<string, unknown> }) =>
      "inviteCode" in args.where ? null : { features, name: "Whispr" },
    restores,
  );
  patchMethod(prisma.channel, "findFirst", async () => channelRow, restores);
  patchMethod(prisma.serverInvite, "findUnique", async () => null, restores);
}

describe("createWorkspaceInvite", () => {
  it("maps the SPEC duration and usage chips straight onto the stored row", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1");
      const calls: InviteCreateArgs[] = [];
      patchMethod(
        prisma.serverInvite,
        "create",
        async (args: InviteCreateArgs) => {
          calls.push(args);
          return inviteRow({ expiresAt: args.data.expiresAt, maxUses: args.data.maxUses });
        },
        restores,
      );

      const before = Date.now();
      const invite = await createWorkspaceInvite("owner-1", "server-1", {
        expiresInHours: 168,
        maxUses: 25,
      });
      const after = Date.now();

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.data.maxUses, 25);
      const expiresAt = calls[0]?.data.expiresAt?.getTime() ?? 0;
      assert.ok(expiresAt >= before + 168 * 60 * 60 * 1000);
      assert.ok(expiresAt <= after + 168 * 60 * 60 * 1000);
      assert.equal(calls[0]?.data.targetUserId, undefined);
      assert.equal(invite.maxUses, 25);
      assert.equal(invite.targetUserId, null);
    });
  });

  it("stores the 'Suresiz' and 'Sinirsiz' chips as null on both fields", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1");
      const calls: InviteCreateArgs[] = [];
      patchMethod(
        prisma.serverInvite,
        "create",
        async (args: InviteCreateArgs) => {
          calls.push(args);
          return inviteRow();
        },
        restores,
      );

      await createWorkspaceInvite("owner-1", "server-1", {
        expiresInHours: null,
        maxUses: null,
      });

      assert.equal(calls[0]?.data.expiresAt, null);
      assert.equal(calls[0]?.data.maxUses, null);
    });
  });

  it("falls back to a text channel that lives inside a category", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1");
      const channelQueries: Array<{ where: Record<string, unknown> }> = [];
      patchMethod(
        prisma.channel,
        "findFirst",
        async (args: { where: Record<string, unknown> }) => {
          channelQueries.push(args);
          return { id: "channel-in-category" };
        },
        restores,
      );
      patchMethod(
        prisma.serverInvite,
        "create",
        async (args: InviteCreateArgs) => inviteRow({ channelId: args.data.channelId }),
        restores,
      );

      const invite = await createWorkspaceInvite("owner-1", "server-1", {});

      assert.equal(invite.channelId, "channel-in-category");
      assert.equal("parentId" in (channelQueries[0]?.where ?? {}), false);
      assert.equal(channelQueries[0]?.where.type, "TEXT");
    });
  });

  it("rejects a requested channel that is not a text channel of this server", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1", { channelRow: null });
      patchMethod(
        prisma.serverInvite,
        "create",
        async () => {
          throw new Error("should not create an invite for a rejected channel");
        },
        restores,
      );

      await assert.rejects(
        () => createWorkspaceInvite("owner-1", "server-1", { channelId: "voice-1" }),
        (error) => error instanceof ApiError && error.status === 404,
      );
    });
  });

  it("closes invite creation to a plain member when member adds are switched off", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "member-user", {
        features: ["MEMBER_ADDS_DISABLED"],
        ownerId: "owner-1",
      });
      patchMethod(
        prisma.serverInvite,
        "create",
        async () => {
          throw new Error("should not create an invite once member adds are disabled");
        },
        restores,
      );

      await assert.rejects(
        () => createWorkspaceInvite("member-user", "server-1", {}),
        (error) => error instanceof ApiError && error.status === 403 && error.code === "FORBIDDEN",
      );
    });
  });

  it("still lets the owner invite while member adds are off", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1", { features: ["MEMBER_ADDS_DISABLED"] });
      patchMethod(prisma.serverInvite, "create", async () => inviteRow(), restores);

      const invite = await createWorkspaceInvite("owner-1", "server-1", {});

      assert.equal(invite.code, "whspr-a7k2");
    });
  });
});

describe("createWorkspaceInvite - targeted invite", () => {
  function patchTargetedEnvironment(
    restores: Restore[],
    options: {
      friends?: boolean;
      openInvites?: ReturnType<typeof inviteRow>[];
    } = {},
  ) {
    const { friends = true, openInvites = [] } = options;

    patchInviteEnvironment(restores, "owner-1");
    patchMethod(
      prisma.friendRequest,
      "findFirst",
      async () => (friends ? { id: "friendship-1" } : null),
      restores,
    );
    patchMethod(
      prisma.user,
      "findUnique",
      async (args: { where: { id: string } }) =>
        args.where.id === "friend-1"
          ? {
              avatarUrl: null,
              displayName: "Ayse Kaya",
              id: "friend-1",
              isBanned: false,
              locale: "tr",
              username: "aysek",
            }
          : { displayName: "DY", username: "dy" },
      restores,
    );
    // Bildirim gÃ¶nderildikten sonraki mobil push sÃ¼zgeci de bu okumaya dÃ¼ÅŸer; boÅŸ
    // liste onu erken bitirir ve test veri tabanÄ±na uzanmaz.
    patchMethod(prisma.user, "findMany", async () => [], restores);
    patchMethod(prisma.serverMember, "findUnique", async () => null, restores);
    patchMethod(prisma.serverInvite, "findMany", async () => openInvites, restores);
    patchMethod(prisma.notification, "create", async () => ({}), restores);
  }

  it("rejects a target who is not a friend with 400, and writes nothing", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchTargetedEnvironment(restores, { friends: false });
      patchMethod(
        prisma.serverInvite,
        "create",
        async () => {
          throw new Error("should not create a targeted invite for a stranger");
        },
        restores,
      );

      await assert.rejects(
        () =>
          createWorkspaceInvite("owner-1", "server-1", {
            expiresInHours: 168,
            maxUses: 25,
            targetUserId: "friend-1",
          }),
        (error) =>
          error instanceof ApiError && error.status === 400 && error.code === "NOT_FRIENDS",
      );
    });
  });

  it("checks friendship before it ever looks the target up", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchTargetedEnvironment(restores, { friends: false });
      patchMethod(
        prisma.user,
        "findUnique",
        async () => {
          throw new Error("a stranger's existence must not be probed");
        },
        restores,
      );

      await assert.rejects(
        () => createWorkspaceInvite("owner-1", "server-1", { targetUserId: "friend-1" }),
        (error) => error instanceof ApiError && error.code === "NOT_FRIENDS",
      );
    });
  });

  it("stores the target and notifies them through the existing SERVER_INVITE family", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchTargetedEnvironment(restores);
      const created: InviteCreateArgs[] = [];
      const notifications: Array<{ data: Record<string, unknown> }> = [];
      patchMethod(
        prisma.serverInvite,
        "create",
        async (args: InviteCreateArgs) => {
          created.push(args);
          return inviteRow({
            expiresAt: args.data.expiresAt,
            maxUses: args.data.maxUses,
            targetUserId: args.data.targetUserId ?? null,
          });
        },
        restores,
      );
      patchMethod(
        prisma.notification,
        "create",
        async (args: { data: Record<string, unknown> }) => {
          notifications.push(args);
          return {
            actionUrl: args.data.actionUrl,
            body: args.data.body,
            createdAt: new Date("2026-08-25T09:00:00.000Z"),
            id: "notification-1",
            imageUrl: null,
            metadata: args.data.metadata,
            read: false,
            readAt: null,
            title: args.data.title,
            type: "SERVER_INVITE",
            userId: args.data.userId,
          };
        },
        restores,
      );

      const invite = await createWorkspaceInvite("owner-1", "server-1", {
        expiresInHours: 24,
        maxUses: 1,
        targetUserId: "friend-1",
      });

      assert.equal(created.length, 1);
      assert.equal(created[0]?.data.targetUserId, "friend-1");
      assert.equal(created[0]?.data.maxUses, 1);
      assert.equal(invite.targetUserId, "friend-1");
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0]?.data.type, "SERVER_INVITE");
      assert.equal(notifications[0]?.data.userId, "friend-1");
    });
  });

  it("returns the open invite instead of minting a second one for the same friend", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchTargetedEnvironment(restores, {
        openInvites: [
          inviteRow({
            code: "whspr-open",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            id: "invite-open",
            maxUses: 25,
            targetUserId: "friend-1",
          }),
        ],
      });
      patchMethod(
        prisma.serverInvite,
        "create",
        async () => {
          throw new Error("should reuse the live targeted invite");
        },
        restores,
      );
      patchMethod(
        prisma.notification,
        "create",
        async () => {
          throw new Error("should not notify twice for the same pending invite");
        },
        restores,
      );

      const invite = await createWorkspaceInvite("owner-1", "server-1", {
        targetUserId: "friend-1",
      });

      assert.equal(invite.id, "invite-open");
      assert.equal(invite.code, "whspr-open");
    });
  });

  it("mints a fresh invite when the only earlier one has expired", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchTargetedEnvironment(restores, {
        openInvites: [
          inviteRow({
            expiresAt: new Date(Date.now() - 60 * 1000),
            id: "invite-expired",
            targetUserId: "friend-1",
          }),
        ],
      });
      patchMethod(
        prisma.serverInvite,
        "create",
        async (args: InviteCreateArgs) =>
          inviteRow({ id: "invite-new", targetUserId: args.data.targetUserId ?? null }),
        restores,
      );

      const invite = await createWorkspaceInvite("owner-1", "server-1", {
        targetUserId: "friend-1",
      });

      assert.equal(invite.id, "invite-new");
    });
  });

  it("refuses a self-invite before any friendship read", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchTargetedEnvironment(restores);
      patchMethod(
        prisma.friendRequest,
        "findFirst",
        async () => {
          throw new Error("self-invite must be rejected without a friendship read");
        },
        restores,
      );

      await assert.rejects(
        () => createWorkspaceInvite("owner-1", "server-1", { targetUserId: "owner-1" }),
        (error) =>
          error instanceof ApiError && error.status === 400 && error.code === "INVITE_SELF",
      );
    });
  });
});

describe("listPendingWorkspaceInvites", () => {
  it("asks only for targeted, unused, unexpired invites", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1");
      const queries: Array<{ where: Record<string, unknown> }> = [];
      patchMethod(
        prisma.serverInvite,
        "findMany",
        async (args: { where: Record<string, unknown> }) => {
          queries.push(args);
          return [];
        },
        restores,
      );

      assert.deepEqual(await listPendingWorkspaceInvites("owner-1", "server-1"), []);
      assert.equal(queries.length, 1);
      assert.deepEqual(queries[0]?.where.targetUserId, { not: null });
      assert.equal(queries[0]?.where.uses, 0);
      assert.equal(queries[0]?.where.serverId, "server-1");
      assert.equal(Array.isArray(queries[0]?.where.OR), true);
    });
  });

  it("joins the recipient identity onto every row", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1");
      patchMethod(
        prisma.serverInvite,
        "findMany",
        async () => [
          inviteRow({
            code: "whspr-p1",
            expiresAt: new Date("2026-09-01T09:00:00.000Z"),
            id: "invite-pending",
            maxUses: 1,
            targetUserId: "friend-1",
          }),
        ],
        restores,
      );
      patchMethod(
        prisma.user,
        "findMany",
        async () => [
          { avatarUrl: null, displayName: "Ayse Kaya", id: "friend-1", username: "aysek" },
        ],
        restores,
      );

      const rows = await listPendingWorkspaceInvites("owner-1", "server-1");

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.code, "whspr-p1");
      assert.equal(rows[0]?.channelId, "channel-1");
      assert.equal(rows[0]?.createdByDisplayName, "DY");
      assert.equal(rows[0]?.expiresAt, "2026-09-01T09:00:00.000Z");
      assert.deepEqual(rows[0]?.targetUser, {
        avatarUrl: null,
        displayName: "Ayse Kaya",
        id: "friend-1",
        username: "aysek",
      });
    });
  });

  it("drops a row whose recipient account no longer exists", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1");
      patchMethod(
        prisma.serverInvite,
        "findMany",
        async () => [inviteRow({ id: "invite-orphan", targetUserId: "deleted-user" })],
        restores,
      );
      patchMethod(prisma.user, "findMany", async () => [], restores);

      assert.deepEqual(await listPendingWorkspaceInvites("owner-1", "server-1"), []);
    });
  });

  it("refuses a member without MANAGE_INVITES", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "member-user", {
        ownerId: "owner-1",
        rolePermissions: 0n,
      });
      patchMethod(
        prisma.serverInvite,
        "findMany",
        async () => {
          throw new Error("should not read invites without MANAGE_INVITES");
        },
        restores,
      );

      await assert.rejects(
        () => listPendingWorkspaceInvites("member-user", "server-1"),
        (error) => error instanceof ApiError && error.status === 403,
      );
    });
  });
});

describe("revokeWorkspaceInvite", () => {
  it("clears the recipient's notification when a pending targeted invite is cancelled", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1");
      patchMethod(
        prisma.serverInvite,
        "findFirst",
        async () => ({ code: "whspr-p1", targetUserId: "friend-1" }),
        restores,
      );
      patchMethod(prisma.serverInvite, "deleteMany", async () => ({ count: 1 }), restores);
      const cleared: Array<{ where: Record<string, unknown> }> = [];
      patchMethod(
        prisma.notification,
        "deleteMany",
        async (args: { where: Record<string, unknown> }) => {
          cleared.push(args);
          return { count: 1 };
        },
        restores,
      );

      await revokeWorkspaceInvite("owner-1", "server-1", "invite-pending");

      assert.equal(cleared.length, 1);
      assert.equal(cleared[0]?.where.type, "SERVER_INVITE");
      assert.equal(cleared[0]?.where.userId, "friend-1");
    });
  });

  it("touches no notification when the cancelled invite was a plain link", async () => {
    await withPatchedEnvironment(async (restores) => {
      patchInviteEnvironment(restores, "owner-1");
      patchMethod(
        prisma.serverInvite,
        "findFirst",
        async () => ({ code: "whspr-a7k2", targetUserId: null }),
        restores,
      );
      patchMethod(prisma.serverInvite, "deleteMany", async () => ({ count: 1 }), restores);
      patchMethod(
        prisma.notification,
        "deleteMany",
        async () => {
          throw new Error("a shared link has no recipient notification to clear");
        },
        restores,
      );

      await revokeWorkspaceInvite("owner-1", "server-1", "invite-1");
    });
  });
});
