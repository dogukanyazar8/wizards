import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
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
      prisma.dMParticipant,
      "findUnique",
      async (args: unknown) => {
        calls.push({ key: "findUnique", value: args });
        return { id: "participant-1" };
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
          value: {
            select: { id: true },
            where: {
              conversationId_userId: {
                conversationId: "conversation-1",
                userId: "user-1",
              },
            },
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
      prisma.dMParticipant,
      "findUnique",
      async (args: unknown) => {
        calls.push({ key: "findUnique", value: args });
        return { id: "participant-1" };
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
          value: {
            select: { id: true },
            where: {
              conversationId_userId: {
                conversationId: "conversation-1",
                userId: "user-1",
              },
            },
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
