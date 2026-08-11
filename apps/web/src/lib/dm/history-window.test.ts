import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { searchDMMessages } from "@/lib/messages/search-service";

import { listDMMessages, listDMThreadMessages, toHistoryWindowFilter } from "./service";

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

const FLOOR = new Date("2026-07-12T09:00:00.000Z");

/** The membership gate, answering "you joined with a 30-day window". */
function patchMembership(restores: Restore[], historyFromAt: Date | null, type = "GROUP_DM") {
  patchMethod(
    prisma.dMConversation,
    "findUnique",
    async () => ({ participants: [{ historyFromAt }], type }),
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

describe("toHistoryWindowFilter", () => {
  it("writes no filter at all when there is neither a floor nor a cursor", () => {
    // An always-true `createdAt` clause would still cost the planner a
    // comparison on every row of every page.
    assert.deepEqual(toHistoryWindowFilter(null, null), {});
  });

  it("keeps the floor and the cursor in one createdAt object", () => {
    const cursor = new Date("2026-08-11T09:00:00.000Z");

    assert.deepEqual(toHistoryWindowFilter(FLOOR, cursor), {
      createdAt: { gte: FLOOR, lt: cursor },
    });
  });

  it("carries a floor with no cursor", () => {
    assert.deepEqual(toHistoryWindowFilter(FLOOR, null), { createdAt: { gte: FLOOR } });
  });

  it("carries a cursor with no floor", () => {
    const cursor = new Date("2026-08-11T09:00:00.000Z");

    assert.deepEqual(toHistoryWindowFilter(null, cursor), { createdAt: { lt: cursor } });
  });
});

/**
 * 2c §7 / §C.6. Five read paths reach DM messages; a floor enforced on four of
 * them is a floor the fifth hands out for free. The three service functions
 * below are those paths — the two HTTP mirrors call the same functions, which
 * the contract test at the bottom pins.
 */
describe("history window enforcement", () => {
  it("filters the message list by the member's floor", async () => {
    const restores: Restore[] = [];
    patchMembership(restores, FLOOR);
    const queries = captureMessageQuery(restores);
    patchMethod(prisma.dMReaction, "findMany", async () => [], restores);
    patchMethod(prisma.dMMessage, "groupBy", async () => [], restores);
    patchMethod(prisma.dMParticipant, "findMany", async () => [], restores);

    try {
      await listDMMessages("user-1", "group-1", undefined, 30);

      assert.deepEqual(queries[0]?.createdAt, { gte: FLOOR });
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("writes no createdAt clause for a member with no floor", async () => {
    const restores: Restore[] = [];
    patchMembership(restores, null, "DM");
    const queries = captureMessageQuery(restores);
    patchMethod(prisma.dMReaction, "findMany", async () => [], restores);
    patchMethod(prisma.dMMessage, "groupBy", async () => [], restores);

    try {
      await listDMMessages("user-1", "dm-1", undefined, 30);

      assert.equal("createdAt" in (queries[0] ?? {}), false);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("filters thread replies and the thread parent by the same floor", async () => {
    const restores: Restore[] = [];
    patchMembership(restores, FLOOR);
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
    // The parent is a real id, so the reaction and thread-summary reads actually
    // run — unlike the empty-page cases above, which short-circuit.
    patchMethod(prisma, "$queryRaw", async () => [], restores);
    patchMethod(prisma.dMMessage, "groupBy", async () => [], restores);

    try {
      await listDMThreadMessages("user-1", "group-1", "message-1", undefined, 30);

      // A thread deep link would otherwise be a door around the window.
      assert.deepEqual(parentQueries[0]?.createdAt, { gte: FLOOR });
      assert.deepEqual(queries[0]?.createdAt, { gte: FLOOR });
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("filters the search query by the floor", async () => {
    const restores: Restore[] = [];
    const statements: string[] = [];

    patchMethod(
      prisma.dMParticipant,
      "findUnique",
      async () => ({ historyFromAt: FLOOR }),
      restores,
    );
    patchMethod(
      prisma,
      "$queryRaw",
      async (sql: { strings?: string[]; sql?: string; values?: unknown[] }) => {
        statements.push(JSON.stringify(sql));
        return [];
      },
      restores,
    );

    try {
      await searchDMMessages({ conversationId: "group-1", query: "toplantı", userId: "user-1" });

      const statement = statements[0] ?? "";
      assert.match(statement, /createdAt/);
      // The floor itself has to be a bound parameter, not a formatted literal.
      assert.match(statement, new RegExp(FLOOR.toISOString()));
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("leaves the search query unfiltered for a member with no floor", async () => {
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

      assert.equal(/m\."createdAt" >=/.test(statements[0] ?? ""), false);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});

/**
 * The two HTTP mirrors are read paths four and five. They hold the window only
 * because they delegate: a route that queried `dMMessage` itself would be a
 * fifth door with no floor on it.
 */
describe("the HTTP read paths delegate rather than query", () => {
  const routes = [
    "../../app/api/v1/dm/[conversationId]/messages/route.ts",
    "../../app/api/v1/dm/[conversationId]/messages/[messageId]/thread/route.ts",
    "../../app/api/v1/dm/[conversationId]/messages/search/route.ts",
    "../../app/api/v1/mobile/dm/[conversationId]/messages/get-route-logic.ts",
    "../../app/api/v1/mobile/dm/[conversationId]/messages/search/route.ts",
  ];

  for (const route of routes) {
    it(`reads DM messages through the service in ${route.split("/api/v1/")[1]}`, async () => {
      const source = await readFile(new URL(route, import.meta.url), "utf8");

      assert.match(source, /listDMMessages|listDMThreadMessages|searchDMMessages/);
      assert.equal(/prisma\.dMMessage\./.test(source), false);
    });
  }
});
