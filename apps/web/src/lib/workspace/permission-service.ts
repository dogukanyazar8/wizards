import { prisma } from "@wizards/db";
import type { ChannelType } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  authorizationRevisionsEqual,
  readAuthorizationRevisionsForUserAcrossServers,
  readServerAuthorizationRevisions,
  type AuthorizationRevision,
} from "@/lib/workspace/authorization-revision";
import {
  readCachedChannelPermissionSnapshot,
  readCachedChannelPermissionSnapshots,
  readCachedVisibleChannelIds,
  readCachedVisibleChannelIdsBatch,
  readCachedVisibleChannelIdsByServerBatch,
  writeCachedChannelPermissionSnapshot,
  writeCachedChannelPermissionSnapshots,
  writeCachedVisibleChannelIds,
  writeCachedVisibleChannelIdsBatch,
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

export const PRIVILEGED_PERMISSION_CACHE_MAX_AGE_SECONDS = 15;

const PRIVILEGED_PERMISSION_CACHE_PERMISSIONS: PermissionValue[] = [
  PermissionBits.ADMINISTRATOR,
  PermissionBits.MANAGE_SERVER,
  PermissionBits.MANAGE_CHANNELS,
  PermissionBits.MANAGE_ROLES,
  PermissionBits.MANAGE_MESSAGES,
  PermissionBits.CLEAR_CHANNEL_HISTORY,
  PermissionBits.MANAGE_INVITES,
  PermissionBits.KICK_MEMBERS,
  PermissionBits.BAN_MEMBERS,
  PermissionBits.TIMEOUT_MEMBERS,
  PermissionBits.VIEW_AUDIT_LOG,
  PermissionBits.MENTION_EVERYONE,
  // Etkinlikler K4 — yeni bit akranlarıyla aynı önbellek penceresini alır; geri alınmış bir
  // `MANAGE_EVENTS` rolü `MENTION_EVERYONE`den daha uzun süre bayat kalmamalı.
  PermissionBits.MANAGE_EVENTS,
  PermissionBits.MUTE_MEMBERS,
  PermissionBits.DEAFEN_MEMBERS,
  PermissionBits.MOVE_MEMBERS,
];

const channelOverrideSelect = {
  allow: true,
  deny: true,
  targetId: true,
  targetType: true,
} as const;

export const CHANNEL_PERMISSION_FILTER_BATCH_SIZE = 500;

type PermissionRole = RolePermissionRecord;
type ChannelPermissionSnapshotChannel = CachedChannelPermissionSnapshot["channel"];

function chunkChannelPermissionUserIds(userIds: string[]) {
  const chunks: string[][] = [];

  for (let index = 0; index < userIds.length; index += CHANNEL_PERMISSION_FILTER_BATCH_SIZE) {
    chunks.push(userIds.slice(index, index + CHANNEL_PERMISSION_FILTER_BATCH_SIZE));
  }

  return chunks;
}

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
  channel: ChannelPermissionSnapshotChannel;
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
    revisions?: AuthorizationRevision;
    serverId?: string;
    requiredServerId?: string;
    requiredType?: ChannelType;
  } = {},
) {
  const serverId = options.serverId ?? (await getChannelPermissionServerId(channelId));

  // Sample before reading overrides and membership roles. Otherwise a
  // concurrent revocation can be cached under the revision that revoked it.
  const revisions =
    options.revisions ??
    (
      await readServerAuthorizationRevisions(prisma as never, serverId, [userId])
    ).revisionsByUser.get(userId);
  if (!revisions) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      bitrate: true,
      id: true,
      locked: true,
      name: true,
      slowModeDelay: true,
      permissionOverrides: {
        select: channelOverrideSelect,
      },
      server: {
        select: {
          features: true,
          messageCharacterLimit: true,
        },
      },
      serverId: true,
      rtcRegion: true,
      type: true,
      userLimit: true,
      videoQualityMode: true,
    },
  });

  if (!channel?.serverId || !channel.server) {
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
      bitrate: channel.bitrate,
      id: channel.id,
      locked: channel.locked,
      name: channel.name,
      slowModeDelay: channel.slowModeDelay,
      server: {
        features: channel.server.features,
        messageCharacterLimit: channel.server.messageCharacterLimit,
      },
      serverId: channel.serverId,
      rtcRegion: channel.rtcRegion,
      type: channel.type,
      userLimit: channel.userLimit,
      videoQualityMode: channel.videoQualityMode,
    },
    context,
    revisions,
  };
}

