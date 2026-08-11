import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { GROUP_DM_MAX_PARTICIPANTS } from "@wizards/types";
import { ApiError } from "@/lib/api";

import { resolveLiveKitRoomName } from "./server";

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

function patchConversation(
  restores: Restore[],
  participantUserIds: readonly string[],
  blockedUserIds: readonly string[] = [],
) {
  patchMethod(prisma.dMConversation, "findUnique", async () => ({ id: "group-1" }), restores);
  patchMethod(
    prisma.dMParticipant,
    "findMany",
    async () => participantUserIds.map((userId) => ({ userId })),
    restores,
  );
  patchMethod(
    prisma.friendRequest,
    "findMany",
    async () => blockedUserIds.map((userId) => ({ receiverId: "user-1", senderId: userId })),
    restores,
  );
}

async function withPatches<T>(run: (restores: Restore[]) => Promise<T>): Promise<T> {
  const restores: Restore[] = [];

  try {
    return await run(restores);
  } finally {
    for (const restore of restores.reverse()) {
      restore();
    }
  }
}

/**
 * Faz 2 §D4. Nothing in the LiveKit path was changed for group calls — the room
 * name has never looked at how many people are in the conversation. These tests
 * are the proof of that, because "it already works" is not something a later
 * refactor can be trusted to preserve on its own.
 *
 * The 32-participant ceiling is enforced where membership is: only a participant
 * gets a token, and a group cannot hold more than
 * `GROUP_DM_MAX_PARTICIPANTS` members, so the room cannot exceed it either. No
 * `createRoom` call is made — one more network hop per token would break call
 * setup whenever the LiveKit control plane is unreachable.
 */
describe("group DM LiveKit rooms", () => {
  it("issues one room name for a three-person group", async () => {
    const roomName = await withPatches(async (restores) => {
      patchConversation(restores, ["user-1", "user-2", "user-3"]);
      return await resolveLiveKitRoomName("user-1", { conversationId: "group-1" });
    });

    assert.equal(roomName, "dm:group-1");
  });

  it("gives every member of a full group the same room", async () => {
    const members = Array.from(
      { length: GROUP_DM_MAX_PARTICIPANTS },
      (_unused, index) => `user-${index + 1}`,
    );

    const roomNames = await withPatches(async (restores) => {
      patchConversation(restores, members);

      return await Promise.all(
        ["user-1", "user-17", `user-${GROUP_DM_MAX_PARTICIPANTS}`].map((userId) =>
          resolveLiveKitRoomName(userId, { conversationId: "group-1" }),
        ),
      );
    });

    // One room per conversation, whatever the head count: a name that varied
    // would put the same call in two rooms.
    assert.deepEqual(roomNames, ["dm:group-1", "dm:group-1", "dm:group-1"]);
  });

  it("refuses a token to somebody who is not in the group", async () => {
    await withPatches(async (restores) => {
      patchConversation(restores, ["user-2", "user-3", "user-4"]);

      await assert.rejects(
        resolveLiveKitRoomName("user-1", { conversationId: "group-1" }),
        (error: unknown) => error instanceof ApiError && error.status === 403,
      );
    });
  });

  it("refuses a token while a block is active inside the group", async () => {
    await withPatches(async (restores) => {
      patchConversation(restores, ["user-1", "user-2", "user-3"], ["user-3"]);

      await assert.rejects(
        resolveLiveKitRoomName("user-1", { conversationId: "group-1" }),
        (error: unknown) => error instanceof ApiError && error.code === "BLOCKED",
      );
    });
  });

  it("404s for a conversation that does not exist", async () => {
    await withPatches(async (restores) => {
      patchMethod(prisma.dMConversation, "findUnique", async () => null, restores);

      await assert.rejects(
        resolveLiveKitRoomName("user-1", { conversationId: "missing" }),
        (error: unknown) => error instanceof ApiError && error.status === 404,
      );
    });
  });
});
