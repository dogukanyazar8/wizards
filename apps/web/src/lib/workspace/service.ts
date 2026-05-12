import { randomBytes } from "node:crypto";
import { ChannelType, MessageType, PermissionTargetType, Prisma, prisma } from "@wizards/db";
import type {
  AddServerMemberInput,
  CreateCategoryInput,
  CreateChannelInput,
  CreateInviteInput,
  CreateServerInput,
  CreateWorkspaceRoleInput,
  DeleteServerInput,
  ReorderCategoriesInput,
  UpdateWorkspaceChannelPermissionsInput,
  UpdateCategoryInput,
  UpdateChannelInput,
  UpdateWorkspaceMemberRolesInput,
  UpdateWorkspaceRoleInput,
  UpdateServerInput,
  WorkspaceAccessLevel,
  WorkspaceCategory,
  WorkspaceChannel,
  WorkspaceChannelPermissionPreset,
  WorkspaceChannelPermissionSettings,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspacePermissionKey,
  WorkspaceRole,
  WorkspaceServerDetail,
  WorkspaceServerSummary,
} from "@wizards/types";
import { ApiError } from "@/lib/api";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { readPresenceMap } from "@/lib/presence";
import { getRedis } from "@/lib/redis";
import type { NotificationSocketPayload } from "@/lib/socket/events";
import { getSocketServer } from "@/lib/socket/runtime";
import { disconnectUnauthorizedVoiceParticipants } from "@/lib/voice/service";
import { getMessageById } from "@/lib/workspace/message-service";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  getServerChannelUnreadCounts,
  getServerMentionCount,
  getServerMentionCounts,
  getServerUnreadCount,
  getServerUnreadCounts,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
import { applyServerMediaSettings, getServerMediaSettings } from "@/lib/workspace/server-features";
import {
  MEMBER_BASE_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  PermissionBits,
  SERVER_ADMIN_PERMISSIONS,
  canUseLockedChannelPermission,
  deriveWorkspaceAccessLevel,
  hasPermission,
  permissionKeysToMask,
  permissionMaskToKeys,
  requireServerPermission,
  resolveChannelPermissions,
  resolveServerPermissions,
  type PermissionKey,
} from "@/lib/workspace/permissions";

const INVITE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type RoleRecord = {
  color: number;
  id: string;
  isDefault?: boolean | null;
  managed?: boolean | null;
  mentionable?: boolean | null;
  name: string;
  permissions: bigint;
  position?: number | null;
};

type AccessContext = {
  accessLevel: WorkspaceAccessLevel;
  memberId: string;
  ownerId: string;
  roles: RoleRecord[];
  serverId: string;
  serverName: string;
  userId: string;
};

type WorkspaceNotificationRecord = {
  actionUrl: string | null;
  body: string;
  createdAt: Date;
  id: string;
  imageUrl: string | null;
  metadata: Prisma.JsonValue | null;
  read: boolean;
  readAt: Date | null;
  title: string;
  type: "MENTION" | "FRIEND_REQUEST" | "FRIEND_ACCEPTED" | "DM" | "SERVER_INVITE" | "SYSTEM" | "MODERATION";
  userId: string;
};

type ChannelRecord = {
  categoryId: string | null;
  canAccess?: boolean;
  id: string;
  locked: boolean;
  name: string;
  permissionOverrides?: Array<{
    allow: bigint;
    deny: bigint;
    targetId: string;
    targetType: "ROLE" | "USER";
  }>;
  position: number;
  readOnly?: boolean;
  topic: string | null;
  type: ChannelType;
};

function serializeWorkspaceNotification(
  notification: WorkspaceNotificationRecord,
): NotificationSocketPayload {
  return {
    actionUrl: notification.actionUrl,
    body: notification.body,
    createdAt: notification.createdAt.toISOString(),
    id: notification.id,
    imageUrl: notification.imageUrl,
    metadata:
      notification.metadata &&
      typeof notification.metadata === "object" &&
      !Array.isArray(notification.metadata)
        ? (notification.metadata as Record<string, unknown>)
        : null,
    read: notification.read,
    readAt: notification.readAt?.toISOString() ?? null,
    title: notification.title,
    type: notification.type,
    userId: notification.userId,
  };
}

function formatRoleNameList(roleNames: string[]) {
  return roleNames.map((roleName) => `@${roleName}`).join(", ");
}

const SERVER_DETAIL_MEMBER_LIMIT = 100;
const SERVER_MEMBERS_PAGE_LIMIT = 100;
const ELEVATED_ROLE_PERMISSIONS =
  PermissionBits.ADMINISTRATOR | PermissionBits.MANAGE_ROLES | PermissionBits.MANAGE_SERVER;
const DEFAULT_ROLE_COLOR = 7_958_864;
const MODERATOR_ROLE_COLOR = 16_093_248;

function isOwnerAccess(access: Pick<AccessContext, "ownerId" | "userId">) {
  return access.ownerId === access.userId;
}

function isElevatedPermissions(permissions: bigint) {
  return (permissions & ELEVATED_ROLE_PERMISSIONS) !== 0n;
}

function isProtectedRole(role: Pick<RoleRecord, "isDefault" | "managed" | "permissions">) {
  return Boolean(role.isDefault || role.managed || isElevatedPermissions(role.permissions));
}

function toPermissionKeys(permissions: bigint): WorkspacePermissionKey[] {
  return permissionMaskToKeys(permissions) as WorkspacePermissionKey[];
}

function toPermissionMask(keys: readonly WorkspacePermissionKey[]) {
  return permissionKeysToMask(keys as readonly PermissionKey[]);
}

function toWorkspaceRole(role: {
  color: number;
  id: string;
  isDefault: boolean;
  managed: boolean;
  mentionable: boolean;
  name: string;
  permissions: bigint;
  position: number;
}): WorkspaceRole {
  return {
    color: role.color,
    id: role.id,
    isDefault: role.isDefault,
    managed: role.managed,
    mentionable: role.mentionable,
    name: role.name,
    permissions: toPermissionKeys(role.permissions),
    position: role.position,
  };
}

function ensureCanWriteRolePermissions(access: AccessContext, permissions: bigint) {
  if (!isOwnerAccess(access) && isElevatedPermissions(permissions)) {
    throw new ApiError(
      "Only the server owner can grant elevated role permissions.",
      403,
      "OWNER_REQUIRED",
    );
  }
}

function getRolePresetPermissions(name: string) {
  const normalized = name.trim().toLowerCase();

  if (normalized === "moderator") {
    return MODERATOR_PERMISSIONS;
  }

  if (normalized === "admin" || normalized === "administrator") {
    return SERVER_ADMIN_PERMISSIONS;
  }

  return MEMBER_BASE_PERMISSIONS;
}

function getChannelInteractionPermissions(type: ChannelType) {
  if (type === ChannelType.VOICE) {
    return (
      PermissionBits.CONNECT_VOICE |
      PermissionBits.SPEAK |
      PermissionBits.STREAM |
      PermissionBits.USE_VIDEO
    );
  }

  return (
    PermissionBits.SEND_MESSAGES |
    PermissionBits.ATTACH_FILES |
    PermissionBits.USE_GIFS |
    PermissionBits.ADD_REACTIONS
  );
}

