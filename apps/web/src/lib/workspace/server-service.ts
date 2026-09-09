import { ChannelType, MobileMediaUploadPurpose, prisma } from "@wizards/db";
import type { Prisma, ServerType, VerificationLevel } from "@wizards/db";
import type {
  CreateServerInput,
  DeleteServerInput,
  UpdateServerInput,
  WorkspaceMember,
  WorkspaceMemberCounts,
  WorkspaceMemberFilter,
  WorkspaceMemberPage,
  WorkspaceServerDetail,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getLiveKitRtcRegionKeys } from "@/lib/livekit/rtc-regions";
import { getSocketServer } from "@/lib/socket/runtime";
import { invalidateServerRoomIdsCache } from "@/lib/socket/server-room-cache";
import {
  ensureOwner,
  ensureServerPermission,
  getAccessContext,
} from "@/lib/workspace/access-context";
import { advanceServerAuthorizationRevision } from "@/lib/workspace/authorization-revision";
import { publishCommittedAuthorizationRevision } from "@/lib/workspace/authorization-revision-publication";
import { generateInviteCode } from "@/lib/workspace/invite-code";
import {
  getBoundedMobileServerUnreadSummary,
  getOnlineServerMemberCount,
  getServerChannelUnreadCounts,
  getServerMentionCount,
  getServerUnreadAndMentionCounts,
  getServerUnreadCount,
} from "@/lib/workspace/unread-service";
import { applyServerMediaSettings, getServerMediaSettings } from "@/lib/workspace/server-features";
import {
  MEMBER_BASE_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  PermissionBits,
  SERVER_ADMIN_PERMISSIONS,
  hasPermission,
  resolveChannelPermissions,
  resolveServerPermissions,
} from "@/lib/workspace/permissions";
import { deriveAccessLevel, mergeRoleRecords, toWorkspaceRole } from "@/lib/workspace/role-helpers";
import {
  buildMemberFilterWhere,
  buildMemberSearchWhere,
  classifyServerRoles,
  memberFilterNeedsPresence,
  memberFilterNeedsRoles,
} from "@/lib/workspace/member-filters";
import {
  mapCategories,
  mapInvites,
  mapMembers,
  mapServerSummary,
  parseServerIconTone,
  pickDefaultChannelId,
  readVisibleOnlineMemberUserIds,
  toWorkspaceChannel,
  withVisibleChannelAccess,
} from "@/lib/workspace/server-query-helpers";
import {
  MODERATOR_ROLE_COLOR,
  SERVER_DETAIL_MEMBER_LIMIT,
  SERVER_MEMBERS_PAGE_LIMIT,
} from "@/lib/workspace/workspace-constants";
import type { AccessContext, ChannelRecord } from "@/lib/workspace/workspace-types";
import {
  loadMobileChannelPreviews,
  type MobileChannelPreviewMap,
} from "@/lib/workspace/mobile-channel-previews";

const MOBILE_SERVER_DETAIL_CATEGORY_LIMIT = 20;
const MOBILE_SERVER_DETAIL_CHANNEL_PER_CATEGORY_LIMIT = 40;
const MOBILE_SERVER_DETAIL_CHANNEL_LIMIT = 80;
const MOBILE_MEMBER_NON_DEFAULT_ROLE_LIMIT = 25;
const MOBILE_MEMBER_ROLE_QUERY_LIMIT = MOBILE_MEMBER_NON_DEFAULT_ROLE_LIMIT + 2;

export type MobileWorkspaceServerDetailProjection = {
  categories: WorkspaceServerDetail["categories"];
  members: WorkspaceServerDetail["members"];
  server: Pick<
    WorkspaceServerDetail["server"],
    | "allowFileUploads"
    | "allowGifs"
    | "defaultChannelId"
    | "description"
    | "iconColor"
    | "iconUrl"
    | "id"
    | "memberCount"
    | "mentionCount"
    | "name"
    | "shortName"
    | "slowModeDelay"
    | "unreadCount"
  > & { onlineMemberCount: number; ownerUserId: string };
  ungroupedChannels: WorkspaceServerDetail["ungroupedChannels"];
};

function toMobileWorkspaceChannel(
  channel: ChannelRecord,
  unreadCounts: Map<string, { mentionCount: number; unreadCount: number }>,
  previews: MobileChannelPreviewMap,
): WorkspaceServerDetail["ungroupedChannels"][number] & {
  lastMessage: {
    author: { displayName: string | null; id: string; username: string };
    createdAt: string;
    id: string;
    text: string;
  } | null;
} {
  return {
    ...toWorkspaceChannel(channel, unreadCounts),
    lastMessage: previews.get(channel.id) ?? null,
  };
}

function mapMobileCategories(
  categories: Array<{
    channels: ChannelRecord[];
    id: string;
    name: string;
    position: number;
  }>,
  unreadCounts: Map<string, { mentionCount: number; unreadCount: number }>,
  previews: MobileChannelPreviewMap,
) {
  return categories.map((category) => ({
    ...category,
    channels: category.channels.map((channel) =>
      toMobileWorkspaceChannel(channel, unreadCounts, previews),
    ),
  }));
}

function ensureMobileMemberRoleBounds(
  members: Array<{ roles: Array<{ role: { isDefault: boolean } }> }>,
) {
  for (const member of members) {
    const defaultRoleCount = member.roles.filter(({ role }) => role.isDefault).length;
    const nonDefaultRoleCount = member.roles.length - defaultRoleCount;

    if (defaultRoleCount > 1 || nonDefaultRoleCount > MOBILE_MEMBER_NON_DEFAULT_ROLE_LIMIT) {
      throw new ApiError(
        "Mobile member role list exceeds the supported limit",
        409,
        "MOBILE_RESPONSE_LIMIT_EXCEEDED",
      );
    }
  }
}

