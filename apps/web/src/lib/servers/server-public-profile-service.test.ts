import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  SERVER_PUBLIC_PROFILE_SELECT,
  buildServerProfileMutualFriends,
  buildServerProfileAdmins,
  buildServerPublicProfile,
  countPublicVoiceRooms,
  getVisibleServerPublicProfileWithDatabase,
  resolveServerAdminRoleIds,
  setServerPublicProfilePresenceReaderForTest,
} from "@/lib/servers/server-public-profile-service";
import { setServerWeeklyMessageCountCacheForTest } from "@/lib/servers/server-weekly-message-count";
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

function buildChannel(overrides: Record<string, unknown> = {}) {
  return {
    _count: { voiceStates: 3 },
    category: null,
    categoryId: null,
    id: "c1",
    messages: [],
    name: "duyurular",
    permissionOverrides: [],
    type: "TEXT" as const,
    voiceStates: [],
    ...overrides,
  };
}

function buildSource(overrides: Record<string, unknown> = {}) {
  return {
    bannerUrl: null,
    channels: [
      buildChannel(),
      buildChannel({
        _count: { voiceStates: 14 },
        id: "c2",
        name: "topluluk-sesli",
        type: "VOICE" as const,
      }),
    ],
    category: "CALISMA" as const,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    description: "Yol haritasını burada tartışıyoruz.",
    discoverable: true,
    features: ["VERIFIED"],
    iconUrl: null,
    id: "s1",
    inviteCode: "abcd1234",
    isPublic: true,
    languages: ["tr", "en"],
    memberCount: 12_400,
    members: [],
    name: "Whispr Topluluk",
    ownerId: "owner-1",
    roles: [{ id: "r1", isDefault: true, name: "@everyone", permissions: OWNER_ROLE_PERMISSIONS }],
    shortName: null,
    tags: ["sohbet"],
    type: "COMMUNITY" as const,
    userServerSettings: [],
    vanityUrlCode: null,
    ...overrides,
  };
}

const EMPTY_VIEWER = {
  admins: [],
  mutualFriendCount: 0,
  mutualFriends: [],
  onlineCount: 1_200,
  upcomingEvent: null,
  viewerId: null,
  voiceRoomCount: 0,
  weeklyMessageCount: null,
};

