import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMobileDMDetails } from "./mobile-details-service";

const participant = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada",
  muted: false,
  presence: { customStatus: null, status: "ONLINE" as const },
  status: "ONLINE" as const,
  unreadCount: 0,
  userId: "user-2",
  username: "ada",
};
const self = { ...participant, displayName: "Dogukan", userId: "user-1", username: "dogukan" };
describe("mobile DM details service", () => {
  it("derives the target only from an authorized conversation and forwards the cursor", async () => {
    const calls: unknown[] = [];
    const result = await getMobileDMDetails(
      { conversationId: "dm-1", cursor: "cursor-1", limit: 10, userId: "user-1" },
      {
        countMedia: async (conversationId) => {
          calls.push(["media", conversationId]);
          return 0;
        },
        getConversation: async (conversationId, userId) => {
          calls.push(["conversation", conversationId, userId]);
          return {
            iconUrl: null,
            id: conversationId,
            lastMessage: null,
            lastMessageAt: new Date().toISOString(),
            name: null,
            ownerId: null,
            participants: [self, participant],
            type: "DM",
          };
        },
        listMessages: async (userId, conversationId, cursor, limit) => {
          calls.push(["messages", userId, conversationId, cursor, limit]);
          return { messages: [], nextCursor: null };
        },
        listMutualServers: async (requester, target, options) => {
          calls.push(["servers", requester, target, options]);
          return [];
        },
      },
    );
    assert.equal(result.participant.id, "user-2");
    assert.deepEqual(calls, [
      ["conversation", "dm-1", "user-1"],
      ["servers", "user-1", "user-2", { limit: 12 }],
      ["messages", "user-1", "dm-1", "cursor-1", 10],
      ["media", "dm-1"],
    ]);
  });

  it("reports the conversation's whole media history, not the length of the page preview", async () => {
    const result = await getMobileDMDetails(
      { conversationId: "dm-1", limit: 30, userId: "user-1" },
      {
        countMedia: async () => 128,
        getConversation: async (conversationId) => ({
          iconUrl: null,
          id: conversationId,
          lastMessage: null,
          lastMessageAt: new Date().toISOString(),
          name: null,
          ownerId: null,
          participants: [self, participant],
          type: "DM",
        }),
        listMessages: async () => ({ messages: [], nextCursor: null }),
        listMutualServers: async () => [],
      },
    );

    assert.equal(result.mediaCount, 128);
    assert.equal(result.sharedAttachments.media.length, 0);
  });
});
