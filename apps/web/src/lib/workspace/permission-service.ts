import { prisma } from "@wizards/db";
import type { ChannelType } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  readCachedChannelPermissionSnapshot,
  readCachedChannelPermissionSnapshots,
  readCachedVisibleChannelIds,
  writeCachedChannelPermissionSnapshot,
  writeCachedChannelPermissionSnapshots,
  writeCachedVisibleChannelIds,
  type CachedChannelPermissionSnapshot,
} from "@/lib/workspace/permission-cache";
import {
  ADMIN_ACCESS_PERMISSIONS,
  PermissionBits,
  type ChannelPermissionResolutionContext,
  type PermissionKey,
  type PermissionResolutionContext,
  type PermissionValue,
  type RolePermissionRecord,
  canUseLockedChannelPermission,
  getExplicitChannelAllowPermissions,
  hasAnyPermission,
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

function canUseCachedLockedChannelPermission(
  snapshot: CachedChannelPermissionSnapshot,
  permission: PermissionKey | PermissionValue,
) {
  if (!hasPermission(snapshot.permissions, permission)) {
    return false;
  }

  if (hasAnyPermission(snapshot.permissions, [...ADMIN_ACCESS_PERMISSIONS])) {
    return true;
  }

  return hasPermission(snapshot.explicitAllowPermissions, permission);
}

function hasCachedChannelPermission(
  snapshot: CachedChannelPermissionSnapshot,
  permission: PermissionKey | PermissionValue,
  options: { respectLocked?: boolean } = {},
) {
  if (!hasPermission(snapshot.permissions, permission)) {
    return false;
  }

  if (!options.respectLocked || !snapshot.channel.locked) {
    return true;
  }

  return canUseCachedLockedChannelPermission(snapshot, permission);
}

function createChannelPermissionSnapshot(args: {
  channel: {
    id: string;
    locked: boolean;
    serverId: string;
    type: ChannelType;
  };
  context: ChannelPermissionResolutionContext;
  permissions: bigint;
}): CachedChannelPermissionSnapshot {
  return {
    channel: args.channel,
    context: args.context,
    explicitAllowPermissions: getExplicitChannelAllowPermissions(args.context),
    permissions: args.permissions,
  };
}

function assertCachedChannelPermission(
  snapshot: CachedChannelPermissionSnapshot,
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
  if (options.requiredServerId && snapshot.channel.serverId !== options.requiredServerId) {
    throw new ApiError("Channel does not belong to this server", 400, "INVALID_SERVER");
  }

  if (options.requiredType && snapshot.channel.type !== options.requiredType) {
    throw new ApiError("Invalid channel type", 400, "INVALID_CHANNEL_TYPE");
  }

  if (!hasPermission(snapshot.permissions, permission)) {
    throw new ApiError(
      options.forbiddenMessage ?? "You do not have permission to access this channel.",
      403,
      options.forbiddenCode ?? "FORBIDDEN",
    );
  }

  if (
    options.respectLocked &&
    snapshot.channel.locked &&
    !canUseCachedLockedChannelPermission(snapshot, permission)
  ) {
    throw new ApiError(
      options.lockedMessage ?? "This channel is locked.",
      403,
      options.lockedCode ?? "CHANNEL_LOCKED",
    );
  }
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
  const cachedSnapshot = await readCachedChannelPermissionSnapshot(userId, channelId);
  if (cachedSnapshot) {
    assertCachedChannelPermission(cachedSnapshot, permission, options);

    return {
      channel: cachedSnapshot.channel,
      context: cachedSnapshot.context,
      permissions: cachedSnapshot.permissions,
    };
  }

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

  await writeCachedChannelPermissionSnapshot({
    channelId,
    snapshot: createChannelPermissionSnapshot({ channel, context, permissions }),
    userId,
  });

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
      type: true,
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
    type: channel.type,
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

  const cachedSnapshots = await readCachedChannelPermissionSnapshots(channelId, uniqueUserIds);
  const allowedUserIds = new Set<string>();
  const uncachedUserIds: string[] = [];

  for (const userId of uniqueUserIds) {
    const snapshot = cachedSnapshots.get(userId);
    if (!snapshot) {
      uncachedUserIds.push(userId);
      continue;
    }

    if (hasCachedChannelPermission(snapshot, permission, options)) {
      allowedUserIds.add(userId);
    }
  }

  if (uncachedUserIds.length === 0) {
    return uniqueUserIds.filter((userId) => allowedUserIds.has(userId));
  }

  const channel = await getChannelPermissionTarget(channelId);
  const [memberships, bans] = await Promise.all([
    prisma.serverMember.findMany({
      where: {
        serverId: channel.serverId,
        userId: { in: uncachedUserIds },
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
        userId: { in: uncachedUserIds },
      },
      select: { userId: true },
    }),
  ]);
  const bannedUserIds = new Set(bans.map((ban) => ban.userId));
  const snapshotsToCache: Array<{
    channelId: string;
    snapshot: CachedChannelPermissionSnapshot;
    userId: string;
  }> = [];

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
    const snapshot = createChannelPermissionSnapshot({
      channel: {
        id: channel.id,
        locked: channel.locked,
        serverId: channel.serverId,
        type: channel.type,
      },
      context,
      permissions,
    });
    snapshotsToCache.push({
      channelId,
      snapshot,
      userId: membership.userId,
    });

    if (hasCachedChannelPermission(snapshot, permission, options)) {
      allowedUserIds.add(membership.userId);
    }
  }

  await writeCachedChannelPermissionSnapshots(snapshotsToCache);

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
  const cacheKeyArgs = {
    permission,
    serverId,
    userId,
    ...(type !== undefined ? { type } : {}),
  };
  const cachedChannelIds = await readCachedVisibleChannelIds(cacheKeyArgs);
  if (cachedChannelIds) {
    return cachedChannelIds;
  }

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

  const channelIds = channels
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

  await writeCachedVisibleChannelIds({
    channelIds,
    permission,
    serverId,
    userId,
    ...(type !== undefined ? { type } : {}),
  });

  return channelIds;
}
