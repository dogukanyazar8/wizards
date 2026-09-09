import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

import {
  clearExpiredDirectMessageMutes,
  deleteDMMessage,
  editDMMessage,
  listDirectMessageMutualServers,
  markDirectMessageRead,
  markDirectMessageUnread,
  setDirectMessageMuted,
} from "./service";
import * as dmService from "./service";

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

describe("DM service mutual servers", () => {
  it("lists only bounded requester-visible mutual servers without exposing private server fields", async () => {
    const restores: Restore[] = [];
    let capturedArgs: unknown;

    patchMethod(
      prisma.serverMember,
      "findMany",
      async (args: unknown) => {
        capturedArgs = args;
        return [
          {
            server: {
              _count: { members: 24 },
              iconColor: "danger",
              iconUrl: "https://cdn.whispr.test/server.png",
              id: "server-1",
              name: "Design Studio",
              shortName: "DS",
            },
          },
        ];
      },
      restores,
    );

    try {
      const result = await listDirectMessageMutualServers("viewer", "target");

      assert.deepEqual(result, [
        {
          iconColor: "danger",
          iconUrl: "https://cdn.whispr.test/server.png",
          id: "server-1",
          memberCount: 24,
          name: "Design Studio",
          shortName: "DS",
        },
      ]);
      assert.deepEqual(capturedArgs, {
        orderBy: {
          joinedAt: "desc",
        },
        select: {
          server: {
            select: {
              _count: {
                select: {
                  members: true,
                },
              },
              iconColor: true,
              iconUrl: true,
              id: true,
              name: true,
              shortName: true,
            },
          },
        },
        take: 6,
        where: {
          pending: false,
          server: {
            members: {
              some: {
                pending: false,
                userId: "target",
              },
            },
          },
          userId: "viewer",
        },
      });
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("does not query mutual servers for the current user themself", async () => {
    const restores: Restore[] = [];

    patchMethod(
      prisma.serverMember,
      "findMany",
      async () => {
        throw new Error("self lookups should be skipped");
      },
      restores,
    );

    try {
      assert.deepEqual(await listDirectMessageMutualServers("viewer", "viewer"), []);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});

describe("DM participant preferences", () => {
  it("masks another participant's private counters while preserving the viewer's own values", () => {
    type ParticipantMapper = (
      participant: never,
      presence: { customStatus: string | null; status: "OFFLINE" },
      lastSeenAt: string | null,
      viewerId: string,
    ) => { mentionCount: number; muted: boolean; unreadCount: number };
    const mapper = (dmService as unknown as { mapDMParticipantWithPresence?: ParticipantMapper })
      .mapDMParticipantWithPresence;

    assert.equal(typeof mapper, "function");

    const participant = {
      joinedAt: new Date("2026-08-12T09:00:00.000Z"),
      mentionCount: 4,
      muted: true,
      nameColor: null,
      role: "MEMBER",
      unreadCount: 9,
      user: {
        avatarUrl: null,
        customStatus: null,
        displayName: "Ada",
        username: "ada",
      },
      userId: "user-2",
    };
    const presence = { customStatus: null, status: "OFFLINE" as const };

    const other = mapper?.(participant as never, presence, null, "user-1");
    const self = mapper?.({ ...participant, userId: "user-1" } as never, presence, null, "user-1");

    assert.deepEqual(
      { mentionCount: other?.mentionCount, muted: other?.muted, unreadCount: other?.unreadCount },
      { mentionCount: 0, muted: false, unreadCount: 0 },
    );
    assert.deepEqual(
      { mentionCount: self?.mentionCount, muted: self?.muted, unreadCount: self?.unreadCount },
      { mentionCount: 4, muted: true, unreadCount: 9 },
    );
  });

  it("marks only the current participant unread after membership verification", async () => {
    const restores: Restore[] = [];
    const calls: Array<{ key: string; value: unknown }> = [];

    patchMethod(
      prisma.dMConversation,
      "findUnique",
      async (args: unknown) => {
        calls.push({ key: "findUnique", value: args });
        return { participants: [{ historyFromAt: null }], type: "DM" };
      },
      restores,
    );
    patchMethod(
      prisma.dMParticipant,
      "update",
      async (args: unknown) => {
        calls.push({ key: "update", value: args });
        return {};
      },
      restores,
    );

    try {
      await markDirectMessageUnread("user-1", "conversation-1");

      assert.deepEqual(calls, [
        {
          key: "findUnique",
          // The membership gate also answers "how far back may this member
          // read", and it stays one statement: the participant row arrives as a
          // filtered relation rather than a second findUnique.
          value: {
            select: {
              participants: { select: { historyFromAt: true }, where: { userId: "user-1" } },
              type: true,
            },
            where: { id: "conversation-1" },
          },
        },
        {
          key: "update",
          value: {
            data: {
              lastReadAt: null,
              unreadCount: 1,
            },
            where: {
              conversationId_userId: {
                conversationId: "conversation-1",
                userId: "user-1",
              },
            },
          },
        },
      ]);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("clears unread and mention badges when the conversation is read", async () => {
    const restores: Restore[] = [];
    let updateArgs: unknown;

    patchMethod(
      prisma.dMConversation,
      "findUnique",
      async () => ({ participants: [{ historyFromAt: null }], type: "GROUP_DM" }),
      restores,
    );
    patchMethod(
      prisma.dMParticipant,
      "update",
      async (args: unknown) => {
        updateArgs = args;
        return {};
      },
      restores,
    );

    try {
      await markDirectMessageRead("user-1", "conversation-1");
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }

    assert.deepEqual(updateArgs, {
      data: {
        lastReadAt: (updateArgs as { data: { lastReadAt: Date } }).data.lastReadAt,
        mentionCount: 0,
        unreadCount: 0,
      },
      where: {
        conversationId_userId: {
          conversationId: "conversation-1",
          userId: "user-1",
        },
      },
    });
  });

  it("persists DM mute state only for the current participant", async () => {
    const restores: Restore[] = [];
    const calls: Array<{ key: string; value: unknown }> = [];

    patchMethod(
      prisma.dMConversation,
      "findUnique",
      async (args: unknown) => {
        calls.push({ key: "findUnique", value: args });
        return { participants: [{ historyFromAt: null }], type: "DM" };
      },
      restores,
    );
    patchMethod(
      prisma.dMParticipant,
      "update",
      async (args: unknown) => {
        calls.push({ key: "update", value: args });
        return {};
      },
      restores,
    );

    try {
      await setDirectMessageMuted("user-1", "conversation-1", true, {
        emitMuteChanged: () => undefined,
        now: () => new Date("2026-08-27T09:00:00.000Z"),
      });

      assert.deepEqual(calls, [
        {
          key: "findUnique",
          // The membership gate also answers "how far back may this member
          // read", and it stays one statement: the participant row arrives as a
          // filtered relation rather than a second findUnique.
          value: {
            select: {
              participants: { select: { historyFromAt: true }, where: { userId: "user-1" } },
              type: true,
            },
            where: { id: "conversation-1" },
          },
        },
        {
          key: "update",
          // Tuzak 5 / karar K8: one statement carries all three columns. Two
          // updates is what leaves the app silent in one surface and loud in
          // another when the second one fails.
          value: {
            data: {
              muted: true,
              mutedUntil: null,
              notifyLevel: "NONE",
            },
            where: {
              conversationId_userId: {
                conversationId: "conversation-1",
                userId: "user-1",
              },
            },
          },
        },
      ]);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});

/** Mesajlar §17's `Sessize al` submenu — karar K8. */
describe("timed DM mute", () => {
  const NOW = new Date("2026-08-27T09:00:00.000Z");

  function stubMuteWrite(restores: Restore[]) {
    const writes: Array<Record<string, unknown>> = [];

    patchMethod(
      prisma.dMConversation,
      "findUnique",
      async () => ({ participants: [{ historyFromAt: null }], type: "DM" }),
      restores,
    );
    patchMethod(
      prisma.dMParticipant,
      "update",
      async (args: unknown) => {
        writes.push((args as { data: Record<string, unknown> }).data);
        return {};
      },
      restores,
    );

    return writes;
  }

  for (const [duration, expected] of [
    ["15m", "2026-08-27T09:15:00.000Z"],
    ["1h", "2026-08-27T10:00:00.000Z"],
    ["8h", "2026-08-27T17:00:00.000Z"],
  ] as const) {
    it(`writes the deadline the ${duration} rung promises`, async () => {
      const restores: Restore[] = [];
      const writes = stubMuteWrite(restores);

      try {
        const state = await setDirectMessageMuted(
          "user-1",
          "conversation-1",
          { duration, muted: true },
          { emitMuteChanged: () => undefined, now: () => NOW },
        );

        assert.deepEqual(writes, [
          { muted: true, mutedUntil: new Date(expected), notifyLevel: "NONE" },
        ]);
        assert.deepEqual(state, { muted: true, mutedUntil: expected, notifyLevel: "NONE" });
      } finally {
        for (const restore of restores.reverse()) {
          restore();
        }
      }
    });
  }

  it("stores no deadline for Süresiz", async () => {
    const restores: Restore[] = [];
    const writes = stubMuteWrite(restores);

    try {
      const state = await setDirectMessageMuted(
        "user-1",
        "conversation-1",
        { duration: "forever", muted: true },
        { emitMuteChanged: () => undefined, now: () => NOW },
      );

      assert.deepEqual(writes, [{ muted: true, mutedUntil: null, notifyLevel: "NONE" }]);
      assert.equal(state.mutedUntil, null);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  // The pre-submenu body. A caller that never learned about durations keeps the
  // behaviour it always had.
  it("treats a bare boolean and a duration-less body as Süresiz", async () => {
    const restores: Restore[] = [];
    const writes = stubMuteWrite(restores);

    try {
      await setDirectMessageMuted("user-1", "conversation-1", true, {
        emitMuteChanged: () => undefined,
        now: () => NOW,
      });
      await setDirectMessageMuted(
        "user-1",
        "conversation-1",
        { muted: true },
        { emitMuteChanged: () => undefined, now: () => NOW },
      );

      assert.deepEqual(writes, [
        { muted: true, mutedUntil: null, notifyLevel: "NONE" },
        { muted: true, mutedUntil: null, notifyLevel: "NONE" },
      ]);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("clears the deadline and the tier when the mute is lifted", async () => {
    const restores: Restore[] = [];
    const writes = stubMuteWrite(restores);

    try {
      const state = await setDirectMessageMuted(
        "user-1",
        "conversation-1",
        { duration: "8h", muted: false },
        { emitMuteChanged: () => undefined, now: () => NOW },
      );

      // The duration is ignored rather than honoured: unmuting for eight hours
      // is not a thing the submenu can express.
      assert.deepEqual(writes, [{ muted: false, mutedUntil: null, notifyLevel: "ALL" }]);
      assert.deepEqual(state, { muted: false, mutedUntil: null, notifyLevel: "ALL" });
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("announces the new state to the muter's own room only", async () => {
    const restores: Restore[] = [];
    stubMuteWrite(restores);
    const emitted: Array<{ payload: unknown; userId: string }> = [];

    try {
      await setDirectMessageMuted(
        "user-1",
        "conversation-1",
        { duration: "1h", muted: true },
        {
          emitMuteChanged: (userId, payload) => emitted.push({ payload, userId }),
          now: () => NOW,
        },
      );

      assert.deepEqual(emitted, [
        {
          payload: {
            conversationId: "conversation-1",
            muted: true,
            mutedUntil: "2026-08-27T10:00:00.000Z",
            notifyLevel: "NONE",
          },
          userId: "user-1",
        },
      ]);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("normalises only this person's lapsed mutes and never a live one", async () => {
    const restores: Restore[] = [];
    let captured: unknown;

    patchMethod(
      prisma.dMParticipant,
      "updateMany",
      async (args: unknown) => {
        captured = args;
        return { count: 2 };
      },
      restores,
    );

    try {
      assert.equal(await clearExpiredDirectMessageMutes("user-1", NOW), 2);
      assert.deepEqual(captured, {
        data: { muted: false, mutedUntil: null, notifyLevel: "ALL" },
        // `mutedUntil: null` is `Süresiz` and never matches `lte`, so a
        // deliberate forever-mute survives the sweepless cleanup.
        where: { muted: true, mutedUntil: { lte: NOW }, userId: "user-1" },
      });
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});

describe("DM message mutation authorization", () => {
  it("does not allow an edit route to target a message from another conversation", async () => {
    const restores: Restore[] = [];

    patchMethod(
      prisma.dMMessage,
      "findUnique",
      async () => ({
        conversationId: "conversation-2",
        deletedAt: null,
        placeholderRemovedAt: null,
        userId: "user-1",
      }),
      restores,
    );
    patchMethod(
      prisma.dMConversation,
      "findUnique",
      async () => {
        throw new Error("membership lookup must not run after a route mismatch");
      },
      restores,
    );

    try {
      await assert.rejects(
        () =>
          editDMMessage("message-1", "user-1", "Updated", {
            conversationId: "conversation-1",
          }),
        (error) => error instanceof ApiError && error.status === 404 && error.code === "NOT_FOUND",
      );
      await assert.rejects(
        () => deleteDMMessage("message-1", "user-1", { conversationId: "conversation-1" }),
        (error) => error instanceof ApiError && error.status === 404 && error.code === "NOT_FOUND",
      );
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("requires the DM message author before an edit can reach persistence", async () => {
    const restores: Restore[] = [];

    patchMethod(
      prisma.dMMessage,
      "findUnique",
      async () => ({
        conversationId: "conversation-1",
        deletedAt: null,
        placeholderRemovedAt: null,
        userId: "user-2",
      }),
      restores,
    );
    patchMethod(
      prisma.dMConversation,
      "findUnique",
      async () => ({ participants: [{ historyFromAt: null }], type: "DM" }),
      restores,
    );
    patchMethod(
      prisma.dMMessage,
      "update",
      async () => {
        throw new Error("unauthorized edits must not reach persistence");
      },
      restores,
    );

    try {
      await assert.rejects(
        () => editDMMessage("message-1", "user-1", "Updated", { conversationId: "conversation-1" }),
        (error) => error instanceof ApiError && error.status === 403 && error.code === "FORBIDDEN",
      );
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("allows the deleting actor to remove their own deleted DM notice", async () => {
    const restores: Restore[] = [];
    const updates: unknown[] = [];

    patchMethod(
      prisma.dMMessage,
      "findUnique",
      async () => ({
        conversationId: "conversation-1",
        deletedAt: new Date("2026-07-11T12:00:00.000Z"),
        deletedById: "user-1",
        placeholderRemovedAt: null,
        userId: "user-1",
      }),
      restores,
    );
    patchMethod(
      prisma.dMConversation,
      "findUnique",
      async () => ({ participants: [{ historyFromAt: null }], type: "DM" }),
      restores,
    );
    patchMethod(
      prisma.dMMessage,
      "updateMany",
      async (args: unknown) => {
        updates.push(args);
        return { count: 1 };
      },
      restores,
    );

    try {
      const result = await deleteDMMessage("message-1", "user-1", {
        conversationId: "conversation-1",
      });

      assert.deepEqual(result, { conversationId: "conversation-1", status: "removed" });
      assert.equal(updates.length, 1);
      const update = updates[0] as {
        data: { placeholderRemovedAt: unknown };
        where: unknown;
      };
      assert.ok(update.data.placeholderRemovedAt instanceof Date);
      assert.deepEqual(update.where, {
        deletedAt: { not: null },
        id: "message-1",
        placeholderRemovedAt: null,
      });
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});
