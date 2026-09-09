import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "./permissions";
import { SERVER_BANS_PAGE_LIMIT, listWorkspaceServerBans } from "./member-ban-service";

function banRow(index: number) {
  return {
    bannedBy: { displayName: "Ada", id: "user-owner" },
    createdAt: new Date(`2026-08-2${index % 9}T10:00:00.000Z`),
    id: `ban-${index}`,
    reason: index % 2 === 0 ? "spam" : null,
    user: {
      avatarUrl: null,
      displayName: index === 0 ? null : `Target ${index}`,
      id: `user-${index}`,
      username: `target${index}`,
    },
  };
}

function moderatorAccess() {
  return {
    accessLevel: "MEMBER",
    isPublic: false,
    memberId: "member-moderator",
    ownerId: "owner",
    roles: [
      {
        id: "role-mod",
        isDefault: false,
        managed: false,
        permissions: PermissionBits.BAN_MEMBERS,
      },
    ],
    serverId: "server-1",
    serverName: "Guild",
    type: "PERSONAL",
    userId: "moderator",
  };
}

function plainMemberAccess() {
  return {
    ...moderatorAccess(),
    roles: [
      {
        id: "role-everyone",
        isDefault: true,
        managed: false,
        permissions: PermissionBits.SEND_MESSAGES,
      },
    ],
    userId: "member",
  };
}

function createDependencies(
  rows: ReturnType<typeof banRow>[],
  queries: unknown[] = [],
  accessContext = moderatorAccess,
) {
  return {
    client: {
      serverBan: {
        count: async () => 42,
        findMany: async (args: unknown) => {
          queries.push(args);
          return rows;
        },
      },
    },
    getAccessContext: async () => accessContext(),
  } as never;
}

describe("workspace server ban list", () => {
  it("projects who, why, by whom and when, and carries the unpaged total", async () => {
    const result = await listWorkspaceServerBans(
      "moderator",
      "server-1",
      {},
      createDependencies([banRow(2)]),
    );

    assert.equal(result.total, 42);
    assert.equal(result.nextCursor, null);
    assert.deepEqual(result.bans, [
      {
        avatarUrl: null,
        bannedAt: "2026-08-22T10:00:00.000Z",
        bannedByDisplayName: "Ada",
        bannedByUserId: "user-owner",
        displayName: "Target 2",
        reason: "spam",
        userId: "user-2",
        username: "target2",
      },
    ]);
  });

  it("falls back to the username so a row is never drawn nameless", async () => {
    const result = await listWorkspaceServerBans(
      "moderator",
      "server-1",
      {},
      createDependencies([banRow(0)]),
    );

    assert.equal(result.bans[0]?.displayName, "target0");
    assert.equal(result.bans[0]?.reason, "spam");
  });

  it("hands back a cursor only when a further page exists", async () => {
    const rows = Array.from({ length: 4 }, (_unused, index) => banRow(index));
    const result = await listWorkspaceServerBans(
      "moderator",
      "server-1",
      { limit: 3 },
      createDependencies(rows),
    );

    assert.equal(result.bans.length, 3);
    assert.equal(result.nextCursor, "ban-2");
  });

  it("orders by id after the timestamp, so two bans in one second cannot skip a row", async () => {
    const queries: unknown[] = [];
    await listWorkspaceServerBans(
      "moderator",
      "server-1",
      { cursor: "ban-9", limit: 1_000 },
      createDependencies([], queries),
    );

    const query = queries[0] as {
      cursor: { id: string };
      orderBy: unknown;
      skip: number;
      take: number;
    };
    assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    assert.deepEqual(query.cursor, { id: "ban-9" });
    assert.equal(query.skip, 1);
    // Sayfa boyu istekle değil sabitle sınırlanır.
    assert.equal(query.take, SERVER_BANS_PAGE_LIMIT + 1);
  });

  it("refuses a member who cannot lift a ban either", async () => {
    await assert.rejects(
      () =>
        listWorkspaceServerBans(
          "member",
          "server-1",
          {},
          createDependencies([], [], plainMemberAccess),
        ),
      (error) => error instanceof ApiError && error.status === 403,
    );
  });
});
