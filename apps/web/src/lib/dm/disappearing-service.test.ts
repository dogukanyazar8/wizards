import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  purgeExpiredDMMessages,
  type DisappearingPurgeDependencies,
  type ExpiredDMMessageRow,
} from "./disappearing-service";

const NOW = new Date("2026-08-11T12:00:00.000Z");

function expiredRow(overrides: Partial<ExpiredDMMessageRow> = {}): ExpiredDMMessageRow {
  return {
    attachments: [],
    conversationId: "conversation-1",
    id: "message-1",
    pinnedInConversations: [],
    ...overrides,
  };
}

type Trace = string[];

function dependencies(
  rows: ExpiredDMMessageRow[],
  overrides: Partial<DisappearingPurgeDependencies> = {},
): { deps: DisappearingPurgeDependencies; errors: unknown[]; trace: Trace } {
  const trace: Trace = [];
  const errors: unknown[] = [];

  const deps: DisappearingPurgeDependencies = {
    deleteMessages: async (ids) => {
      trace.push(`delete:${ids.join(",")}`);
      return ids.length;
    },
    deleteStorageObjects: async (keys) => {
      trace.push(`storage:${keys.join(",")}`);
    },
    emitExpired: (input) => {
      trace.push(`emit:${input.conversationId}:${input.messageIds.join(",")}`);
    },
    emitUnpinned: (input) => {
      trace.push(`unpin:${input.conversationId}`);
    },
    findExpired: async ({ limit }) => {
      trace.push(`find:${limit}`);
      return rows;
    },
    logError: (_message, error) => {
      errors.push(error);
    },
    now: () => NOW,
    ...overrides,
  };

  return { deps, errors, trace };
}

describe("purgeExpiredDMMessages", () => {
  it("does nothing at all when no row is due", async () => {
    const { deps, trace } = dependencies([]);

    const result = await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.equal(result.deleted, 0);
    // No delete, no event, no storage call: an idle minute must cost one query.
    assert.deepEqual(trace, ["find:500"]);
  });

  it("deletes the due rows and reports the count", async () => {
    const { deps } = dependencies([expiredRow(), expiredRow({ id: "message-2" })]);

    const result = await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.equal(result.deleted, 2);
  });

  it("deletes before it announces", async () => {
    // §4.10. The other order lets a client that receives the event re-fetch the
    // message and put it back on screen.
    const { deps, trace } = dependencies([expiredRow()]);

    await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.deepEqual(trace, ["find:500", "delete:message-1", "emit:conversation-1:message-1"]);
  });

  it("still deletes before it announces when files are involved", async () => {
    const { deps, trace } = dependencies([
      expiredRow({ attachments: [{ thumbnailUrl: null, url: "https://utfs.io/f/file-key" }] }),
    ]);

    await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.deepEqual(trace, [
      "find:500",
      "delete:message-1",
      "emit:conversation-1:message-1",
      "storage:file-key",
    ]);
  });

  it("announces once per conversation, not once per message", async () => {
    const { deps, trace } = dependencies([
      expiredRow({ id: "message-1" }),
      expiredRow({ id: "message-2" }),
      expiredRow({ conversationId: "conversation-2", id: "message-3" }),
    ]);

    await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.deepEqual(
      trace.filter((entry) => entry.startsWith("emit:")),
      ["emit:conversation-1:message-1,message-2", "emit:conversation-2:message-3"],
    );
  });

  it("clears the pinned strip when the purged message was the pin", async () => {
    // The FK drops `pinnedMessageId` on its own; the clients still hold the old
    // strip until something tells them.
    const { deps, trace } = dependencies([
      expiredRow({ pinnedInConversations: [{ id: "conversation-1" }] }),
    ]);

    await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.ok(trace.includes("unpin:conversation-1"));
  });

  it("leaves the pin alone when the purged message was not pinned", async () => {
    const { deps, trace } = dependencies([expiredRow()]);

    await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.equal(
      trace.some((entry) => entry.startsWith("unpin:")),
      false,
    );
  });

  it("removes the uploaded files behind the purged messages", async () => {
    const { deps, trace } = dependencies([
      expiredRow({
        attachments: [
          { thumbnailUrl: "https://utfs.io/f/thumb-key", url: "https://utfs.io/f/file-key" },
        ],
      }),
    ]);

    await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.ok(trace.includes("storage:file-key,thumb-key"));
  });

  it("does not call storage when nothing had an attachment", async () => {
    const { deps } = dependencies([expiredRow()]);
    let called = 0;

    await purgeExpiredDMMessages(
      { limit: 500 },
      {
        ...deps,
        deleteStorageObjects: async () => {
          called += 1;
        },
      },
    );

    assert.equal(called, 0);
  });

  it("keeps the rows deleted when the storage sweep fails", async () => {
    // A file left behind is recoverable; a message the purge failed to delete is
    // the promise the feature made being broken.
    const { deps, errors } = dependencies([
      expiredRow({ attachments: [{ thumbnailUrl: null, url: "https://utfs.io/f/file-key" }] }),
    ]);

    const result = await purgeExpiredDMMessages(
      { limit: 500 },
      {
        ...deps,
        deleteStorageObjects: async () => {
          throw new Error("uploadthing down");
        },
      },
    );

    assert.equal(result.deleted, 1);
    assert.equal(errors.length, 1);
  });

  it("passes the batch limit straight through", async () => {
    const { deps, trace } = dependencies([]);

    await purgeExpiredDMMessages({ limit: 25 }, deps);

    assert.deepEqual(trace, ["find:25"]);
  });

  it("stays silent when the delete removed nothing, so a lost race emits no event", async () => {
    // Another worker instance got there first. Announcing anyway would tell
    // clients to drop messages this run never actually removed.
    const { deps, trace } = dependencies([expiredRow()], { deleteMessages: async () => 0 });

    const result = await purgeExpiredDMMessages({ limit: 500 }, deps);

    assert.equal(result.deleted, 0);
    assert.equal(
      trace.some((entry) => entry.startsWith("emit:")),
      false,
    );
  });
});

/**
 * §F. The pinned-message half of the purge is a database constraint, not code:
 * the Faz 1 foreign key drops `pinnedMessageId` when the message row goes. The
 * event above closes the strip; this is what makes the state underneath correct.
 */
describe("pinned message survives the purge as a NULL", () => {
  it("keeps the pin foreign key on ON DELETE SET NULL", async () => {
    const migration = await readFile(
      new URL(
        "../../../../../packages/db/prisma/rebaseline-migrations/20260811120000_group_dm_v2/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    // CASCADE here would delete the conversation with the message; RESTRICT
    // would make the purge fail on any group with a pinned message.
    assert.match(migration, /"DMConversation_pinnedMessageId_fkey"[\s\S]*?ON DELETE SET NULL/);
  });

  it("declares the same rule in the schema the client is generated from", async () => {
    const schema = await readFile(
      new URL("../../../../../packages/db/prisma/schema.prisma", import.meta.url),
      "utf8",
    );

    assert.match(schema, /DMConversationPinnedMessage[\s\S]*?onDelete: SetNull/);
  });
});
