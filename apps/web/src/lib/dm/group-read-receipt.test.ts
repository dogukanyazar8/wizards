import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { listDMMessages } from "./service";

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

const author = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada",
  id: "user-1",
  status: "ONLINE",
  username: "ada",
};

function message(id: string, userId: string, createdAt: string, overrides = {}) {
  return {
    attachments: [],
    author: { ...author, id: userId },
    content: id,
    conversationId: "group-1",
    createdAt: new Date(createdAt),
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    forwardedAt: null,
    id,
    placeholderRemovedAt: null,
    replyToId: null,
    systemTargetUserIds: [],
    systemType: null,
    systemValue: null,
    threadParentId: null,
    userId,
    ...overrides,
  };
}

/** Newest first, the order `listDMMessages` reads them in. */
function patchPage(restores: Restore[], messages: unknown[], type = "GROUP_DM") {
  patchMethod(
    prisma.dMConversation,
    "findUnique",
    async () => ({ participants: [{ historyFromAt: null }], type }),
    restores,
  );
  patchMethod(prisma.dMMessage, "findMany", async () => messages, restores);
  patchMethod(prisma, "$queryRaw", async () => [], restores);
  patchMethod(prisma.dMMessage, "groupBy", async () => [], restores);
}

function patchReadStates(restores: Restore[], states: unknown[]) {
  patchMethod(prisma.dMParticipant, "findMany", async () => states, restores);
}

async function withRestores<T>(run: (restores: Restore[]) => Promise<T>): Promise<T> {
  const restores: Restore[] = [];

  try {
    return await run(restores);
  } finally {
    for (const restore of restores.reverse()) {
      restore();
    }
  }
}

/**
 * 2d §8 / §4.5. The receipt is drawn under one bubble — the newest outgoing one
 * — so it is computed once per page from a participant list that was read once.
 */
describe("group read receipt attachment", () => {
  it("attaches the receipt to the newest outgoing message only", async () => {
    const messages = await withRestores(async (restores) => {
      patchPage(restores, [
        message("m4", "user-2", "2026-08-11T09:04:00.000Z"),
        message("m3", "user-1", "2026-08-11T09:03:00.000Z"),
        message("m2", "user-1", "2026-08-11T09:02:00.000Z"),
        message("m1", "user-2", "2026-08-11T09:01:00.000Z"),
      ]);
      patchReadStates(restores, [
        {
          lastDeliveredAt: null,
          lastReadAt: new Date("2026-08-11T09:10:00.000Z"),
          userId: "user-2",
        },
        { lastDeliveredAt: null, lastReadAt: null, userId: "user-3" },
      ]);

      return (await listDMMessages("user-1", "group-1", undefined, 30)).messages;
    });

    const withReceipt = messages.filter((entry) => entry.readReceipt !== undefined);
    assert.deepEqual(
      withReceipt.map((entry) => entry.id),
      ["m3"],
    );
    assert.deepEqual(withReceipt[0]?.readReceipt, {
      count: 1,
      everyone: false,
      readerIds: ["user-2"],
    });
  });

  it("skips a system row when it looks for the newest outgoing message", async () => {
    const messages = await withRestores(async (restores) => {
      patchPage(restores, [
        message("m2", "user-1", "2026-08-11T09:02:00.000Z", { systemType: "MEMBER_ADDED" }),
        message("m1", "user-1", "2026-08-11T09:01:00.000Z"),
      ]);
      patchReadStates(restores, [
        {
          lastDeliveredAt: null,
          lastReadAt: new Date("2026-08-11T09:10:00.000Z"),
          userId: "user-2",
        },
      ]);

      return (await listDMMessages("user-1", "group-1", undefined, 30)).messages;
    });

    // A system row has no author to report a receipt for.
    assert.equal(messages.find((entry) => entry.id === "m2")?.readReceipt, undefined);
    assert.equal(messages.find((entry) => entry.id === "m1")?.readReceipt?.count, 1);
  });

  it("skips a deleted message", async () => {
    const messages = await withRestores(async (restores) => {
      patchPage(restores, [
        message("m2", "user-1", "2026-08-11T09:02:00.000Z", {
          deletedAt: new Date("2026-08-11T09:05:00.000Z"),
        }),
        message("m1", "user-1", "2026-08-11T09:01:00.000Z"),
      ]);
      patchReadStates(restores, [
        {
          lastDeliveredAt: null,
          lastReadAt: new Date("2026-08-11T09:10:00.000Z"),
          userId: "user-2",
        },
      ]);

      return (await listDMMessages("user-1", "group-1", undefined, 30)).messages;
    });

    assert.equal(messages.find((entry) => entry.id === "m2")?.readReceipt, undefined);
    assert.equal(messages.find((entry) => entry.id === "m1")?.readReceipt?.count, 1);
  });

  it("does not read participant states for a 1:1 conversation", async () => {
    // A DM has ticks, not a receipt; paying for the read would be a query per
    // conversation open for the majority of conversations.
    const reads = await withRestores(async (restores) => {
      let calls = 0;
      patchPage(restores, [message("m1", "user-1", "2026-08-11T09:01:00.000Z")], "DM");
      patchMethod(
        prisma.dMParticipant,
        "findMany",
        async () => {
          calls += 1;
          return [];
        },
        restores,
      );

      const page = await listDMMessages("user-1", "dm-1", undefined, 30);
      assert.equal(page.messages[0]?.readReceipt, undefined);
      return calls;
    });

    assert.equal(reads, 0);
  });

  it("does not read participant states on an older page", async () => {
    // The design only draws the receipt under the last bubble of the
    // conversation, which is never on a cursor page.
    const reads = await withRestores(async (restores) => {
      let calls = 0;
      patchPage(restores, [message("m1", "user-1", "2026-08-11T09:01:00.000Z")]);
      patchMethod(
        prisma.dMMessage,
        "findFirst",
        async () => ({ createdAt: new Date("2026-08-11T09:05:00.000Z") }),
        restores,
      );
      patchMethod(
        prisma.dMParticipant,
        "findMany",
        async () => {
          calls += 1;
          return [];
        },
        restores,
      );

      const page = await listDMMessages("user-1", "group-1", "cursor-1", 30);
      assert.equal(page.messages[0]?.readReceipt, undefined);
      return calls;
    });

    assert.equal(reads, 0);
  });
});