function getPermissionCacheReadOptions(
  permission: PermissionKey | PermissionValue,
  maxAgeSeconds?: number,
) {
  if (maxAgeSeconds !== undefined) {
    return { maxAgeSeconds };
  }

  const permissionValue = typeof permission === "string" ? PermissionBits[permission] : permission;
  if (hasAnyPermission(permissionValue, PRIVILEGED_PERMISSION_CACHE_PERMISSIONS)) {
    return { maxAgeSeconds: PRIVILEGED_PERMISSION_CACHE_MAX_AGE_SECONDS };
  }

  return {};
}

export async function requireChannelPermissionForUser(
  userId: string,
  channelId: string,
  permission: PermissionKey | PermissionValue,
  options: {
    cacheMaxAgeSeconds?: number;
    forbiddenCode?: string;
    forbiddenMessage?: string;
    lockedCode?: string;
    lockedMessage?: string;
    requiredServerId?: string;
    requiredType?: ChannelType;
    respectLocked?: boolean;
  } = {},
) {
  const serverId = await getChannelPermissionServerId(channelId);
  const revisionRead = await readServerAuthorizationRevisions(prisma as never, serverId, [userId]);
  const revisions = revisionRead.revisionsByUser.get(userId);
  if (!revisionRead.serverExists || !revisions) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }
  const cacheReadOptions = {
    ...getPermissionCacheReadOptions(permission, options.cacheMaxAgeSeconds),
    revisionsByUser: revisionRead.revisionsByUser,
  };
  const cachedSnapshot = await readCachedChannelPermissionSnapshot(
    userId,
    channelId,
    cacheReadOptions,
  );
  if (cachedSnapshot) {
    assertCachedChannelPermission(cachedSnapshot, permission, options);

    return {
      channel: cachedSnapshot.channel,
      context: cachedSnapshot.context,
      permissions: cachedSnapshot.permissions,
    };
  }

  const contextOptions: {
    requiredServerId?: string;
    requiredType?: ChannelType;
    revisions: AuthorizationRevision;
    serverId: string;
  } = { revisions, serverId };
  if (options.requiredServerId !== undefined) {
    contextOptions.requiredServerId = options.requiredServerId;
  }
  if (options.requiredType !== undefined) {
    contextOptions.requiredType = options.requiredType;
  }
  const {
    channel,
    context,
    revisions: resolvedRevisions,
  } = await getChannelPermissionContext(userId, channelId, contextOptions);

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

  const currentRevisions = (
    await readServerAuthorizationRevisions(prisma as never, channel.serverId, [userId])
  ).revisionsByUser.get(userId);
  if (authorizationRevisionsEqual(resolvedRevisions, currentRevisions)) {
    await writeCachedChannelPermissionSnapshot({
      channelId,
      revisions: resolvedRevisions,
      snapshot: createChannelPermissionSnapshot({ channel, context, permissions }),
      userId,
    });
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
      bitrate: true,
      id: true,
      locked: true,
      name: true,
      slowModeDelay: true,
      permissionOverrides: {
        select: channelOverrideSelect,
      },
      server: {
        select: {
          features: true,
          messageCharacterLimit: true,
          ownerId: true,
          roles: {
            where: { isDefault: true },
            select: permissionRoleSelect,
          },
        },
      },
      serverId: true,
      rtcRegion: true,
      type: true,
      userLimit: true,
      videoQualityMode: true,
    },
  });

  if (!channel?.serverId || !channel.server) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }

  return {
    bitrate: channel.bitrate,
    id: channel.id,
    defaultRoles: channel.server.roles,
    locked: channel.locked,
    name: channel.name,
    slowModeDelay: channel.slowModeDelay,
    ownerId: channel.server.ownerId,
    permissionOverrides: channel.permissionOverrides,
    server: {
      features: channel.server.features,
      messageCharacterLimit: channel.server.messageCharacterLimit,
    },
    serverId: channel.serverId,
    rtcRegion: channel.rtcRegion,
    type: channel.type,
    userLimit: channel.userLimit,
    videoQualityMode: channel.videoQualityMode,
  };
}

async function getChannelPermissionServerId(channelId: string) {
  const target = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { serverId: true },
  });

  if (!target?.serverId) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }

  return target.serverId;
}

