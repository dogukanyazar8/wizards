import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileNotificationsResponse } from "@wizards/types";

import { removeMobileNotificationsByInviteCode } from "../src/notifications/mobile-notification-invite-model";

function notification(overrides: Record<string, unknown> = {}) {
  return {
    actionUrl: "/invite/code-1",
    actor: null,
    body: "Doğukan seni Mobile Test sunucusuna davet etti.",
    channel: null,
    createdAt: "2026-07-26T12:00:00.000Z",
    eventKind: null,
    friendRequestId: null,
    id: "00000000-0000-4000-8000-000000000001",
    messageQuote: null,
    read: false,
    readAt: null,
    server: null,
    serverInviteCode: "code-1",
    type: "SERVER_INVITE" as const,
    ...overrides,
  } as MobileNotificationsResponse["notifications"][number];
}

function page(
  notifications: MobileNotificationsResponse["notifications"],
  unreadCount: number,
): MobileNotificationsResponse {
  return { nextCursor: null, notifications, unreadCount };
}

describe("answered invite notification cleanup", () => {
  it("retires every row carrying the answered code", () => {
    const pages = [
      page(
        [
          notification({ id: "00000000-0000-4000-8000-000000000001" }),
          notification({ id: "00000000-0000-4000-8000-000000000002", serverInviteCode: "other" }),
        ],
        2,
      ),
    ];

    const result = removeMobileNotificationsByInviteCode(pages, "code-1");

    assert.deepEqual(
      result[0]!.notifications.map((entry) => entry.serverInviteCode),
      ["other"],
    );
  });

  it("drops the unread badge by exactly the unread rows it removed", () => {
    const pages = [
      page(
        [
          notification({ id: "00000000-0000-4000-8000-000000000001", read: false }),
          notification({ id: "00000000-0000-4000-8000-000000000002", read: true }),
        ],
        1,
      ),
    ];

    assert.equal(removeMobileNotificationsByInviteCode(pages, "code-1")[0]!.unreadCount, 0);
  });

  it("never drives the unread badge below zero", () => {
    const pages = [page([notification({ read: false })], 0)];
    assert.equal(removeMobileNotificationsByInviteCode(pages, "code-1")[0]!.unreadCount, 0);
  });

  it("leaves an already-read row's badge alone", () => {
    const pages = [page([notification({ read: true })], 3)];
    const result = removeMobileNotificationsByInviteCode(pages, "code-1");

    assert.deepEqual(result[0]!.notifications, []);
    assert.equal(result[0]!.unreadCount, 3);
  });

  it("returns the same page object when nothing matched, so no cache churn", () => {
    const untouched = page([notification({ serverInviteCode: "other" })], 1);
    const result = removeMobileNotificationsByInviteCode([untouched], "code-1");

    assert.equal(result[0], untouched);
  });

  it("cleans every cached page, not just the first", () => {
    const pages = [
      page([notification({ id: "00000000-0000-4000-8000-000000000001" })], 1),
      page([notification({ id: "00000000-0000-4000-8000-000000000002" })], 1),
    ];

    const result = removeMobileNotificationsByInviteCode(pages, "code-1");

    assert.deepEqual(
      result.map((entry) => entry.notifications.length),
      [0, 0],
    );
  });

  it("ignores rows with no invite code at all", () => {
    const pages = [page([notification({ serverInviteCode: null, type: "MENTION" })], 1)];
    const result = removeMobileNotificationsByInviteCode(pages, "code-1");

    assert.equal(result[0]!.notifications.length, 1);
    assert.equal(result[0]!.unreadCount, 1);
  });
});
