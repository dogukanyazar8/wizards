import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyIncomingNotification, prependIncomingNotification } from "./notification-bell";

describe("incoming notification cache work", () => {
  it("increments unread state without reconciling notification queries", () => {
    let unreadCount = 4;
    const invalidatedBadgeKeys: Array<readonly unknown[]> = [];

    applyIncomingNotification(
      { id: "notification-1", type: "MENTION", userId: "user-1" } as never,
      {
        invalidateBadgeQuery: (queryKey) => invalidatedBadgeKeys.push(queryKey),
        updateUnreadCount: (update) => {
          unreadCount = update(unreadCount);
        },
      },
    );

    assert.equal(unreadCount, 5);
    assert.deepEqual(invalidatedBadgeKeys, []);
  });

  it("prepends and deduplicates the socket notification for an already-open popup", () => {
    const payload = {
      actionUrl: "/channels/server-1/channel-1",
      actor: {
        avatarUrl: null,
        displayName: "Ada",
        id: "author-1",
        username: "ada",
      },
      body: "Yeni mesaj",
      createdAt: "2026-08-12T12:00:00.000Z",
      id: "notification-2",
      imageUrl: null,
      metadata: { channelId: "channel-1" },
      read: false,
      readAt: null,
      title: "Mention",
      type: "MENTION",
      userId: "user-1",
    } as const;
    const current = [
      {
        actionUrl: null,
        actor: null,
        createdAt: "2026-08-12T11:00:00.000Z",
        id: "notification-1",
        message: "Eski",
        readAt: null,
        type: "SYSTEM" as const,
      },
      {
        actionUrl: null,
        actor: null,
        createdAt: payload.createdAt,
        id: payload.id,
        message: payload.body,
        readAt: null,
        type: payload.type,
      },
    ];

    const next = prependIncomingNotification(current, payload, 2);

    assert.ok(next);
    assert.deepEqual(
      next.map((notification) => notification.id),
      ["notification-2", "notification-1"],
    );
    assert.equal(next[0]?.message, "Yeni mesaj");
    assert.equal(next[0]?.actor?.username, "ada");

    const seeded = prependIncomingNotification(undefined, payload, 2);
    assert.deepEqual(
      seeded?.map((notification) => notification.id),
      ["notification-2"],
    );
  });
});
