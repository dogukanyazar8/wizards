import type { ChannelType, MessageNotification, Prisma, PrismaClient } from "@wizards/db";
import { normalizeServerIconTone } from "@wizards/types";
import type {
  ServerNotificationLevel,
  ServerProfileAccessLevel,
  ServerPublicProfile,
  ServerPublicProfileAdmin,
  ServerPublicProfileFriend,
  ServerScheduledEvent,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { resolveAppOriginDisplayHost, type AppOriginEnv } from "@/lib/app-origin";
import { toCategoryKey } from "@/lib/discover/identity";
import { readPresenceState, type VisiblePresenceStatus } from "@/lib/presence";
import { getRedis } from "@/lib/redis";
import { getServerWeeklyMessageCount } from "@/lib/servers/server-weekly-message-count";
import {
  getOnlineServerMemberCount,
  getOnlineServerMemberIds,
} from "@/lib/workspace/unread-service";
import {
  PermissionBits,
  hasPermission,
  resolveChannelPermissions,
  resolveServerPermissions,
  type RolePermissionRecord,
} from "@/lib/workspace/permissions";
import { getUpcomingServerScheduledEventWithDatabase } from "@/lib/workspace/scheduled-event-service";
import {
  DEFAULT_SERVER_USER_SETTINGS,
  buildServerUserSettings,
} from "@/lib/workspace/server-user-settings-service";

const PREVIEWABLE_CHANNEL_TYPES = [
  "TEXT",
  "VOICE",
  "ANNOUNCEMENT",
  "STAGE",
  "FORUM",
] as const satisfies readonly ChannelType[];

/** 6e shows at most three avatars on a voice row before it switches to a count. */
const MAX_CHANNEL_PARTICIPANTS = 3;

/** 6e's YÖNETİCİLER list; a server with more than this is showing a sample. */
const MAX_PROFILE_ADMINS = 20;
const MAX_PROFILE_CHANNELS = 40;

/**
 * Presence is *not* derived from a last-seen window any more. The same card
 * prints `onlineCount` (Redis `server:<id>:online`) next to the admin list, and
 * a two-minute `AppSession.lastSeenAt` window could put "3 çevrimiçi" above an
 * all-offline admin list. `AppSession` still backs `lastSeenAt` — 6e's "2 saat
 * önce" line — but the boolean comes from the set the count comes from.
 */

export const SERVER_PUBLIC_PROFILE_SELECT = {
  bannerUrl: true,
  channels: {
    /**
     * Category position first: 6e groups the list by category and the mobile
     * grouper takes first appearance as the design's order. Ordering by
     * `channel.position` alone let a category whose channels happen to carry
     * lower positions jump ahead of the category the server owner put first —
     * `server-service.ts` already orders the workspace tree this way.
     */
    orderBy: [
      { category: { position: "asc" as const } },
      { position: "asc" as const },
      { id: "asc" as const },
    ],
    // Fetch one sentinel row so the response can distinguish a complete list
    // from a bounded preview without loading every channel in a public server.
    take: MAX_PROFILE_CHANNELS + 1,
    select: {
      _count: { select: { voiceStates: true } },
      category: { select: { id: true, name: true } },
      categoryId: true,
      id: true,
      /**
       * 6d/6e's right-hand column on a text row. A bounded `take: 1` nested
       * select rather than a query per channel: the client is generated with
       * `relationJoins`, so Prisma emits this as a LATERAL join inside the
       * same statement (schema.prisma:12).
       */
      messages: {
        orderBy: { createdAt: "desc" as const },
        select: { createdAt: true },
        take: 1,
        where: { deletedAt: null },
      },
      name: true,
      permissionOverrides: {
        select: { allow: true, deny: true, targetId: true, targetType: true },
      },
      type: true,
      /** Same LATERAL-join reasoning as `messages` above. */
      voiceStates: {
        orderBy: { joinedAt: "asc" as const },
        select: {
          user: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
        },
        take: MAX_CHANNEL_PARTICIPANTS,
      },
    },
    where: { parentId: null, type: { in: [...PREVIEWABLE_CHANNEL_TYPES] } },
  },
  category: true,
  createdAt: true,
  description: true,
  discoverable: true,
  features: true,
  iconColor: true,
  iconUrl: true,
  id: true,
  inviteCode: true,
  isPublic: true,
  languages: true,
  memberCount: true,
  members: {
    select: {
      id: true,
      joinedAt: true,
      roles: {
        select: {
          role: { select: { id: true, isDefault: true, name: true, permissions: true } },
        },
      },
    },
    take: 1,
  },
  name: true,
  ownerId: true,
  /**
   * Every role, not only the default one. `buildServerPublicProfile` still
   * resolves the viewer's permissions from the default role plus the roles
   * their own membership carries -- selecting all of them here would be a
   * privilege leak if they were fed into that merge, so the filter happens in
   * the builder rather than in the query.
   */
  roles: {
    select: { id: true, isDefault: true, name: true, permissions: true },
  },
  shortName: true,
  tags: true,
  type: true,
  userServerSettings: {
    select: {
      messageNotifications: true,
      muted: true,
      mutedUntil: true,
      starred: true,
    },
    take: 1,
  },
  vanityUrlCode: true,
} satisfies Prisma.ServerSelect;

export type ServerPublicProfileSource = Prisma.ServerGetPayload<{
  select: typeof SERVER_PUBLIC_PROFILE_SELECT;
}>;

export type ServerPublicProfileViewer = {
  readonly admins: readonly ServerPublicProfileAdmin[];
  readonly mutualFriendCount: number;
  readonly mutualFriends: readonly ServerPublicProfileFriend[];
  readonly onlineCount: number;
  readonly upcomingEvent: ServerScheduledEvent | null;
  readonly viewerId: string | null;
  readonly voiceRoomCount: number;
  readonly weeklyMessageCount: number | null;
};

type VoiceRoomVisibilitySource = {
  readonly permissionOverrides: readonly {
    readonly allow: bigint;
    readonly deny: bigint;
    readonly targetId: string;
    readonly targetType: "ROLE" | "USER";
  }[];
};

/**
 * `Channel` has no stored `isPrivate` flag. Public means the existing
 * permission resolver grants VIEW_CHANNEL to @everyone after channel
 * overrides; deriving it here keeps the profile and channel cards aligned.
 */
export function countPublicVoiceRooms(
  channels: readonly VoiceRoomVisibilitySource[],
  ownerId: string,
  defaultRoles: readonly RolePermissionRecord[],
) {
  return channels.filter((channel) => {
    const permissions = resolveChannelPermissions({
      memberId: null,
      ownerId,
      overrides: [...channel.permissionOverrides],
      roles: [...defaultRoles],
      userId: "",
    });
    return hasPermission(permissions, PermissionBits.VIEW_CHANNEL);
  }).length;
}

function isVoiceChannel(type: ChannelType): boolean {
  return type === "VOICE" || type === "STAGE";
}

/**
 * The avatar fallback both 6e lists use. There is no `User.shortName` column
 * (only servers carry one), so the two initials are derived from the display
 * name here instead of every client inventing its own rule.
 */
export function toProfileMemberShortName(displayName: string): string | null {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials.length > 0 ? initials : null;
}

/**
 * 6c's identity row and 6d's address line, e.g.
 * `wizardsweb-uat.up.railway.app/invite/mobile-test`.
 *
 * The handoff draws `whispr.gg/<code>`, and that literal shipped as a constant
 * — wrong in every environment, including production, whose domain is
 * `whispr.team`. The host now comes from the deployment's own canonical origin
 * (`resolveAppOrigin`), so UAT prints a UAT host without a second variable to
 * keep in sync.
 *
 * The `/invite/` segment is deliberate: this string is copied to the clipboard
 * and handed to the native share sheet, so it has to be a URL that resolves.
 * `/invite/<code>` accepts both a server's permanent `inviteCode` (mirrored
 * into a `ServerInvite` row at creation) and its `vanityUrlCode`
 * (`joinWorkspaceServerByInvite` falls back to the newest public link).
 *
 * `null` when the origin is not configured; both surfaces already hide the
 * address line and the share action rather than print a broken link.
 */
export function buildServerInviteAddress(
  server: {
    readonly inviteCode: string;
    readonly vanityUrlCode: string | null;
  },
  env: AppOriginEnv = process.env,
): string | null {
  const host = resolveAppOriginDisplayHost(env);
  if (host === null) {
    return null;
  }

  return `${host}/invite/${server.vanityUrlCode ?? server.inviteCode}`;
}

/**
 * `approval` is deliberately unreachable: no column in the schema carries an
 * approval gate today. 6e renders three states and the enum already has room
 * for the third, so adding one later is a service change, not a contract one.
 */
export function resolveServerAccessLevel(server: {
  readonly isPublic: boolean;
}): ServerProfileAccessLevel {
  return server.isPublic ? "public" : "invite";
}

type ViewerSettings = {
  readonly muted: boolean;
  readonly notificationLevel: ServerNotificationLevel;
  readonly starred: boolean;
};

function resolveViewerSettings(
  rows: readonly {
    readonly messageNotifications: MessageNotification;
    readonly muted: boolean;
    readonly mutedUntil: Date | null;
    readonly starred: boolean;
  }[],
): ViewerSettings {
  const settings = rows[0] ? buildServerUserSettings(rows[0]) : DEFAULT_SERVER_USER_SETTINGS;

  return {
    muted: settings.muted,
    notificationLevel: settings.notificationLevel,
    starred: settings.starred,
  };
}

/**
 * Pure so the permission filter can be asserted without a database. Three
 * surfaces read a server profile — the 2g card, the discovery card, and the
 * invite preview — and all of them go through this function so the filter can
 * never be written a second time and drift.
 */
export function buildServerPublicProfile(
  server: ServerPublicProfileSource,
  viewer: ServerPublicProfileViewer,
  /** Only the invite address reads it; passed in so the builder stays assertable. */
  env: AppOriginEnv = process.env,
): ServerPublicProfile {
  const membership = server.members[0] ?? null;
  const defaultRoles = server.roles.filter((role) => role.isDefault);
  const roles: RolePermissionRecord[] = [
    ...defaultRoles,
    ...(membership?.roles.map((entry) => entry.role) ?? []),
  ];

  const hasMoreChannels = server.channels.length > MAX_PROFILE_CHANNELS;
  const channels = server.channels
    .slice(0, MAX_PROFILE_CHANNELS)
    .map((channel) => {
      const permissions = resolveChannelPermissions({
        memberId: membership?.id ?? null,
        ownerId: server.ownerId,
        overrides: channel.permissionOverrides,
        roles,
        userId: viewer.viewerId ?? "",
      });
      // "Private" is a property of the channel, not of the viewer: what
      // @everyone can see, resolved without the viewer's own roles.
      const everyonePermissions = resolveChannelPermissions({
        memberId: null,
        ownerId: server.ownerId,
        overrides: channel.permissionOverrides,
        roles: defaultRoles,
        userId: "",
      });
      const voice = isVoiceChannel(channel.type);

      return {
        categoryId: channel.categoryId,
        categoryName: channel.category?.name ?? null,
        id: channel.id,
        isPrivate: !hasPermission(everyonePermissions, PermissionBits.VIEW_CHANNEL),
        lastActivityAt: channel.messages[0]?.createdAt.toISOString() ?? null,
        liveCount: voice ? channel._count.voiceStates : channel.type === "FORUM" ? 0 : null,
        name: channel.name,
        // A non-member gets the channel list but not who is sitting in it.
        participants:
          membership === null
            ? []
            : channel.voiceStates.map((state) => ({
                avatarUrl: state.user.avatarUrl,
                displayName: state.user.displayName?.trim() || state.user.username,
                id: state.user.id,
                shortName: toProfileMemberShortName(
                  state.user.displayName?.trim() || state.user.username,
                ),
              })),
        readOnly: !hasPermission(
          permissions,
          voice ? PermissionBits.CONNECT_VOICE : PermissionBits.SEND_MESSAGES,
        ),
        type: voice ? ("voice" as const) : ("text" as const),
        visible: hasPermission(permissions, PermissionBits.VIEW_CHANNEL),
      };
    })
    .filter((channel) => channel.visible)
    .map(({ visible: _visible, ...channel }) => channel);

  const settings = resolveViewerSettings(server.userServerSettings);
  const serverPermissions = resolveServerPermissions({
    ownerId: server.ownerId,
    roles,
    userId: viewer.viewerId ?? "",
  });

  return {
    accessLevel: resolveServerAccessLevel(server),
    admins: [...viewer.admins],
    bannerUrl: server.bannerUrl,
    canManageServer:
      membership !== null && hasPermission(serverPermissions, PermissionBits.MANAGE_SERVER),
    category: toCategoryKey(server.category),
    channelCount: channels.length,
    channels,
    createdAt: server.createdAt.toISOString(),
    description: server.description ?? "",
    discoverable: server.discoverable,
    hasMoreChannels,
    iconColor: normalizeServerIconTone(server.iconColor),
    iconUrl: server.iconUrl,
    inviteAddress: buildServerInviteAddress(server, env),
    isPublic: server.isPublic,
    joined: membership !== null,
    joinedAt: membership?.joinedAt.toISOString() ?? null,
    languages: server.languages,
    memberCount: server.memberCount,
    muted: settings.muted,
    mutualFriendCount: viewer.mutualFriendCount,
    mutualFriends: [...viewer.mutualFriends],
    name: server.name,
    notificationLevel: settings.notificationLevel,
    onlineCount: viewer.onlineCount,
    serverId: server.id,
    shortName: server.shortName,
    starred: settings.starred,
    tags: server.tags,
    type: server.type,
    upcomingEvent: viewer.upcomingEvent,
    verified: server.features.includes("VERIFIED"),
    voiceActiveCount: channels.reduce((total, channel) => total + (channel.liveCount ?? 0), 0),
    voiceRoomCount: viewer.voiceRoomCount,
    weeklyMessageCount: viewer.weeklyMessageCount,
  };
}

export async function getServerPublicProfileWithDatabase(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile> {
  const serverQuery = database.server.findUnique({
    select: {
      ...SERVER_PUBLIC_PROFILE_SELECT,
      members: {
        ...SERVER_PUBLIC_PROFILE_SELECT.members,
        where: viewerId === null ? { id: "" } : { userId: viewerId },
      },
      userServerSettings: {
        ...SERVER_PUBLIC_PROFILE_SELECT.userServerSettings,
        where: viewerId === null ? { id: "" } : { userId: viewerId },
      },
    },
    where: { id: serverId },
  });
  const voiceRoomsQuery = database.channel.findMany({
    select: {
      permissionOverrides: {
        select: { allow: true, deny: true, targetId: true, targetType: true },
      },
    },
    where: { serverId, type: "VOICE" },
  });
  const [server, voiceRooms] = await database.$transaction([serverQuery, voiceRoomsQuery]);

  if (!server) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  const source = server as ServerPublicProfileSource;
  const voiceRoomCount = countPublicVoiceRooms(
    voiceRooms,
    source.ownerId,
    source.roles.filter((role) => role.isDefault),
  );
  const viewer = await loadServerPublicProfileViewer(
    database,
    serverId,
    viewerId,
    source,
    voiceRoomCount,
  );

  return buildServerPublicProfile(source, viewer);
}

export async function getServerPublicProfile(
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile> {
  const { prisma } = await import("@wizards/db");
  return getServerPublicProfileWithDatabase(prisma, serverId, viewerId);
}

/**
 * The S2 profile card's access rule: visible when `isPublic || discoverable
 * || viewer is a member`, otherwise 404 — never 403, so a private server's
 * existence is never distinguishable from one that doesn't exist at all.
 *
 * This wraps `getServerPublicProfileWithDatabase` instead of gating inside
 * it, because that function also backs the invite preview, where a private,
 * non-discoverable server must stay previewable to someone holding a valid
 * invite even though none of the three conditions hold. Folding the check in
 * there would silently break that path. `isPublic`/`discoverable`/`joined`
 * are already present on the returned profile, so this costs no extra query.
 */
export async function getVisibleServerPublicProfileWithDatabase(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile> {
  const profile = await getServerPublicProfileWithDatabase(database, serverId, viewerId);

  if (!profile.isPublic && !profile.discoverable && !profile.joined) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  return profile;
}

export async function getVisibleServerPublicProfile(
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile> {
  const { prisma } = await import("@wizards/db");
  return getVisibleServerPublicProfileWithDatabase(prisma, serverId, viewerId);
}

/**
 * Owner plus everyone holding MANAGE_SERVER through a role. Resolved from the
 * server's own role rows (already fetched) so the member query can filter on a
 * role id list instead of scanning the membership table for a bitmask.
 */
export function resolveServerAdminRoleIds(
  roles: readonly RolePermissionRecord[],
): readonly string[] {
  return roles.flatMap((role) =>
    role.id && hasPermission(role.permissions, PermissionBits.MANAGE_SERVER) ? [role.id] : [],
  );
}

type AdminMemberRow = {
  readonly user: {
    readonly avatarUrl: string | null;
    readonly displayName: string | null;
    readonly id: string;
    readonly username: string;
  };
};

type MutualFriendshipRow = {
  readonly receiver: {
    readonly avatarUrl: string | null;
    readonly displayName: string | null;
    readonly id: string;
    readonly username: string;
  };
  readonly receiverId: string;
  readonly sender: {
    readonly avatarUrl: string | null;
    readonly displayName: string | null;
    readonly id: string;
    readonly username: string;
  };
  readonly senderId: string;
};

type MutualFriendMembershipRow = {
  readonly roles: readonly { readonly role: { readonly permissions: bigint } }[];
  readonly userId: string;
};

type ServerPublicProfilePresenceStatus = VisiblePresenceStatus | "INVISIBLE";

export function buildServerProfileMutualFriends(
  friendships: readonly MutualFriendshipRow[],
  viewerId: string,
  ownerId: string,
  memberships: readonly MutualFriendMembershipRow[],
  presenceByUserId: ReadonlyMap<string, ServerPublicProfilePresenceStatus>,
): ServerPublicProfileFriend[] {
  const membershipByUserId = new Map(
    memberships.map((membership) => [membership.userId, membership]),
  );

  return friendships.map((friendship) => {
    const friend = friendship.senderId === viewerId ? friendship.receiver : friendship.sender;
    const membership = membershipByUserId.get(friend.id);
    const admin =
      friend.id === ownerId ||
      (membership?.roles.some(({ role }) =>
        hasPermission(role.permissions, PermissionBits.MANAGE_SERVER),
      ) ??
        false);
    const status = presenceByUserId.get(friend.id) ?? "OFFLINE";

    return {
      avatarUrl: friend.avatarUrl,
      displayName: friend.displayName?.trim() || friend.username,
      id: friend.id,
      presence:
        status === "ONLINE"
          ? "online"
          : status === "OFFLINE" || status === "INVISIBLE"
            ? "offline"
            : "idle",
      role: admin ? "admin" : "member",
    };
  });
}

type MutualFriendPresenceReader = (
  userIds: readonly string[],
) => Promise<ReadonlyMap<string, ServerPublicProfilePresenceStatus>>;

let mutualFriendPresenceReaderForTest: MutualFriendPresenceReader | null = null;

export function setServerPublicProfilePresenceReaderForTest(
  reader: MutualFriendPresenceReader | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setServerPublicProfilePresenceReaderForTest is not available in production.");
  }
  mutualFriendPresenceReaderForTest = reader;
}

async function readMutualFriendPresence(userIds: readonly string[]) {
  if (mutualFriendPresenceReaderForTest) {
    return mutualFriendPresenceReaderForTest(userIds);
  }
  const state = await readPresenceState(
    getRedis(),
    userIds.map((userId) => ({ customStatus: null, status: "OFFLINE", userId })),
  );
  return new Map(
    userIds.map((userId) => [userId, state.presenceByUserId.get(userId)?.status ?? "OFFLINE"]),
  );
}

/** Pure: the presence rule and the owner/admin split, assertable without a row. */
export function buildServerProfileAdmins(
  members: readonly AdminMemberRow[],
  ownerId: string,
  lastSeenByUserId: ReadonlyMap<string, Date>,
  onlineUserIds: ReadonlySet<string>,
): ServerPublicProfileAdmin[] {
  return members
    .map((member) => {
      const displayName = member.user.displayName?.trim() || member.user.username;
      const lastSeenAt = lastSeenByUserId.get(member.user.id) ?? null;

      return {
        avatarUrl: member.user.avatarUrl,
        displayName,
        id: member.user.id,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
        presence: onlineUserIds.has(member.user.id) ? ("online" as const) : ("offline" as const),
        role: member.user.id === ownerId ? ("owner" as const) : ("admin" as const),
        shortName: toProfileMemberShortName(displayName),
        username: member.user.username,
      };
    })
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "owner" ? -1 : 1;
      }

      return left.displayName.localeCompare(right.displayName, "tr");
    });
}

async function loadServerProfileAdmins(
  database: PrismaClient,
  serverId: string,
  server: ServerPublicProfileSource,
): Promise<ServerPublicProfileAdmin[]> {
  const adminRoleIds = resolveServerAdminRoleIds(server.roles);
  const members = await database.serverMember.findMany({
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    select: {
      user: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
    },
    take: MAX_PROFILE_ADMINS,
    where: {
      serverId,
      OR: [
        { userId: server.ownerId },
        ...(adminRoleIds.length > 0
          ? [{ roles: { some: { roleId: { in: [...adminRoleIds] } } } }]
          : []),
      ],
    },
  });

  if (members.length === 0) {
    return [];
  }

  const adminUserIds = members.map((member) => member.user.id);
  /**
   * Two reads, neither of which scales with the (capped) admin list: the newest
   * `AppSession.lastSeenAt` per user for 6e's "en son görüldü" line — same
   * source as the DM last-seen contract, never a last message, which is
   * two-sided and lies — and one `SMISMEMBER` against the very set
   * `onlineCount` is counted from, which is what makes the dot and the count
   * agree by construction. `appSession.groupBy` is not a DB query per admin and
   * `getOnlineServerMemberIds` is not a DB query at all, so the route's query
   * budget is unchanged.
   */
  const [sessions, onlineUserIds] = await Promise.all([
    database.appSession.groupBy({
      by: ["userId"],
      where: { userId: { in: adminUserIds } },
      _max: { lastSeenAt: true },
    }),
    getOnlineServerMemberIds(serverId, adminUserIds),
  ]);

  const lastSeenByUserId = new Map<string, Date>();
  for (const session of sessions) {
    const lastSeenAt = session._max.lastSeenAt;
    if (lastSeenAt) {
      lastSeenByUserId.set(session.userId, lastSeenAt);
    }
  }

  return buildServerProfileAdmins(members, server.ownerId, lastSeenByUserId, onlineUserIds);
}

/**
 * S3 binding decision 5: this and the discovery list's batch read must never
 * disagree about the same server's online count. `getOnlineServerMemberCount`
 * (unread-service.ts) already reads the same `server:<id>:online` Redis set
 * the discovery batch read does, so sourcing this from it -- instead of the
 * `serverMember.count` by `user.status` this used before S3 -- makes the two
 * surfaces agree by construction rather than by coincidence.
 *
 * Everything here runs concurrently and none of it scales with the channel or
 * member count: the admin list is capped, the weekly count is one cached
 * aggregate, and the upcoming event is a single indexed row.
 */
async function loadServerPublicProfileViewer(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
  server: ServerPublicProfileSource,
  voiceRoomCount: number,
): Promise<ServerPublicProfileViewer> {
  /**
   * The admin block is the only personal data this read model carries:
   * usernames, avatars, live presence and a last-seen timestamp. Every screen
   * that renders it (6d/6e, the mobile invite preview) sits behind a session;
   * the web profile card renders none of it. `servers/[serverId]/profile` is
   * an unauthenticated route (route-contract.test.ts), so an anonymous caller
   * would otherwise be handed moderator identities and last-seen times for
   * every public server. Withholding it costs no consumer anything -- and it
   * drops `serverMember.findMany` + `appSession.groupBy` from the anonymous
   * read, taking it from five queries to three.
   */
  const [admins, upcomingEvent, weeklyMessageCount] = await Promise.all([
    viewerId === null
      ? Promise.resolve<ServerPublicProfileAdmin[]>([])
      : loadServerProfileAdmins(database, serverId, server),
    getUpcomingServerScheduledEventWithDatabase(database, serverId, viewerId),
    getServerWeeklyMessageCount(database, serverId),
  ]);

  if (viewerId === null) {
    return {
      admins,
      mutualFriendCount: 0,
      mutualFriends: [],
      onlineCount: await getOnlineServerMemberCount(serverId),
      upcomingEvent,
      viewerId: null,
      voiceRoomCount,
      weeklyMessageCount,
    };
  }

  const mutualFriendWhere = {
    OR: [
      {
        receiver: { serverMembers: { some: { serverId } } },
        senderId: viewerId,
      },
      {
        receiverId: viewerId,
        sender: { serverMembers: { some: { serverId } } },
      },
    ],
    status: "ACCEPTED" as const,
  };

  const [onlineCount, mutualFriendCount, mutualFriendships] = await Promise.all([
    getOnlineServerMemberCount(serverId),
    database.friendRequest.count({ where: mutualFriendWhere }),
    database.friendRequest.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        receiver: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
        receiverId: true,
        sender: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
        senderId: true,
      },
      take: 8,
      where: mutualFriendWhere,
    }),
  ]);
  const mutualFriendIds = mutualFriendships.map((friendship) =>
    friendship.senderId === viewerId ? friendship.receiverId : friendship.senderId,
  );
  const [mutualFriendMemberships, mutualFriendPresence] =
    mutualFriendIds.length === 0
      ? [[], new Map<string, VisiblePresenceStatus>()]
      : await Promise.all([
          database.serverMember.findMany({
            select: {
              roles: { select: { role: { select: { permissions: true } } } },
              userId: true,
            },
            where: { serverId, userId: { in: mutualFriendIds } },
          }),
          readMutualFriendPresence(mutualFriendIds),
        ]);

  return {
    admins,
    mutualFriendCount,
    mutualFriends: buildServerProfileMutualFriends(
      mutualFriendships,
      viewerId,
      server.ownerId,
      mutualFriendMemberships,
      mutualFriendPresence,
    ),
    onlineCount,
    upcomingEvent,
    viewerId,
    voiceRoomCount,
    weeklyMessageCount,
  };
}