function getChannelPresetPermissions(type: ChannelType, preset: WorkspaceChannelPermissionPreset) {
  const interactionPermissions = getChannelInteractionPermissions(type);
  const visiblePermissions = PermissionBits.VIEW_CHANNEL;
  const controlledPermissions = visiblePermissions | interactionPermissions;

  if (preset === "PUBLIC") {
    return {
      controlledPermissions,
      everyoneAllow: 0n,
      everyoneDeny: 0n,
      roleAllow: 0n,
    };
  }

  if (preset === "LOCKED_VISIBLE") {
    return {
      controlledPermissions,
      everyoneAllow: visiblePermissions,
      everyoneDeny: interactionPermissions,
      roleAllow: 0n,
    };
  }

  const roleAllow = controlledPermissions;
  return {
    controlledPermissions,
    everyoneAllow: 0n,
    everyoneDeny: controlledPermissions,
    roleAllow: preset === "ROLE_GATED" ? roleAllow : 0n,
  };
}

function mergeControlledPermissionOverride(args: {
  allow: bigint;
  controlledPermissions: bigint;
  deny: bigint;
  nextAllow: bigint;
  nextDeny: bigint;
}) {
  return {
    allow: (args.allow & ~args.controlledPermissions) | args.nextAllow,
    deny: (args.deny & ~args.controlledPermissions) | args.nextDeny,
  };
}

function inferChannelPermissionSettings(args: {
  defaultRoleId: string | null;
  locked: boolean;
  overrides: Array<{
    allow: bigint;
    deny: bigint;
    targetId: string;
    targetType: "ROLE" | "USER";
  }>;
  type: ChannelType;
}): WorkspaceChannelPermissionSettings {
  const interactionPermissions = getChannelInteractionPermissions(args.type);
  const controlledPermissions = PermissionBits.VIEW_CHANNEL | interactionPermissions;
  const defaultOverride = args.defaultRoleId
    ? args.overrides.find(
        (override) => override.targetType === "ROLE" && override.targetId === args.defaultRoleId,
      )
    : null;
  const allowedRoleIds = args.overrides
    .filter(
      (override) =>
        override.targetType === "ROLE" &&
        override.targetId !== args.defaultRoleId &&
        (override.allow & controlledPermissions) !== 0n,
    )
    .map((override) => override.targetId);

  if (defaultOverride && (defaultOverride.deny & PermissionBits.VIEW_CHANNEL) !== 0n) {
    return {
      allowedRoleIds,
      preset: allowedRoleIds.length > 0 ? "ROLE_GATED" : "PRIVATE",
    };
  }

  if (defaultOverride && (defaultOverride.deny & interactionPermissions) !== 0n) {
    return {
      allowedRoleIds,
      preset: "LOCKED_VISIBLE",
    };
  }

  if (args.locked && allowedRoleIds.length > 0) {
    return {
      allowedRoleIds,
      preset: "ROLE_GATED",
    };
  }

  if (args.locked) {
    return {
      allowedRoleIds,
      preset: "LOCKED_VISIBLE",
    };
  }

  return {
    allowedRoleIds,
    preset: "PUBLIC",
  };
}

type ChannelPermissionRoleRecord = Pick<RoleRecord, "id" | "isDefault" | "managed" | "permissions">;

type ChannelPermissionOverrideRecord = {
  allow: bigint;
  deny: bigint;
  targetId: string;
  targetType: "ROLE" | "USER";
};

function prepareChannelPermissionMutation(args: {
  input: WorkspaceChannelPermissionSettings;
  roles: ChannelPermissionRoleRecord[];
  type: ChannelType;
}) {
  const defaultRole = args.roles.find((role) => role.isDefault) ?? null;
  if (!defaultRole) {
    throw new ApiError("Default role is missing for this server.", 500, "DEFAULT_ROLE_MISSING");
  }

  const allowedRoleIds = Array.from(new Set(args.input.allowedRoleIds));
  const allowedRoles = args.roles.filter((role) => allowedRoleIds.includes(role.id));

  if (allowedRoles.length !== allowedRoleIds.length) {
    throw new ApiError("One or more roles could not be found.", 404, "ROLE_NOT_FOUND");
  }

  if (allowedRoles.some((role) => role.isDefault || role.managed)) {
    throw new ApiError("Protected roles cannot be used for channel gates.", 403, "PROTECTED_ROLE");
  }

  if (args.input.preset === "ROLE_GATED" && allowedRoleIds.length === 0) {
    throw new ApiError("Choose at least one role for role-gated access.", 400, "ROLE_REQUIRED");
  }

  return {
    allowedRoleIds,
    defaultRole,
    nextLocked: args.input.preset !== "PUBLIC",
    presetPermissions: getChannelPresetPermissions(args.type, args.input.preset),
  };
}

async function applyChannelPermissionMutation(
  tx: Prisma.TransactionClient,
  args: {
    allowedRoleIds: string[];
    channelId: string;
    defaultRoleId: string;
    existingRoleOverrides: ChannelPermissionOverrideRecord[];
    presetPermissions: ReturnType<typeof getChannelPresetPermissions>;
  },
) {
  const targetRoleIds = new Set([
    args.defaultRoleId,
    ...args.allowedRoleIds,
    ...args.existingRoleOverrides.map((override) => override.targetId),
  ]);

  for (const targetId of targetRoleIds) {
    const existing = args.existingRoleOverrides.find((override) => override.targetId === targetId);
    const isDefaultTarget = targetId === args.defaultRoleId;
    const isAllowedTarget = args.allowedRoleIds.includes(targetId);
    const next = mergeControlledPermissionOverride({
      allow: existing?.allow ?? 0n,
      controlledPermissions: args.presetPermissions.controlledPermissions,
      deny: existing?.deny ?? 0n,
      nextAllow: isDefaultTarget
        ? args.presetPermissions.everyoneAllow
        : isAllowedTarget
          ? args.presetPermissions.roleAllow
          : 0n,
      nextDeny: isDefaultTarget ? args.presetPermissions.everyoneDeny : 0n,
    });

    const where = {
      channelId_targetId_targetType: {
        channelId: args.channelId,
        targetId,
        targetType: PermissionTargetType.ROLE,
      },
    };

    if (next.allow === 0n && next.deny === 0n) {
      if (existing) {
        await tx.channelPermissionOverride.delete({ where });
      }
      continue;
    }

    await tx.channelPermissionOverride.upsert({
      create: {
        allow: next.allow,
        channelId: args.channelId,
        deny: next.deny,
        targetId,
        targetType: PermissionTargetType.ROLE,
      },
      update: {
        allow: next.allow,
        deny: next.deny,
      },
      where,
    });
  }
}

function toWorkspaceChannel(
  channel: ChannelRecord,
  unreadCounts?: Map<string, { mentionCount: number; unreadCount: number }>,
): WorkspaceChannel {
  const canAccess = channel.canAccess ?? true;
  const counts = canAccess ? unreadCounts?.get(channel.id) : undefined;

  return {
    canAccess,
    categoryId: channel.categoryId,
    id: channel.id,
    locked: channel.locked,
    mentionCount: counts?.mentionCount ?? 0,
    name: channel.name,
    position: channel.position,
    readOnly: channel.readOnly ?? false,
    topic: canAccess ? channel.topic : null,
    type: channel.type === ChannelType.VOICE ? "VOICE" : "TEXT",
    unreadCount: counts?.unreadCount ?? 0,
  };
}

function serializeDate(date: Date | null) {
  return date ? date.toISOString() : null;
}

function getDisplayName(
  user: {
    avatarUrl: string | null;
    displayName: string | null;
    username: string;
  },
  nickname?: string | null,
) {
  return nickname ?? user.displayName ?? user.username;
}

