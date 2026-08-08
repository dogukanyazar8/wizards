import type { ChannelType, Prisma, PrismaClient } from "@wizards/db";
import type { ServerPublicProfile, ServerPublicProfileFriend } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getOnlineServerMemberCount } from "@/lib/workspace/unread-service";
import {
  PermissionBits,
  hasPermission,
  resolveChannelPermissions,
  type RolePermissionRecord,
} from "@/lib/workspace/permissions";

const PREVIEWABLE_CHANNEL_TYPES = [
  "TEXT",
  "VOICE",
  "ANNOUNCEMENT",
  "STAGE",
  "FORUM",
] as const satisfies readonly ChannelType[];

export const SERVER_PUBLIC_PROFILE_SELECT = {
  bannerUrl: true,
  channels: {
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
    select: {
      _count: { select: { voiceStates: true } },
      id: true,
      name: true,
      permissionOverrides: {
        select: { allow: true, deny: true, targetId: true, targetType: true },
      },
      type: true,
    },
    where: { parentId: null, type: { in: [...PREVIEWABLE_CHANNEL_TYPES] } },
  },
  description: true,
  discoverable: true,
  features: true,
  iconUrl: true,
  id: true,
  isPublic: true,
  memberCount: true,
  members: {
    select: {
      id: true,
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
  roles: {
    select: { id: true, isDefault: true, name: true, permissions: true },
    where: { isDefault: true },
  },
  shortName: true,
  type: true,
} satisfies Prisma.ServerSelect;

export type ServerPublicProfileSource = Prisma.ServerGetPayload<{
  select: typeof SERVER_PUBLIC_PROFILE_SELECT;
}>;

export type ServerPublicProfileViewer = {
  readonly mutualFriendCount: number;
  readonly mutualFriends: readonly ServerPublicProfileFriend[];
  readonly onlineCount: number;
  readonly viewerId: string | null;
};

function isVoiceChannel(type: ChannelType): boolean {
  return type === "VOICE" || type === "STAGE";
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
): ServerPublicProfile {
  const membership = server.members[0] ?? null;
  const roles: RolePermissionRecord[] = [
    ...server.roles,
    ...(membership?.roles.map((entry) => entry.role) ?? []),
  ];

  const channels = server.channels
    .map((channel) => {
      const permissions = resolveChannelPermissions({
        memberId: membership?.id ?? null,
        ownerId: server.ownerId,
        overrides: channel.permissionOverrides,
        roles,
        userId: viewer.viewerId ?? "",
      });
      const voice = isVoiceChannel(channel.type);

      return {
        liveCount: voice ? channel._count.voiceStates : channel.type === "FORUM" ? 0 : null,
        name: channel.name,
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

  return {
    bannerUrl: server.bannerUrl,
    channels,
    description: server.description ?? "",
    discoverable: server.discoverable,
    iconUrl: server.iconUrl,
    isPublic: server.isPublic,
    joined: membership !== null,
    memberCount: server.memberCount,
    mutualFriendCount: viewer.mutualFriendCount,
    mutualFriends: [...viewer.mutualFriends],
    name: server.name,
    onlineCount: viewer.onlineCount,
    serverId: server.id,
    shortName: server.shortName,
    type: server.type,
    verified: server.features.includes("VERIFIED"),
  };
}

export async function getServerPublicProfileWithDatabase(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile> {
  const server = await database.server.findUnique({
    select: {
      ...SERVER_PUBLIC_PROFILE_SELECT,
      members: {
        ...SERVER_PUBLIC_PROFILE_SELECT.members,
        where: viewerId === null ? { id: "" } : { userId: viewerId },
      },
    },
    where: { id: serverId },
  });

  if (!server) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  const viewer = await loadServerPublicProfileViewer(database, serverId, viewerId);

  return buildServerPublicProfile(server as ServerPublicProfileSource, viewer);
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
 * S3 binding decision 5: this and the discovery list's batch read must never
 * disagree about the same server's online count. `getOnlineServerMemberCount`
 * (unread-service.ts) already reads the same `server:<id>:online` Redis set
 * the discovery batch read does, so sourcing this from it -- instead of the
 * `serverMember.count` by `user.status` this used before S3 -- makes the two
 * surfaces agree by construction rather than by coincidence.
 */
async function loadServerPublicProfileViewer(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfileViewer> {
  if (viewerId === null) {
    return {
      mutualFriendCount: 0,
      mutualFriends: [],
      onlineCount: await getOnlineServerMemberCount(serverId),
      viewerId: null,
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

  return {
    mutualFriendCount,
    mutualFriends: mutualFriendships.map((friendship) => {
      const friend = friendship.senderId === viewerId ? friendship.receiver : friendship.sender;
      return {
        avatarUrl: friend.avatarUrl,
        displayName: friend.displayName?.trim() || friend.username,
        id: friend.id,
      };
    }),
    onlineCount,
    viewerId,
  };
}
