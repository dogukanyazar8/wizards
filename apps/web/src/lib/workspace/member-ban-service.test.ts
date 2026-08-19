import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { banWorkspaceMember, unbanWorkspaceMember } from "./member-ban-service";

function indexOf(operations: string[], operation: string) {
  const index = operations.indexOf(operation);
  assert.notEqual(index, -1, `Missing operation: ${operation}`);
  return index;
}

function ownerAccess() {
  return {
    accessLevel: "OWNER",
    isPublic: false,
    memberId: "member-owner",
    ownerId: "actor",
    roles: [],
    serverId: "server-1",
    serverName: "Guild",
    type: "PERSONAL",
    userId: "actor",
  };
}

function createIo(operations: string[]) {
  return {
    to(room: string) {
      return {
        emit(event: string, payload: { reason?: string }) {
          operations.push(`emit:${room}:${event}:${payload.reason ?? ""}`);
        },
      };
    },
  };
}

describe("workspace member ban service", () => {
  it("commits ban, persistent revision and outbox before cluster eviction", async () => {
    const operations: string[] = [];
    const io = createIo(operations);
    const tx = {
      $executeRaw: async () => {
        operations.push("memberCount.decrement");
        return 1;
      },
      auditLog: {
        create: async () => {
          operations.push("audit.create");
          return {};
        },
      },
      outboxJob: {
        upsert: async () => {
          operations.push("outbox.upsert");
          return {};
        },
      },
      server: {
        findUnique: async () => ({ authorizationRevision: 4n }),
      },
      serverAuthorizationSubjectRevision: {
        upsert: async () => {
          operations.push("revision.increment");
          return { revision: 9n };
        },
      },
      serverBan: {
        upsert: async () => {
          operations.push("ban.upsert");
          return {};
        },
      },
      serverMember: {
        delete: async () => {
          operations.push("member.delete");
          return {};
        },
        findFirst: async () => ({
          id: "member-target",
          roles: [],
          userId: "target",
        }),
      },
    };

    const result = await banWorkspaceMember(
      "actor",
      "server-1",
      "member-target",
      { reason: "abuse" },
      {
        client: {
          $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
            const value = await callback(tx);
            operations.push("transaction.commit");
            return value;
          },
        },
        detachUserFromServerSocketRoom: async () => {
          operations.push("cluster.evict");
          return io;
        },
        emitServerUnreadUpdatesForServer: async () => {
          operations.push("unread.emit");
        },
        getAccessContext: async () => ownerAccess(),
        getSocketServer: () => io,
        invalidateServerRoomIdsCache: async () => {
          operations.push("room-cache.invalidate");
        },
        publishCommittedAuthorizationRevision: async (revision: {
          memberVersion?: string;
          serverId: string;
          serverVersion: string;
          userId?: string;
        }) => {
          assert.deepEqual(revision, {
            memberVersion: "9",
            serverId: "server-1",
            serverVersion: "4",
            userId: "target",
          });
          operations.push("revision.publish");
          return "published";
        },
      } as never,
    );

    assert.deepEqual(result, { success: true, userId: "target" });
    assert.ok(indexOf(operations, "ban.upsert") < indexOf(operations, "member.delete"));
    assert.ok(indexOf(operations, "member.delete") < indexOf(operations, "revision.increment"));
    assert.ok(indexOf(operations, "outbox.upsert") < indexOf(operations, "transaction.commit"));
    assert.ok(indexOf(operations, "transaction.commit") < indexOf(operations, "revision.publish"));
    assert.ok(indexOf(operations, "revision.publish") < indexOf(operations, "cluster.evict"));
    assert.ok(
      indexOf(operations, "cluster.evict") <
        indexOf(operations, "emit:user:target:server:membership:removed:banned"),
    );
  });

  it("commits unban and its revision before returning success", async () => {
    const operations: string[] = [];
    const io = createIo(operations);
    const tx = {
      auditLog: { create: async () => ({}) },
      outboxJob: { upsert: async () => ({}) },
      server: { findUnique: async () => ({ authorizationRevision: 5n }) },
      serverAuthorizationSubjectRevision: {
        upsert: async () => ({ revision: 10n }),
      },
      serverBan: {
        deleteMany: async () => {
          operations.push("ban.delete");
          return { count: 1 };
        },
      },
    };

    await unbanWorkspaceMember("actor", "server-1", "target", {
      client: {
        $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
          const value = await callback(tx);
          operations.push("transaction.commit");
          return value;
        },
      },
      detachUserFromServerSocketRoom: async () => io,
      emitServerUnreadUpdatesForServer: async () => {},
      getAccessContext: async () => ownerAccess(),
      getSocketServer: () => io,
      invalidateServerRoomIdsCache: async () => {},
      publishCommittedAuthorizationRevision: async () => {
        operations.push("revision.publish");
        return "published";
      },
    } as never);

    assert.ok(indexOf(operations, "ban.delete") < indexOf(operations, "transaction.commit"));
    assert.ok(indexOf(operations, "transaction.commit") < indexOf(operations, "revision.publish"));
  });
});
