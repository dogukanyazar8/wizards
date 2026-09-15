import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";
import { mobileProfileUpdateRoute } from "./route-logic";

describe("mobile profile route", () => {
  it("authenticates, rate limits, parses, and delegates", async () => {
    const calls: string[] = [];
    const response = await mobileProfileUpdateRoute(
      new Request("https://whispr.test/profile", {
        body: JSON.stringify({ displayName: " Ada " }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      {
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId, action) => {
          calls.push(`${action}:${userId}`);
        },
        parseBody: parseJsonBody,
        updateProfile: async (userId, input) => {
          calls.push(`update:${userId}:${input.displayName}`);
          return {
            avatarUrl: null,
            bannerColor: null,
            bannerOffsetX: null,
            bannerOffsetY: null,
            bannerUrl: null,
            bio: null,
            customStatus: null,
            customStatusEmoji: null,
            customStatusExpiresAt: null,
            displayName: input.displayName ?? null,
            email: "a@b.co",
            emailVerified: true,
            id: userId,
            status: "ONLINE",
            twoFactorEnabled: false,
            username: "ada",
            usernameChangedAt: null,
          };
        },
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["auth", "mobile:account:profile:user-1", "update:user-1:Ada"]);
  });

  it("accepts the profile bio and custom status and returns the stored bio", async () => {
    const response = await mobileProfileUpdateRoute(
      new Request("https://whispr.test/profile", {
        body: JSON.stringify({ bio: "  Building Whispr  ", customStatus: "focus" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async () => undefined,
        parseBody: parseJsonBody,
        updateProfile: async (userId, input) => ({
          avatarUrl: null,
          bannerColor: null,
          bannerOffsetX: null,
          bannerOffsetY: null,
          bannerUrl: null,
          bio: input.bio ?? null,
          customStatus: input.customStatus ?? null,
          customStatusEmoji: null,
          customStatusExpiresAt: null,
          displayName: "Ada",
          email: "a@b.co",
          emailVerified: true,
          id: userId,
          status: "ONLINE" as const,
          twoFactorEnabled: false,
          username: "ada",
          usernameChangedAt: null,
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      user: {
        avatarUrl: null,
        bannerColor: null,
        bannerOffsetX: null,
        bannerOffsetY: null,
        bannerUrl: null,
        bio: "Building Whispr",
        customStatus: "focus",
        customStatusEmoji: null,
        customStatusExpiresAt: null,
        displayName: "Ada",
        id: "user-1",
        nextUsernameChangeAt: null,
        status: "ONLINE",
        twoFactorEnabled: false,
        username: "ada",
      },
    });
  });

  it("accepts and returns the banner focal point", async () => {
    const response = await mobileProfileUpdateRoute(
      new Request("https://whispr.test/profile", {
        body: JSON.stringify({ bannerOffsetX: 0.3, bannerOffsetY: 0.72 }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async () => undefined,
        parseBody: parseJsonBody,
        updateProfile: async (userId, input) => ({
          avatarUrl: null,
          bannerColor: null,
          bannerOffsetX: input.bannerOffsetX ?? null,
          bannerOffsetY: input.bannerOffsetY ?? null,
          bannerUrl: "https://cdn.whispr.team/banner.webp",
          bio: null,
          customStatus: null,
          customStatusEmoji: null,
          customStatusExpiresAt: null,
          displayName: "Ada",
          email: "a@b.co",
          emailVerified: true,
          id: userId,
          status: "ONLINE" as const,
          twoFactorEnabled: false,
          username: "ada",
          usernameChangedAt: null,
        }),
      },
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as { user: Record<string, unknown> };
    assert.equal(body.user.bannerOffsetX, 0.3);
    assert.equal(body.user.bannerOffsetY, 0.72);
  });

  it("rejects forbidden profile fields", async () => {
    const response = await mobileProfileUpdateRoute(
      new Request("https://whispr.test/profile", {
        body: JSON.stringify({ email: "leak@example.com" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async () => undefined,
        parseBody: parseJsonBody,
        updateProfile: async () => {
          throw new Error("must not run");
        },
      },
    );
    assert.equal(response.status, 400);
  });
});