export async function listWorkspaceServers(userId: string) {
  const memberships = await prisma.serverMember.findMany({
    orderBy: {
      joinedAt: "asc",
    },
    where: {
      server: {
        bans: {
          none: {
            userId,
          },
        },
      },
      userId,
    },
    select: {
      id: true,
      roles: {
        select: {
          role: {
            select: {
              color: true,
              id: true,
              isDefault: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
      server: {
        select: {
          _count: {
            select: {
              members: true,
            },
          },
          channels: {
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
              permissionOverrides: {
                select: {
                  allow: true,
                  deny: true,
                  targetId: true,
                  targetType: true,
                },
              },
            },
            where: {
              parentId: null,
              type: ChannelType.TEXT,
            },
          },
          iconUrl: true,
          features: true,
          iconColor: true,
          id: true,
          inviteCode: true,
          messageCharacterLimit: true,
          deletedMessageNoticeMinutes: true,
          name: true,
          ownerId: true,
          slowModeDelay: true,
          roles: {
            where: { isDefault: true },
            select: {
              color: true,
              id: true,
              isDefault: true,
              name: true,
              permissions: true,
            },
          },
          shortName: true,
          /**
           * 6c "Yıldızla". A bounded sub-select on the viewer's own settings
           * row rather than a second query: the row is lazy, so an absent one
           * simply reads as `starred: false`.
           */
          userServerSettings: {
            select: { starred: true },
            take: 1,
            where: { userId },
          },
        },
      },
    },
  });

  const serverIds = memberships.map((membership) => membership.server.id);
  const { mentionCounts, unreadCounts } = await getServerUnreadAndMentionCounts(userId, serverIds);

  const summaries = memberships.map((membership) => {
    const mediaSettings = getServerMediaSettings(membership.server.features);
    const roles = mergeRoleRecords(
      membership.server.roles,
      membership.roles.map((entry) => entry.role),
    );
    const defaultChannelId =
      membership.server.channels.find((channel) =>
        hasPermission(
          resolveChannelPermissions({
            memberId: membership.id,
            ownerId: membership.server.ownerId,
            roles,
            userId,
            overrides: channel.permissionOverrides,
          }),
          PermissionBits.VIEW_CHANNEL,
        ),
      )?.id ?? null;

    return mapServerSummary({
      accessLevel: deriveAccessLevel(membership.server.ownerId, userId, roles),
      allowFileUploads: mediaSettings.allowFileUploads,
      allowGifs: mediaSettings.allowGifs,
      allowMemberAdds: mediaSettings.allowMemberAdds,
      defaultChannelId,
      iconColor: parseServerIconTone(membership.server.iconColor),
      iconUrl: membership.server.iconUrl,
      id: membership.server.id,
      inviteCode: membership.server.inviteCode,
      memberCount: membership.server._count.members,
      messageCharacterLimit: membership.server.messageCharacterLimit,
      deletedMessageNoticeMinutes: membership.server.deletedMessageNoticeMinutes,
      mentionCount: mentionCounts.get(membership.server.id) ?? 0,
      name: membership.server.name,
      shortName: membership.server.shortName,
      slowModeDelay: membership.server.slowModeDelay,
      starred: membership.server.userServerSettings[0]?.starred ?? false,
      unreadCount: unreadCounts.get(membership.server.id) ?? 0,
    });
  });

  return sortWorkspaceServerSummaries(summaries);
}

/**
 * Faz 1 §C5: `starred desc`, then the order the query already produced (join
 * date ascending). Written as a stable sort over the query result rather than
 * an `orderBy` because the flag lives on a different table than the ordering
 * the rail otherwise keeps -- and mobile's Faz 4 rail derives its order from
 * this same rule.
 */
export function sortWorkspaceServerSummaries<T extends { readonly starred: boolean }>(
  summaries: readonly T[],
): T[] {
  return [...summaries].sort((left, right) => Number(right.starred) - Number(left.starred));
}

async function loadWorkspaceServerDetail(access: AccessContext): Promise<WorkspaceServerDetail> {
  const { serverId, userId } = access;
  const isAdmin = access.accessLevel !== "MEMBER";
  const canManageInvites = hasPermission(
    resolveServerPermissions(access),
    PermissionBits.MANAGE_INVITES,
  );

  const [server, invites, unreadCount, mentionCount, channelUnreadCounts] = await Promise.all([
    prisma.server.findUnique({
      where: {
        id: serverId,
      },
      select: {
        _count: {
          select: {
            members: true,
          },
        },
        categories: {
          orderBy: {
            position: "asc",
          },
          select: {
            channels: {
              orderBy: {
                position: "asc",
              },
              select: {
                bitrate: true,
                categoryId: true,
                id: true,
                locked: true,
                name: true,
                permissionOverrides: {
                  select: {
                    allow: true,
                    deny: true,
                    targetId: true,
                    targetType: true,
                  },
                },
                position: true,
                rtcRegion: true,
                slowModeDelay: true,
                topic: true,
                type: true,
                userLimit: true,
                videoQualityMode: true,
              },
              where: {
                parentId: null,
                type: {
                  in: [ChannelType.TEXT, ChannelType.VOICE],
                },
              },
            },
            id: true,
            name: true,
            position: true,
          },
        },
        channels: {
          orderBy: {
            position: "asc",
          },
          select: {
            bitrate: true,
            categoryId: true,
            id: true,
            locked: true,
            name: true,
            permissionOverrides: {
              select: {
                allow: true,
                deny: true,
                targetId: true,
                targetType: true,
              },
            },
            position: true,
            rtcRegion: true,
            slowModeDelay: true,
            topic: true,
            type: true,
            userLimit: true,
            videoQualityMode: true,
          },
          where: {
            categoryId: null,
            parentId: null,
            type: {
              in: [ChannelType.TEXT, ChannelType.VOICE],
            },
          },
        },
        description: true,
        discoverable: true,
        features: true,
        iconColor: true,
        iconUrl: true,
        id: true,
        inviteCode: true,
        isPublic: true,
        messageCharacterLimit: true,
        deletedMessageNoticeMinutes: true,
        members: {
          orderBy: [
            {
              joinedAt: "asc",
            },
            {
              id: "asc",
            },
          ],
          select: {
            communicationDisabledUntil: true,
            id: true,
            nickname: true,
            roles: {
              select: {
                role: {
                  select: {
                    color: true,
                    id: true,
                    name: true,
                    permissions: true,
                  },
                },
              },
            },
            user: {
              select: {
                avatarUrl: true,
                customStatus: true,
                displayName: true,
                id: true,
                status: true,
                username: true,
              },
            },
          },
          take: SERVER_DETAIL_MEMBER_LIMIT + 1,
        },
        name: true,
        ownerId: true,
        roles: {
          orderBy: [
            {
              position: "desc",
            },
            {
              createdAt: "asc",
            },
          ],
          select: {
            color: true,
            id: true,
            isDefault: true,
            managed: true,
            mentionable: true,
            name: true,
            permissions: true,
            position: true,
          },
        },
        shortName: true,
        slowModeDelay: true,
        tags: true,
        type: true,
        userServerSettings: {
          select: { starred: true },
          take: 1,
          where: { userId },
        },
      },
    }),
    canManageInvites
      ? prisma.serverInvite.findMany({
          orderBy: {
            createdAt: "desc",
          },
          select: {
            channelId: true,
            code: true,
            createdAt: true,
            creator: {
              select: {
                displayName: true,
                username: true,
              },
            },
            expiresAt: true,
            id: true,
            maxUses: true,
            targetUserId: true,
            uses: true,
          },
          where: {
            serverId,
          },
        })
      : Promise.resolve([]),
    getServerUnreadCount(userId, serverId),
    getServerMentionCount(userId, serverId),
    getServerChannelUnreadCounts(userId, serverId),
  ]);

  if (!server) {
    throw new ApiError("Server not found", 404);
  }

  const visibleCategories = server.categories.map((category) => ({
    ...category,
    channels: category.channels
      .map((channel) => withVisibleChannelAccess(access, channel))
      .filter((channel): channel is ChannelRecord => channel !== null),
  }));
  const visibleUngroupedChannelRows = server.channels
    .map((channel) => withVisibleChannelAccess(access, channel))
    .filter((channel): channel is ChannelRecord => channel !== null);
  const categories = mapCategories(visibleCategories, channelUnreadCounts);
  const ungroupedChannels = visibleUngroupedChannelRows.map((channel) =>
    toWorkspaceChannel(channel, channelUnreadCounts),
  );
  const mediaSettings = getServerMediaSettings(server.features);
  const defaultChannelId = pickDefaultChannelId({
    categories,
    ungroupedChannels,
  });

  const memberRows = server.members.slice(0, SERVER_DETAIL_MEMBER_LIMIT);
  const members = await mapMembers(server.ownerId, userId, memberRows);
  const roles = server.roles.map(toWorkspaceRole);

  return {
    categories,
    invites: mapInvites(invites),
    memberPage: {
      limit: SERVER_DETAIL_MEMBER_LIMIT,
      nextCursor:
        server.members.length > SERVER_DETAIL_MEMBER_LIMIT ? (memberRows.at(-1)?.id ?? null) : null,
    },
    members,
    roles,
    server: {
      accessLevel: access.accessLevel,
      allowFileUploads: mediaSettings.allowFileUploads,
      allowGifs: mediaSettings.allowGifs,
      allowMemberAdds: mediaSettings.allowMemberAdds,
      availableRtcRegions: getLiveKitRtcRegionKeys(),
      defaultChannelId,
      description: server.description,
      discoverable: server.discoverable,
      iconColor: parseServerIconTone(server.iconColor),
      iconUrl: server.iconUrl,
      id: server.id,
      inviteCode: server.inviteCode,
      isAdmin,
      isOwner: access.accessLevel === "OWNER",
      isPublic: server.isPublic,
      memberCount: server._count.members,
      messageCharacterLimit: server.messageCharacterLimit,
      deletedMessageNoticeMinutes: server.deletedMessageNoticeMinutes,
      mentionCount,
      name: server.name,
      shortName: server.shortName,
      slowModeDelay: server.slowModeDelay,
      starred: server.userServerSettings[0]?.starred ?? false,
      tags: server.tags,
      type: server.type,
      unreadCount,
    },
    ungroupedChannels,
  };
}

async function loadMobileWorkspaceServerDetail(access: AccessContext): Promise<{
  detail: MobileWorkspaceServerDetailProjection;
  hasMoreChannels: boolean;
}> {
  const { serverId, userId } = access;
  const server = await prisma.server.findUnique({
    where: {
      id: serverId,
    },
    select: {
      _count: {
        select: {
          members: true,
        },
      },
      categories: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          channels: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: {
              bitrate: true,
              categoryId: true,
              id: true,
              locked: true,
              name: true,
              permissionOverrides: {
                select: {
                  allow: true,
                  deny: true,
                  targetId: true,
                  targetType: true,
                },
              },
              position: true,
              rtcRegion: true,
              slowModeDelay: true,
              topic: true,
              type: true,
              userLimit: true,
              videoQualityMode: true,
            },
            take: MOBILE_SERVER_DETAIL_CHANNEL_PER_CATEGORY_LIMIT + 1,
            where: {
              parentId: null,
              type: {
                in: [ChannelType.TEXT, ChannelType.VOICE],
              },
            },
          },
          id: true,
          name: true,
          position: true,
        },
        take: MOBILE_SERVER_DETAIL_CATEGORY_LIMIT + 1,
      },
      channels: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          bitrate: true,
          categoryId: true,
          id: true,
          locked: true,
          name: true,
          permissionOverrides: {
            select: {
              allow: true,
              deny: true,
              targetId: true,
              targetType: true,
            },
          },
          position: true,
          rtcRegion: true,
          slowModeDelay: true,
          topic: true,
          type: true,
          userLimit: true,
          videoQualityMode: true,
        },
        take: MOBILE_SERVER_DETAIL_CHANNEL_LIMIT + 1,
        where: {
          categoryId: null,
          parentId: null,
          type: {
            in: [ChannelType.TEXT, ChannelType.VOICE],
          },
        },
      },
      description: true,
      features: true,
      iconColor: true,
      iconUrl: true,
      id: true,
      name: true,
      ownerId: true,
      shortName: true,
      slowModeDelay: true,
    },
  });

  if (!server) {
    throw new ApiError("Server not found", 404);
  }

  let hasMoreChannels =
    server.categories.length > MOBILE_SERVER_DETAIL_CATEGORY_LIMIT ||
    server.channels.length > MOBILE_SERVER_DETAIL_CHANNEL_LIMIT ||
    server.categories
      .slice(0, MOBILE_SERVER_DETAIL_CATEGORY_LIMIT)
      .some(
        (category) => category.channels.length > MOBILE_SERVER_DETAIL_CHANNEL_PER_CATEGORY_LIMIT,
      );
  const visibleCategoryRows = server.categories
    .slice(0, MOBILE_SERVER_DETAIL_CATEGORY_LIMIT)
    .map((category) => ({
      ...category,
      channels: category.channels
        .slice(0, MOBILE_SERVER_DETAIL_CHANNEL_PER_CATEGORY_LIMIT)
        .map((channel) => withVisibleChannelAccess(access, channel))
        .filter((channel): channel is ChannelRecord => channel !== null),
      hasChannels: category.channels.length > 0,
    }))
    // A category whose channels are all hidden from this viewer stays hidden, but
    // a genuinely empty one is real and must be returned — it is the only way a
    // manager ever sees the category they just created.
    .filter((category) => category.channels.length > 0 || !category.hasChannels);
  const visibleUngroupedRows = server.channels
    .slice(0, MOBILE_SERVER_DETAIL_CHANNEL_LIMIT)
    .map((channel) => withVisibleChannelAccess(access, channel))
    .filter((channel): channel is ChannelRecord => channel !== null);

  let remainingChannelSlots = MOBILE_SERVER_DETAIL_CHANNEL_LIMIT;
  const boundedCategoryRows = visibleCategoryRows.map((category) => {
    const channels = category.channels.slice(0, remainingChannelSlots);
    if (channels.length < category.channels.length) {
      hasMoreChannels = true;
    }
    remainingChannelSlots -= channels.length;

    return { ...category, channels };
  });
  const boundedUngroupedRows = visibleUngroupedRows.slice(0, remainingChannelSlots);
  if (boundedUngroupedRows.length < visibleUngroupedRows.length) {
    hasMoreChannels = true;
  }

  const visibleTextChannelIds = [
    ...boundedCategoryRows.flatMap((category) => category.channels),
    ...boundedUngroupedRows,
  ]
    .filter((channel) => channel.type === ChannelType.TEXT)
    .map((channel) => channel.id);
  const visibleChannelIds = [
    ...boundedCategoryRows.flatMap((category) => category.channels),
    ...boundedUngroupedRows,
  ].map((channel) => channel.id);
  const [unreadSummary, onlineMemberCount, channelPreviews] = await Promise.all([
    getBoundedMobileServerUnreadSummary(userId, serverId, visibleTextChannelIds),
    getOnlineServerMemberCount(serverId),
    loadMobileChannelPreviews(visibleChannelIds),
  ]);
  const categories = mapMobileCategories(
    boundedCategoryRows,
    unreadSummary.channelUnreadCounts,
    channelPreviews,
  );
  const ungroupedChannels = boundedUngroupedRows.map((channel) =>
    toMobileWorkspaceChannel(channel, unreadSummary.channelUnreadCounts, channelPreviews),
  );
  const mediaSettings = getServerMediaSettings(server.features);

  return {
    detail: {
      categories,
      // The channel list screen never rendered this list; the member surfaces
      // page through `/servers/:id/members` instead. Dropping it here removes
      // the member, role, and user joins from every server open.
      members: [],
      server: {
        allowFileUploads: mediaSettings.allowFileUploads,
        allowGifs: mediaSettings.allowGifs,
        defaultChannelId: pickDefaultChannelId({ categories, ungroupedChannels }),
        description: server.description,
        // K10: mobil ekranlar bu pakette değişmiyor; iki alan yalnızca
        // **opsiyonel** olarak yanıta biniyor, böylece eski istemci sürümü de
        // yeni yanıtı ayrıştırmaya devam ediyor.
        iconColor: parseServerIconTone(server.iconColor),
        iconUrl: server.iconUrl,
        id: server.id,
        memberCount: server._count.members,
        mentionCount: unreadSummary.mentionCount,
        name: server.name,
        onlineMemberCount,
        ownerUserId: server.ownerId,
        shortName: server.shortName,
        slowModeDelay: server.slowModeDelay,
        unreadCount: unreadSummary.unreadCount,
      },
      ungroupedChannels,
    },
    hasMoreChannels,
  };
}

