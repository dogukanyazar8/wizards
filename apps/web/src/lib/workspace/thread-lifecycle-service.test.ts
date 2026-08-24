import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "@/lib/workspace/permissions";
import { setChannelThreadClosed } from "@/lib/workspace/thread-lifecycle-service";

function database(parent: { threadClosedAt?: Date | null; userId?: string } | null) {
  const updates: Array<Record<string, unknown>> = [];

  return {
    client: {
      message: {
        findFirst: async () =>
          parent
            ? {
                id: "parent-1",
                threadClosedAt: parent.threadClosedAt ?? null,
                userId: parent.userId ?? "author-1",
              }
            : null,
        update: async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return {
            id: "parent-1",
            threadClosedAt: args.data.threadClosedAt as Date | null,
            threadClosedById: args.data.threadClosedById as string | null,
          };
        },
      },
    },
    updates,
  };
}

describe("channel thread lifecycle", () => {
  it("lets the root author close the thread and records the actor", async () => {
    const fake = database({ userId: "author-1" });
    const now = new Date("2026-08-21T12:00:00.000Z");

    const result = await setChannelThreadClosed({
      channelId: "channel-1",
      closed: true,
      database: fake.client,
      now: () => now,
      parentMessageId: "parent-1",
      permissions: PermissionBits.VIEW_CHANNEL,
      userId: "author-1",
    });

    assert.deepEqual(fake.updates, [{ threadClosedAt: now, threadClosedById: "author-1" }]);
    assert.deepEqual(result, {
      closedAt: now.toISOString(),
      closedById: "author-1",
      open: false,
    });
  });

  it("lets MANAGE_MESSAGES close another member's thread", async () => {
    const fake = database({ userId: "author-1" });

    await setChannelThreadClosed({
      channelId: "channel-1",
      closed: true,
      database: fake.client,
      parentMessageId: "parent-1",
      permissions: PermissionBits.VIEW_CHANNEL | PermissionBits.MANAGE_MESSAGES,
      userId: "moderator-1",
    });

    assert.equal(fake.updates.length, 1);
  });

  it("rejects a non-author without MANAGE_MESSAGES", async () => {
    const fake = database({ userId: "author-1" });

    await assert.rejects(
      setChannelThreadClosed({
        channelId: "channel-1",
        closed: true,
        database: fake.client,
        parentMessageId: "parent-1",
        permissions: PermissionBits.VIEW_CHANNEL,
        userId: "member-1",
      }),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
    assert.deepEqual(fake.updates, []);
  });

  it("reopens by clearing both close fields", async () => {
    const fake = database({
      threadClosedAt: new Date("2026-08-21T11:00:00.000Z"),
      userId: "author-1",
    });

    const result = await setChannelThreadClosed({
      channelId: "channel-1",
      closed: false,
      database: fake.client,
      parentMessageId: "parent-1",
      permissions: PermissionBits.VIEW_CHANNEL,
      userId: "author-1",
    });

    assert.deepEqual(fake.updates, [{ threadClosedAt: null, threadClosedById: null }]);
    assert.deepEqual(result, { closedAt: null, closedById: null, open: true });
  });

  it("hides missing, deleted and non-root parents behind a 404", async () => {
    const fake = database(null);

    await assert.rejects(
      setChannelThreadClosed({
        channelId: "channel-1",
        closed: true,
        database: fake.client,
        parentMessageId: "parent-1",
        permissions: PermissionBits.MANAGE_MESSAGES,
        userId: "moderator-1",
      }),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
  });
});