export async function filterUserIdsByChannelPermission(
  channelId: string,
  userIds: string[],
  permission: PermissionKey | PermissionValue,
  options: { cacheMaxAgeSeconds?: number; respectLocked?: boolean } = {},
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const serverId = await getChannelPermissionServerId(channelId);
  const sampledRevisionRead = await readServerAuthorizationRevisions(
    prisma as never,
    serverId,
    uniqueUserIds,
  );
  if (!sampledRevisionRead.serverExists) {
    return [];
  }
  const allowedUserIds = new Set<string>();
  const cacheReadOptions = {
    ...getPermissionCacheReadOptions(permission, options.cacheMaxAgeSeconds),
    revisionsByUser: sampledRevisionRead.revisionsByUser,
  };
  const uncachedUserIds: string[] = [];

  for (const batchUserIds of chunkChannelPermissionUserIds(uniqueUserIds)) {
    const cachedSnapshots = await readCachedChannelPermissionSnapshots(
      channelId,
      batchUserIds,
      cacheReadOptions,
    );
    for (const userId of batchUserIds) {
      const snapshot = cachedSnapshots.get(userId);
      if (!snapshot) {
        uncachedUserIds.push(userId);
        continue;
      }

      if (hasCachedChannelPermission(snapshot, permission, options)) {
        allowedUserIds.add(userId);
      }
    }
  }

  if (uncachedUserIds.length === 0) {
    return uniqueUserIds.filter((userId) => allowedUserIds.has(userId));
  }

  const sampledRevisions = sampledRevisionRead.revisionsByUser;
  const channel = await getChannelPermissionTarget(channelId);
  if (channel.serverId !== serverId) {
    throw new ApiError(
      "Channel changed servers during permission resolution",
      409,
      "STALE_CHANNEL",
    );
  }

  for (const batchUserIds of chunkChannelPermissionUserIds(uncachedUserIds)) {
    const [memberships, bans] = await Promise.all([
      prisma.serverMember.findMany({
        where: {
          serverId: channel.serverId,
          userId: { in: batchUserIds },
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
          userId: { in: batchUserIds },
        },
        select: { userId: true },
      }),
    ]);
    const bannedUserIds = new Set(bans.map((ban) => ban.userId));
    const snapshotsToCache: Array<{
      channelId: string;
      revisions: AuthorizationRevision;
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
          bitrate: channel.bitrate,
          id: channel.id,
          locked: channel.locked,
          name: channel.name,
          slowModeDelay: channel.slowModeDelay,
          server: channel.server,
          serverId: channel.serverId,
          rtcRegion: channel.rtcRegion,
          type: channel.type,
          userLimit: channel.userLimit,
          videoQualityMode: channel.videoQualityMode,
        },
        context,
        permissions,
      });
      const revisions = sampledRevisions.get(membership.userId);
      if (!revisions) {
        throw new Error(`Missing sampled permission-cache revision for ${membership.userId}`);
      }
      snapshotsToCache.push({
        channelId,
        revisions,
        snapshot,
        userId: membership.userId,
      });

      if (hasCachedChannelPermission(snapshot, permission, options)) {
        allowedUserIds.add(membership.userId);
      }
    }

    const currentRevisions = (
      await readServerAuthorizationRevisions(prisma as never, serverId, batchUserIds)
    ).revisionsByUser;
    await writeCachedChannelPermissionSnapshots(
      snapshotsToCache.filter((entry) =>
        authorizationRevisionsEqual(entry.revisions, currentRevisions.get(entry.userId)),
      ),
    );
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