export async function getWorkspaceServerDetailWithAccess(
  userId: string,
  serverId: string,
): Promise<{ access: AccessContext; detail: WorkspaceServerDetail }> {
  const access = await getAccessContext(userId, serverId);
  const detail = await loadWorkspaceServerDetail(access);

  return { access, detail };
}

export async function getMobileWorkspaceServerDetailWithAccess(
  userId: string,
  serverId: string,
): Promise<{
  access: AccessContext;
  detail: MobileWorkspaceServerDetailProjection;
  hasMoreChannels: boolean;
}> {
  const access = await getAccessContext(userId, serverId);
  const result = await loadMobileWorkspaceServerDetail(access);

  return { access, ...result };
}

export async function getWorkspaceServerDetail(
  userId: string,
  serverId: string,
): Promise<WorkspaceServerDetail> {
  return (await getWorkspaceServerDetailWithAccess(userId, serverId)).detail;
}

type WorkspaceMemberWithAuthorizationRoles = {
  authorizationRoles: Array<{
    id: string;
    isDefault: boolean;
    managed: boolean;
    permissions: bigint;
  }>;
  member: WorkspaceMember;
};

export type WorkspaceServerMemberListOptions = {
  cursor?: string;
  filter?: WorkspaceMemberFilter;
  limit?: number;
  q?: string;
};

