import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getWebUserProfile } from "./web-user-profile-service";

const user = {
  avatarUrl: "https://cdn.example/avatar.png",
  bannerColor: "#123456",
  bannerUrl: "https://cdn.example/banner.png",
  bio: "Private bio",
  createdAt: new Date("2026-08-13T10:00:00.000Z"),
  customStatus: "Shipping",
  deletedAt: null,
  displayName: "Subject",
  id: "subject",
  username: "subject",
};

describe("web user profile service", () => {
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
      bannerUrl: user.bannerUrl,
      bio: user.bio,
      createdAt: "2026-08-13T10:00:00.000Z",
      customStatus: user.customStatus,
      displayName: user.displayName,
      id: user.id,
      serverNickname: "Captain",
      username: user.username,
    });
  });
});
