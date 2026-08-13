import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
  clearNotifications,
  getUnreadCount,
  getMobileVisibleNotificationTypes,
  listNotifications,
  markAllRead,
  markRead,
} from "@/lib/notifications/service";

type Restore = () => void;
type UnknownRecord = Record<string, unknown>;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as UnknownRecord;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

/**
 * The three feed actions all touch the same four tables. Every test stubs the
 * lot so an unexpected call fails loudly instead of reaching a database the
 * test runner does not have.
 */
function stubNotificationTables(
  restores: Restore[],
  overrides: {
    findFirst?: (args: unknown) => Promise<unknown>;
    findMany?: (args: unknown) => Promise<unknown>;
    updateMany?: (args: unknown) => Promise<{ count: number }>;
  } = {},
) {
  const calls = {
    dmParticipantUpdateMany: [] as unknown[],
    notificationDeleteMany: [] as unknown[],
    notificationUpdateMany: [] as unknown[],
  };

  patchMethod(
    prisma.notification,
    "findFirst",
    overrides.findFirst ?? (async () => null),
    restores,
  );
  patchMethod(
    prisma.notification,
    "updateMany",
    async (args: unknown) => {
      calls.notificationUpdateMany.push(args);
      return overrides.updateMany?.(args) ?? { count: 1 };
    },
    restores,
  );
  patchMethod(prisma.notification, "findMany", overrides.findMany ?? (async () => []), restores);
  patchMethod(
    prisma.notification,
    "deleteMany",
    async (args: unknown) => {
      calls.notificationDeleteMany.push(args);
      return { count: 1 };
    },
    restores,
  );
  patchMethod(prisma.channelReadState, "findMany", async () => [], restores);
  patchMethod(prisma.channelReadState, "updateMany", async () => ({ count: 0 }), restores);
  patchMethod(
    prisma.dMParticipant,
    "updateMany",
    async (args: unknown) => {
      calls.dmParticipantUpdateMany.push(args);
      return { count: 1 };
    },
    restores,
  );

  return calls;
}

function restoreAll(restores: Restore[]) {
  for (const restore of restores.reverse()) {
    restore();
  }
}

describe("mobile notification compatibility", () => {
  it("keeps BADGE rows away from frozen clients that cannot parse them", () => {
    assert.equal(
      getMobileVisibleNotificationTypes({ badgeCapable: false }).includes("BADGE"),
      false,
    );
    assert.equal(getMobileVisibleNotificationTypes({ badgeCapable: true }).includes("BADGE"), true);
  });

  it("keeps FEEDBACK rows visible to web and mobile clients", async () => {
    const restores: Restore[] = [];
    const queries: unknown[] = [];

    patchMethod(
      prisma.notification,
      "findMany",
      async (args: unknown) => {
        queries.push(args);
        return [
          {
            actionUrl: "/settings/feedback",
            body: "Feedback updated",
            createdAt: new Date("2026-08-12T12:00:00.000Z"),
            id: "feedback-1",
            metadata: null,
            readAt: null,
            type: "FEEDBACK",
          },
        ];
      },
      restores,
    );
    patchMethod(prisma.user, "findMany", async () => [], restores);
    patchMethod(
      prisma.notification,
      "count",
      async (args: unknown) => {
        queries.push(args);
        return 1;
      },
      restores,
    );

    try {
      const rows = await listNotifications("user-1", 5);
      const unreadCount = await getUnreadCount("user-1");

      assert.equal(rows[0]?.type, "FEEDBACK");
      assert.equal(unreadCount, 1);
      assert.equal(
        getMobileVisibleNotificationTypes({ badgeCapable: false }).includes("FEEDBACK"),
        true,
      );
      for (const query of queries) {
        const visibleTypes = (query as { where: { type: { in: string[] } } }).where.type.in;
        assert.equal(visibleTypes.includes("FEEDBACK"), true);
      }
    } finally {
      restoreAll(restores);
    }
  });
});

describe("direct message badge release", () => {
  it("retires one conversation's unread counter when a DM row is read", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({
        metadata: { conversationId: "conversation-1", mentioned: true, senderId: "sender-1" },
        read: false,
        type: "DM",
      }),
    });

    try {
      await markRead("user-1", "notification-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, [
      {
        where: {
          conversationId: "conversation-1",
          mentionCount: { gt: 0 },
          unreadCount: { gt: 0 },
          userId: "user-1",
        },
        data: {
          mentionCount: { decrement: 1 },
          unreadCount: { decrement: 1 },
        },
      },
    ]);
  });

  it("pays the counter once when concurrent reads race", async () => {
    const restores: Restore[] = [];
    let updateAttempt = 0;
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({
        metadata: { conversationId: "conversation-1" },
        type: "DM",
      }),
      updateMany: async () => ({ count: updateAttempt++ === 0 ? 1 : 0 }),
    });

    try {
      await markRead("user-1", "notification-1");
      await markRead("user-1", "notification-1");
    } finally {
      restoreAll(restores);
    }

    assert.equal(calls.dmParticipantUpdateMany.length, 1);
    assert.deepEqual(
      calls.notificationUpdateMany.map((args) => (args as { where: unknown }).where),
      [
        { id: "notification-1", read: false, userId: "user-1" },
        { id: "notification-1", read: false, userId: "user-1" },
      ],
    );
  });

  it("leaves the counter alone for a DM row with no conversation in its metadata", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({ metadata: null, read: false, type: "DM" }),
    });

    try {
      await markRead("user-1", "notification-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, []);
  });

  it("zeroes only conversation counters named by unread rows on mark-all-read", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findMany: async () => [
        { metadata: { conversationId: "conversation-1" } },
        { metadata: { conversationId: "conversation-1" } },
      ],
    });

    try {
      await markAllRead("user-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, [
      {
        where: { conversationId: { in: ["conversation-1"] }, userId: "user-1" },
        data: { mentionCount: 0, unreadCount: 0 },
      },
    ]);
  });

  it("leaves muted conversations without notification rows alone on clear-all", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findMany: async () => [{ metadata: { conversationId: "not-muted" } }],
    });

    try {
      await clearNotifications("user-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, [
      {
        where: { conversationId: { in: ["not-muted"] }, userId: "user-1" },
        data: { mentionCount: 0, unreadCount: 0 },
      },
    ]);
  });
});