/**
 * Çip seçimini bir Prisma `where` parçasına indirger (Ş2, SPEC-SUNUCU §8.6).
 *
 * Rol ve presence çözümü **yalnız** o çip istendiğinde yapılıyor: `all` çipi ne rol tablosunu
 * okur ne Redis'e gider, ki bugünkü filtresiz liste bir satır bile yavaşlamasın.
 */
async function buildServerMemberFilterWhere(
  access: AccessContext,
  filter: WorkspaceMemberFilter,
): Promise<Prisma.ServerMemberWhereInput> {
  if (filter === "all") {
    return {};
  }
  if (filter === "owner") {
    return { userId: access.ownerId };
  }

  const { serverId, userId } = access;
  const classification = memberFilterNeedsRoles(filter)
    ? classifyServerRoles(
        await prisma.role.findMany({
          select: { id: true, permissions: true },
          where: { serverId },
        }),
      )
    : { adminRoleIds: [], moderatorRoleIds: [] };
  const onlineUserIds = memberFilterNeedsPresence(filter)
    ? await readVisibleOnlineMemberUserIds(
        userId,
        (
          await prisma.serverMember.findMany({
            select: { user: { select: { customStatus: true, id: true } } },
            where: { serverId },
          })
        ).map((row) => ({ customStatus: row.user.customStatus, userId: row.user.id })),
      )
    : [];

  return buildMemberFilterWhere(filter, {
    ...classification,
    onlineUserIds,
    ownerId: access.ownerId,
  });
}

