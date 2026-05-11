import { prisma } from "@wizards/db";
import type { ChannelType } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  PermissionBits,
  type ChannelPermissionResolutionContext,
  type PermissionKey,
  type PermissionResolutionContext,
  type PermissionValue,
  type RolePermissionRecord,
  canUseLockedChannelPermission,
  hasPermission,
  requireChannelPermission,
  requireServerPermission,
  resolveChannelPermissions,
} from "@/lib/workspace/permissions";

const permissionRoleSelect = {
  id: true,
  isDefault: true,
  name: true,
  permissions: true,
} as const;

const channelOverrideSelect = {
  allow: true,
  deny: true,
  targetId: true,
  targetType: true,
} as const;

type PermissionRole = RolePermissionRecord;

function mergePermissionRoles(...roleGroups: PermissionRole[][]) {
  const rolesById = new Map<string, PermissionRole>();
  const anonymousRoles: PermissionRole[] = [];

  for (const role of roleGroups.flat()) {
    if (!role.id) {
      anonymousRoles.push(role);
      continue;
    }

    rolesById.set(role.id, role);
  }

  return [...rolesById.values(), ...anonymousRoles];
}

export async function getServerPermissionContext(
  userId: string,
  serverId: string,
): Promise<PermissionResolutionContext> {
  const [membership, defaultRoles, serverBan] = await Promise.all([
    prisma.serverMember.findUnique({
      where: {
        userId_serverId: {
          serverId,
          userId,
        },
      },
      select: {
        id: true,
        roles: {
          select: {
            role: {
              select: permissionRoleSelect,
            },
          },
        },
        server: {
          select: {
            ownerId: true,
          },
        },
      },
    }),
    prisma.role.findMany({
      where: {
        isDefault: true,
        serverId,
      },
      select: permissionRoleSelect,
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
    throw new ApiError("You are not a member of this server", 403, "FORBIDDEN");
  }

  return {
    memberId: membership.id,
    ownerId: membership.server.ownerId,
    roles: mergePermissionRoles(
      defaultRoles,
      membership.roles.map((entry) => entry.role),
    ),
    userId,
  };
}

export async function requireServerPermissionForUser(
  userId: string,
  serverId: string,
  permission: PermissionKey | PermissionValue,
) {
  const context = await getServerPermissionContext(userId, serverId);
  const permissions = requireServerPermission(context, permission);

  return {
    context,
    permissions,
  };
}

export async function getChannelPermissionContext(
  userId: string,
  channelId: string,
  options: {
    requiredServerId?: string;
    requiredType?: ChannelType;
  } = {},
) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      locked: true,
      permissionOverrides: {
        select: channelOverrideSelect,
      },
      serverId: true,
      type: true,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }

  if (options.requiredServerId && channel.serverId !== options.requiredServerId) {
    throw new ApiError("Channel does not belong to this server", 400, "INVALID_SERVER");
  }

  if (options.requiredType && channel.type !== options.requiredType) {
    throw new ApiError("Invalid channel type", 400, "INVALID_CHANNEL_TYPE");
  }

  const serverContext = await getServerPermissionContext(userId, channel.serverId);
  const context: ChannelPermissionResolutionContext = {
    ...serverContext,
    overrides: channel.permissionOverrides,
  };

  return {
    channel: {
      id: channel.id,
      locked: channel.locked,
      serverId: channel.serverId,
      type: channel.type,
    },
    context,
  };
}

export async function requireChannelPermissionForUser(
  userId: string,
  channelId: string,
  permission: PermissionKey | PermissionValue,
  options: {
    forbiddenCode?: string;
    forbiddenMessage?: string;
    lockedCode?: string;
    lockedMessage?: string;
    requiredServerId?: string;
    requiredType?: ChannelType;
    respectLocked?: boolean;
  } = {},
) {
  const contextOptions: { requiredServerId?: string; requiredType?: ChannelType } = {};
  if (options.requiredServerId !== undefined) {
    contextOptions.requiredServerId = options.requiredServerId;
  }
  if (options.requiredType !== undefined) {
    contextOptions.requiredType = options.requiredType;
  }
  const { channel, context } = await getChannelPermissionContext(userId, channelId, contextOptions);

  let permissions: bigint;
  try {
    permissions = requireChannelPermission(context, permission);
  } catch (error) {
    if (error instanceof ApiError && (options.forbiddenCode || options.forbiddenMessage)) {
      throw new ApiError(
        options.forbiddenMessage ?? error.message,
        error.status,
        options.forbiddenCode ?? error.code,
      );
    }
    throw error;
  }

  if (
    options.respectLocked &&
    channel.locked &&
    !canUseLockedChannelPermission(context, permission)
  ) {
    throw new ApiError(
      options.lockedMessage ?? "This channel is locked.",
      403,
      options.lockedCode ?? "CHANNEL_LOCKED",
    );
  }

  return {
    channel,
    context,
    permissions,
  };
}

async function getChannelPermissionTarget(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      locked: true,
      permissionOverrides: {
        select: channelOverrideSelect,
      },
      server: {
        select: {
          ownerId: true,
          roles: {
            where: { isDefault: true },
            select: permissionRoleSelect,
          },
        },
      },
      serverId: true,
    },
  });

  if (!channel?.serverId || !channel.server) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }

  return {
    id: channel.id,
    defaultRoles: channel.server.roles,
    locked: channel.locked,
    ownerId: channel.server.ownerId,
    permissionOverrides: channel.permissionOverrides,
    serverId: channel.serverId,
  };
}

