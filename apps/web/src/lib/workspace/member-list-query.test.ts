import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "@wizards/db";
import { PermissionBits } from "@/lib/workspace/permissions";
import {
  setServerMemberPresenceRedisForTest,
  setServerMemberVisibilityResolverForTest,
} from "@/lib/workspace/server-query-helpers";
import { listWorkspaceServerMembers } from "@/lib/workspace/server-service";

type Restore = () => void;

function patchMethod<Target extends object, Key extends keyof Target>(
  target: Target,
  key: Key,
  implementation: Target[Key],
  restores: Restore[],
) {
  const original = target[key];
  target[key] = implementation;
  restores.push(() => {
    target[key] = original;
  });
}

/**
 * `readPresenceState` iki boru hattı kullanır: birincisi soket sayısı + anahtar tipi,
 * ikincisi değerin kendisi. Sahte istemci ikisini de aynı sırayla yanıtlar, yoksa presence
 * "herkes çevrimdışı"na düşer ve `online` çipi testte hep boş çıkar.
 */
function createPresenceRedis(onlineUserIds: string[] = []) {
  return {
    status: "ready",
    pipeline() {
      const results: Array<readonly [null, unknown]> = [];
      const chain = {
        get() {
          return chain;
        },
        hgetall(key: string) {
          const userId = key.slice("presence:".length);
          results.push([null, onlineUserIds.includes(userId) ? { status: "ONLINE" } : {}]);
          return chain;
        },
        type(key: string) {
          const userId = key.slice("presence:".length);
          results.push([null, onlineUserIds.includes(userId) ? "hash" : "none"]);
          return chain;
        },
        zcard(key: string) {
          const userId = key.split(":").at(-1) ?? "";
          results.push([null, onlineUserIds.includes(userId) ? 1 : 0]);
          return chain;
        },
        zremrangebyscore() {
          results.push([null, 0]);
          return chain;
        },
        async exec() {
          return results;
        },
      };
      return chain;
    },
  };
}

const memberRow = {
  communicationDisabledUntil: null,
  id: "member-1",
  nickname: null,
  roles: [],
  user: {
    avatarUrl: null,
    customStatus: null,
    displayName: "Target",
    id: "target",
    status: "OFFLINE",
    username: "target",
  },
};

async function withListedMembers(
  run: (state: { counts: unknown[]; lists: unknown[]; roleQueries: unknown[] }) => Promise<void>,
  options: { onlineUserIds?: string[] } = {},
) {
  const restores: Restore[] = [];
  const state = { counts: [] as unknown[], lists: [] as unknown[], roleQueries: [] as unknown[] };

  setServerMemberPresenceRedisForTest(createPresenceRedis(options.onlineUserIds) as never);
  setServerMemberVisibilityResolverForTest(
    async (_viewerId, subjectIds) =>
      new Map(
        subjectIds.map((subjectId) => [subjectId, { canViewPresence: true, canViewProfile: true }]),
      ),
  );
  patchMethod(prisma.serverBan, "findUnique", (async () => null) as never, restores);
  patchMethod(
    prisma.serverMember,
    "findFirst",
    (async () => ({
      id: "member-actor",
      roles: [
        {
          role: {
            id: "role-admin",
            isDefault: false,
            managed: false,
            name: "Admin",
            permissions: PermissionBits.MANAGE_ROLES,
          },
        },
      ],
      server: {
        id: "server-1",
        isPublic: false,
        name: "Guild",
        ownerId: "owner",
        roles: [],
        type: "PERSONAL",
      },
    })) as never,
    restores,
  );
  patchMethod(
    prisma.serverMember,
    "findMany",
    (async (args: unknown) => {
      state.lists.push(args);
      const query = args as { select?: Record<string, unknown> };
      // Presence çözümü yalnız kullanıcı kimliklerini ister; sayfa sorgusu tam satırı.
      return query.select && "user" in query.select && !("roles" in query.select)
        ? [{ user: { customStatus: null, id: "target" } }]
        : [memberRow];
    }) as never,
    restores,
  );
  patchMethod(
    prisma.serverMember,
    "count",
    (async (args: unknown) => {
      state.counts.push(args);
      return state.counts.length === 1 ? 24 : 3;
    }) as never,
    restores,
  );
  patchMethod(
    prisma.role,
    "findMany",
    (async (args: unknown) => {
      state.roleQueries.push(args);
      return [
        { id: "role-admin", permissions: PermissionBits.MANAGE_ROLES },
        { id: "role-mod", permissions: PermissionBits.KICK_MEMBERS },
        { id: "role-everyone", permissions: PermissionBits.VIEW_CHANNEL },
      ];
    }) as never,
    restores,
  );

  try {
    await run(state);
  } finally {
    for (const restore of restores.reverse()) {
      restore();
    }
    setServerMemberPresenceRedisForTest(null);
    setServerMemberVisibilityResolverForTest(null);
  }
}

