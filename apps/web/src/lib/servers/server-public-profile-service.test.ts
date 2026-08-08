import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  buildServerPublicProfile,
  getVisibleServerPublicProfileWithDatabase,
} from "@/lib/servers/server-public-profile-service";
import { MEMBER_BASE_PERMISSIONS, PermissionBits } from "@/lib/workspace/permissions";
import { setOnlineServerMemberCountRedisForTest } from "@/lib/workspace/unread-service";

// NOTE: deviates from the task-9 brief's literal fixture, which set this to
// `0n`. Per permissions.test.ts:114-127 ("respects an explicitly cleared
// @everyone role"), an explicit default role with a `0n` mask is a
// deliberately locked-down server and resolves VIEW_CHANNEL to false for
// every channel — the brief's own channel-visibility tests would then find
// no channels at all. Using the real member baseline here is what the tests'
// own names and the module's "is a hidden channel actually proven hidden?"
// self-review question require.
const OWNER_ROLE_PERMISSIONS = MEMBER_BASE_PERMISSIONS;

function buildSource(overrides: Record<string, unknown> = {}) {
  return {
    bannerUrl: null,
    channels: [
      {
        _count: { voiceStates: 3 },
        id: "c1",
        name: "duyurular",
        permissionOverrides: [],
        type: "TEXT" as const,
      },
      {
        _count: { voiceStates: 14 },
        id: "c2",
        name: "topluluk-sesli",
        permissionOverrides: [],
        type: "VOICE" as const,
      },
    ],
    description: "Yol haritasını burada tartışıyoruz.",
    discoverable: true,
    features: ["VERIFIED"],
    iconUrl: null,
    id: "s1",
    isPublic: true,
    memberCount: 12_400,
    members: [],
    name: "Whispr Topluluk",
    ownerId: "owner-1",
    roles: [{ id: "r1", isDefault: true, name: "@everyone", permissions: OWNER_ROLE_PERMISSIONS }],
    shortName: null,
    type: "COMMUNITY" as const,
    ...overrides,
  };
}

const EMPTY_VIEWER = {
  mutualFriendCount: 0,
  mutualFriends: [],
  onlineCount: 1_200,
  viewerId: null,
};

describe("buildServerPublicProfile", () => {
  it("carries the server identity and classification through", () => {
    const profile = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);

    assert.equal(profile.serverId, "s1");
    assert.equal(profile.name, "Whispr Topluluk");
    assert.equal(profile.type, "COMMUNITY");
    assert.equal(profile.isPublic, true);
    assert.equal(profile.discoverable, true);
    assert.equal(profile.memberCount, 12_400);
    assert.equal(profile.onlineCount, 1_200);
  });

  it("derives verified from the features array, not verificationLevel", () => {
    const verified = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);
    const plain = buildServerPublicProfile(
      buildSource({ features: [] }) as never,
      EMPTY_VIEWER as never,
    );

    assert.equal(verified.verified, true);
    assert.equal(plain.verified, false);
  });

  it("reports a voice channel's live count and leaves text channels null", () => {
    const profile = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);

    const text = profile.channels.find((channel) => channel.name === "duyurular");
    const voice = profile.channels.find((channel) => channel.name === "topluluk-sesli");

    assert.equal(text?.liveCount, null);
    assert.equal(text?.type, "text");
    assert.equal(voice?.liveCount, 14);
    assert.equal(voice?.type, "voice");
  });

  it("hides channels the default role cannot view", () => {
    const source = buildSource({
      channels: [
        {
          _count: { voiceStates: 0 },
          id: "c3",
          name: "gizli",
          permissionOverrides: [
            {
              allow: 0n,
              deny: PermissionBits.VIEW_CHANNEL,
              targetId: "r1",
              targetType: "ROLE" as const,
            },
          ],
          type: "TEXT" as const,
        },
      ],
      // Also deviates from the brief's literal `1n`: that value is
      // PermissionBits.ADMINISTRATOR (`1n << 0n`), which makes
      // resolveChannelPermissions short-circuit before overrides are ever
      // applied (see permissions.ts:196-198), so the deny override below
      // would be silently ignored and "gizli" would stay visible — the
      // opposite of what this test asserts. A non-admin baseline is required
      // for the override to have any effect at all.
      roles: [
        { id: "r1", isDefault: true, name: "@everyone", permissions: MEMBER_BASE_PERMISSIONS },
      ],
    });

    const profile = buildServerPublicProfile(source as never, EMPTY_VIEWER as never);

    assert.equal(
      profile.channels.some((channel) => channel.name === "gizli"),
      false,
    );
  });

  it("marks the viewer as joined only when a membership row is present", () => {
    const guest = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);
    const member = buildServerPublicProfile(
      buildSource({ members: [{ id: "m1", roles: [] }] }) as never,
      { ...EMPTY_VIEWER, viewerId: "u1" } as never,
    );

    assert.equal(guest.joined, false);
    assert.equal(member.joined, true);
  });

  it("passes the mutual friend summary through untouched", () => {
    const profile = buildServerPublicProfile(
      buildSource() as never,
      {
        mutualFriendCount: 12,
        mutualFriends: [{ avatarUrl: null, displayName: "Ada", id: "u9" }],
        onlineCount: 1_200,
        viewerId: "u1",
      } as never,
    );

    assert.equal(profile.mutualFriendCount, 12);
    assert.equal(profile.mutualFriends.length, 1);
    assert.equal(profile.mutualFriends[0]?.displayName, "Ada");
  });
});