function normalizeWorkspaceLabel(value: string, maxLength = 48) {
  const normalized = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, "");

  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    return "";
  }

  return Array.from(normalized).slice(0, maxLength).join("").trim();
}

function mergeRoleRecords(...roleGroups: RoleRecord[][]) {
  const roles = new Map<string, RoleRecord>();

  for (const role of roleGroups.flat()) {
    roles.set(role.id, role);
  }

  return [...roles.values()];
}

function deriveAccessLevel(
  ownerId: string,
  userId: string,
  roles: RoleRecord[],
): WorkspaceAccessLevel {
  return deriveWorkspaceAccessLevel({ ownerId, roles, userId });
}

async function generateInviteCode(tx: Prisma.TransactionClient = prisma) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = randomBytes(8);
    let code = "";

    for (const byte of bytes) {
      code += INVITE_CHARSET[byte % INVITE_CHARSET.length];
      if (code.length === 8) {
        break;
      }
    }

    const [existingInvite, existingServer] = await Promise.all([
      tx.serverInvite.findUnique({
        where: { code },
        select: { id: true },
      }),
      tx.server.findUnique({
        where: { inviteCode: code },
        select: { id: true },
      }),
    ]);

    if (!existingInvite && !existingServer) {
      return code;
    }
  }

  throw new ApiError("Unable to generate a unique invite code", 500);
}

async function getAccessContext(userId: string, serverId: string): Promise<AccessContext> {
  const [membership, serverBan] = await Promise.all([
    prisma.serverMember.findFirst({
      where: {
        serverId,
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
            id: true,
            name: true,
            ownerId: true,
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
          },
        },
      },
    }),
    prisma.serverBan.findUnique({
      where: {
        serverId_userId: {
          serverId,
          userId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (serverBan) {
    throw new ApiError("You are banned from this server", 403, "SERVER_BANNED");
  }

  if (!membership) {
    throw new ApiError("Server not found", 404);
  }

  const roles = mergeRoleRecords(
    membership.server.roles,
    membership.roles.map((entry) => entry.role),
  );

  return {
    accessLevel: deriveAccessLevel(membership.server.ownerId, userId, roles),
    memberId: membership.id,
    ownerId: membership.server.ownerId,
    roles,
    serverId: membership.server.id,
    serverName: membership.server.name,
    userId,
  };
}

function ensureServerPermission(
  context: AccessContext,
  permission: Parameters<typeof requireServerPermission>[1],
) {
  requireServerPermission(context, permission);
}

function ensureOwner(context: AccessContext) {
  if (context.accessLevel !== "OWNER") {
    throw new ApiError("Only the server owner can perform this action", 403);
  }
}

function canAddMembers(accessLevel: WorkspaceAccessLevel, allowMemberAdds: boolean) {
  return accessLevel !== "MEMBER" || allowMemberAdds;
}

async function detachUserFromServerSocketRoom(userId: string, serverId: string) {
  const io = getSocketServer();
  if (!io) {
    return null;
  }

  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.leave(`server:${serverId}`);
  }

  return io;
}

async function ensureUserNotServerBanned(
  client: Pick<typeof prisma, "serverBan">,
  serverId: string,
  userId: string,
  message = "You are banned from this server",
) {
  const ban = await client.serverBan.findUnique({
    where: {
      serverId_userId: {
        serverId,
        userId,
      },
    },
    select: { id: true },
  });

  if (ban) {
    throw new ApiError(message, 403, "SERVER_BANNED");
  }
}

function mapServerSummary(args: {
  accessLevel: WorkspaceAccessLevel;
  allowFileUploads: boolean;
  allowGifs: boolean;
  allowMemberAdds: boolean;
  defaultChannelId: string | null;
  iconUrl: string | null;
  id: string;
  inviteCode: string | null;
  memberCount: number;
  messageCharacterLimit: number;
  deletedMessageNoticeMinutes: number;
  mentionCount: number;
  name: string;
  shortName: string | null;
  unreadCount: number;
}): WorkspaceServerSummary {
  return {
    accessLevel: args.accessLevel,
    allowFileUploads: args.allowFileUploads,
    allowGifs: args.allowGifs,
    allowMemberAdds: args.allowMemberAdds,
    defaultChannelId: args.defaultChannelId,
    iconUrl: args.iconUrl,
    id: args.id,
    inviteCode: args.inviteCode,
    memberCount: args.memberCount,
    messageCharacterLimit: args.messageCharacterLimit,
    deletedMessageNoticeMinutes: args.deletedMessageNoticeMinutes,
    mentionCount: args.mentionCount,
    name: args.name,
    shortName: args.shortName,
    unreadCount: args.unreadCount,
  };
}

async function mapMembers(
  ownerId: string,
  members: Array<{
    id: string;
    nickname: string | null;
    roles: Array<{
      role: RoleRecord;
    }>;
    user: {
      avatarUrl: string | null;
      customStatus: string | null;
      displayName: string | null;
      id: string;
      status: string;
      username: string;
    };
  }>,
): Promise<WorkspaceMember[]> {
  const presenceByUserId = await readPresenceMap(
    getRedis(),
    members.map((member) => ({
      customStatus: member.user.customStatus,
      status: "OFFLINE",
      userId: member.user.id,
    })),
  );

  return members.map((member) => {
    const roles = member.roles.map((entry) => ({
      color: entry.role.color,
      id: entry.role.id,
      name: entry.role.name,
    }));
    const presence = presenceByUserId.get(member.user.id) ?? {
      customStatus: member.user.customStatus,
      status: "OFFLINE" as const,
    };

    return {
      accessLevel: deriveAccessLevel(
        ownerId,
        member.user.id,
        member.roles.map((entry) => entry.role),
      ),
      avatarUrl: member.user.avatarUrl,
      customStatus: presence.customStatus,
      displayName: getDisplayName(member.user, member.nickname),
      id: member.id,
      roles,
      status: presence.status,
      userId: member.user.id,
      username: member.user.username,
    };
  });
}

function mapInvites(
  invites: Array<{
    channelId: string | null;
    code: string;
    createdAt: Date;
    creator: {
      displayName: string | null;
      username: string;
    };
    expiresAt: Date | null;
    id: string;
    maxUses: number | null;
    uses: number;
  }>,
): WorkspaceInvite[] {
  return invites.map((invite) => ({
    channelId: invite.channelId,
    code: invite.code,
    createdAt: invite.createdAt.toISOString(),
    createdByDisplayName: invite.creator.displayName ?? invite.creator.username,
    expiresAt: serializeDate(invite.expiresAt),
    id: invite.id,
    maxUses: invite.maxUses,
    uses: invite.uses,
  }));
}

function mapCategories(
  categories: Array<{
    channels: ChannelRecord[];
    id: string;
    name: string;
    position: number;
  }>,
  unreadCounts?: Map<string, { mentionCount: number; unreadCount: number }>,
): WorkspaceCategory[] {
  return categories.map((category) => ({
    channels: category.channels.map((channel) => toWorkspaceChannel(channel, unreadCounts)),
    id: category.id,
    name: category.name,
    position: category.position,
  }));
}

function withVisibleChannelAccess(access: AccessContext, channel: ChannelRecord): ChannelRecord | null {
  const context = {
    memberId: access.memberId,
    ownerId: access.ownerId,
    roles: access.roles,
    userId: access.userId,
    overrides: channel.permissionOverrides ?? [],
  };
  const permissions = resolveChannelPermissions(context);
  const canView = hasPermission(permissions, PermissionBits.VIEW_CHANNEL);

  if (!canView) {
    return null;
  }

  const canConnectVoice =
    hasPermission(permissions, PermissionBits.CONNECT_VOICE) &&
    (!channel.locked || canUseLockedChannelPermission(context, PermissionBits.CONNECT_VOICE));
  const canSendMessages = hasPermission(permissions, PermissionBits.SEND_MESSAGES);

  return {
    ...channel,
    canAccess: channel.type === ChannelType.VOICE ? canConnectVoice : true,
    readOnly: channel.type === ChannelType.TEXT ? !canSendMessages : false,
  };
}

function pickDefaultChannelId(args: {
  categories: WorkspaceCategory[];
  ungroupedChannels: WorkspaceChannel[];
}) {
  const canOpenChannel = (channel: WorkspaceChannel) => channel.canAccess !== false;
  const firstGroupedChannel = args.categories
    .flatMap((category) => category.channels)
    .find(canOpenChannel);
  return firstGroupedChannel?.id ?? args.ungroupedChannels.find(canOpenChannel)?.id ?? null;
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
          id: true,
          inviteCode: true,
          messageCharacterLimit: true,
          deletedMessageNoticeMinutes: true,
          name: true,
          ownerId: true,
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
        },
      },
    },
  });

  const serverIds = memberships.map((membership) => membership.server.id);
  const [unreadCounts, mentionCounts] = await Promise.all([
    getServerUnreadCounts(userId, serverIds),
    getServerMentionCounts(userId, serverIds),
  ]);

  return memberships.map((membership) => {
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
      iconUrl: membership.server.iconUrl,
      id: membership.server.id,
      inviteCode: membership.server.inviteCode,
      memberCount: membership.server._count.members,
      messageCharacterLimit: membership.server.messageCharacterLimit,
      deletedMessageNoticeMinutes: membership.server.deletedMessageNoticeMinutes,
      mentionCount: mentionCounts.get(membership.server.id) ?? 0,
      name: membership.server.name,
      shortName: membership.server.shortName,
      unreadCount: unreadCounts.get(membership.server.id) ?? 0,
    });
  });
}