export async function listChannelIdsForUsersWithPermission(
  userIds: string[],
  serverId: string,
  permission: PermissionKey | PermissionValue = PermissionBits.VIEW_CHANNEL,
  type?: ChannelType,
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const channelIdsByUser = new Map<string, string[]>(uniqueUserIds.map((userId) => [userId, []]));
  if (uniqueUserIds.length === 0) {
    return channelIdsByUser;
  }

  const sampledRevisionRead = await readServerAuthorizationRevisions(
    prisma as never,
    serverId,
    uniqueUserIds,
  );
  if (!sampledRevisionRead.serverExists) {
    return channelIdsByUser;
  }
  const cachedChannelIdsByUser = await readCachedVisibleChannelIdsBatch({
    ...getPermissionCacheReadOptions(permission),
    permission,
    revisionsByUser: sampledRevisionRead.revisionsByUser,
    serverId,
    userIds: uniqueUserIds,
    ...(type !== undefined ? { type } : {}),
  });
  for (const [userId, channelIds] of cachedChannelIdsByUser) {
    channelIdsByUser.set(userId, channelIds);
  }

  const uncachedUserIds = uniqueUserIds.filter((userId) => !cachedChannelIdsByUser.has(userId));
  if (uncachedUserIds.length === 0) {
    return channelIdsByUser;
  }

  const [server, channels, memberships, bans] = await Promise.all([
    prisma.server.findUnique({
      where: { id: serverId },
      select: {
        ownerId: true,
        roles: {
          where: { isDefault: true },
          select: permissionRoleSelect,
        },
      },
    }),
    prisma.channel.findMany({
      where: {
        parentId: null,
        serverId,
        ...(type !== undefined ? { type } : {}),
      },
      select: {
        id: true,
        permissionOverrides: {
          select: channelOverrideSelect,
        },
      },
    }),
    prisma.serverMember.findMany({
      where: {
        serverId,
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
        serverId,
        userId: { in: uncachedUserIds },
      },
      select: { userId: true },
    }),
  ]);

  if (!server) {
    return channelIdsByUser;
  }

  const bannedUserIds = new Set(bans.map((ban) => ban.userId));
  const cacheEntries: Array<{
    channelIds: string[];
    permission: PermissionKey | PermissionValue;
    revisions: AuthorizationRevision;
    serverId: string;
    type?: ChannelType;
    userId: string;
  }> = [];

  for (const membership of memberships) {
    if (bannedUserIds.has(membership.userId)) {
      continue;
    }

    const serverContext: PermissionResolutionContext = {
      memberId: membership.id,
      ownerId: server.ownerId,
      roles: mergePermissionRoles(
        server.roles,
        membership.roles.map((entry) => entry.role),
      ),
      userId: membership.userId,
    };
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

    channelIdsByUser.set(membership.userId, channelIds);
    cacheEntries.push({
      channelIds,
      permission,
      revisions: sampledRevisionRead.revisionsByUser.get(membership.userId)!,
      serverId,
      userId: membership.userId,
      ...(type !== undefined ? { type } : {}),
    });
  }

  const currentRevisions = (
    await readServerAuthorizationRevisions(prisma as never, serverId, uncachedUserIds)
  ).revisionsByUser;
  await writeCachedVisibleChannelIdsBatch(
    cacheEntries.filter((entry) =>
      authorizationRevisionsEqual(entry.revisions, currentRevisions.get(entry.userId)),
    ),
  );

  return channelIdsByUser;
}

