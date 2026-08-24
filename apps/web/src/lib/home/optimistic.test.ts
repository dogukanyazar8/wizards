import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyEventInterest,
  applyPresenceProjection,
  clearRecentUnread,
  removeAwaitingItem,
  restoreAwaitingItem,
} from "@/lib/home/optimistic";
import type {
  AppAwaitingResponse,
  AppRecentResponse,
  AppSummaryResponse,
  EventsUpcomingResponse,
  HomeAwaitingItem,
} from "@/lib/home/types";

/**
 * `06-faz5` §2 — the cache half of every optimistic path.
 *
 * These are the functions the mutations' `onMutate`/`onError` pair calls. Keeping
 * them pure is what makes "the row comes back when the endpoint answers 500"
 * something a test can state rather than something a comment claims.
 */

function actor(id: string) {
  return { avatarUrl: null, displayName: id, id, presence: "ONLINE" as const };
}

function awaitingItem(id: string, overrides: Partial<HomeAwaitingItem> = {}): HomeAwaitingItem {
  return {
    action: "accept",
    context: "",
    href: "/messages",
    id,
    occurredAt: "2026-08-19T11:00:00.000Z",
    reason: "",
    source: "friend_request",
    user: actor(id),
    ...overrides,
  };
}

const AWAITING: AppAwaitingResponse = {
  items: [awaitingItem("a"), awaitingItem("b"), awaitingItem("c")],
  newCount: 2,
  total: 3,
};

describe("removeAwaitingItem", () => {
  it("drops the row, its position and one from every counter", () => {
    const result = removeAwaitingItem(AWAITING, "b");

    assert.deepEqual(
      result?.next.items.map((item) => item.id),
      ["a", "c"],
    );
    assert.equal(result?.next.newCount, 1);
    assert.equal(result?.next.total, 2);
    assert.equal(result?.index, 1);
    assert.equal(result?.item.id, "b");
  });

  it("floors the counters instead of writing a negative badge", () => {
    const result = removeAwaitingItem({ items: [awaitingItem("a")], newCount: 0, total: 0 }, "a");

    assert.equal(result?.next.newCount, 0);
    assert.equal(result?.next.total, 0);
  });

  it("does nothing for a row that is not in the list", () => {
    assert.equal(removeAwaitingItem(AWAITING, "zzz"), null);
    assert.equal(removeAwaitingItem(undefined, "a"), null);
  });
});

describe("restoreAwaitingItem", () => {
  it("puts the row back where it was, with the counters it had", () => {
    const removed = removeAwaitingItem(AWAITING, "b");
    assert.ok(removed);

    const restored = restoreAwaitingItem(removed.next, removed);

    assert.deepEqual(
      restored.items.map((item) => item.id),
      ["a", "b", "c"],
    );
    assert.deepEqual(restored, AWAITING);
  });

  it("appends when the list shrank underneath the failed accept", () => {
    const removed = removeAwaitingItem(AWAITING, "a");
    assert.ok(removed);

    const restored = restoreAwaitingItem({ items: [], newCount: 0, total: 0 }, removed);

    assert.deepEqual(
      restored.items.map((item) => item.id),
      ["a"],
    );
  });

  it("survives a cache that was emptied while the request was in flight", () => {
    const removed = removeAwaitingItem(AWAITING, "a");
    assert.ok(removed);

    assert.deepEqual(restoreAwaitingItem(undefined, removed).items.length, 1);
  });
});

describe("applyPresenceProjection", () => {
  const summary: AppSummaryResponse = {
    dateLabel: "2026-08-19T12:00:00.000Z",
    dmUnread: 3,
    focus: null,
    greetingName: "Alice",
    pendingReplies: 1,
    presence: "ONLINE",
    unreadMentions: 2,
  };

  it("writes only presence and focus, leaving every counter untouched", () => {
    const next = applyPresenceProjection(summary, {
      focus: {
        active: true,
        expiresAt: "2026-08-19T12:25:00.000Z",
        minutesLeft: 25,
        totalMinutes: 25,
      },
      presence: "DND",
    });

    assert.equal(next?.presence, "DND");
    assert.equal(next?.focus?.minutesLeft, 25);
    assert.equal(next?.dmUnread, 3);
    assert.equal(next?.unreadMentions, 2);
    assert.equal(next?.pendingReplies, 1);
  });

  it("does nothing without a cached summary", () => {
    assert.equal(applyPresenceProjection(undefined, { focus: null, presence: "DND" }), undefined);
  });
});

describe("applyEventInterest", () => {
  const upcoming: EventsUpcomingResponse = {
    next: {
      attendeeCount: 4,
      attendees: [actor("u1")],
      context: "Tasarım",
      href: "/servers/s1/about?event=e1",
      id: "e1",
      interested: false,
      serverId: "s1",
      startAt: "2026-08-19T13:00:00.000Z",
      title: "Sprint",
    },
    totalCount: 3,
    upcoming: [],
  };

  it("marks interest and counts one more attendee", () => {
    const next = applyEventInterest(upcoming, { eventId: "e1", interested: true });

    assert.equal(next?.next?.interested, true);
    assert.equal(next?.next?.attendeeCount, 5);
  });

  it("is idempotent: re-marking the same interest does not count twice", () => {
    const once = applyEventInterest(upcoming, { eventId: "e1", interested: true });
    const twice = applyEventInterest(once, { eventId: "e1", interested: true });

    assert.equal(twice?.next?.attendeeCount, 5);
  });

  it("removes interest and gives the attendee back", () => {
    const marked = applyEventInterest(upcoming, { eventId: "e1", interested: true });
    const cleared = applyEventInterest(marked, { eventId: "e1", interested: false });

    assert.equal(cleared?.next?.interested, false);
    assert.equal(cleared?.next?.attendeeCount, 4);
  });

  it("ignores an event that is no longer the next one", () => {
    assert.deepEqual(
      applyEventInterest(upcoming, { eventId: "other", interested: true }),
      upcoming,
    );
  });
});

describe("clearRecentUnread", () => {
  const recent: AppRecentResponse = {
    items: [
      {
        avatarUrl: null,
        href: "/channels/s1/c1",
        id: "c1",
        kind: "channel",
        lastMessage: null,
        lastMessageAt: "2026-08-19T11:00:00.000Z",
        mentioned: true,
        name: "genel",
        presence: null,
        serverName: "Wizards",
        unreadCount: 7,
      },
      {
        avatarUrl: null,
        href: "/messages/d1",
        id: "d1",
        kind: "dm",
        lastMessage: null,
        lastMessageAt: "2026-08-19T10:00:00.000Z",
        mentioned: false,
        name: "Selin",
        presence: "ONLINE",
        serverName: null,
        unreadCount: 2,
      },
    ],
  };

  it("zeroes the tapped row's badge and its mention flag, and only that row", () => {
    const next = clearRecentUnread(recent, "c1");

    assert.equal(next?.items[0]?.unreadCount, 0);
    assert.equal(next?.items[0]?.mentioned, false);
    assert.equal(next?.items[1]?.unreadCount, 2);
  });

  it("leaves an already-read row identical, so no render is triggered", () => {
    const once = clearRecentUnread(recent, "c1");
    assert.equal(clearRecentUnread(once, "c1"), once);
  });

  it("does nothing without a cached list", () => {
    assert.equal(clearRecentUnread(undefined, "c1"), undefined);
  });
});
