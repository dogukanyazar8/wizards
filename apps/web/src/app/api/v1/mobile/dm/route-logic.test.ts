import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";
import { mobileDMCreateRoute } from "./route-logic";

describe("mobile DM create route", () => {
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
