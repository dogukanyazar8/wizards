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
          return { avatarUrl: null, bio: null, customStatus: null, displayName: input.displayName ?? null, email: "a@b.co", emailVerified: true, id: userId, status: "ONLINE", twoFactorEnabled: false, username: "ada" };
        },
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["auth", "mobile:account:profile:user-1", "update:user-1:Ada"]);
  });

  it("accepts the profile bio and custom status and returns the stored bio", async () => {
    const response = await mobileProfileUpdateRoute(
      new Request("https://whispr.test/profile", { body: JSON.stringify({ bio: "  Building Whispr  ", customStatus: "focus" }), headers: { "content-type": "application/json" }, method: "PATCH" }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async () => undefined,
        parseBody: parseJsonBody,
        updateProfile: async (userId, input) => ({
          avatarUrl: null,
          bio: input.bio ?? null,
          customStatus: input.customStatus ?? null,
          displayName: "Ada",
          email: "a@b.co",
          emailVerified: true,
          id: userId,
          status: "ONLINE" as const,
          twoFactorEnabled: false,
          username: "ada",
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      user: {
        avatarUrl: null,
        bio: "Building Whispr",
        customStatus: "focus",
        displayName: "Ada",
        id: "user-1",
        status: "ONLINE",
        twoFactorEnabled: false,
        username: "ada",
      },
    });
  });

  it("rejects forbidden profile fields", async () => {
    const response = await mobileProfileUpdateRoute(
      new Request("https://whispr.test/profile", { body: JSON.stringify({ email: "leak@example.com" }), headers: { "content-type": "application/json" }, method: "PATCH" }),
      { authenticate: async () => "user-1", enforceRateLimit: async () => undefined, parseBody: parseJsonBody, updateProfile: async () => { throw new Error("must not run"); } },
    );
    assert.equal(response.status, 400);
  });
});
