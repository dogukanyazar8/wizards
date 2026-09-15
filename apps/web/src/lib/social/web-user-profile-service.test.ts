import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getWebUserProfile } from "./web-user-profile-service";

const user = {
  avatarUrl: "https://cdn.example/avatar.png",
  bannerColor: "#123456",
  bannerOffsetX: 0,
  bannerOffsetY: 1,
  bannerUrl: "https://cdn.example/banner.png",
  bio: "Private bio",
  createdAt: new Date("2026-08-13T10:00:00.000Z"),
  customStatus: "Shipping",
  customStatusEmoji: "🚀",
  customStatusExpiresAt: null,
  status: "ONLINE",
  deletedAt: null,
  displayName: "Subject",
  id: "subject",
  username: "subject",
};

describe("web user profile service", () => {
  it("hides status text, emoji and deadline for invisible and expired profiles", async () => {
    for (const subject of [
      { ...user, status: "INVISIBLE" },
      { ...user, customStatusExpiresAt: new Date("2000-01-01") },
    ]) {
      const profile = await getWebUserProfile(
        { requesterId: "viewer", serverId: null, userId: "subject" },
        {
          findUser: async () => subject,
          findServerMemberships: async () => [],
          resolveVisibility: async () =>
            new Map([["subject", { canViewPresence: true, canViewProfile: true }]]),
        },
      );
      assert.equal(profile.customStatus, null);
      assert.equal(profile.customStatusEmoji, null);
      assert.equal(profile.customStatusExpiresAt, null);
    }
  });
  it("returns not found before serializing a profile the viewer cannot read", async () => {
    await assert.rejects(
      getWebUserProfile(
        { requesterId: "viewer", serverId: null, userId: "subject" },
        {
          findServerMemberships: async () => {
            throw new Error("server lookup must not run");
          },
          findUser: async () => user,
          resolveVisibility: async () =>
            new Map([["subject", { canViewPresence: false, canViewProfile: false }]]),
        },
      ),
      (error: unknown) =>
        error instanceof Error && error.message === "User not found" && "status" in error,
    );
  });

  it("returns the existing profile shape after visibility and server membership checks", async () => {
    const profile = await getWebUserProfile(
      { requesterId: "viewer", serverId: "server", userId: "subject" },
      {
        findServerMemberships: async () => [
          { nickname: null, userId: "viewer" },
          { nickname: "Captain", userId: "subject" },
        ],
        findUser: async () => user,
        resolveVisibility: async () =>
          new Map([["subject", { canViewPresence: true, canViewProfile: true }]]),
      },
    );

    assert.deepEqual(profile, {
      avatarUrl: user.avatarUrl,
      bannerColor: user.bannerColor,
      bannerOffsetX: 0,
      bannerOffsetY: 1,
      bannerUrl: user.bannerUrl,
      bio: user.bio,
      createdAt: "2026-08-13T10:00:00.000Z",
      customStatus: user.customStatus,
      customStatusEmoji: user.customStatusEmoji,
      customStatusExpiresAt: null,
      displayName: user.displayName,
      id: user.id,
      serverNickname: "Captain",
      username: user.username,
    });
  });
});
