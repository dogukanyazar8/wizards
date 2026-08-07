import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DMConversationDTO } from "@wizards/types";

import { getDMConversationRealtimeUpdates } from "./realtime-service";

const conversation = {
  id: "dm-1",
  type: "GROUP_DM",
  name: null,
  iconUrl: null,
  ownerId: null,
  lastMessageAt: "2026-05-14T00:00:00.000Z",
  participants: [],
  lastMessage: null,
} satisfies DMConversationDTO;

describe("DM realtime updates", () => {
  it("loads conversation projections once for all participants", async () => {
    const calls: Array<{ conversationId: string; userIds: string[] }> = [];

    const updates = await getDMConversationRealtimeUpdates(
      "dm-1",
      [{ userId: "user-1" }, { userId: "user-2" }, { userId: "user-3" }],
      {
        async loadConversationViews(conversationId, userIds) {
          calls.push({ conversationId, userIds: [...userIds] });
          return userIds.map((userId, index) => ({
            conversation,
            participantId: userId,
            unreadCount: index,
          }));
        },
      },
    );

    assert.deepEqual(calls, [
      {
        conversationId: "dm-1",
        userIds: ["user-1", "user-2", "user-3"],
      },
    ]);
    assert.deepEqual(
      updates.map((update) => [update.participantId, update.unreadCount]),
      [
        ["user-1", 0],
        ["user-2", 1],
        ["user-3", 2],
      ],
    );
  });
});
