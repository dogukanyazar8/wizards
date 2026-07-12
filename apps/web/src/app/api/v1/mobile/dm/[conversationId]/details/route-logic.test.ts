import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mobileDMDetailsRoute } from "./route-logic";

describe("mobile DM details route", () => {
  it("validates auth, rate limit, params, and bounded cursor query", async () => {
    const calls: unknown[] = [];
    const response = await mobileDMDetailsRoute(new Request("https://whispr.test/details?cursor=m-1&limit=10"), { params: Promise.resolve({ conversationId: "dm-1" }) }, {
      authenticate: async () => "user-1", enforceRateLimit: async (_id, action) => { calls.push(action); }, getDetails: async (input) => { calls.push(input); return { mutualServers: [], nextCursor: null, participant: { avatarUrl: null, customStatus: null, displayName: "Ada", id: "user-2", status: "ONLINE", username: "ada" }, sharedAttachments: { files: [], media: [] } }; },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["mobile:dm:details", { conversationId: "dm-1", cursor: "m-1", limit: 10, userId: "user-1" }]);
  });
});
