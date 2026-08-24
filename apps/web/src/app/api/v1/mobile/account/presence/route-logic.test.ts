import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";
import { mobilePresenceUpdateRoute } from "./route-logic";

describe("mobile presence route", () => {
  it("accepts only whitelisted presence and delegates after rate limiting", async () => {
    const calls: string[] = [];
    const response = await mobilePresenceUpdateRoute(
      new Request("https://whispr.test/presence", {
        body: JSON.stringify({ status: "DND" }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async (_id, action) => {
          calls.push(action);
        },
        parseBody: parseJsonBody,
        updatePresence: async (userId, status) => {
          calls.push(`${userId}:${status}`);
          return { customStatus: null, status, userId };
        },
      },
    );
    assert.deepEqual(await response.json(), { status: "DND" });
    assert.deepEqual(calls, ["mobile:account:presence", "user-1:DND"]);
  });
});
