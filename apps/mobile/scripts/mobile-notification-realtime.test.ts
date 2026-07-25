import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { MobileNotificationsResponse } from "@wizards/types";

import {
  applyMobileRealtimeNotificationEvent,
  canApplyMobileNotificationEvent,
  toMobileNotificationItem,
} from "../src/notifications/mobile-notification-realtime";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

const actor = {
  avatarUrl: "https://cdn.whispr.test/ada.png",
  displayName: "Ada",
  id: "user-ada",
  username: "ada",
};

function mentionEvent(overrides: Record<string, unknown> = {}) {
  return {
    actionUrl: "/channels/server-1/channel-1",
    actor,
    body: "Ada seni #genel kanalında etiketledi.",
    channel: { id: "channel-1", name: "genel" },
    createdAt: "2026-07-26T10:00:00.000Z",
    id: "notification-1",
    metadata: { messageId: "message-1", messagePreview: "PR'a bakar mısın?" },
    read: false,
    readAt: null,
    server: { id: "server-1", name: "Whispr" },
    type: "MENTION" as const,
    userId: "user-1",
    ...overrides,
  };
}

function seed(queryClient: QueryClient, filter: string, notifications: unknown[] = []) {
  queryClient.setQueryData<InfiniteData<MobileNotificationsResponse>>(
    mobileQueryKeys.notifications(filter),
    {
      pageParams: [null],
      pages: [
        {
          nextCursor: null,
          notifications: notifications as MobileNotificationsResponse["notifications"],
          unreadCount: 2,
        },
      ],
    },
  );
}

function read(queryClient: QueryClient, filter: string) {
  return queryClient.getQueryData<InfiniteData<MobileNotificationsResponse>>(
    mobileQueryKeys.notifications(filter),
  );
}

describe("mobile notification realtime cache", () => {
  it("maps a socket event into the same item shape the feed endpoint returns", () => {
    const item = toMobileNotificationItem(mentionEvent());

    assert.deepEqual(item, {
      actionUrl: "/channels/server-1/channel-1",
      actor,
      body: "Ada seni #genel kanalında etiketledi.",
      channel: { id: "channel-1", name: "genel" },
      createdAt: "2026-07-26T10:00:00.000Z",
      eventKind: null,
      friendRequestId: null,
      id: "notification-1",
      messageQuote: { id: "message-1", preview: "PR'a bakar mısın?" },
      read: false,
      readAt: null,
      server: { id: "server-1", name: "Whispr" },
      type: "MENTION",
    });
  });

  it("falls back to the thread preview and keeps a friend-request id only on its own type", () => {
    const threadItem = toMobileNotificationItem(
      mentionEvent({
        metadata: { messageId: "message-9", threadReplyPreview: "yanıt" },
        type: "SYSTEM",
      }),
    );
    assert.equal(threadItem.messageQuote?.preview, "yanıt");
    assert.equal(threadItem.friendRequestId, null);

    const friendItem = toMobileNotificationItem(
      mentionEvent({
        actor,
        channel: null,
        metadata: { friendRequestId: "request-1" },
        type: "FRIEND_REQUEST",
      }),
    );
    assert.equal(friendItem.friendRequestId, "request-1");
    assert.equal(friendItem.messageQuote, null);
  });

  it("refuses to draw a row whose actor or channel the event could not resolve", () => {
    assert.equal(canApplyMobileNotificationEvent(mentionEvent()), true);
    assert.equal(canApplyMobileNotificationEvent(mentionEvent({ actor: null })), false);
    assert.equal(canApplyMobileNotificationEvent(mentionEvent({ channel: null })), false);
    assert.equal(
      canApplyMobileNotificationEvent(mentionEvent({ channel: null, type: "DM" })),
      true,
    );
    // A system row draws an icon, so it never needed an actor.
    assert.equal(
      canApplyMobileNotificationEvent(mentionEvent({ actor: null, channel: null, type: "SYSTEM" })),
      true,
    );
  });

  it("prepends the row into every feed it belongs to and moves the unread total", () => {
    const queryClient = new QueryClient();
    seed(queryClient, "all");
    seed(queryClient, "unread");
    seed(queryClient, "mentions");

    const applied = applyMobileRealtimeNotificationEvent({
      event: mentionEvent(),
      queryClient,
    });

    assert.equal(applied, true);
    for (const filter of ["all", "unread", "mentions"]) {
      const page = read(queryClient, filter)?.pages[0];
      assert.equal(page?.notifications[0]?.id, "notification-1", filter);
      assert.equal(page?.unreadCount, 3, filter);
    }
  });

  it("keeps a read notification out of the unread feed and leaves the total alone", () => {
    const queryClient = new QueryClient();
    seed(queryClient, "all");
    seed(queryClient, "unread");

    applyMobileRealtimeNotificationEvent({
      event: mentionEvent({ read: true, readAt: "2026-07-26T10:00:01.000Z" }),
      queryClient,
    });

    assert.equal(read(queryClient, "all")?.pages[0]?.notifications.length, 1);
    assert.equal(read(queryClient, "unread")?.pages[0]?.notifications.length, 0);
    assert.equal(read(queryClient, "all")?.pages[0]?.unreadCount, 2);
  });

  it("never duplicates a row a backfill already delivered", () => {
    const queryClient = new QueryClient();
    seed(queryClient, "all", [toMobileNotificationItem(mentionEvent())]);

    applyMobileRealtimeNotificationEvent({ event: mentionEvent(), queryClient });

    const page = read(queryClient, "all")?.pages[0];
    assert.equal(page?.notifications.length, 1);
    // The row was already counted when it first arrived.
    assert.equal(page?.unreadCount, 3);
  });

  it("reports no write when nothing is cached, so the caller still refreshes", () => {
    const queryClient = new QueryClient();

    const applied = applyMobileRealtimeNotificationEvent({
      event: mentionEvent({ actor: null }),
      queryClient,
    });

    assert.equal(applied, false);
  });
});