export async function getWorkspaceServerDetail(
  userId: string,
  serverId: string,
): Promise<WorkspaceServerDetail> {
  const access = await getAccessContext(userId, serverId);
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
                topic: true,
                type: true,
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
            topic: true,
            type: true,
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
        features: true,
        iconUrl: true,
        id: true,
        inviteCode: true,
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
  const members = await mapMembers(server.ownerId, memberRows);
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
      defaultChannelId,
      description: server.description,
      iconUrl: server.iconUrl,
      id: server.id,
      inviteCode: server.inviteCode,
      isAdmin,
      isOwner: access.accessLevel === "OWNER",
      memberCount: server._count.members,
      messageCharacterLimit: server.messageCharacterLimit,
      deletedMessageNoticeMinutes: server.deletedMessageNoticeMinutes,
      mentionCount,
      name: server.name,
      shortName: server.shortName,
      unreadCount,
    },
    ungroupedChannels,
  };
}

export async function listWorkspaceServerMembers(
  userId: string,
  serverId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
) {
  const access = await getAccessContext(userId, serverId);
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
    take: limit + 1,
    where: {
      serverId,
      ...cursorFilter,
    },
  });
  const pageRows = rows.slice(0, limit);

  return {
    memberPage: {
      limit,
      nextCursor: rows.length > limit ? (pageRows.at(-1)?.id ?? null) : null,
    },
    members: await mapMembers(access.ownerId, pageRows),
  };
}