describe("buildServerPublicProfile", () => {
  it("returns a bounded channel preview with an explicit continuation signal", () => {
    const source = buildSource({
      channels: Array.from({ length: 41 }, (_, index) =>
        buildChannel({ id: `channel-${index}`, name: `channel-${index}` }),
      ),
    });

    const profile = buildServerPublicProfile(source as never, EMPTY_VIEWER as never);

    assert.equal(SERVER_PUBLIC_PROFILE_SELECT.channels.take, 41);
    assert.equal(profile.channels.length, 40);
    assert.equal(profile.hasMoreChannels, true);
  });

  it("carries the server identity and classification through", () => {
    const profile = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);

    assert.equal(profile.serverId, "s1");
    assert.equal(profile.name, "Whispr Topluluk");
    assert.equal(profile.type, "COMMUNITY");
    assert.equal(profile.isPublic, true);
    assert.equal(profile.discoverable, true);
    assert.equal(profile.memberCount, 12_400);
    assert.equal(profile.onlineCount, 1_200);
    assert.equal(profile.category, "calisma");
    assert.deepEqual(profile.languages, ["tr", "en"]);
    assert.equal(profile.voiceRoomCount, 0);
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
        buildChannel({
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
        }),
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
      buildSource({
        members: [{ id: "m1", joinedAt: new Date("2026-02-03T04:05:06.000Z"), roles: [] }],
      }) as never,
      { ...EMPTY_VIEWER, viewerId: "u1" } as never,
    );

    assert.equal(guest.joined, false);
    assert.equal(member.joined, true);
  });

  it("passes the mutual friend summary through untouched", () => {
    const profile = buildServerPublicProfile(
      buildSource() as never,
      {
        ...EMPTY_VIEWER,
        mutualFriendCount: 12,
        mutualFriends: [{ avatarUrl: null, displayName: "Ada", id: "u9" }],
        viewerId: "u1",
      } as never,
    );

    assert.equal(profile.mutualFriendCount, 12);
    assert.equal(profile.mutualFriends.length, 1);
    assert.equal(profile.mutualFriends[0]?.displayName, "Ada");
  });

  /**
   * The handoff's `whispr.gg` was a mock: production is `whispr.team` and UAT is
   * a Railway host. The address now follows the deployment's own origin, so the
   * environment is an input rather than a constant baked into the build.
   */
  it("builds the address from the deployment origin and prefers the vanity code", () => {
    const env = { NEXTAUTH_URL: "https://wizardsweb-uat.up.railway.app" };
    const plain = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never, env);
    const vanity = buildServerPublicProfile(
      buildSource({ vanityUrlCode: "mobile-test" }) as never,
      EMPTY_VIEWER as never,
      env,
    );

    assert.equal(plain.inviteAddress, "wizardsweb-uat.up.railway.app/invite/abcd1234");
    assert.equal(vanity.inviteAddress, "wizardsweb-uat.up.railway.app/invite/mobile-test");
  });

  it("prints a production host without a scheme or a www prefix", () => {
    const profile = buildServerPublicProfile(
      buildSource({ vanityUrlCode: "mobile-test" }) as never,
      EMPTY_VIEWER as never,
      { APP_URL: "https://www.whispr.team/" },
    );

    assert.equal(profile.inviteAddress, "whispr.team/invite/mobile-test");
  });

  it("hides the address rather than printing a broken link when no origin is configured", () => {
    const profile = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never, {});

    assert.equal(profile.inviteAddress, null);
  });

  it("marks a channel private from what @everyone can see, not from the viewer", () => {
    // The viewer is the owner and can see everything; the channel is still
    // private, because @everyone cannot.
    const source = buildSource({
      channels: [
        buildChannel({
          id: "c9",
          name: "yonetim",
          permissionOverrides: [
            {
              allow: 0n,
              deny: PermissionBits.VIEW_CHANNEL,
              targetId: "r1",
              targetType: "ROLE" as const,
            },
          ],
        }),
      ],
      members: [{ id: "m1", joinedAt: new Date(), roles: [] }],
      roles: [
        { id: "r1", isDefault: true, name: "@everyone", permissions: MEMBER_BASE_PERMISSIONS },
      ],
    });

    const profile = buildServerPublicProfile(
      source as never,
      {
        ...EMPTY_VIEWER,
        viewerId: "owner-1",
      } as never,
    );

    assert.equal(profile.channels.length, 1);
    assert.equal(profile.channels[0]?.isPrivate, true);
  });

  it("derives lastActivityAt from the channel's newest message", () => {
    const source = buildSource({
      channels: [buildChannel({ messages: [{ createdAt: new Date("2026-07-31T10:00:00.000Z") }] })],
    });

    const profile = buildServerPublicProfile(source as never, EMPTY_VIEWER as never);

    assert.equal(profile.channels[0]?.lastActivityAt, "2026-07-31T10:00:00.000Z");
  });

  it("withholds voice participants from a non-member but shows them to a member", () => {
    const voiceStates = [
      { user: { avatarUrl: null, displayName: "Ada Lovelace", id: "u9", username: "ada" } },
    ];
    const guest = buildServerPublicProfile(
      buildSource({
        channels: [buildChannel({ id: "c2", name: "sesli", type: "VOICE" as const, voiceStates })],
      }) as never,
      EMPTY_VIEWER as never,
    );
    const member = buildServerPublicProfile(
      buildSource({
        channels: [buildChannel({ id: "c2", name: "sesli", type: "VOICE" as const, voiceStates })],
        members: [{ id: "m1", joinedAt: new Date(), roles: [] }],
      }) as never,
      { ...EMPTY_VIEWER, viewerId: "u1" } as never,
    );

    assert.deepEqual(guest.channels[0]?.participants, []);
    assert.equal(member.channels[0]?.participants.length, 1);
    assert.equal(member.channels[0]?.participants[0]?.shortName, "AL");
  });

  it("counts channels and live voice seats from the visible list only", () => {
    const profile = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);

    assert.equal(profile.channelCount, 2);
    // Only the voice channel reports a live count; a text channel is null.
    assert.equal(profile.voiceActiveCount, 14);
  });

  it("reports the viewer's own preferences, defaulting when no row exists", () => {
    const withoutRow = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);
    const withRow = buildServerPublicProfile(
      buildSource({
        userServerSettings: [
          {
            messageNotifications: "MENTIONS",
            muted: true,
            mutedUntil: null,
            starred: true,
          },
        ],
      }) as never,
      { ...EMPTY_VIEWER, viewerId: "u1" } as never,
    );

    assert.equal(withoutRow.starred, false);
    assert.equal(withoutRow.muted, false);
    assert.equal(withoutRow.notificationLevel, "all");
    assert.equal(withRow.starred, true);
    assert.equal(withRow.muted, true);
    assert.equal(withRow.notificationLevel, "mentions");
  });

  it("grants canManageServer to the owner and refuses it to a non-member", () => {
    const owner = buildServerPublicProfile(
      buildSource({ members: [{ id: "m1", joinedAt: new Date(), roles: [] }] }) as never,
      { ...EMPTY_VIEWER, viewerId: "owner-1" } as never,
    );
    const guest = buildServerPublicProfile(
      buildSource() as never,
      {
        ...EMPTY_VIEWER,
        viewerId: "owner-1",
      } as never,
    );

    assert.equal(owner.canManageServer, true);
    // Same user id, no membership row: the profile is a stranger's view.
    assert.equal(guest.canManageServer, false);
  });

  it("reports access as public or invite, never inventing approval", () => {
    const open = buildServerPublicProfile(buildSource() as never, EMPTY_VIEWER as never);
    const closed = buildServerPublicProfile(
      buildSource({ isPublic: false }) as never,
      EMPTY_VIEWER as never,
    );

    assert.equal(open.accessLevel, "public");
    assert.equal(closed.accessLevel, "invite");
  });
});

