import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { setSocketServer, type AppSocketServer } from "@/lib/socket/runtime";
import { setServerRoomIdsCacheRedisForTest } from "@/lib/socket/server-room-cache";
import { setPermissionCacheRedisForTest } from "@/lib/workspace/permission-cache";
import { joinPublicWorkspaceServer } from "./invite-service";

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

      assert.deepEqual(result, { alreadyMember: true, serverId: "server-1" });
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

      assert.deepEqual(result, { alreadyMember: false, serverId: "server-1" });
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

      assert.deepEqual(result, { alreadyMember: true, serverId: "server-1" });
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
