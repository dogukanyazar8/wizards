import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

const notification = {
  actionUrl: "/channels/server-1/channel-1",
  actor: { avatarUrl: null, displayName: "Ada", id: "user-2", username: "ada" },
  body: "Ada mentioned you",
  channel: { id: "channel-1", name: "general" },
  createdAt: "2026-07-15T10:00:00.000Z",
  eventKind: null,
  friendRequestId: null,
  id: "00000000-0000-4000-8000-000000000001",
  messageQuote: { id: "message-1", preview: "Please review the contract" },
  read: false,
  readAt: null,
  server: { id: "server-1", name: "Whispr" },
  serverInviteCode: null,
  type: "MENTION" as const,
};

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    clearNotifications: async () => undefined,
    enforceRateLimit: async () => undefined,
    listNotifications: async () => ({
      nextCursor: null,
      notifications: [notification],
      unreadCount: 1,
    }),
    markAllRead: async () => undefined,
    markRead: async () => undefined,
    ...overrides,
  };
}

describe("mobile notifications route logic", () => {
  it("uses bearer-authenticated identity and cursor pagination before listing notifications", async () => {
    const { mobileNotificationsListRoute } = await routes;
    const calls: string[] = [];
    const response = await mobileNotificationsListRoute(
      new Request("https://whispr.test/api/v1/mobile/notifications?cursor=cursor-1&limit=20"),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) =>
          calls.push(`rate:${userId}:${action}`),
        listNotifications: async (userId: string, query: unknown) => {
          calls.push(`list:${userId}:${JSON.stringify(query)}`);
          return { nextCursor: null, notifications: [notification], unreadCount: 1 };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      nextCursor: null,
      notifications: [notification],
      unreadCount: 1,
    });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:notifications:list",
      'list:user-1:{"cursor":"cursor-1","filter":"all","limit":20}',
    ]);
  });

  it("marks owned notifications read and supports mark-all without changing cookie endpoints", async () => {
    const { mobileNotificationMarkAllReadRoute, mobileNotificationMarkReadRoute } = await routes;
    const calls: string[] = [];
    const deps = dependencies({
      enforceRateLimit: async (_userId: string, action: string) => calls.push(action),
      markAllRead: async (userId: string) => calls.push(`all:${userId}`),
      markRead: async (userId: string, notificationId: string) =>
        calls.push(`one:${userId}:${notificationId}`),
    });

    const one = await mobileNotificationMarkReadRoute(
      new Request(
        "https://whispr.test/api/v1/mobile/notifications/00000000-0000-4000-8000-000000000001/read",
        {
          method: "PATCH",
        },
      ),
      context({ id: notification.id }),
      deps,
    );
    const all = await mobileNotificationMarkAllReadRoute(
      new Request("https://whispr.test/api/v1/mobile/notifications/read-all", { method: "PATCH" }),
      deps,
    );

    assert.deepEqual(await one.json(), { success: true });
    assert.deepEqual(await all.json(), { success: true });
    assert.deepEqual(calls, [
      "mobile:notifications:mark-read",
      `one:user-1:${notification.id}`,
      "mobile:notifications:mark-read",
      "all:user-1",
    ]);
  });

  it("passes the requested feed filter through to the notification service", async () => {
    const { mobileNotificationsListRoute } = await routes;
    const queries: unknown[] = [];
    const deps = dependencies({
      listNotifications: async (_userId: string, query: unknown) => {
        queries.push(query);
        return { nextCursor: null, notifications: [], unreadCount: 3 };
      },
    });

    for (const filter of ["unread", "mentions"]) {
      await mobileNotificationsListRoute(
        new Request(`https://whispr.test/api/v1/mobile/notifications?filter=${filter}`),
        deps,
      );
    }
    const rejected = await mobileNotificationsListRoute(
      new Request("https://whispr.test/api/v1/mobile/notifications?filter=everything"),
      deps,
    );

    assert.deepEqual(queries, [
      { filter: "unread", limit: 20 },
      { filter: "mentions", limit: 20 },
    ]);
    assert.equal(rejected.status, 400);
  });

  it("clears the whole feed behind its own rate-limit action", async () => {
    const { mobileNotificationsClearRoute } = await routes;
    const calls: string[] = [];
    const response = await mobileNotificationsClearRoute(
      new Request("https://whispr.test/api/v1/mobile/notifications/clear", { method: "DELETE" }),
      dependencies({
        clearNotifications: async (userId: string) => {
          calls.push(`clear:${userId}`);
        },
        enforceRateLimit: async (_userId: string, action: string) => calls.push(action),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, ["mobile:notifications:clear", "clear:user-1"]);
  });

  it("rejects unauthorized and malformed mobile notification requests before domain access", async () => {
    const { mobileNotificationMarkReadRoute, mobileNotificationsListRoute } = await routes;
    let listed = false;
    const unauthorized = await mobileNotificationsListRoute(
      new Request("https://whispr.test/api/v1/mobile/notifications"),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        listNotifications: async () => {
          listed = true;
          return { nextCursor: null, notifications: [], unreadCount: 0 };
        },
      }),
    );
    const malformed = await mobileNotificationMarkReadRoute(
      new Request("https://whispr.test/api/v1/mobile/notifications/not-a-uuid/read", {
        method: "PATCH",
      }),
      context({ id: "not-a-uuid" }),
      dependencies({
        markRead: async () => {
          throw new Error("must not be called");
        },
      }),
    );
    const malformedQuery = await mobileNotificationsListRoute(
      new Request("https://whispr.test/api/v1/mobile/notifications?limit=not-a-number"),
      dependencies({
        listNotifications: async () => {
          throw new Error("must not be called");
        },
      }),
    );

    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
    assert.equal(listed, false);
    assert.equal(malformed.status, 400);
    assert.equal(malformedQuery.status, 400);
  });
});