describe("buildServerProfileAdmins", () => {
  const members = [
    { user: { avatarUrl: null, displayName: "Zoe Admin", id: "u2", username: "zoe" } },
    { user: { avatarUrl: null, displayName: null, id: "owner-1", username: "owner" } },
    { user: { avatarUrl: null, displayName: "Ada Admin", id: "u3", username: "ada" } },
  ];
  const nowMs = Date.parse("2026-08-10T12:00:00.000Z");

  it("puts the owner first and sorts the rest by display name", () => {
    const admins = buildServerProfileAdmins(members, "owner-1", new Map(), new Set());

    assert.deepEqual(
      admins.map((admin) => admin.id),
      ["owner-1", "u3", "u2"],
    );
    assert.equal(admins[0]?.role, "owner");
    assert.equal(admins[1]?.role, "admin");
  });

  /**
   * A0.4: presence is the online *set* the card's own `onlineCount` is counted
   * from, not a last-seen window. A recent session is still only a last-seen
   * line — it can no longer contradict the count above it.
   */
  it("takes presence from the online set and leaves last-seen to the session row", () => {
    const lastSeen = new Map([
      ["u2", new Date(nowMs - 30_000)],
      ["u3", new Date(nowMs - 2 * 60 * 60 * 1000)],
    ]);

    const admins = buildServerProfileAdmins(members, "owner-1", lastSeen, new Set(["u3"]));
    const byId = new Map(admins.map((admin) => [admin.id, admin]));

    assert.equal(byId.get("u3")?.presence, "online");
    assert.equal(byId.get("u3")?.lastSeenAt, new Date(nowMs - 2 * 60 * 60 * 1000).toISOString());
    // Seen 30 seconds ago but not in the set: no live socket, so offline.
    assert.equal(byId.get("u2")?.presence, "offline");
    // Never seen at all: no session row, so no last-seen timestamp either.
    assert.equal(byId.get("owner-1")?.presence, "offline");
    assert.equal(byId.get("owner-1")?.lastSeenAt, null);
  });

  it("falls back to the username when a display name is missing", () => {
    const admins = buildServerProfileAdmins(members, "owner-1", new Map(), new Set());

    assert.equal(admins[0]?.displayName, "owner");
    assert.equal(admins[0]?.username, "owner");
  });
});