function buildFakeDatabase(options: {
  friendRequestCount?: number;
  friendRequests?: unknown[];
  onlineCount?: number;
  server: Record<string, unknown> | null;
}) {
  return {
    friendRequest: {
      count: async () => options.friendRequestCount ?? 0,
      findMany: async () => options.friendRequests ?? [],
    },
    server: {
      findUnique: async () => options.server,
    },
    serverMember: {
      count: async () => options.onlineCount ?? 0,
    },
  } as never;
}

describe("getVisibleServerPublicProfileWithDatabase", () => {
  it("throws the same 404 as a missing server when the server does not exist", async () => {
    const database = buildFakeDatabase({ server: null });

    await assert.rejects(
      getVisibleServerPublicProfileWithDatabase(database, "s404", null),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "SERVER_NOT_FOUND");
        return true;
      },
    );
  });

  it("hides a private, non-discoverable server from an anonymous viewer behind a 404", async () => {
    const database = buildFakeDatabase({
      server: buildSource({ discoverable: false, isPublic: false }),
    });

    await assert.rejects(
      getVisibleServerPublicProfileWithDatabase(database, "s1", null),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "SERVER_NOT_FOUND");
        return true;
      },
    );
  });

  it("hides a private, non-discoverable server from a signed-in non-member behind a 404", async () => {
    const database = buildFakeDatabase({
      server: buildSource({ discoverable: false, isPublic: false }),
    });

    await assert.rejects(
      getVisibleServerPublicProfileWithDatabase(database, "s1", "viewer-1"),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        return true;
      },
    );
  });

  it("shows a private, non-discoverable server to a member", async () => {
    const database = buildFakeDatabase({
      server: buildSource({
        discoverable: false,
        isPublic: false,
        members: [{ id: "m1", roles: [] }],
      }),
    });

    const profile = await getVisibleServerPublicProfileWithDatabase(database, "s1", "viewer-1");

    assert.equal(profile.joined, true);
    assert.equal(profile.isPublic, false);
    assert.equal(profile.discoverable, false);
  });

  it("shows a public server to an anonymous viewer even though isPublic is the only true condition", async () => {
    const database = buildFakeDatabase({
      server: buildSource({ discoverable: false, isPublic: true }),
    });

    const profile = await getVisibleServerPublicProfileWithDatabase(database, "s1", null);

    assert.equal(profile.serverId, "s1");
  });

  it("shows a discoverable-but-not-public server to an anonymous viewer", async () => {
    const database = buildFakeDatabase({
      server: buildSource({ discoverable: true, isPublic: false }),
    });

    const profile = await getVisibleServerPublicProfileWithDatabase(database, "s1", null);

    assert.equal(profile.serverId, "s1");
  });
});

/**
 * S3 binding decision 5: onlineCount now sources from the same
 * `server:<id>:online` Redis set the discovery list's batch read uses
 * (unread-service.ts's `getOnlineServerMemberCount`), not from
 * `serverMember.count`. `buildFakeDatabase`'s `serverMember.count` stub above
 * is therefore no longer in this loop for `onlineCount` -- these tests
 * exercise the Redis path directly instead.
 */
describe("getVisibleServerPublicProfileWithDatabase online count", () => {
  it("reads onlineCount from the server's online-presence set for an anonymous viewer", async () => {
    setOnlineServerMemberCountRedisForTest({
      expire: async () => undefined,
      sadd: async () => undefined,
      scard: async () => 7,
      srem: async () => undefined,
      status: "ready",
    } as never);

    try {
      const database = buildFakeDatabase({ server: buildSource() });
      const profile = await getVisibleServerPublicProfileWithDatabase(database, "s1", null);

      assert.equal(profile.onlineCount, 7);
    } finally {
      setOnlineServerMemberCountRedisForTest(null);
    }
  });

  it("reads the same onlineCount for a signed-in viewer's parallel load", async () => {
    setOnlineServerMemberCountRedisForTest({
      expire: async () => undefined,
      sadd: async () => undefined,
      scard: async () => 3,
      srem: async () => undefined,
      status: "ready",
    } as never);

    try {
      const database = buildFakeDatabase({ server: buildSource() });
      const profile = await getVisibleServerPublicProfileWithDatabase(database, "s1", "viewer-1");

      assert.equal(profile.onlineCount, 3);
    } finally {
      setOnlineServerMemberCountRedisForTest(null);
    }
  });

  it("degrades to zero instead of throwing when redis is not ready", async () => {
    setOnlineServerMemberCountRedisForTest({
      expire: async () => undefined,
      sadd: async () => undefined,
      scard: async () => {
        throw new Error("should not be called once status is not ready");
      },
      srem: async () => undefined,
      status: "connecting",
    } as never);

    try {
      const database = buildFakeDatabase({ server: buildSource() });
      const profile = await getVisibleServerPublicProfileWithDatabase(database, "s1", null);

      assert.equal(profile.onlineCount, 0);
    } finally {
      setOnlineServerMemberCountRedisForTest(null);
    }
  });
});