export async function createWorkspaceServer(userId: string, input: CreateServerInput) {
  const createdServer = await prisma.$transaction(async (tx) => {
    const inviteCode = await generateInviteCode(tx);

    const server = await tx.server.create({
      data: {
        description: input.description ?? null,
        features: applyServerMediaSettings([], {
          allowFileUploads: input.allowFileUploads,
          allowGifs: input.allowGifs,
          allowMemberAdds: input.allowMemberAdds,
        }),
        iconUrl: input.iconUrl ?? null,
        inviteCode,
        name: input.name.trim(),
        ownerId: userId,
        shortName: input.shortName ?? null,
      },
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

  return createdServer;
}

export async function updateWorkspaceServer(
  userId: string,
  serverId: string,
  input: UpdateServerInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_SERVER);

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

  if (input.messageCharacterLimit !== undefined) {
    data.messageCharacterLimit = input.messageCharacterLimit;
  }

  if (input.deletedMessageNoticeMinutes !== undefined) {
    data.deletedMessageNoticeMinutes = input.deletedMessageNoticeMinutes;
  }

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

  await prisma.server.update({
    where: {
      id: serverId,
    },
    data,
  });

  if (input.deletedMessageNoticeMinutes !== undefined) {
    await prisma.$executeRaw`
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

  const detail = await getWorkspaceServerDetail(userId, serverId);
  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return detail;
}

export async function listWorkspaceRoles(userId: string, serverId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const roles = await prisma.role.findMany({
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
    where: {
      serverId,
    },
  });

  return roles.map(toWorkspaceRole);
}

export async function createWorkspaceRole(
  userId: string,
  serverId: string,
  input: CreateWorkspaceRoleInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const normalizedName = normalizeWorkspaceLabel(input.name);
  if (!normalizedName) {
    throw new ApiError("Role name must include at least one letter or number", 400);
  }

  const permissions =
    input.permissions.length > 0
      ? toPermissionMask(input.permissions)
      : getRolePresetPermissions(normalizedName);
  ensureCanWriteRolePermissions(access, permissions);

  const lastRole = await prisma.role.findFirst({
    orderBy: {
      position: "desc",
    },
    select: {
      position: true,
    },
    where: {
      serverId,
    },
  });

  const role = await prisma.role.create({
    data: {
      color: input.color ?? DEFAULT_ROLE_COLOR,
      isDefault: false,
      managed: false,
      mentionable: input.mentionable ?? false,
      name: normalizedName,
      permissions,
      position: (lastRole?.position ?? 0) + 1,
      serverId,
    },
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
  });

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return toWorkspaceRole(role);
}

export async function updateWorkspaceRole(
  userId: string,
  serverId: string,
  roleId: string,
  input: UpdateWorkspaceRoleInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const role = await prisma.role.findFirst({
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
    where: {
      id: roleId,
      serverId,
    },
  });

  if (!role) {
    throw new ApiError("Role not found", 404);
  }

  if (isProtectedRole(role)) {
    throw new ApiError("Protected roles cannot be edited from this panel.", 403, "PROTECTED_ROLE");
  }

  const data: Prisma.RoleUpdateInput = {};

  if (input.name !== undefined) {
    const normalizedName = normalizeWorkspaceLabel(input.name);
    if (!normalizedName) {
      throw new ApiError("Role name must include at least one letter or number", 400);
    }
    data.name = normalizedName;
  }

  if (input.color !== undefined) {
    data.color = input.color;
  }

  if (input.mentionable !== undefined) {
    data.mentionable = input.mentionable;
  }

  if (input.permissions !== undefined) {
    const permissions = toPermissionMask(input.permissions);
    ensureCanWriteRolePermissions(access, permissions);
    data.permissions = permissions;
  }

  const updatedRole = await prisma.role.update({
    data,
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
    where: {
      id: roleId,
    },
  });

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return toWorkspaceRole(updatedRole);
}

export async function deleteWorkspaceRole(userId: string, serverId: string, roleId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const role = await prisma.role.findFirst({
    select: {
      id: true,
      isDefault: true,
      managed: true,
      permissions: true,
    },
    where: {
      id: roleId,
      serverId,
    },
  });

  if (!role) {
    throw new ApiError("Role not found", 404);
  }

  if (isProtectedRole(role)) {
    throw new ApiError("Protected roles cannot be deleted.", 403, "PROTECTED_ROLE");
  }

  await prisma.role.delete({
    where: {
      id: roleId,
    },
  });

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { success: true as const };
}

export async function updateWorkspaceMemberRoles(
  userId: string,
  serverId: string,
  memberId: string,
  input: UpdateWorkspaceMemberRolesInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const member = await prisma.serverMember.findFirst({
    select: {
      id: true,
      roles: {
        select: {
          role: {
            select: {
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
          locale: true,
        },
      },
      userId: true,
    },
    where: {
      id: memberId,
      serverId,
    },
  });

  if (!member) {
    throw new ApiError("Member not found", 404);
  }

  if (member.userId === access.ownerId) {
    throw new ApiError("The server owner cannot be role-modified.", 403, "OWNER_PROTECTED");
  }

  if (!isOwnerAccess(access) && member.roles.some((entry) => isProtectedRole(entry.role))) {
    throw new ApiError("You cannot modify a member with an elevated role.", 403, "ROLE_HIERARCHY");
  }

  const requestedRoleIds = Array.from(new Set(input.roleIds));
  const roles = await prisma.role.findMany({
    select: {
      id: true,
      isDefault: true,
      managed: true,
      name: true,
      permissions: true,
    },
    where: {
      id: {
        in: requestedRoleIds,
      },
      serverId,
    },
  });

  if (roles.length !== requestedRoleIds.length) {
    throw new ApiError("One or more roles could not be found.", 404, "ROLE_NOT_FOUND");
  }

  if (roles.some((role) => role.isDefault || role.managed)) {
    throw new ApiError("Protected roles cannot be assigned manually.", 403, "PROTECTED_ROLE");
  }

  for (const role of roles) {
    ensureCanWriteRolePermissions(access, role.permissions);
  }

  const existingNonDefaultRoleIds = member.roles
    .map((entry) => entry.role)
    .filter((role) => !role.isDefault)
    .map((role) => role.id);
  const addedRoleIds = requestedRoleIds.filter(
    (roleId) => !existingNonDefaultRoleIds.includes(roleId),
  );
  const addedRoles = roles.filter((role) => addedRoleIds.includes(role.id));

  const mutations: Prisma.PrismaPromise<unknown>[] = [
    prisma.memberRole.deleteMany({
      where: {
        memberId,
        roleId: {
          in: existingNonDefaultRoleIds,
        },
      },
    }),
  ];

  if (requestedRoleIds.length > 0) {
    mutations.push(
      prisma.memberRole.createMany({
        data: requestedRoleIds.map((roleId) => ({
          memberId,
          roleId,
        })),
        skipDuplicates: true,
      }),
    );
  }

  await prisma.$transaction(mutations);

  const io = getSocketServer();
  io?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  if (member.userId !== userId && addedRoles.length > 0) {
    const locale = normalizeAppLocale(member.user.locale);
    const roleList = formatRoleNameList(addedRoles.map((role) => role.name));
    const notification = await prisma.notification.create({
      data: {
        actionUrl: `/channels/${serverId}`,
        body: translate(locale, "workspace.notification.rolesAssigned.body", {
          roles: roleList,
          server: access.serverName,
        }),
        metadata: {
          roleIds: addedRoleIds,
          roles: addedRoles.map((role) => role.name),
          senderId: userId,
          serverId,
          serverName: access.serverName,
        },
        title: translate(locale, "workspace.notification.rolesAssigned.title", {
          server: access.serverName,
        }),
        type: "MODERATION",
        userId: member.userId,
      },
      select: {
        actionUrl: true,
        body: true,
        createdAt: true,
        id: true,
        imageUrl: true,
        metadata: true,
        read: true,
        readAt: true,
        title: true,
        type: true,
        userId: true,
      },
    });

    io?.to(`user:${member.userId}`).emit(
      "notification:new",
      serializeWorkspaceNotification(notification),
    );
  }

  return { success: true as const };
}

export async function deleteWorkspaceServer(
  userId: string,
  serverId: string,
  input: DeleteServerInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureOwner(access);

  if (input.confirmationName !== access.serverName) {
    throw new ApiError("Server name confirmation did not match", 400);
  }

  const members = await prisma.serverMember.findMany({
    where: {
      serverId,
    },
    select: {
      userId: true,
    },
  });

  await prisma.server.delete({
    where: {
      id: serverId,
    },
  });

  const io = getSocketServer();
  if (io) {
    for (const member of members) {
      const sockets = await io.in(`user:${member.userId}`).fetchSockets();
      for (const socket of sockets) {
        socket.leave(`server:${serverId}`);
      }
      io.to(`user:${member.userId}`).emit("server:membership:removed", {
        reason: "deleted",
        serverId,
      });
    }
  }
}

export async function leaveWorkspaceServer(userId: string, serverId: string) {
  const access = await getAccessContext(userId, serverId);

  if (access.accessLevel === "OWNER") {
    throw new ApiError("Transfer ownership or delete the server instead", 400);
  }

  await prisma.serverMember.delete({
    where: {
      userId_serverId: {
        serverId,
        userId,
      },
    },
  });

  const io = await detachUserFromServerSocketRoom(userId, serverId);
  io?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  io?.to(`user:${userId}`).emit("server:membership:removed", {
    reason: "left",
    serverId,
  });
  io?.to(`user:${userId}`).emit("server:settings:updated", { serverId });
  await emitServerUnreadUpdatesForServer(serverId);
}

export async function createWorkspaceCategory(
  userId: string,
  serverId: string,
  input: CreateCategoryInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const lastCategory = await prisma.channelCategory.findFirst({
    orderBy: {
      position: "desc",
    },
    select: {
      position: true,
    },
    where: {
      serverId,
    },
  });

  const category = await prisma.channelCategory.create({
    data: {
      name: normalizeWorkspaceLabel(input.name),
      position: (lastCategory?.position ?? -1) + 1,
      serverId,
    },
    select: {
      id: true,
    },
  });

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return category;
}

export async function updateWorkspaceCategory(
  userId: string,
  serverId: string,
  categoryId: string,
  input: UpdateCategoryInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const category = await prisma.channelCategory.findFirst({
    where: {
      id: categoryId,
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (!category) {
    throw new ApiError("Category not found", 404, "NOT_FOUND");
  }

  await prisma.channelCategory.update({
    where: {
      id: categoryId,
    },
    data: {
      name: normalizeWorkspaceLabel(input.name),
    },
  });

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { success: true as const };
}

export async function deleteWorkspaceCategory(
  userId: string,
  serverId: string,
  categoryId: string,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const category = await prisma.channelCategory.findFirst({
    where: {
      id: categoryId,
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (!category) {
    throw new ApiError("Category not found", 404, "NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.channel.updateMany({
      where: {
        categoryId,
        serverId,
      },
      data: {
        categoryId: null,
      },
    }),
    prisma.channelCategory.delete({
      where: {
        id: categoryId,
      },
    }),
  ]);

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { success: true as const };
}

export async function createWorkspaceChannel(
  userId: string,
  serverId: string,
  input: CreateChannelInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const normalizedName = normalizeWorkspaceLabel(input.name);

  if (!normalizedName) {
    throw new ApiError("Channel name must include at least one letter or number", 400);
  }

  if (input.categoryId) {
    const category = await prisma.channelCategory.findFirst({
      where: {
        id: input.categoryId,
        serverId,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      throw new ApiError("Category not found", 404);
    }
  }

  const lastChannel = await prisma.channel.findFirst({
    orderBy: {
      position: "desc",
    },
    select: {
      position: true,
    },
    where: {
      categoryId: input.categoryId ?? null,
      parentId: null,
      serverId,
    },
  });

  const channelType = input.type === "VOICE" ? ChannelType.VOICE : ChannelType.TEXT;
  const channelPermissionMutation = input.permissions
    ? prepareChannelPermissionMutation({
        input: input.permissions,
        roles: await prisma.role.findMany({
          select: {
            id: true,
            isDefault: true,
            managed: true,
            permissions: true,
          },
          where: {
            serverId,
          },
        }),
        type: channelType,
      })
    : null;

  const channel = await prisma.$transaction(async (tx) => {
    const createdChannel = await tx.channel.create({
      data: {
        categoryId: input.categoryId ?? null,
        locked: channelPermissionMutation?.nextLocked ?? false,
        name: normalizedName,
        position: (lastChannel?.position ?? -1) + 1,
        serverId,
        topic: input.topic ?? null,
        type: channelType,
      },
      select: {
        id: true,
      },
    });

    if (channelPermissionMutation) {
      await applyChannelPermissionMutation(tx, {
        allowedRoleIds: channelPermissionMutation.allowedRoleIds,
        channelId: createdChannel.id,
        defaultRoleId: channelPermissionMutation.defaultRole.id,
        existingRoleOverrides: [],
        presetPermissions: channelPermissionMutation.presetPermissions,
      });
    }

    return createdChannel;
  });

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return channel;
}

export async function updateWorkspaceChannel(
  userId: string,
  channelId: string,
  input: UpdateChannelInput,
) {
  const existingChannel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      categoryId: true,
      id: true,
      locked: true,
      serverId: true,
      type: true,
    },
  });

  if (!existingChannel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, existingChannel.serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  let nextPosition: number | undefined;

  if (input.categoryId !== undefined && input.categoryId !== existingChannel.categoryId) {
    if (input.categoryId) {
      const targetCategory = await prisma.channelCategory.findFirst({
        where: {
          id: input.categoryId,
          serverId: existingChannel.serverId,
        },
        select: {
          id: true,
        },
      });

      if (!targetCategory) {
        throw new ApiError("Category not found", 404);
      }
    }

    const lastChannel = await prisma.channel.findFirst({
      orderBy: {
        position: "desc",
      },
      select: {
        position: true,
      },
      where: {
        categoryId: input.categoryId ?? null,
        parentId: null,
        serverId: existingChannel.serverId,
      },
    });

    nextPosition = (lastChannel?.position ?? -1) + 1;
  }

  const data: Prisma.ChannelUpdateInput = {};

  if (input.name !== undefined) {
    const normalizedName = normalizeWorkspaceLabel(input.name);

    if (!normalizedName) {
      throw new ApiError("Channel name must include at least one letter or number", 400);
    }

    data.name = normalizedName;
  }

  if (input.topic !== undefined) {
    data.topic = input.topic;
  }

  if (input.locked !== undefined) {
    data.locked = input.locked;
  }

  if (input.categoryId !== undefined) {
    data.category = input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true };
  }

  if (nextPosition !== undefined) {
    data.position = nextPosition;
  }

  await prisma.channel.update({
    where: {
      id: channelId,
    },
    data,
  });

  if (
    existingChannel.type === ChannelType.VOICE &&
    input.locked === true &&
    existingChannel.locked !== true
  ) {
    await disconnectUnauthorizedVoiceParticipants(channelId);
  }

  getSocketServer()?.to(`server:${existingChannel.serverId}`).emit("server:settings:updated", {
    serverId: existingChannel.serverId,
  });
}

export async function getWorkspaceChannelPermissionSettings(
  userId: string,
  channelId: string,
): Promise<WorkspaceChannelPermissionSettings> {
  const channel = await prisma.channel.findUnique({
    select: {
      id: true,
      locked: true,
      permissionOverrides: {
        select: {
          allow: true,
          deny: true,
          targetId: true,
          targetType: true,
        },
      },
      server: {
        select: {
          roles: {
            select: {
              id: true,
              isDefault: true,
            },
            where: {
              isDefault: true,
            },
          },
        },
      },
      serverId: true,
      type: true,
    },
    where: {
      id: channelId,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const defaultRoleId = channel.server?.roles[0]?.id ?? null;
  return inferChannelPermissionSettings({
    defaultRoleId,
    locked: channel.locked,
    overrides: channel.permissionOverrides,
    type: channel.type,
  });
}

export async function updateWorkspaceChannelPermissions(
  userId: string,
  channelId: string,
  input: UpdateWorkspaceChannelPermissionsInput,
) {
  const channel = await prisma.channel.findUnique({
    select: {
      id: true,
      locked: true,
      permissionOverrides: {
        select: {
          allow: true,
          deny: true,
          targetId: true,
          targetType: true,
        },
      },
      server: {
        select: {
          roles: {
            select: {
              id: true,
              isDefault: true,
              managed: true,
              permissions: true,
            },
          },
        },
      },
      serverId: true,
      type: true,
    },
    where: {
      id: channelId,
    },
  });

  if (!channel?.serverId || !channel.server) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const permissionMutation = prepareChannelPermissionMutation({
    input,
    roles: channel.server.roles,
    type: channel.type,
  });
  const existingRoleOverrides = channel.permissionOverrides.filter(
    (override) => override.targetType === "ROLE",
  );

  await prisma.$transaction(async (tx) => {
    await tx.channel.update({
      data: {
        locked: permissionMutation.nextLocked,
      },
      where: {
        id: channelId,
      },
    });

    await applyChannelPermissionMutation(tx, {
      allowedRoleIds: permissionMutation.allowedRoleIds,
      channelId,
      defaultRoleId: permissionMutation.defaultRole.id,
      existingRoleOverrides,
      presetPermissions: permissionMutation.presetPermissions,
    });
  });

  if (channel.type === ChannelType.VOICE) {
    await disconnectUnauthorizedVoiceParticipants(channelId);
  }

  getSocketServer()?.to(`server:${channel.serverId}`).emit("server:settings:updated", {
    serverId: channel.serverId,
  });

  return {
    allowedRoleIds: permissionMutation.allowedRoleIds,
    preset: input.preset,
  };
}

export async function reorderWorkspaceChannels(
  userId: string,
  serverId: string,
  items: Array<{
    categoryId: string | null;
    id: string;
    position: number;
  }>,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const existingChannels = await prisma.channel.findMany({
    where: {
      id: {
        in: items.map((item) => item.id),
      },
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (existingChannels.length !== items.length) {
    throw new ApiError("One or more channels could not be found", 404);
  }

  const categoryIds = Array.from(
    new Set(items.flatMap((item) => (item.categoryId ? [item.categoryId] : []))),
  );

  if (categoryIds.length > 0) {
    const existingCategories = await prisma.channelCategory.findMany({
      where: {
        id: {
          in: categoryIds,
        },
        serverId,
      },
      select: {
        id: true,
      },
    });

    if (existingCategories.length !== categoryIds.length) {
      throw new ApiError("One or more categories could not be found", 404);
    }
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.channel.update({
        where: {
          id: item.id,
        },
        data: {
          categoryId: item.categoryId,
          position: item.position,
        },
      }),
    ),
  );

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });
}

export async function reorderWorkspaceCategories(
  userId: string,
  serverId: string,
  items: ReorderCategoriesInput["items"],
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const existingCategories = await prisma.channelCategory.findMany({
    where: {
      id: {
        in: items.map((item) => item.id),
      },
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (existingCategories.length !== items.length) {
    throw new ApiError("One or more categories could not be found", 404);
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.channelCategory.update({
        where: {
          id: item.id,
        },
        data: {
          position: item.position,
        },
      }),
    ),
  );

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { success: true as const };
}

export async function deleteWorkspaceChannel(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      id: true,
      serverId: true,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  await prisma.channel.delete({
    where: {
      id: channelId,
    },
  });

  getSocketServer()?.to(`server:${channel.serverId}`).emit("server:settings:updated", {
    serverId: channel.serverId,
  });
}

export async function clearWorkspaceChannelHistory(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      id: true,
      serverId: true,
      type: true,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  if (channel.type !== ChannelType.TEXT) {
    throw new ApiError("Only text channels can have their history cleared", 400);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureServerPermission(access, PermissionBits.CLEAR_CHANNEL_HISTORY);

  const clearedAt = new Date();

  const deletedCount = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Message"
      SET "replyToId" = NULL,
          "threadParentId" = NULL
      WHERE "replyToId" IN (
        SELECT "id"
        FROM "Message"
        WHERE "channelId" = ${channelId}
      )
      OR "threadParentId" IN (
        SELECT "id"
        FROM "Message"
        WHERE "channelId" = ${channelId}
      )
    `);

    const deletedMessages = await tx.message.deleteMany({
      where: {
        channelId,
      },
    });

    await tx.channelReadState.updateMany({
      where: {
        channelId,
      },
      data: {
        lastReadAt: clearedAt,
        lastReadMessageId: null,
        mentionCount: 0,
      },
    });

    await tx.channel.update({
      where: {
        id: channelId,
      },
      data: {
        lastMessageId: null,
        lastPinAt: null,
        messageCount: 0,
      },
    });

    return deletedMessages.count;
  });

  return {
    channelId,
    clearedAt,
    deletedCount,
    serverId: channel.serverId,
  };
}

export async function createWorkspaceInvite(
  userId: string,
  serverId: string,
  input: CreateInviteInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  let channelId = input.channelId ?? null;

  if (channelId) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        serverId,
      },
      select: {
        id: true,
      },
    });

    if (!channel) {
      throw new ApiError("Channel not found", 404);
    }
  } else {
    const fallbackChannel = await prisma.channel.findFirst({
      orderBy: {
        position: "asc",
      },
      select: {
        id: true,
      },
      where: {
        parentId: null,
        serverId,
        type: ChannelType.TEXT,
      },
    });

    channelId = fallbackChannel?.id ?? null;
  }

  const code = await generateInviteCode();
  const expiresAt =
    input.expiresInHours != null
      ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
      : null;

  await prisma.serverInvite.create({
    data: {
      channelId,
      code,
      createdById: userId,
      expiresAt,
      maxUses: input.maxUses ?? null,
      serverId,
    },
  });

  return { code };
}