describe("resolveServerAdminRoleIds", () => {
  it("keeps only the roles that actually carry MANAGE_SERVER", () => {
    const ids = resolveServerAdminRoleIds([
      { id: "r1", isDefault: true, name: "@everyone", permissions: MEMBER_BASE_PERMISSIONS },
      { id: "r2", isDefault: false, name: "Yönetici", permissions: PermissionBits.MANAGE_SERVER },
    ]);

    assert.deepEqual(ids, ["r2"]);
  });
});

describe("discover profile mutual-friend enrichment", () => {
  const friendships = [
    {
      receiver: { avatarUrl: null, displayName: "Owner", id: "owner-1", username: "owner" },
      receiverId: "owner-1",
      sender: { avatarUrl: null, displayName: "Viewer", id: "viewer-1", username: "viewer" },
      senderId: "viewer-1",
    },
    {
      receiver: { avatarUrl: null, displayName: "Ada", id: "admin-1", username: "ada" },
      receiverId: "admin-1",
      sender: { avatarUrl: null, displayName: "Viewer", id: "viewer-1", username: "viewer" },
      senderId: "viewer-1",
    },
    {
      receiver: { avatarUrl: null, displayName: "Grace", id: "member-1", username: "grace" },
      receiverId: "member-1",
      sender: { avatarUrl: null, displayName: "Viewer", id: "viewer-1", username: "viewer" },
      senderId: "viewer-1",
    },
  ];

  it("marks owner and MANAGE_SERVER member admin; keeps invisible offline", () => {
    const friends = buildServerProfileMutualFriends(
      friendships,
      "viewer-1",
      "owner-1",
      [
        { roles: [], userId: "owner-1" },
        {
          roles: [{ role: { permissions: PermissionBits.MANAGE_SERVER } }],
          userId: "admin-1",
        },
        { roles: [], userId: "member-1" },
      ],
      new Map([
        ["owner-1", "ONLINE" as const],
        ["admin-1", "IDLE" as const],
        ["member-1", "INVISIBLE" as const],
      ]),
    );

    assert.deepEqual(
      friends.map(({ id, presence, role }) => ({ id, presence, role })),
      [
        { id: "owner-1", presence: "online", role: "admin" },
        { id: "admin-1", presence: "idle", role: "admin" },
        { id: "member-1", presence: "offline", role: "member" },
      ],
    );
  });
});

describe("discover profile voice-room count", () => {
  it("counts only VOICE channels visible to @everyone", () => {
    assert.equal(
      countPublicVoiceRooms(
        [
          { permissionOverrides: [] },
          {
            permissionOverrides: [
              {
                allow: 0n,
                deny: PermissionBits.VIEW_CHANNEL,
                targetId: "r1",
                targetType: "ROLE" as const,
              },
            ],
          },
        ],
        "owner-1",
        [{ id: "r1", isDefault: true, permissions: MEMBER_BASE_PERMISSIONS }],
      ),
      1,
    );
  });
});