async function loadWorkspaceServerMembers(
  access: AccessContext,
  options: WorkspaceServerMemberListOptions = {},
  projection: { boundMobileRoles?: boolean } = {},
): Promise<{
  memberCounts: WorkspaceMemberCounts;
  memberPage: WorkspaceMemberPage;
  members: WorkspaceMemberWithAuthorizationRoles[];
}> {
  const { serverId, userId } = access;
  const filter = options.filter ?? "all";
  const searchWhere = buildMemberSearchWhere(options.q);
  const filterWhere = await buildServerMemberFilterWhere(access, filter);
  const scopeWhere: Prisma.ServerMemberWhereInput = {
    AND: [searchWhere, filterWhere],
    serverId,
  };
  const isUnscoped = filter === "all" && Object.keys(searchWhere).length === 0;
  const limit = Math.min(
    Math.max(options.limit ?? SERVER_MEMBERS_PAGE_LIMIT, 1),
    SERVER_MEMBERS_PAGE_LIMIT,
  );
  let cursorFilter: Prisma.ServerMemberWhereInput = {};

  if (options.cursor) {
    const cursorMember = await prisma.serverMember.findFirst({
      where: {
        id: options.cursor,
        serverId,
      },
      select: {
        id: true,
        joinedAt: true,
      },
    });

    if (!cursorMember) {
      throw new ApiError("Member cursor not found", 404, "NOT_FOUND");
    }

    cursorFilter = {
      OR: [
        {
          joinedAt: {
            gt: cursorMember.joinedAt,
          },
        },
        {
          id: {
            gt: cursorMember.id,
          },
          joinedAt: cursorMember.joinedAt,
        },
      ],
    };
  }

  const rows = await prisma.serverMember.findMany({
    orderBy: [
      {
        joinedAt: "asc",
      },
      {
        id: "asc",
      },
    ],
    select: {
      communicationDisabledUntil: true,
      id: true,
      nickname: true,
      roles: {
        ...(projection.boundMobileRoles
          ? {
              orderBy: [{ role: { position: "desc" as const } }, { roleId: "asc" as const }],
              take: MOBILE_MEMBER_ROLE_QUERY_LIMIT,
            }
          : {}),
        select: {
          role: {
            select: {
              color: true,
              id: true,
              isDefault: true,
              managed: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
      user: {
        select: {
          avatarUrl: true,
          customStatus: true,
          displayName: true,
          id: true,
          status: true,
          username: true,
        },
      },
    },
    take: limit + 1,
    // `AND` şart: imleç, arama ve `moderator` çipinin üçü de kendi `OR`/`roles` parçasını
    // taşıyor. Tek nesneye yaymak son yazanın öncekini sessizce ezmesi demekti.
    where: { AND: [cursorFilter, searchWhere, filterWhere], serverId },
  });
  if (projection.boundMobileRoles) {
    ensureMobileMemberRoleBounds(rows);
  }
  const pageRows = rows.slice(0, limit);
  const [members, total, filtered] = await Promise.all([
    mapMembers(access.ownerId, userId, pageRows),
    prisma.serverMember.count({ where: { serverId } }),
    // Filtresiz çağrıda ikinci sayım aynı sayıyı iki kez sorardı.
    isUnscoped ? Promise.resolve(null) : prisma.serverMember.count({ where: scopeWhere }),
  ]);

  return {
    memberCounts: { filtered: filtered ?? total, total },
    memberPage: {
      limit,
      nextCursor: rows.length > limit ? (pageRows.at(-1)?.id ?? null) : null,
    },
    members: members.map((member, index) => ({
      authorizationRoles: pageRows[index]!.roles.map(({ role }) => ({
        id: role.id,
        isDefault: role.isDefault,
        managed: role.managed,
        permissions: role.permissions,
      })),
      member,
    })),
  };
}

export async function listWorkspaceServerMembersWithAccess(
  userId: string,
  serverId: string,
  options: WorkspaceServerMemberListOptions = {},
): Promise<{
  access: AccessContext;
  memberCounts: WorkspaceMemberCounts;
  memberPage: WorkspaceMemberPage;
  members: WorkspaceMemberWithAuthorizationRoles[];
}> {
  const access = await getAccessContext(userId, serverId);
  const result = await loadWorkspaceServerMembers(access, options);

  return { access, ...result };
}

export async function listMobileWorkspaceServerMembersWithAccess(
  userId: string,
  serverId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
): Promise<{
  access: AccessContext;
  memberPage: WorkspaceMemberPage;
  members: WorkspaceMemberWithAuthorizationRoles[];
}> {
  const access = await getAccessContext(userId, serverId);
  // K10: mobil yanıtı `strict` bir şemadan geçiyor ve `q`/filtre çipleri mobil ekranlarda
  // yok. Sayaç web dalında kalır; mobil dal bugünkü şeklini korur.
  const { memberCounts: _webOnlyCounts, ...result } = await loadWorkspaceServerMembers(
    access,
    options,
    { boundMobileRoles: true },
  );

  return { access, ...result };
}

export async function listWorkspaceServerMembers(
  userId: string,
  serverId: string,
  options: WorkspaceServerMemberListOptions = {},
) {
  const result = await listWorkspaceServerMembersWithAccess(userId, serverId, options);

  return {
    memberCounts: result.memberCounts,
    memberPage: result.memberPage,
    members: result.members.map(({ member }) => member),
  };
}

export type CreateWorkspaceServerOptions = {
  readonly discoverable?: boolean;
  readonly isPublic?: boolean;
  readonly type?: ServerType;
  readonly verificationLevel?: VerificationLevel;
};

/**
 * `discoverable` yalnız `isPublic` açıkken bir anlam taşır — `resolveVisibilityUpdateData`'nın
 * `PATCH` tarafında zorladığı değişmezin oluşturma tarafındaki eşi (Ş10 §1.4).
 *
 * Ayrı bir fonksiyon, çünkü admin yolu iki alanı `options` üzerinden, tüketici yolu ise
 * gövdeden verir; kural ikisinde de aynı olmak zorunda. Saf, çünkü "`discoverable:true` +
 * `isPublic:false` gövdesi ne yazar" sorusunun cevabı veritabanı olmadan okunabilmeli.
 */
export function resolveVisibilityCreateData(
  input: ServerVisibilityFields,
  options: ServerVisibilityFields = {},
): { discoverable: boolean; isPublic: boolean } {
  const isPublic = options.isPublic ?? input.isPublic ?? false;
  const discoverable = options.discoverable ?? input.discoverable ?? false;

  return { discoverable: isPublic ? discoverable : false, isPublic };
}

/**
 * Split out of the transaction so the privileged defaults can be asserted
 * without a database. The consumer route passes no `options`; `type` and
 * `verificationLevel` therefore stay admin-only, while görünürlük ve Ş10'un dört
 * yeni alanı gövdeden okunur.
 */
export function buildServerCreateData(
  userId: string,
  input: CreateServerInput,
  inviteCode: string,
  options: CreateWorkspaceServerOptions = {},
): Prisma.ServerUncheckedCreateInput {
  const visibility = resolveVisibilityCreateData(input, options);

  return {
    description: input.description ?? null,
    discoverable: visibility.discoverable,
    features: applyServerMediaSettings([], {
      allowFileUploads: input.allowFileUploads,
      allowGifs: input.allowGifs,
      allowMemberAdds: input.allowMemberAdds,
    }),
    /**
     * K2/Ş10 §1.1: swatch seçimi kolona yazılır. Alan yoksa kolon `null` kalır ve ikon
     * rengi kısa addan deterministik türetilir — "renk seçilmedi" ile "renk kaldırıldı"
     * oluşturma anında aynı şeydir, ayrımı `PATCH` tarafı taşır.
     */
    iconColor: input.iconColor ?? null,
    iconUrl: input.iconUrl ?? null,
    inviteCode,
    isPublic: visibility.isPublic,
    // The founding member row is created inside the same transaction, so the
    // counter starts at one instead of zero plus a follow-up increment.
    memberCount: 1,
    name: input.name.trim(),
    ownerId: userId,
    shortName: input.shortName ?? null,
    type: options.type ?? "PERSONAL",
    verificationLevel: options.verificationLevel ?? "NONE",
    // `undefined` bırakmak Prisma'da "kolonun varsayılanını kullan" demektir; `null`
    // yazmak `NOT NULL` kolonu kırardı. Ş10'un `Gelişmiş` bloğu bir seçim yapmadıysa
    // 2000 / 60 dakika varsayılanları geçerli kalır (K7).
    ...(input.deletedMessageNoticeMinutes === undefined
      ? {}
      : { deletedMessageNoticeMinutes: input.deletedMessageNoticeMinutes }),
    ...(input.messageCharacterLimit === undefined
      ? {}
      : { messageCharacterLimit: input.messageCharacterLimit }),
    ...(input.tags === undefined ? {} : { tags: input.tags }),
  };
}

export async function createWorkspaceServer(
  userId: string,
  input: CreateServerInput,
  options: CreateWorkspaceServerOptions = {},
) {
  const createdServer = await prisma.$transaction(async (tx) => {
    const inviteCode = await generateInviteCode(tx);

    const server = await tx.server.create({
      data: buildServerCreateData(userId, input, inviteCode, options),
      select: {
        id: true,
      },
    });

    const [adminRole, member] = await Promise.all([
      tx.role.create({
        data: {
          color: 3_428_765,
          isDefault: false,
          name: "Admin",
          permissions: SERVER_ADMIN_PERMISSIONS,
          position: 2,
          serverId: server.id,
        },
        select: {
          id: true,
        },
      }),
      tx.serverMember.create({
        data: {
          serverId: server.id,
          userId,
        },
        select: {
          id: true,
        },
      }),
    ]);

    await tx.role.createMany({
      data: [
        {
          color: MODERATOR_ROLE_COLOR,
          isDefault: false,
          name: "Moderator",
          permissions: MODERATOR_PERMISSIONS,
          position: 1,
          serverId: server.id,
        },
        {
          color: 0,
          isDefault: true,
          name: "@everyone",
          permissions: MEMBER_BASE_PERMISSIONS,
          position: 0,
          serverId: server.id,
        },
      ],
    });

    await tx.memberRole.create({
      data: {
        memberId: member.id,
        roleId: adminRole.id,
      },
    });

    const lobby = await tx.channelCategory.create({
      data: {
        name: "Lobby",
        position: 0,
        serverId: server.id,
      },
      select: {
        id: true,
      },
    });

    const generalChannel = await tx.channel.create({
      data: {
        categoryId: lobby.id,
        name: "welcome-chat",
        position: 0,
        serverId: server.id,
        topic: null,
        type: ChannelType.TEXT,
      },
      select: {
        id: true,
      },
    });

    await tx.channel.create({
      data: {
        categoryId: lobby.id,
        name: "live-room",
        position: 1,
        serverId: server.id,
        type: ChannelType.VOICE,
      },
    });

    await tx.server.update({
      where: {
        id: server.id,
      },
      data: {
        systemChannelId: generalChannel.id,
      },
    });

    await tx.serverInvite.create({
      data: {
        channelId: generalChannel.id,
        code: inviteCode,
        createdById: userId,
        serverId: server.id,
      },
    });

    return {
      channelId: generalChannel.id,
      serverId: server.id,
    };
  });

  await invalidateServerRoomIdsCache(userId);

  return createdServer;
}

/**
 * A community server's owner is the admin who created it, so the ordinary
 * owner check is not enough on its own — deletion has to route through the
 * admin surface where it lands in the audit trail.
 */
export function assertServerIsDeletableByOwner(type: ServerType): void {
  if (type === "COMMUNITY") {
    throw new ApiError(
      "Community servers can only be deleted from the admin surface",
      403,
      "COMMUNITY_SERVER_PROTECTED",
    );
  }
}

export type ServerVisibilityFields = {
  readonly discoverable?: boolean | undefined;
  readonly isPublic?: boolean | undefined;
};

export function assertVisibilityFieldsWritable(
  type: ServerType,
  input: ServerVisibilityFields,
): void {
  if (type !== "COMMUNITY") {
    return;
  }

  if (input.isPublic !== undefined || input.discoverable !== undefined) {
    throw new ApiError(
      "Community server visibility is managed from the admin surface",
      403,
      "COMMUNITY_SERVER_PROTECTED",
    );
  }
}

/**
 * `discoverable` only means anything while `isPublic` is on (S3 Bölüm C).
 * Pure so the invariant is assertable without a database: whatever the
 * client sends, the resolved `discoverable` can never end up `true` while
 * the resolved `isPublic` is `false` -- turning `isPublic` off (or it
 * already being off) forces `discoverable` off in the same update, on the
 * server, not just by the settings UI disabling its own switch.
 */
export function resolveVisibilityUpdateData(
  currentIsPublic: boolean,
  input: ServerVisibilityFields,
): { discoverable?: boolean; isPublic?: boolean } {
  const data: { discoverable?: boolean; isPublic?: boolean } = {};

  if (input.isPublic !== undefined) {
    data.isPublic = input.isPublic;
  }

  if (input.discoverable !== undefined) {
    data.discoverable = input.discoverable;
  }

  const nextIsPublic = input.isPublic ?? currentIsPublic;
  if (!nextIsPublic) {
    data.discoverable = false;
  }

  return data;
}

/**
 * The whole permission prelude of `updateWorkspaceServer`, in the order the
 * route runs it. Extracted so a test can drive the real sequence -- gate,
 * arguments and all -- without a database; asserting the gates in isolation
 * would not catch the wrong variable being handed to one of them.
 */
export function assertServerUpdateAllowed(access: AccessContext, input: UpdateServerInput): void {
  ensureServerPermission(access, PermissionBits.MANAGE_SERVER);
  assertVisibilityFieldsWritable(access.type, input);
}

/**
 * Everything `updateWorkspaceServer` writes except `features`, which needs the
 * row's current feature array. Pure so the two Ş1 columns can be asserted
 * without a database -- `iconColor: null` in particular is a value, not an
 * absence, and only a test that reads the built payload can tell the two apart.
 */
export function buildServerUpdateData(
  currentIsPublic: boolean,
  input: UpdateServerInput,
): Prisma.ServerUpdateInput {
  const data: Prisma.ServerUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name.trim();
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  if (input.shortName !== undefined) {
    data.shortName = input.shortName;
  }

  if (input.iconUrl !== undefined) {
    data.iconUrl = input.iconUrl;
  }

  /**
   * Ş1 §1, K2. `null` is "clear the choice", not "leave the column alone": the
   * swatch row's `Kaldır` returns the icon to the deterministic derivation from
   * the short name. `undefined` (field absent) is the one that means untouched,
   * so the guard has to be `!== undefined` rather than a truthiness check.
   */
  if (input.iconColor !== undefined) {
    data.iconColor = input.iconColor;
  }

  /** Ş1 §1 — SPEC-SUNUCU §8.3'ün `Kapalı` seçeneği 0'dır, alanın yokluğu değil. */
  if (input.slowModeDelay !== undefined) {
    data.slowModeDelay = input.slowModeDelay;
  }

  if (input.messageCharacterLimit !== undefined) {
    data.messageCharacterLimit = input.messageCharacterLimit;
  }

  if (input.tags !== undefined) {
    // Already lowercased, slug-checked, deduplicated and capped at five by
    // `ServerTagsSchema`; the service writes what the contract produced rather
    // than re-validating it (Faz 1 §C3).
    data.tags = { set: input.tags };
  }

  Object.assign(data, resolveVisibilityUpdateData(currentIsPublic, input));

  if (input.deletedMessageNoticeMinutes !== undefined) {
    data.deletedMessageNoticeMinutes = input.deletedMessageNoticeMinutes;
  }

  return data;
}

/**
 * The channel permission snapshot caches the server columns the message send
 * path reads (`features`, `messageCharacterLimit` and, since Ş1,
 * `slowModeDelay`). Bumping the server authorization revision is what expires
 * those snapshots, so every cached column has to appear here -- a new server
 * slow mode that only took effect after the cache aged out would be a setting
 * that silently lies for its first fifteen seconds.
 */
export function requiresChannelPermissionMetadataInvalidation(input: UpdateServerInput): boolean {
  return (
    input.messageCharacterLimit !== undefined ||
    input.slowModeDelay !== undefined ||
    input.allowGifs !== undefined ||
    input.allowFileUploads !== undefined ||
    input.allowMemberAdds !== undefined
  );
}

export async function updateWorkspaceServer(
  userId: string,
  serverId: string,
  input: UpdateServerInput,
) {
  const access = await getAccessContext(userId, serverId);
  assertServerUpdateAllowed(access, input);

  const data = buildServerUpdateData(access.isPublic, input);

  if (
    input.allowGifs !== undefined ||
    input.allowFileUploads !== undefined ||
    input.allowMemberAdds !== undefined
  ) {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { features: true },
    });

    data.features = applyServerMediaSettings(server?.features ?? [], {
      allowFileUploads: input.allowFileUploads,
      allowGifs: input.allowGifs,
      allowMemberAdds: input.allowMemberAdds,
    });
  }

  const shouldInvalidateChannelPermissionMetadata =
    requiresChannelPermissionMetadataInvalidation(input);

  const authorizationRevision = await prisma.$transaction(async (tx) => {
    await tx.server.update({
      where: {
        id: serverId,
      },
      data,
    });

    if (input.deletedMessageNoticeMinutes !== undefined) {
      await tx.$executeRaw`
        UPDATE "Message"
        SET "placeholderExpiresAt" =
          "deletedAt" + (${input.deletedMessageNoticeMinutes}::int * INTERVAL '1 minute')
        WHERE "deletedAt" IS NOT NULL
          AND "placeholderRemovedAt" IS NULL
          AND "channelId" IN (
            SELECT "id" FROM "Channel" WHERE "serverId" = ${serverId}
          )
      `;
    }

    return shouldInvalidateChannelPermissionMetadata
      ? advanceServerAuthorizationRevision(tx, serverId)
      : null;
  });

  if (authorizationRevision) {
    await publishCommittedAuthorizationRevision(authorizationRevision);
  }

  const detail = await getWorkspaceServerDetail(userId, serverId);
  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return detail;
}

/**
 * Socket.IO accepts an array of rooms in a single broadcast, so member
 * notification costs one publish per chunk instead of one per member. The size
 * mirrors the permission-service user chunking so both stay predictable.
 */
const SERVER_MEMBER_ROOM_BROADCAST_CHUNK_SIZE = 500;

function chunkServerMemberRooms(members: readonly { userId: string }[]): string[][] {
  const chunks: string[][] = [];

  for (let index = 0; index < members.length; index += SERVER_MEMBER_ROOM_BROADCAST_CHUNK_SIZE) {
    chunks.push(
      members
        .slice(index, index + SERVER_MEMBER_ROOM_BROADCAST_CHUNK_SIZE)
        .map((member) => `user:${member.userId}`),
    );
  }

  return chunks;
}

/**
 * Same reason as `assertServerUpdateAllowed`: the community gate has to run
 * before the owner check (a community server's owner is the admin who created
 * it), and that ordering is only meaningful when it is asserted on the real
 * sequence rather than on the gate alone.
 */
export function assertServerDeleteAllowed(access: AccessContext, input: DeleteServerInput): void {
  assertServerIsDeletableByOwner(access.type);
  ensureOwner(access);

  if (input.confirmationName !== access.serverName) {
    throw new ApiError("Server name confirmation did not match", 400);
  }
}

export async function deleteWorkspaceServer(
  userId: string,
  serverId: string,
  input: DeleteServerInput,
) {
  const access = await getAccessContext(userId, serverId);

  assertServerDeleteAllowed(access, input);

  const members = await prisma.serverMember.findMany({
    where: {
      serverId,
    },
    select: {
      userId: true,
    },
  });

  const now = new Date();
  const authorizationRevision = await prisma.$transaction(async (tx) => {
    await tx.mobileMediaUpload.updateMany({
      where: {
        purpose: MobileMediaUploadPurpose.SERVER_ICON,
        storageDeletedAt: null,
        targetServerId: serverId,
      },
      data: { cleanupAfter: now },
    });
    const revision = await advanceServerAuthorizationRevision(tx, serverId);
    await tx.server.delete({
      where: {
        id: serverId,
      },
    });
    return revision;
  });

  await publishCommittedAuthorizationRevision(authorizationRevision);
  await Promise.all(members.map((member) => invalidateServerRoomIdsCache(member.userId)));

  const io = getSocketServer();
  if (io) {
    const serverRoom = `server:${serverId}`;
    // `socketsLeave` is cluster-aware: the adapter clears the room on every
    // node. The loop this replaced awaited one `fetchSockets()` per member,
    // and each of those is a request/response broadcast over the Redis
    // adapter with a five second timeout — roughly one cluster round trip per
    // member, which a large server could not finish inside a request.
    io.in(serverRoom).socketsLeave(serverRoom);

    // Notify the member rooms rather than the server room so a socket that had
    // not joined the server room yet still hears about the deletion. Chunked so
    // one enormous server cannot turn this into a single oversized publish.
    for (const memberRooms of chunkServerMemberRooms(members)) {
      io.to(memberRooms).emit("server:membership:removed", {
        reason: "deleted",
        serverId,
      });
    }
  }
}
