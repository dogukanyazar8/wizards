import assert from "node:assert/strict";
import { it } from "node:test";
import { prisma } from "@wizards/db";
import { getChannelMessages, mapRawMessage } from "@/lib/workspace/message-service";
import { listDMMessages, mapDMMessagePayload } from "@/lib/dm/service";

it("history exposes stored nonces only to their author; shared mappers omit them", async (t) => {
  const message = {
    id: "server-id",
    channelId: "channel",
    conversationId: "dm",
    userId: "author",
    clientNonce: "optimistic-id",
    content: "hello",
    type: "DEFAULT",
    createdAt: new Date(),
    deletedAt: null,
    editedAt: null,
    attachments: [],
    reactions: [],
    reply: null,
    author: { id: "author", username: "ada", displayName: "Ada", avatarUrl: null },
  };
  const rows = async (args: { select?: unknown }) => (args.select ? [] : [message]);
  const patch = (target: object, key: string, implementation: unknown) => {
    const record = target as Record<string, unknown>;
    const original = record[key];
    record[key] = implementation;
    t.after(() => {
      record[key] = original;
    });
  };
  patch(prisma.message, "findMany", rows);
  patch(prisma.dMMessage, "findMany", rows);
  patch(prisma, "$queryRaw", async () => []);
  patch(prisma.dMConversation, "findUnique", async () => ({
    type: "DM",
    participants: [{ historyFromAt: null }],
  }));
  for (const viewer of ["author", "other"]) {
    const expected = viewer === "author" ? "optimistic-id" : undefined;
    assert.equal(
      (await getChannelMessages("channel", undefined, 50, viewer)).messages[0]?.clientNonce,
      expected,
    );
    assert.equal(
      (await listDMMessages(viewer, "dm", undefined, 50)).messages[0]?.clientNonce,
      expected,
    );
  }
  assert.equal(
    mapRawMessage(message as unknown as Parameters<typeof mapRawMessage>[0], undefined, "author")
      .clientNonce,
    undefined,
  );
  assert.equal(
    mapDMMessagePayload(
      message as unknown as Parameters<typeof mapDMMessagePayload>[0],
      undefined,
      undefined,
      "author",
    ).clientNonce,
    undefined,
  );
});
