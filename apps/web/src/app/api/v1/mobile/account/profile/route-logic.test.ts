import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";
import { mobileProfileUpdateRoute } from "./route-logic";

describe("mobile profile route", () => {
  it("authenticates, rate limits, parses, and delegates", async () => {
    const calls: string[] = [];
    const response = await mobileProfileUpdateRoute(
      new Request("https://whispr.test/profile", { body: JSON.stringify({ displayName: " Ada " }), headers: { "content-type": "application/json" }, method: "PATCH" }),
      {
        authenticate: async () => { calls.push("auth"); return "user-1"; },
        enforceRateLimit: async (userId, action) => { calls.push(`${action}:${userId}`); },
        parseBody: parseJsonBody,
        updateProfile: async (userId, input) => {
          calls.push(`update:${userId}:${input.displayName}`);
          return { avatarUrl: null, customStatus: null, displayName: input.displayName ?? null, email: "a@b.co", emailVerified: true, id: userId, status: "ONLINE", twoFactorEnabled: false, username: "ada" };
        },
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["auth", "mobile:account:profile:user-1", "update:user-1:Ada"]);
  });

  it("rejects forbidden profile fields", async () => {
    const response = await mobileProfileUpdateRoute(
      new Request("https://whispr.test/profile", { body: JSON.stringify({ email: "leak@example.com" }), headers: { "content-type": "application/json" }, method: "PATCH" }),
      { authenticate: async () => "user-1", enforceRateLimit: async () => undefined, parseBody: parseJsonBody, updateProfile: async () => { throw new Error("must not run"); } },
    );
    assert.equal(response.status, 400);
  });
});
