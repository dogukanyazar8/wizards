import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ensureImplicitFollow,
  isThreadFollowed,
  listMutedThreadFollowerIds,
  listThreadFollowers,
  setExplicitFollow,
} from "./thread-follow-service";

type UpsertCall = {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
  where: Record<string, unknown>;
};

function createWriteClient() {
  const calls: UpsertCall[] = [];
  return {
    calls,
    client: {
      threadFollow: {
        upsert: async (args: unknown) => {
          calls.push(args as UpsertCall);
          return {};
        },
      },
    },
  };
}

function createReadClient(
  rows: Array<{
    mutedAt: Date | null;
    origin: "AUTHOR" | "REPLY" | "MENTION" | "EXPLICIT";
    userId: string;
  }>,
) {
  const queries: unknown[] = [];
  return {
    client: {
      threadFollow: {
        findMany: async (args: unknown) => {
          queries.push(args);
          const where = (args as { where?: { mutedAt?: unknown; userId?: string } }).where ?? {};
          return rows
            .filter((row) => (where.mutedAt === null ? row.mutedAt === null : true))
            .filter((row) =>
              typeof where.mutedAt === "object" && where.mutedAt !== null
                ? row.mutedAt !== null
                : true,
            )
            .filter((row) => (where.userId ? row.userId === where.userId : true));
        },
      },
    },
    queries,
  };
}

describe("thread follow service", () => {
  it("writes an implicit follow that never touches an existing row", async () => {
    const { calls, client } = createWriteClient();

    await ensureImplicitFollow({
      channelId: "channel-1",
      client,
      origin: "AUTHOR",
      parentMessageId: "message-1",
      userId: "user-1",
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.where, {
      userId_parentMessageId: { parentMessageId: "message-1", userId: "user-1" },
    });
    assert.deepEqual(calls[0]?.create, {
      channelId: "channel-1",
      origin: "AUTHOR",
      parentMessageId: "message-1",
      userId: "user-1",
    });
    // K3: `mutedAt` dolu bir satır örtük kurallarla geri açılmaz — boş `update` bunun kanıtı.
    assert.deepEqual(calls[0]?.update, {});
  });

  it("clears the mute when an explicit follow is switched on", async () => {
    const { calls, client } = createWriteClient();

    const result = await setExplicitFollow({
      channelId: "channel-1",
      client,
      following: true,
      parentMessageId: "message-1",
      userId: "user-1",
    });

    assert.deepEqual(result, { following: true });
    assert.deepEqual(calls[0]?.update, { mutedAt: null, origin: "EXPLICIT" });
    assert.equal(calls[0]?.create.mutedAt, null);
  });

  it("writes a mute row even when the user never followed, so implicit rules cannot reopen it", async () => {
    const { calls, client } = createWriteClient();

    await setExplicitFollow({
      channelId: "channel-1",
      client,
      following: false,
      parentMessageId: "message-1",
      userId: "user-1",
    });

    assert.equal(calls[0]?.create.origin, "EXPLICIT");
    assert.ok(calls[0]?.create.mutedAt instanceof Date);
    assert.ok((calls[0]?.update as { mutedAt?: Date }).mutedAt instanceof Date);
  });

  it("lists only followers that are not muted", async () => {
    const { client } = createReadClient([
      { mutedAt: null, origin: "AUTHOR", userId: "author" },
      { mutedAt: new Date(), origin: "REPLY", userId: "muted" },
      { mutedAt: null, origin: "MENTION", userId: "mentioned" },
    ]);

    assert.deepEqual(await listThreadFollowers("message-1", { client }), [
      { origin: "AUTHOR", userId: "author" },
      { origin: "MENTION", userId: "mentioned" },
    ]);
  });

  it("lists the deliberately muted followers separately", async () => {
    const { client } = createReadClient([
      { mutedAt: null, origin: "AUTHOR", userId: "author" },
      { mutedAt: new Date(), origin: "REPLY", userId: "muted" },
    ]);

    assert.deepEqual(await listMutedThreadFollowerIds("message-1", { client }), ["muted"]);
  });

  it("answers whether one user follows a thread", async () => {
    const { client } = createReadClient([
      { mutedAt: null, origin: "AUTHOR", userId: "author" },
      { mutedAt: new Date(), origin: "EXPLICIT", userId: "muted" },
    ]);

    assert.equal(await isThreadFollowed({ client, parentMessageId: "m", userId: "author" }), true);
    assert.equal(await isThreadFollowed({ client, parentMessageId: "m", userId: "muted" }), false);
  });
});
