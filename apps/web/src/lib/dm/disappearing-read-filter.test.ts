import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { searchDMMessages } from "@/lib/messages/search-service";

import {
  isMessageUnexpired,
  listDMMessages,
  listDMThreadMessages,
  toUnexpiredFilter,
} from "./service";

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

function patchMembership(restores: Restore[], type = "GROUP_DM") {
  patchMethod(
    prisma.dMConversation,
    "findUnique",
    async () => ({ participants: [{ historyFromAt: null }], type }),
    restores,
  );
}

function captureMessageQuery(restores: Restore[]) {
  const queries: Array<Record<string, unknown>> = [];

  patchMethod(
    prisma.dMMessage,
    "findMany",
    async (args: { where: Record<string, unknown> }) => {
      queries.push(args.where);
      return [];
    },
    restores,
  );

  return queries;
}

/** Both shapes the filter can take, as Prisma would receive them. */
function assertUnexpiredClause(where: Record<string, unknown> | undefined) {
  const or = where?.OR as Array<Record<string, unknown>> | undefined;

  assert.ok(Array.isArray(or), "expected an OR clause on expiresAt");
  assert.deepEqual(or?.[0], { expiresAt: null });
  assert.ok(
    (or?.[1]?.expiresAt as { gt?: Date } | undefined)?.gt instanceof Date,
    "expected the second arm to compare expiresAt against a clock",
  );
}

describe("toUnexpiredFilter", () => {
  it("keeps rows with no deadline and rows whose deadline is still ahead", () => {
    const now = new Date("2026-08-11T12:00:00.000Z");

    assert.deepEqual(toUnexpiredFilter(now), {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
  });
});

describe("isMessageUnexpired", () => {
  const now = new Date("2026-08-11T12:00:00.000Z");

  it("keeps a message with no deadline", () => {
    assert.equal(isMessageUnexpired({ expiresAt: null }, now), true);
  });

  it("keeps a message whose deadline is ahead", () => {
    assert.equal(isMessageUnexpired({ expiresAt: new Date(now.getTime() + 1) }, now), true);
  });

  it("drops a message whose deadline has passed", () => {
    assert.equal(isMessageUnexpired({ expiresAt: new Date(now.getTime() - 1) }, now), false);
  });

  it("drops a message exactly at its deadline, matching the query's strict >", () => {
    // The two halves of C4 have to agree, or a row survives the query and is
    // hidden by the mapper (or worse, the other way round).
    assert.equal(isMessageUnexpired({ expiresAt: new Date(now) }, now), false);
  });
});

/**
 * C4. Three service functions reach DM message rows, and the sweep is up to a
 * minute behind the deadline it enforces. A filter on two of them would make the
 * third the way to read an expired message.
 */
describe("expired messages are filtered out of every read", () => {
  it("filters the message list", async () => {
    const restores: Restore[] = [];
    patchMembership(restores);
    const queries = captureMessageQuery(restores);
    patchMethod(prisma.dMReaction, "findMany", async () => [], restores);
    patchMethod(prisma.dMMessage, "groupBy", async () => [], restores);
    patchMethod(prisma.dMParticipant, "findMany", async () => [], restores);

    try {
      await listDMMessages("user-1", "group-1", undefined, 30);

      assertUnexpiredClause(queries[0]);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("filters thread replies and the thread parent", async () => {
    const restores: Restore[] = [];
    patchMembership(restores);
    const parentQueries: Array<Record<string, unknown>> = [];
    const queries = captureMessageQuery(restores);
    patchMethod(
      prisma.dMMessage,
      "findFirst",
      async (args: { where: Record<string, unknown> }) => {
        parentQueries.push(args.where);
        return {
          attachments: [],
          author: {
            avatarUrl: null,
            customStatus: null,
            displayName: "Ada",
            id: "user-1",
            status: "ONLINE",
            username: "ada",
          },
          content: "Parent",
          conversationId: "group-1",
          createdAt: new Date("2026-08-01T09:00:00.000Z"),
          deletedAt: null,
          deletedById: null,
          editedAt: null,
          expiresAt: null,
          forwardedAt: null,
          id: "message-1",
          placeholderRemovedAt: null,
          replyToId: null,
          systemTargetUserIds: [],
          systemType: null,
          systemValue: null,
          threadParentId: null,
          userId: "user-1",
        };
      },
      restores,
    );
    patchMethod(prisma, "$queryRaw", async () => [], restores);
    patchMethod(prisma.dMMessage, "groupBy", async () => [], restores);

    try {
      await listDMThreadMessages("user-1", "group-1", "message-1", undefined, 30);

      // The deep link is the door C4 would otherwise leave open.
      assertUnexpiredClause(parentQueries[0]);
      assertUnexpiredClause(queries[0]);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("filters the search query", async () => {
    const restores: Restore[] = [];
    const statements: string[] = [];

    patchMethod(
      prisma.dMParticipant,
      "findUnique",
      async () => ({ historyFromAt: null }),
      restores,
    );
    patchMethod(
      prisma,
      "$queryRaw",
      async (sql: unknown) => {
        statements.push(JSON.stringify(sql));
        return [];
      },
      restores,
    );

    try {
      await searchDMMessages({ conversationId: "group-1", query: "toplantı", userId: "user-1" });

      const statement = statements[0] ?? "";
      assert.match(statement, /expiresAt.*IS NULL/s);
      assert.match(statement, /expiresAt.*>/s);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});
