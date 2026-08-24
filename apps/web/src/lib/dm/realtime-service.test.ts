import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { DMConversationDTO } from "@wizards/types";

import { getDMConversationRealtimeUpdates } from "./realtime-service";

const conversation = {
  id: "dm-1",
  type: "GROUP_DM",
  name: null,
  iconUrl: null,
  ownerId: null,
  lastMessageAt: "2026-05-14T00:00:00.000Z",
  participants: [],
  lastMessage: null,
} satisfies DMConversationDTO;

describe("DM realtime updates", () => {
  it("loads conversation projections once for all participants", async () => {
    const calls: Array<{ conversationId: string; userIds: string[] }> = [];

    const updates = await getDMConversationRealtimeUpdates(
      "dm-1",
      [{ userId: "user-1" }, { userId: "user-2" }, { userId: "user-3" }],
      {
        async loadConversationViews(conversationId, userIds) {
          calls.push({ conversationId, userIds: [...userIds] });
          return userIds.map((userId, index) => ({
            conversation,
            participantId: userId,
            unreadCount: index,
          }));
        },
      },
    );

    assert.deepEqual(calls, [
      {
        conversationId: "dm-1",
        userIds: ["user-1", "user-2", "user-3"],
      },
    ]);
    assert.deepEqual(
      updates.map((update) => [update.participantId, update.unreadCount]),
      [
        ["user-1", 0],
        ["user-2", 1],
        ["user-3", 2],
      ],
    );
  });
});

/**
 * Ana Sayfa 1a — Faz 6. A DM mention is a row now, not only a counter.
 *
 * `createRealtimeDMMessage` writes `prisma` directly, so this reads the module's
 * own source: the assertion worth making is not "createMany was called" but
 * **where** it was called from. The mention rows and `DMParticipant.mentionCount`
 * have to move inside the same interactive transaction as the message — a badge
 * that commits without its row would leave "Bahsedilmeler" describing a message
 * that does not exist, and a row without the badge would be invisible.
 */
describe("DM mention rows", () => {
  const source = readFileSync(new URL("./realtime-service.ts", import.meta.url), "utf8");
  const transaction = source.slice(
    source.indexOf("prisma.$transaction"),
    source.indexOf("return resolveIdempotentMessageSend"),
  );

  it("writes mention rows in the same transaction as the mention counter", () => {
    assert.ok(transaction.length > 0, "the send transaction must be findable");
    assert.match(transaction, /tx\.dMMessageMention\.createMany/);
    assert.match(transaction, /mentionCount: \{ increment: 1 \}/);
  });

  it("writes one mention row per named participant, skipping duplicates", () => {
    const createManyAt = transaction.indexOf("tx.dMMessageMention.createMany");
    const block = transaction.slice(createManyAt, createManyAt + 400);

    assert.match(block, /mentionedUserIds\.map/);
    assert.match(block, /messageId: createdMessage\.id/);
    // A resend that resolves to the same message must not double-insert.
    assert.match(block, /skipDuplicates: true/);
  });

  /** Bahsedilmeler Ş2: DM'de rol ve `@herkes` yoktur, bu dal her zaman `SELF` yazar. */
  it("stamps every DM mention row as SELF", () => {
    const createManyAt = transaction.indexOf("tx.dMMessageMention.createMany");
    const block = transaction.slice(createManyAt, createManyAt + 400);

    assert.match(block, /kind: "SELF"/);
  });

  it("derives the row timestamp from the message, not from a second clock", () => {
    const createManyAt = transaction.indexOf("tx.dMMessageMention.createMany");
    const block = transaction.slice(createManyAt, createManyAt + 400);

    assert.match(block, /createdAt: createdMessage\.createdAt/);
  });
});