export async function listChannelIdsForUserWithPermission(
  userId: string,
  serverId: string,
  permission: PermissionKey | PermissionValue = PermissionBits.VIEW_CHANNEL,
  type?: ChannelType,
) {
  const sampledRevisionRead = await readServerAuthorizationRevisions(prisma as never, serverId, [
    userId,
  ]);
  const sampledRevisions = sampledRevisionRead.revisionsByUser.get(userId);
  if (!sampledRevisionRead.serverExists || !sampledRevisions) {
    return [];
  }
  const cacheKeyArgs = {
    ...getPermissionCacheReadOptions(permission),
    permission,
    revisions: sampledRevisions,
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

  const currentRevisions = (
    await readServerAuthorizationRevisions(prisma as never, serverId, [userId])
  ).revisionsByUser.get(userId);
  if (authorizationRevisionsEqual(sampledRevisions, currentRevisions)) {
    await writeCachedVisibleChannelIds({
      channelIds,
      permission,
      revisions: sampledRevisions,
      serverId,
      userId,
      ...(type !== undefined ? { type } : {}),
    });
  }

  return channelIds;
}

export async function listChannelIdsByServerForUserWithPermission(
  userId: string,
  serverIds: string[],
  permission: PermissionKey | PermissionValue = PermissionBits.VIEW_CHANNEL,
  type?: ChannelType,
) {
  const uniqueServerIds = Array.from(new Set(serverIds.filter(Boolean)));
  const channelIdsByServer = new Map<string, string[]>(
    uniqueServerIds.map((serverId) => [serverId, []]),
  );
  if (!userId || uniqueServerIds.length === 0) {
    return channelIdsByServer;
  }

  const sampledRevisionsByServer = await readAuthorizationRevisionsForUserAcrossServers(
    prisma as never,
    uniqueServerIds,
    userId,
  );
  // Cold bootstrap can contain 50 servers. Read every visibility key and both
  // revision families in batched Redis commands instead of one command set per
  // server.
  const cachedChannelIdsByServer = await readCachedVisibleChannelIdsByServerBatch({
    ...getPermissionCacheReadOptions(permission),
    permission,
    revisionsByServer: sampledRevisionsByServer,
    serverIds: uniqueServerIds,
    userId,
    ...(type !== undefined ? { type } : {}),
  });
  const uncachedServerIds: string[] = [];
  for (const serverId of uniqueServerIds) {
    const cachedChannelIds = cachedChannelIdsByServer.get(serverId) ?? null;
    if (cachedChannelIds) {
      channelIdsByServer.set(serverId, cachedChannelIds);
    } else {
      uncachedServerIds.push(serverId);
    }
  }

  if (uncachedServerIds.length === 0) {
    return channelIdsByServer;
  }

  const [memberships, defaultRoles, bans, channels] = await Promise.all([
    prisma.serverMember.findMany({
      where: {
        serverId: { in: uncachedServerIds },
        userId,
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
        serverId: true,
      },
    }),
    prisma.role.findMany({
      where: {
        isDefault: true,
        serverId: { in: uncachedServerIds },
      },
      select: {
        ...permissionRoleSelect,
        serverId: true,
      },
    }),
    prisma.serverBan.findMany({
      where: {
        serverId: { in: uncachedServerIds },
        userId,
      },
      select: { serverId: true },
    }),
    prisma.channel.findMany({
      where: {
        parentId: null,
        serverId: { in: uncachedServerIds },
        ...(type ? { type } : {}),
      },
      select: {
        id: true,
        permissionOverrides: {
          select: channelOverrideSelect,
        },
        serverId: true,
      },
    }),
  ]);
  const bannedServerIds = new Set(bans.map((ban) => ban.serverId));
  const membershipsByServerId = new Map(
    memberships.map((membership) => [membership.serverId, membership]),
  );
  const defaultRolesByServerId = new Map<string, PermissionRole[]>();
  for (const role of defaultRoles) {
    const { serverId, ...permissionRole } = role;
    const roles = defaultRolesByServerId.get(serverId) ?? [];
    roles.push(permissionRole);
    defaultRolesByServerId.set(serverId, roles);
  }
  const channelsByServerId = new Map<string, Array<(typeof channels)[number]>>();
  for (const channel of channels) {
    if (!channel.serverId) {
      continue;
    }
    const serverChannels = channelsByServerId.get(channel.serverId) ?? [];
    serverChannels.push(channel);
    channelsByServerId.set(channel.serverId, serverChannels);
  }

  const cacheEntries: Array<{
    channelIds: string[];
    permission: PermissionKey | PermissionValue;
    revisions: AuthorizationRevision;
    serverId: string;
    type?: ChannelType;
    userId: string;
  }> = [];

  for (const serverId of uncachedServerIds) {
    const membership = membershipsByServerId.get(serverId);
    if (!membership || bannedServerIds.has(serverId)) {
      continue;
    }

    const serverContext: PermissionResolutionContext = {
      memberId: membership.id,
      ownerId: membership.server.ownerId,
      roles: mergePermissionRoles(
        defaultRolesByServerId.get(serverId) ?? [],
        membership.roles.map((entry) => entry.role),
      ),
      userId,
    };
    const channelIds = (channelsByServerId.get(serverId) ?? [])
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

    channelIdsByServer.set(serverId, channelIds);
    cacheEntries.push({
      channelIds,
      permission,
      revisions: sampledRevisionsByServer.get(serverId)!,
      serverId,
      userId,
      ...(type !== undefined ? { type } : {}),
    });
  }

  const currentRevisionsByServer = await readAuthorizationRevisionsForUserAcrossServers(
    prisma as never,
    uncachedServerIds,
    userId,
  );
  await writeCachedVisibleChannelIdsBatch(
    cacheEntries.filter((entry) =>
      authorizationRevisionsEqual(entry.revisions, currentRevisionsByServer.get(entry.serverId)),
    ),
  );

  return channelIdsByServer;
}
