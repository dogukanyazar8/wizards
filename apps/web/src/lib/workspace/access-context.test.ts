import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { getAccessContext, getAccessContextWithClient } from "./access-context";

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

function membership() {
  return {
    id: "member-1",
    roles: [
      {
        role: {
          color: 0x5865f2,
          id: "role-manager",
          isDefault: false,
          name: "Manager",
          permissions: 32n,
        },
      },
    ],
    server: {
      id: "server-1",
      name: "Guild",
      ownerId: "owner-1",
      roles: [
        {
          color: 0,
          id: "role-everyone",
          isDefault: true,
          name: "@everyone",
          permissions: 1n,
        },
      ],
    },
  };
}

function createClient(
  options: { banned?: boolean; membership?: ReturnType<typeof membership> | null } = {},
) {
  const operations: string[] = [];
  const client = {
    serverBan: {
      async findUnique(args: unknown) {
        operations.push("serverBan.findUnique");
        assert.deepEqual(args, {
          select: { id: true },
          where: { serverId_userId: { serverId: "server-1", userId: "user-1" } },
        });
        return options.banned ? { id: "ban-1" } : null;
      },
    },
    serverMember: {
      async findFirst(args: unknown) {
        operations.push("serverMember.findFirst");
        assert.deepEqual((args as { where: unknown }).where, {
          serverId: "server-1",
          userId: "user-1",
        });
        return options.membership === undefined ? membership() : options.membership;
      },
    },
  };

  return { client, operations };
}

describe("workspace access context", { concurrency: false }, () => {
  it("uses the transaction-compatible client for membership and ban lookup", async () => {
    const { client, operations } = createClient();

    const context = await getAccessContextWithClient(client as never, "user-1", "server-1");

    assert.deepEqual(operations.sort(), ["serverBan.findUnique", "serverMember.findFirst"]);
    assert.equal(context.memberId, "member-1");
    assert.equal(context.ownerId, "owner-1");
    assert.equal(context.serverId, "server-1");
    assert.equal(context.userId, "user-1");
    assert.deepEqual(context.roles.map((role) => role.id).sort(), [
      "role-everyone",
      "role-manager",
    ]);
  });

  it("preserves banned-member rejection", async () => {
    const { client } = createClient({ banned: true, membership: null });

    await assert.rejects(
      () => getAccessContextWithClient(client as never, "user-1", "server-1"),
      (error) =>
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === "SERVER_BANNED" &&
        error.message === "You are banned from this server",
    );
  });

  it("preserves missing-membership rejection", async () => {
    const { client } = createClient({ membership: null });

    await assert.rejects(
      () => getAccessContextWithClient(client as never, "user-1", "server-1"),
      (error) =>
        error instanceof ApiError && error.status === 404 && error.message === "Server not found",
    );
  });

  it("keeps the global access lookup as a Prisma-backed wrapper", async () => {
    const restores: Restore[] = [];
    const operations: string[] = [];

    patchMethod(
      prisma.serverBan,
      "findUnique",
      async () => {
        operations.push("global.serverBan.findUnique");
        return null;
      },
      restores,
    );
    patchMethod(
      prisma.serverMember,
      "findFirst",
      async () => {
        operations.push("global.serverMember.findFirst");
        return membership();
      },
      restores,
    );

    try {
      const context = await getAccessContext("user-1", "server-1");
      assert.equal(context.memberId, "member-1");
      assert.deepEqual(operations.sort(), [
        "global.serverBan.findUnique",
        "global.serverMember.findFirst",
      ]);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});
