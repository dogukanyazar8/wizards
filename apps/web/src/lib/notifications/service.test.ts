import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
  clearNotifications,
  getMobileVisibleNotificationTypes,
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
      return { count: 1 };
    },
    restores,
  );
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
});

describe("direct message badge release", () => {
  it("retires one conversation's unread counter when a DM row is read", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({
        metadata: { conversationId: "conversation-1", senderId: "sender-1" },
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
        where: { conversationId: "conversation-1", unreadCount: { gt: 0 }, userId: "user-1" },
        data: { unreadCount: { decrement: 1 } },
      },
    ]);
  });

  it("does not pay the counter twice for an already-read DM row", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({
        metadata: { conversationId: "conversation-1" },
        read: true,
        type: "DM",
      }),
    });

    try {
      await markRead("user-1", "notification-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, []);
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

  it("zeroes every conversation counter on mark-all-read", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores);

    try {
      await markAllRead("user-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, [
      {
        where: { unreadCount: { gt: 0 }, userId: "user-1" },
        data: { unreadCount: 0 },
      },
    ]);
  });

  it("zeroes every conversation counter on clear-all", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores);

    try {
      await clearNotifications("user-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, [
      {
        where: { unreadCount: { gt: 0 }, userId: "user-1" },
        data: { unreadCount: 0 },
      },
    ]);
  });
});
