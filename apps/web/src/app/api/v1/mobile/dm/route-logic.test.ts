import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";
import { mobileDMCreateRoute, mobileDMListRoute } from "./route-logic";

describe("mobile DM create route", () => {
  it("returns a bearer-authenticated, bounded page with typed previews", async () => {
    const calls: unknown[] = [];
    const response = await mobileDMListRoute(
      new Request("https://whispr.test/api/v1/mobile/dm?cursor=dm-2&limit=20"),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async (_id, action) => { calls.push(action); },
        listDMs: async (userId, input) => {
          calls.push({ input, userId });
          return {
            conversations: [{
              id: "dm-1", lastMessage: { attachments: [], author: { avatarUrl: null, customStatus: null, displayName: "Ada", id: "user-2", status: "ONLINE", username: "ada" }, content: "  Hello\nworld  ", conversationId: "dm-1", createdAt: "2026-07-15T12:00:00.000Z", deletedAt: null, deletedById: null, editedAt: null, id: "message-1", reactions: [], replyTo: null, replyToId: null, threadParentId: null, userId: "user-2" }, lastMessageAt: "2026-07-15T12:00:00.000Z", name: null, participants: [{ avatarUrl: null, customStatus: null, displayName: "Ada", muted: false, presence: { customStatus: null, status: "ONLINE" }, status: "ONLINE", unreadCount: 3, userId: "user-2", username: "ada" }], type: "DM" }],
            nextCursor: null,
          };
        },
        getUnreadCount: async () => 7,
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["mobile:dm:conversations:list", { input: { cursor: "dm-2", limit: 20 }, userId: "user-1" }]);
    assert.deepEqual(await response.json(), {
      conversations: [{
        iconUrl: null,
        id: "dm-1",
        lastMessage: { author: { displayName: "Ada", id: "user-2", username: "ada" }, authorIsCurrentUser: false, createdAt: "2026-07-15T12:00:00.000Z", id: "message-1", text: "Hello world" },
        lastMessageAt: "2026-07-15T12:00:00.000Z",
        muted: false,
        name: null,
        participantCount: 1,
        participants: [{ avatarUrl: null, displayName: "Ada", id: "user-2", status: "ONLINE", username: "ada" }],
        type: "DM",
        unreadCount: 0,
      }],
      nextCursor: null,
      totalUnreadCount: 7,
    });
  });

  it("authenticates, rate limits, validates the target, and delegates authorization", async () => {
    const calls: string[] = [];
    const response = await mobileDMCreateRoute(new Request("https://whispr.test/dm", { body: JSON.stringify({ userId: "user-2" }), headers: { "content-type": "application/json" }, method: "POST" }), {
      authenticate: async () => "user-1",
      enforceRateLimit: async (_id, action) => { calls.push(action); },
      parseBody: parseJsonBody,
      createDM: async (userId, targetId) => { calls.push(`${userId}:${targetId}`); return { id: "dm-1", lastMessage: null, lastMessageAt: new Date().toISOString(), name: null, participants: [{ avatarUrl: null, customStatus: null, displayName: "Dogukan", muted: false, presence: { customStatus: null, status: "ONLINE" }, status: "ONLINE", unreadCount: 0, userId, username: "dogukan" }, { avatarUrl: null, customStatus: null, displayName: "Ada", muted: false, presence: { customStatus: null, status: "ONLINE" }, status: "ONLINE", unreadCount: 0, userId: targetId, username: "ada" }], type: "DM" }; },
    });
    assert.equal(response.status, 201);
    assert.deepEqual(calls, ["mobile:dm:create", "user-1:user-2"]);
  });
});
