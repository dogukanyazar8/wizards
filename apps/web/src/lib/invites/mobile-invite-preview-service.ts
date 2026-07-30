import type { ChannelType, Prisma, PrismaClient } from "@wizards/db";
import type { MobileInvitePreviewChannel, MobileInvitePreviewResponse } from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  PermissionBits,
  hasPermission,
  resolveChannelPermissions,
  type RolePermissionRecord,
} from "@/lib/workspace/permissions";

type MobileInvitePreviewSourceChannel = MobileInvitePreviewChannel & {
  readonly visible: boolean;
};

export type MobileInvitePreviewSource = Omit<MobileInvitePreviewResponse, "channels"> & {
  readonly channels: readonly MobileInvitePreviewSourceChannel[];
};

const PREVIEWABLE_CHANNEL_TYPES = [
  "TEXT",
  "VOICE",
  "ANNOUNCEMENT",
  "STAGE",
  "FORUM",
] as const satisfies readonly ChannelType[];

const MOBILE_INVITE_PREVIEW_SELECT = {
  expiresAt: true,
  maxUses: true,
  server: {
    select: {
      _count: { select: { members: true } },
      bannerUrl: true,
      channels: {
        orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
        select: {
          _count: { select: { voiceStates: true } },
          id: true,
          name: true,
          permissionOverrides: {
            select: {
              allow: true,
              deny: true,
              targetId: true,
              targetType: true,
            },
          },
          type: true,
        },
        where: {
          parentId: null,
          type: { in: [...PREVIEWABLE_CHANNEL_TYPES] },
        },
      },
      description: true,
      features: true,
      iconUrl: true,
      id: true,
      members: {
        select: {
          id: true,
          roles: {
            select: {
              role: {
                select: {
                  id: true,
                  isDefault: true,
                  name: true,
                  permissions: true,
                },
              },
            },
          },
        },
        take: 1,
      },
      name: true,
      ownerId: true,
      roles: {
        select: {
          id: true,
          isDefault: true,
          name: true,
          permissions: true,
        },
        where: { isDefault: true },
      },
    },
  },
  targetUserId: true,
  uses: true,
} satisfies Prisma.ServerInviteSelect;

function isVoiceChannel(type: ChannelType): boolean {
  return type === "VOICE" || type === "STAGE";
}

function toPreviewChannelType(type: ChannelType): MobileInvitePreviewChannel["type"] {
  return isVoiceChannel(type) ? "voice" : "text";
}

export function buildMobileInvitePreviewResponse(
  source: MobileInvitePreviewSource,
): MobileInvitePreviewResponse {
  return {
    ...source,
    channels: source.channels
      .filter((channel) => channel.visible)
      .map(({ visible: _visible, ...channel }) => channel),
  };
}

function inviteCanBePreviewed(
  invite: {
    readonly expiresAt: Date | null;
    readonly maxUses: number | null;
    readonly targetUserId: string | null;
    readonly uses: number;
  },
  userId: string,
): boolean {
  if (invite.targetUserId !== null && invite.targetUserId !== userId) {
    return false;
  }

  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= Date.now()) {
    return false;
  }

  return invite.maxUses === null || invite.uses < invite.maxUses;
}

export async function getMobileInvitePreview(
  userId: string,
  slug: string,
): Promise<MobileInvitePreviewResponse> {
  const { prisma } = await import("@wizards/db");
  return getMobileInvitePreviewWithDatabase(prisma, userId, slug);
}

async function getMobileInvitePreviewWithDatabase(
  database: PrismaClient,
  userId: string,
  slug: string,
): Promise<MobileInvitePreviewResponse> {
  const select = {
    ...MOBILE_INVITE_PREVIEW_SELECT,
    server: {
      select: {
        ...MOBILE_INVITE_PREVIEW_SELECT.server.select,
        members: {
          ...MOBILE_INVITE_PREVIEW_SELECT.server.select.members,
          where: { userId },
        },
      },
    },
  } satisfies Prisma.ServerInviteSelect;
  const directInvite = await database.serverInvite.findUnique({
    select,
    where: { code: slug },
  });
  // A direct, globally unique invite code always wins. Only then can a stable
  // community vanity slug resolve to the newest public link invite.
  const invite =
    directInvite ??
    (await database.serverInvite.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select,
      where: {
        server: { vanityUrlCode: slug },
        targetUserId: null,
      },
    }));

  if (!invite || !inviteCanBePreviewed(invite, userId)) {
    throw new ApiError("Invite not found", 404, "INVITE_NOT_FOUND");
  }

  const serverId = invite.server.id;
  const mutualFriendWhere = {
    OR: [
      {
        receiver: { serverMembers: { some: { serverId } } },
        senderId: userId,
      },
      {
        receiverId: userId,
        sender: { serverMembers: { some: { serverId } } },
      },
    ],
    status: "ACCEPTED" as const,
  };
  const [onlineCount, mutualFriendCount, mutualFriendships] = await Promise.all([
    database.serverMember.count({
      where: {
        serverId,
        user: {
          status: {
            in: ["ONLINE", "IDLE", "DND"],
          },
        },
      },
    }),
    database.friendRequest.count({ where: mutualFriendWhere }),
    database.friendRequest.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        receiver: {
          select: { avatarUrl: true, displayName: true, id: true, username: true },
        },
        receiverId: true,
        sender: {
          select: { avatarUrl: true, displayName: true, id: true, username: true },
        },
        senderId: true,
      },
      take: 8,
      where: mutualFriendWhere,
    }),
  ]);

  const membership = invite.server.members[0] ?? null;
  const roles: RolePermissionRecord[] = [
    ...invite.server.roles,
    ...(membership?.roles.map((entry) => entry.role) ?? []),
  ];
  const channels: MobileInvitePreviewSourceChannel[] = invite.server.channels.map((channel) => {
    const permissions = resolveChannelPermissions({
      memberId: membership?.id ?? null,
      ownerId: invite.server.ownerId,
      overrides: channel.permissionOverrides,
      roles,
      userId,
    });
    const voice = isVoiceChannel(channel.type);

    return {
      liveCount: voice ? channel._count.voiceStates : channel.type === "FORUM" ? 0 : null,
      name: channel.name,
      readOnly: !hasPermission(
        permissions,
        voice ? PermissionBits.CONNECT_VOICE : PermissionBits.SEND_MESSAGES,
      ),
      type: toPreviewChannelType(channel.type),
      visible: hasPermission(permissions, PermissionBits.VIEW_CHANNEL),
    };
  });
  const mutualFriends = mutualFriendships.map((friendship) => {
    const friend = friendship.senderId === userId ? friendship.receiver : friendship.sender;
    return {
      avatarUrl: friend.avatarUrl,
      displayName: friend.displayName?.trim() || friend.username,
      id: friend.id,
    };
  });

  return buildMobileInvitePreviewResponse({
    bannerUrl: invite.server.bannerUrl,
    channels,
    description: invite.server.description ?? "",
    iconUrl: invite.server.iconUrl,
    joined: membership !== null,
    memberCount: invite.server._count.members,
    mutualFriendCount,
    mutualFriends,
    name: invite.server.name,
    onlineCount,
    serverId,
    slug,
    verified: invite.server.features.includes("VERIFIED"),
  });
}