function whereOf(query: unknown) {
  return (query as { where: { AND: unknown[]; serverId: string } }).where;
}

describe("server member list query (Ş2 §5)", () => {
  it("counts the server once and does not count twice without a search or a chip", async () => {
    await withListedMembers(async (state) => {
      const result = await listWorkspaceServerMembers("actor", "server-1");

      assert.deepEqual(result.memberCounts, { filtered: 24, total: 24 });
      assert.equal(state.counts.length, 1);
      assert.deepEqual(state.counts[0], { where: { serverId: "server-1" } });
      // Rol tablosu filtresiz çağrıda hiç okunmaz.
      assert.deepEqual(state.roleQueries, []);
    });
  });

  it("reports the filtered count next to the unfiltered total", async () => {
    await withListedMembers(async (state) => {
      const result = await listWorkspaceServerMembers("actor", "server-1", { q: "ada" });

      assert.deepEqual(result.memberCounts, { filtered: 3, total: 24 });
      assert.equal(state.counts.length, 2);
      // Toplam filtreden bağımsız kalmalı, yoksa `3 / 3` yazardı.
      assert.deepEqual(state.counts[0], { where: { serverId: "server-1" } });
    });
  });

  it("pushes the search into the query rather than filtering the page", async () => {
    await withListedMembers(async (state) => {
      await listWorkspaceServerMembers("actor", "server-1", { q: "  ada  " });

      const where = whereOf(state.lists.at(-1));
      assert.equal(where.serverId, "server-1");
      assert.deepEqual(where.AND[1], {
        OR: [
          { nickname: { contains: "ada", mode: "insensitive" } },
          { user: { displayName: { contains: "ada", mode: "insensitive" } } },
          { user: { username: { contains: "ada", mode: "insensitive" } } },
        ],
      });
    });
  });

  it("keeps the cursor, the search and the chip in separate AND branches", async () => {
    await withListedMembers(async (state) => {
      await listWorkspaceServerMembers("actor", "server-1", { filter: "owner", q: "ada" });

      const where = whereOf(state.lists.at(-1));
      // Üç parçanın ikisi kendi `OR`unu taşıyor; tek nesneye yayılsalar biri diğerini ezerdi.
      assert.equal(where.AND.length, 3);
      assert.deepEqual(where.AND[2], { userId: "owner" });
    });
  });

  it("resolves the role chips from the role table, not from the page rows", async () => {
    await withListedMembers(async (state) => {
      await listWorkspaceServerMembers("actor", "server-1", { filter: "moderator" });

      assert.deepEqual(state.roleQueries, [
        { select: { id: true, permissions: true }, where: { serverId: "server-1" } },
      ]);
      assert.deepEqual(whereOf(state.lists.at(-1)).AND[2], {
        roles: {
          none: { roleId: { in: ["role-admin"] } },
          some: { roleId: { in: ["role-mod"] } },
        },
        userId: { not: "owner" },
      });
    });
  });

  it("turns presence into a user-id clause so online and offline stay paginable", async () => {
    await withListedMembers(
      async (state) => {
        await listWorkspaceServerMembers("actor", "server-1", { filter: "online" });

        assert.deepEqual(whereOf(state.lists.at(-1)).AND[2], { userId: { in: ["target"] } });
      },
      { onlineUserIds: ["target"] },
    );

    await withListedMembers(async (state) => {
      await listWorkspaceServerMembers("actor", "server-1", { filter: "offline" });

      // Kimse çevrimiçi değilse `offline` herkesi geçirir, kimseyi değil.
      assert.deepEqual(whereOf(state.lists.at(-1)).AND[2], { userId: { notIn: [] } });
    });
  });
});