function buildFakeDatabase(options: {
  adminMembers?: unknown[];
  friendRequestCount?: number;
  friendRequests?: unknown[];
  mutualMembers?: unknown[];
  onlineCount?: number;
  queryLog?: string[];
  server: Record<string, unknown> | null;
  serverQueries?: Record<string, unknown>[];
  voiceRooms?: unknown[];
  weeklyMessageCount?: number;
}) {
  const log = (name: string) => options.queryLog?.push(name);

  return {
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
    appSession: {
      groupBy: async () => {
        log("appSession.groupBy");
        return [];
      },
    },
    channel: {
      findMany: async () => {
        log("channel.findMany");
        return options.voiceRooms ?? [];
      },
    },
    friendRequest: {
      count: async () => {
        log("friendRequest.count");
        return options.friendRequestCount ?? 0;
      },
      findMany: async () => {
        log("friendRequest.findMany");
        return options.friendRequests ?? [];
      },
    },
    message: {
      count: async () => {
        log("message.count");
        return options.weeklyMessageCount ?? 0;
      },
    },
    scheduledEvent: {
      findFirst: async () => {
        log("scheduledEvent.findFirst");
        return null;
      },
    },
    server: {
      findUnique: async (args: Record<string, unknown>) => {
        log("server.findUnique");
        options.serverQueries?.push(args);
        return options.server;
      },
    },
    serverMember: {
      count: async () => options.onlineCount ?? 0,
      findMany: async (args: { where?: { userId?: unknown } }) => {
        log("serverMember.findMany");
        return args.where?.userId ? (options.mutualMembers ?? []) : (options.adminMembers ?? []);
      },
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
        members: [{ id: "m1", joinedAt: new Date("2026-02-03T04:05:06.000Z"), roles: [] }],
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

  it("derives voiceRoomCount from every public VOICE channel, including beyond the preview", async () => {
    const database = buildFakeDatabase({
      server: buildSource(),
      voiceRooms: [
        { permissionOverrides: [] },
        {
          permissionOverrides: [
            {
              allow: 0n,
              deny: PermissionBits.VIEW_CHANNEL,
              targetId: "r1",
              targetType: "ROLE",
            },
          ],
        },
      ],
    });

    const profile = await getVisibleServerPublicProfileWithDatabase(database, "s1", null);

    assert.equal(profile.voiceRoomCount, 1);
    assert.equal(profile.voiceActiveCount, 14);
  });

  it("fills mutual-friend owner/admin roles and Redis-normalized presence", async () => {
    const friendRequests = [
      {
        receiver: { avatarUrl: null, displayName: "Owner", id: "owner-1", username: "owner" },
        receiverId: "owner-1",
        sender: { avatarUrl: null, displayName: "Viewer", id: "viewer-1", username: "viewer" },
        senderId: "viewer-1",
      },
      {
        receiver: { avatarUrl: null, displayName: "Ada", id: "admin-1", username: "ada" },
        receiverId: "admin-1",
        sender: { avatarUrl: null, displayName: "Viewer", id: "viewer-1", username: "viewer" },
        senderId: "viewer-1",
      },
      {
        receiver: { avatarUrl: null, displayName: "Grace", id: "member-1", username: "grace" },
        receiverId: "member-1",
        sender: { avatarUrl: null, displayName: "Viewer", id: "viewer-1", username: "viewer" },
        senderId: "viewer-1",
      },
    ];
    setServerPublicProfilePresenceReaderForTest(
      async () =>
        new Map([
          ["owner-1", "ONLINE" as const],
          ["admin-1", "IDLE" as const],
          ["member-1", "INVISIBLE" as const],
        ]),
    );

    try {
      const database = buildFakeDatabase({
        friendRequestCount: 3,
        friendRequests,
        mutualMembers: [
          { roles: [], userId: "owner-1" },
          {
            roles: [{ role: { permissions: PermissionBits.MANAGE_SERVER } }],
            userId: "admin-1",
          },
          { roles: [], userId: "member-1" },
        ],
        server: buildSource(),
      });
      const profile = await getVisibleServerPublicProfileWithDatabase(database, "s1", "viewer-1");

      assert.deepEqual(
        profile.mutualFriends.map(({ id, presence, role }) => ({ id, presence, role })),
        [
          { id: "owner-1", presence: "online", role: "admin" },
          { id: "admin-1", presence: "idle", role: "admin" },
          { id: "member-1", presence: "offline", role: "member" },
        ],
      );
    } finally {
      setServerPublicProfilePresenceReaderForTest(null);
    }
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

/**
 * A0.3: the read model carries no `position`, so the mobile grouper takes the
 * order the route returns as the design's order. That only holds if the query
 * sorts by the *category's* position first — sorting by channel position alone
 * let a category whose channels happen to carry lower positions jump ahead of
 * the one the owner put first.
 */
describe("getVisibleServerPublicProfileWithDatabase channel ordering", () => {
  it("orders channels by category position before channel position", async () => {
    const serverQueries: Record<string, unknown>[] = [];
    const database = buildFakeDatabase({ server: buildSource(), serverQueries });

    await getVisibleServerPublicProfileWithDatabase(database, "s1", null);

    const select = serverQueries[0]?.select as { channels: { orderBy: unknown } };
    assert.deepEqual(select.channels.orderBy, [
      { category: { position: "asc" } },
      { position: "asc" },
      { id: "asc" },
    ]);
  });

  it("keeps the same ordering on the exported select the invite preview reuses", () => {
    assert.deepEqual(SERVER_PUBLIC_PROFILE_SELECT.channels.orderBy, [
      { category: { position: "asc" } },
      { position: "asc" },
      { id: "asc" },
    ]);
  });

  it("returns a lower-positioned channel of a later category after the earlier category's channels", () => {
    // The database does the sorting; what the builder must not do is reshuffle
    // it. Two categories whose channel positions run in the opposite direction.
    const profile = buildServerPublicProfile(
      buildSource({
        channels: [
          buildChannel({
            category: { id: "cat-1", name: "Genel" },
            categoryId: "cat-1",
            id: "c-genel",
            name: "genel",
          }),
          buildChannel({
            category: { id: "cat-2", name: "Arşiv" },
            categoryId: "cat-2",
            id: "c-arsiv",
            name: "arsiv",
          }),
        ],
      }) as never,
      EMPTY_VIEWER as never,
    );

    assert.deepEqual(
      profile.channels.map((channel) => channel.categoryName),
      ["Genel", "Arşiv"],
    );
  });
});

/**
 * A0.4: the dot next to an admin and the "N çevrimiçi" line above it now read
 * the same `server:<id>:online` set, so they cannot contradict each other.
 */
describe("getVisibleServerPublicProfileWithDatabase admin presence", () => {
  function presenceRedis(online: readonly string[], status = "ready") {
    return {
      expire: async () => undefined,
      sadd: async () => undefined,
      scard: async () => online.length,
      smismember: async (_key: string, ...members: string[]) =>
        members.map((member) => (online.includes(member) ? 1 : 0)),
      srem: async () => undefined,
      status,
    } as never;
  }

  const adminMembers = [
    { user: { avatarUrl: null, displayName: "Ada", id: "owner-1", username: "owner" } },
    { user: { avatarUrl: null, displayName: "Zoe", id: "u2", username: "zoe" } },
  ];

  /**
   * A signed-in viewer, because the admin block is no longer served to an
   * anonymous one -- and a stubbed weekly-count cache, so the read never
   * reaches for a real Redis while proving a presence rule.
   */
  async function loadWithPresence(online: readonly string[], status = "ready") {
    setOnlineServerMemberCountRedisForTest(presenceRedis(online, status));
    setServerWeeklyMessageCountCacheForTest({
      acquireLock: async () => true,
      read: async () => null,
      write: async () => undefined,
    });

    try {
      const database = buildFakeDatabase({ adminMembers, server: buildSource() });
      return await getVisibleServerPublicProfileWithDatabase(database, "s1", "viewer-1");
    } finally {
      setServerWeeklyMessageCountCacheForTest(null);
      setOnlineServerMemberCountRedisForTest(null);
    }
  }

  it("marks exactly the admins in the online set as online", async () => {
    const profile = await loadWithPresence(["u2"]);
    const byId = new Map(profile.admins.map((admin) => [admin.id, admin]));

    assert.equal(byId.get("u2")?.presence, "online");
    assert.equal(byId.get("owner-1")?.presence, "offline");
  });

  it("degrades every admin to offline exactly where the count degrades to zero", async () => {
    const profile = await loadWithPresence(["u2"], "connecting");

    assert.equal(profile.onlineCount, 0);
    assert.deepEqual(
      profile.admins.map((admin) => admin.presence),
      ["offline", "offline"],
    );
  });
});

describe("getVisibleServerPublicProfileWithDatabase query budget", () => {
  /**
   * Faz 1 §B6.2 and §E: the profile read must not open a query per channel. The
   * assertion is on the exact query list rather than a ceiling, so a future
   * per-channel or per-admin lookup fails here instead of only showing up as
   * latency on a large server.
   */
  async function countQueries(channelCount: number, viewerId: string | null) {
    // A cold cache every time: with a real Redis around, a warmed weekly-count
    // key would silently remove `message.count` from the budget and make this
    // assertion depend on test order.
    setServerWeeklyMessageCountCacheForTest({
      acquireLock: async () => true,
      read: async () => null,
      write: async () => undefined,
    });
    const queryLog: string[] = [];
    const channels = Array.from({ length: channelCount }, (_unused, index) =>
      buildChannel({ id: `c${index}`, name: `kanal-${index}` }),
    );
    const database = buildFakeDatabase({
      adminMembers: [
        { user: { avatarUrl: null, displayName: "Ada", id: "owner-1", username: "owner" } },
      ],
      queryLog,
      server: buildSource({ channels }),
    });

    try {
      await getVisibleServerPublicProfileWithDatabase(database, "s1", viewerId);
    } finally {
      setServerWeeklyMessageCountCacheForTest(null);
    }

    return queryLog;
  }

  it("issues the same queries for 1 channel as for 50", async () => {
    const small = await countQueries(1, null);
    const large = await countQueries(50, null);

    assert.deepEqual(small.sort(), large.sort());
    // The anonymous read no longer loads the admin block, so the two queries
    // that produced it are gone with it.
    assert.deepEqual(small.sort(), [
      "channel.findMany",
      "message.count",
      "scheduledEvent.findFirst",
      "server.findUnique",
    ]);
  });

  it("adds the admin and mutual-friend queries only for a signed-in viewer", async () => {
    const anonymous = await countQueries(20, null);
    const signedIn = await countQueries(20, "viewer-1");

    assert.equal(anonymous.length, 4);
    assert.equal(signedIn.length, 8);
    assert.deepEqual(signedIn.sort(), [
      "appSession.groupBy",
      "channel.findMany",
      "friendRequest.count",
      "friendRequest.findMany",
      "message.count",
      "scheduledEvent.findFirst",
      "server.findUnique",
      "serverMember.findMany",
    ]);
  });
});

/**
 * `servers/[serverId]/profile` is in `UNAUTHENTICATED_ROUTE_PATHS`. The admin
 * block is the only personal data the read model carries -- usernames, avatars,
 * live presence, last-seen timestamps -- and no anonymous consumer renders it
 * (the web profile card draws tags and counts only). It must not travel to a
 * caller without a session.
 */
describe("getVisibleServerPublicProfileWithDatabase anonymous exposure", () => {
  const ADMIN_MEMBERS = [
    { user: { avatarUrl: null, displayName: "Ada", id: "owner-1", username: "owner" } },
  ];

  async function load(viewerId: string | null) {
    setServerWeeklyMessageCountCacheForTest({
      acquireLock: async () => true,
      read: async () => null,
      write: async () => undefined,
    });

    try {
      const database = buildFakeDatabase({ adminMembers: ADMIN_MEMBERS, server: buildSource() });
      return await getVisibleServerPublicProfileWithDatabase(database, "s1", viewerId);
    } finally {
      setServerWeeklyMessageCountCacheForTest(null);
    }
  }

  it("withholds the admin block from an anonymous viewer", async () => {
    const profile = await load(null);

    assert.deepEqual(profile.admins, []);
  });

  it("still serves the admin block to a signed-in viewer", async () => {
    const profile = await load("viewer-1");

    assert.equal(profile.admins.length, 1);
    assert.equal(profile.admins[0]?.username, "owner");
  });

  it("leaks no username or last-seen timestamp anywhere in the anonymous payload", async () => {
    const profile = await load(null);
    const serialised = JSON.stringify(profile);

    // A future field that re-introduces the identity through another door
    // fails here rather than in production.
    assert.equal(serialised.includes("owner-1"), false);
    assert.equal(serialised.includes("lastSeenAt"), false);
  });
});