export async function addWorkspaceServerMemberByUsername(
  userId: string,
  serverId: string,
  input: AddServerMemberInput,
) {
  const access = await getAccessContext(userId, serverId);
  const username = input.username.trim().replace(/^@+/, "");

  if (username.length < 2) {
    throw new ApiError("Username must be at least 2 characters", 400, "VALIDATION_ERROR");
  }
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      features: true,
      id: true,
      name: true,
      roles: {
        orderBy: {
          position: "desc",
        },
        select: {
          id: true,
          isDefault: true,
        },
      },
      systemChannelId: true,
    },
  });

  if (!server) {
    throw new ApiError("Server not found", 404, "NOT_FOUND");
  }

  const settings = getServerMediaSettings(server.features);
  if (!canAddMembers(access.accessLevel, settings.allowMemberAdds)) {
    throw new ApiError("Members are not allowed to add users to this server", 403, "FORBIDDEN");
  }

  const [targetUser, actor] = await Promise.all([
    prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
      },
      select: {
        avatarUrl: true,
        displayName: true,
        id: true,
        isBanned: true,
        locale: true,
        username: true,
      },
    }),
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        displayName: true,
        username: true,
      },
    }),
  ]);

  if (!targetUser) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  if (targetUser.isBanned) {
    throw new ApiError("This user cannot be added", 403, "FORBIDDEN");
  }

  await ensureUserNotServerBanned(
    prisma,
    serverId,
    targetUser.id,
    "This user is banned from this server",
  );

  if (targetUser.id === userId) {
    throw new ApiError("You are already in this server", 400, "ALREADY_MEMBER");
  }

  const existingMember = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        serverId,
        userId: targetUser.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingMember) {
    throw new ApiError("User is already a member of this server", 400, "ALREADY_MEMBER");
  }

  const result = await prisma.$transaction(async (tx) => {
    await ensureUserNotServerBanned(
      tx,
      serverId,
      targetUser.id,
      "This user is banned from this server",
    );

    const targetChannelId =
      server.systemChannelId ??
      (
        await tx.channel.findFirst({
          orderBy: {
            position: "asc",
          },
          select: {
            id: true,
          },
          where: {
            parentId: null,
            serverId,
            type: ChannelType.TEXT,
          },
        })
      )?.id ??
      null;

    const member = await tx.serverMember.create({
      data: {
        serverId,
        userId: targetUser.id,
      },
      select: {
        id: true,
      },
    });

    const defaultRole = server.roles.find((role) => role.isDefault);
    if (defaultRole) {
      await tx.memberRole.create({
        data: {
          memberId: member.id,
          roleId: defaultRole.id,
        },
      });
    }

    let systemMessage: {
      channelId: string;
      createdAt: Date;
      id: string;
    } | null = null;

    if (targetChannelId) {
      const displayName = targetUser.displayName ?? targetUser.username;
      const message = await tx.message.create({
        data: {
          channelId: targetChannelId,
          content: `${displayName} joined the server.`,
          type: MessageType.SYSTEM_JOIN,
          userId: targetUser.id,
        },
      });

      systemMessage = {
        channelId: targetChannelId,
        createdAt: message.createdAt,
        id: message.id,
      };
    }

    const locale = normalizeAppLocale(targetUser.locale);
    const actorName = actor?.displayName ?? actor?.username ?? "A teammate";
    const notification = await tx.notification.create({
      data: {
        actionUrl: targetChannelId
          ? `/channels/${serverId}/${targetChannelId}`
          : `/channels/${serverId}`,
        body: translate(locale, "workspace.notification.memberAdded.body", {
          actor: actorName,
          server: server.name,
        }),
        metadata: {
          senderId: userId,
          serverId,
          serverName: server.name,
        },
        title: translate(locale, "workspace.notification.memberAdded.title", {
          server: server.name,
        }),
        type: "SERVER_INVITE",
        userId: targetUser.id,
      },
      select: {
        actionUrl: true,
        body: true,
        createdAt: true,
        id: true,
        imageUrl: true,
        metadata: true,
        read: true,
        readAt: true,
        title: true,
        type: true,
        userId: true,
      },
    });

    return {
      message: systemMessage,
      notification,
      targetChannelId,
    };
  });

  const io = getSocketServer();

  if (io) {
    const targetSockets = await io.in(`user:${targetUser.id}`).fetchSockets();
    for (const targetSocket of targetSockets) {
      targetSocket.join(`server:${serverId}`);
    }
  }

  if (result.message) {
    const activeViewerUserIds = getActiveChannelViewerUserIds(result.message.channelId);
    await markChannelReadStates({
      channelId: result.message.channelId,
      lastReadAt: result.message.createdAt,
      lastReadMessageId: result.message.id,
      userIds: [userId, ...activeViewerUserIds],
    });
    const message = await getMessageById(result.message.id);
    if (message) {
      io?.to(result.message.channelId).emit("message:new", message);
    }
  }

  const notificationPayload: NotificationSocketPayload = {
    actionUrl: result.notification.actionUrl,
    body: result.notification.body,
    createdAt: result.notification.createdAt.toISOString(),
    id: result.notification.id,
    imageUrl: result.notification.imageUrl,
    metadata:
      result.notification.metadata &&
      typeof result.notification.metadata === "object" &&
      !Array.isArray(result.notification.metadata)
        ? (result.notification.metadata as Record<string, unknown>)
        : null,
    read: result.notification.read,
    readAt: result.notification.readAt?.toISOString() ?? null,
    title: result.notification.title,
    type: result.notification.type,
    userId: result.notification.userId,
  };

  io?.to(`user:${targetUser.id}`).emit("notification:new", notificationPayload);
  io?.to(`user:${targetUser.id}`).emit("server:membership:added", { serverId });
  io?.to(`user:${targetUser.id}`).emit("server:settings:updated", { serverId });
  io?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  await emitServerUnreadUpdatesForServer(serverId);

  const detail = await getWorkspaceServerDetail(userId, serverId);

  return {
    addedUser: {
      avatarUrl: targetUser.avatarUrl,
      displayName: targetUser.displayName,
      id: targetUser.id,
      username: targetUser.username,
    },
    detail,
  };
}

