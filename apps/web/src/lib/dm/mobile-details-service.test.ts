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
    assert.equal(result.participant?.id, "user-2");
    assert.deepEqual(result.members, []);
    assert.equal(result.ownerId, null);
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

  // A group has no "the other participant". The 1:1 lookup used to 404 here, so
  // the details screen could never open for a group at all.
  it("describes a group by its member list instead of a single counterpart", async () => {
    const calls: string[] = [];
    const result = await getMobileDMDetails(
      { conversationId: "group-1", limit: 30, userId: "user-1" },
      {
        countMedia: async () => 0,
        getConversation: async (conversationId) => ({
          iconUrl: null,
          id: conversationId,
          lastMessage: null,
          lastMessageAt: new Date().toISOString(),
          name: "Takım",
          ownerId: "user-2",
          participants: [self, participant],
          type: "GROUP_DM",
        }),
        listMessages: async () => ({ messages: [], nextCursor: null }),
        listMutualServers: async () => {
          calls.push("servers");
          return [];
        },
      },
    );

    assert.equal(result.participant, null);
    assert.equal(result.ownerId, "user-2");
    assert.deepEqual(result.members, [
      {
        avatarUrl: null,
        displayName: "Dogukan",
        id: "user-1",
        isOwner: false,
        status: "ONLINE",
        username: "dogukan",
      },
      {
        avatarUrl: null,
        displayName: "Ada",
        id: "user-2",
        isOwner: true,
        status: "ONLINE",
        username: "ada",
      },
    ]);
    assert.deepEqual(result.mutualServers, []);
    // A group has no single counterpart, so there is nothing to compute a
    // "servers you share" list against.
    assert.deepEqual(calls, []);
  });
});