export async function filterUserIdsByChannelPermission(
  channelId: string,
  userIds: string[],
  permission: PermissionKey | PermissionValue,
  options: { respectLocked?: boolean } = {},
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const channel = await getChannelPermissionTarget(channelId);
  const [memberships, bans] = await Promise.all([
    prisma.serverMember.findMany({
      where: {
        serverId: channel.serverId,
        userId: { in: uniqueUserIds },
      },
      select: {
        id: true,
        roles: {
          select: {
            role: {
              select: permissionRoleSelect,
            },
          },
        },
        userId: true,
      },
    }),
    prisma.serverBan.findMany({
      where: {
        serverId: channel.serverId,
        userId: { in: uniqueUserIds },
      },
      select: { userId: true },
    }),
  ]);
  const bannedUserIds = new Set(bans.map((ban) => ban.userId));
  const allowedUserIds = new Set<string>();

  for (const membership of memberships) {
    if (bannedUserIds.has(membership.userId)) {
      continue;
    }

    const context: ChannelPermissionResolutionContext = {
      memberId: membership.id,
      ownerId: channel.ownerId,
      roles: mergePermissionRoles(
        channel.defaultRoles,
        membership.roles.map((entry) => entry.role),
      ),
      userId: membership.userId,
      overrides: channel.permissionOverrides,
    };
    const permissions = resolveChannelPermissions(context);

    const allowed =
      options.respectLocked && channel.locked
        ? canUseLockedChannelPermission(context, permission)
        : hasPermission(permissions, permission);

    if (allowed) {
      allowedUserIds.add(membership.userId);
    }
  }

  return uniqueUserIds.filter((userId) => allowedUserIds.has(userId));
}

export async function listUserIdsWithChannelPermission(
  channelId: string,
  permission: PermissionKey | PermissionValue = PermissionBits.VIEW_CHANNEL,
) {
  const channel = await getChannelPermissionTarget(channelId);
  const memberships = await prisma.serverMember.findMany({
    where: {
      serverId: channel.serverId,
    },
    select: {
      userId: true,
    },
  });

  return filterUserIdsByChannelPermission(
    channelId,
    memberships.map((membership) => membership.userId),
    permission,
  );
}

export async function listChannelIdsForUserWithPermission(
  userId: string,
  serverId: string,
  permission: PermissionKey | PermissionValue = PermissionBits.VIEW_CHANNEL,
  type?: ChannelType,
) {
  const serverContext = await getServerPermissionContext(userId, serverId);
  const channels = await prisma.channel.findMany({
    where: {
      parentId: null,
      serverId,
      ...(type ? { type } : {}),
    },
    select: {
      id: true,
      permissionOverrides: {
        select: channelOverrideSelect,
      },
    },
  });

  return channels
    .filter((channel) =>
      hasPermission(
        resolveChannelPermissions({
          ...serverContext,
          overrides: channel.permissionOverrides,
        }),
        permission,
      ),
    )
    .map((channel) => channel.id);
}