export async function revokeWorkspaceInvite(userId: string, serverId: string, inviteId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  await prisma.serverInvite.deleteMany({
    where: {
      id: inviteId,
      serverId,
    },
  });
}

export async function kickWorkspaceMember(userId: string, serverId: string, memberId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.KICK_MEMBERS);

  const member = await prisma.serverMember.findFirst({
    where: {
      id: memberId,
      serverId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!member) {
    throw new ApiError("Member not found", 404);
  }

  if (member.userId === userId) {
    throw new ApiError("Use leave server instead of kicking yourself", 400);
  }

  if (member.userId === access.ownerId) {
    throw new ApiError("The server owner cannot be kicked", 403, "OWNER_PROTECTED");
  }

  await prisma.serverMember.delete({
    where: {
      id: member.id,
    },
  });

  const io = await detachUserFromServerSocketRoom(member.userId, serverId);
  io?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  io?.to(`user:${member.userId}`).emit("server:membership:removed", {
    reason: "kicked",
    serverId,
  });
  io?.to(`user:${member.userId}`).emit("server:settings:updated", { serverId });
  await emitServerUnreadUpdatesForServer(serverId);
}

export async function joinWorkspaceServerByInvite(userId: string, code: string) {
  const invite = await prisma.serverInvite.findUnique({
    where: {
      code,
    },
    select: {
      channelId: true,
      expiresAt: true,
      id: true,
      maxUses: true,
      server: {
        select: {
          id: true,
          ownerId: true,
          roles: {
            orderBy: {
              position: "desc",
            },
            select: {
              id: true,
              isDefault: true,
            },
          },
        },
      },
      uses: true,
    },
  });

  if (!invite) {
    throw new ApiError("Invite not found", 404);
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError("Invite has expired", 400);
  }

  const joiningUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      displayName: true,
      isBanned: true,
      username: true,
    },
  });

  if (!joiningUser) {
    throw new ApiError("User not found", 404);
  }

  if (joiningUser.isBanned) {
    throw new ApiError("Your account has been suspended", 403);
  }

  await ensureUserNotServerBanned(prisma, invite.server.id, userId);

  const existingMember = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        serverId: invite.server.id,
        userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!existingMember) {
    const transactionResult = await prisma.$transaction(async (tx) => {
      await ensureUserNotServerBanned(tx, invite.server.id, userId);

      if (invite.maxUses != null) {
        const claimResult = await tx.serverInvite.updateMany({
          where: {
            id: invite.id,
            uses: {
              lt: invite.maxUses,
            },
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });

        if (claimResult.count !== 1) {
          throw new ApiError("Invite has reached its usage limit", 400);
        }
      } else {
        await tx.serverInvite.update({
          where: {
            id: invite.id,
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });
      }

      const targetChannelId =
        invite.channelId ??
        (
          await tx.channel.findFirst({
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
            },
            where: {
              parentId: null,
              serverId: invite.server.id,
              type: ChannelType.TEXT,
            },
          })
        )?.id ??
        null;

      const member = await tx.serverMember.create({
        data: {
          serverId: invite.server.id,
          userId,
        },
        select: {
          id: true,
        },
      });

      const defaultRole = invite.server.roles.find((role) => role.isDefault);

      if (defaultRole) {
        await tx.memberRole.create({
          data: {
            memberId: member.id,
            roleId: defaultRole.id,
          },
        });
      }

      let systemMessage: {
        channelId: string;
        createdAt: Date;
        id: string;
      } | null = null;

      if (targetChannelId) {
        const message = await tx.message.create({
          data: {
            channelId: targetChannelId,
            content: `${joiningUser?.displayName ?? joiningUser?.username ?? "A new Whispr user"} joined the server.`,
            type: MessageType.SYSTEM_JOIN,
            userId,
          },
        });

        systemMessage = {
          channelId: targetChannelId,
          createdAt: message.createdAt,
          id: message.id,
        };
      }

      return { message: systemMessage };
    });

    if (transactionResult.message) {
      const activeViewerUserIds = getActiveChannelViewerUserIds(
        transactionResult.message.channelId,
      );
      await markChannelReadStates({
        channelId: transactionResult.message.channelId,
        lastReadAt: transactionResult.message.createdAt,
        lastReadMessageId: transactionResult.message.id,
        userIds: [userId, ...activeViewerUserIds],
      });
      const message = await getMessageById(transactionResult.message.id);
      if (message) {
        getSocketServer()?.to(transactionResult.message.channelId).emit("message:new", message);
      }
      await emitServerUnreadUpdatesForServer(invite.server.id);
    }

    const io = getSocketServer();

    if (io) {
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      for (const socket of sockets) {
        socket.join(`server:${invite.server.id}`);
      }

      io.to(`server:${invite.server.id}`).emit("server:settings:updated", {
        serverId: invite.server.id,
      });
      io.to(`user:${userId}`).emit("server:settings:updated", {
        serverId: invite.server.id,
      });
    }
  }

  const targetChannel =
    invite.channelId ??
    (
      await prisma.channel.findFirst({
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
        },
        where: {
          parentId: null,
          serverId: invite.server.id,
          type: ChannelType.TEXT,
        },
      })
    )?.id ??
    null;

  return {
    channelId: targetChannel,
    serverId: invite.server.id,
  };
}
