import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

import {
  deleteDMMessage,
  editDMMessage,
  listDirectMessageMutualServers,
  markDirectMessageUnread,
  setDirectMessageMuted,
} from "./service";

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
      await setDirectMessageMuted("user-1", "conversation-1", true);

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
              muted: true,
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
