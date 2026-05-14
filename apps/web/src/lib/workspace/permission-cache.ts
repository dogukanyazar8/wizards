import type { ChannelType } from "@wizards/db";
import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import {
  recordPermissionCacheInvalidation,
  recordPermissionCacheMetric,
} from "@/lib/workspace/performance-metrics";
import {
  PermissionBits,
  type ChannelPermissionResolutionContext,
  type PermissionKey,
  type PermissionValue,
} from "@/lib/workspace/permissions";

const PERMISSION_CACHE_TTL_SECONDS = 45;
const PERMISSION_CACHE_VERSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const PERMISSION_CACHE_SCHEMA_VERSION = "v2";

type PermissionCacheReadOptions = {
  maxAgeSeconds?: number;
};

type PermissionCachePipeline = {
  exec(): Promise<unknown>;
  expire(key: string, seconds: number): PermissionCachePipeline;
  incr(key: string): PermissionCachePipeline;
  set(key: string, value: string, mode: "EX", seconds: number): PermissionCachePipeline;
};

type PermissionCacheRedis = {
  mget(...keys: string[]): Promise<Array<string | null>>;
  pipeline(): PermissionCachePipeline;
  status?: string;
};

type PermissionCacheRole = {
  id?: string;
  isDefault?: boolean | null;
  name?: string;
  permissions: string;
};

type PermissionCacheOverride = {
  allow: string;
  deny: string;
  targetId: string;
  targetType: "ROLE" | "USER";
};

type PermissionCacheContext = {
  memberId?: string | null;
  ownerId: string;
  roles: PermissionCacheRole[];
  userId: string;
  overrides?: PermissionCacheOverride[];
};

type PermissionCacheChannelSnapshot = {
  cachedAt: number;
  channel: {
    id: string;
    locked: boolean;
    name: string;
    server: {
      features: string[];
      messageCharacterLimit: number;
    };
    serverId: string;
    type: ChannelType;
  };
  context: PermissionCacheContext;
  explicitAllowPermissions: string;
  memberVersion: string;
  permissions: string;
  serverVersion: string;
};

type PermissionCacheChannelList = {
  cachedAt: number;
  channelIds: string[];
  memberVersion: string;
  serverVersion: string;
};

export type CachedChannelPermissionSnapshot = {
  channel: {
    id: string;
    locked: boolean;
    name: string;
    server: {
      features: string[];
      messageCharacterLimit: number;
    };
    serverId: string;
    type: ChannelType;
  };
  context: ChannelPermissionResolutionContext;
  explicitAllowPermissions: bigint;
  permissions: bigint;
};

let permissionCacheRedisForTest: PermissionCacheRedis | null = null;

function isPermissionCacheEnabled() {
  if (process.env.PERMISSION_CACHE_DISABLED === "true") {
    return false;
  }
  if (process.env.PERMISSION_CACHE_ENABLED === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "test";
}

function getReadyRedis() {
  if (!isPermissionCacheEnabled()) {
    return null;
  }
  if (permissionCacheRedisForTest) {
    return permissionCacheRedisForTest;
  }

  const redis = getRedis();
  return redis.status === "ready" ? (redis as PermissionCacheRedis) : null;
}

export function setPermissionCacheRedisForTest(redis: PermissionCacheRedis | null) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setPermissionCacheRedisForTest is not available in production.");
  }
  permissionCacheRedisForTest = redis;
}

function permissionValueToString(permission: PermissionKey | PermissionValue) {
  const value = typeof permission === "string" ? PermissionBits[permission] : permission;
  return value.toString();
}

function channelPermissionSnapshotKey(channelId: string, userId: string) {
  return `permission:${PERMISSION_CACHE_SCHEMA_VERSION}:channel:${channelId}:${userId}`;
}

function visibleChannelListKey(args: {
  permission: PermissionKey | PermissionValue;
  serverId: string;
  type?: ChannelType;
  userId: string;
}) {
  const typeKey = args.type ?? "ALL";
  return `permission:${PERMISSION_CACHE_SCHEMA_VERSION}:channels:${args.serverId}:${args.userId}:${permissionValueToString(args.permission)}:${typeKey}`;
}

function serverVersionKey(serverId: string) {
  return `permission:server:${serverId}:v`;
}

function memberVersionKey(serverId: string, userId: string) {
  return `permission:member:${serverId}:${userId}:v`;
}

function parseVersion(value: string | null) {
  return value ?? "0";
}

function parseBigInt(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function isFreshEnough(cachedAt: number, options: PermissionCacheReadOptions) {
  if (options.maxAgeSeconds === undefined) {
    return true;
  }

  return Date.now() - cachedAt <= options.maxAgeSeconds * 1000;
}

function serializeContext(context: ChannelPermissionResolutionContext): PermissionCacheContext {
  return {
    ...(context.memberId !== undefined ? { memberId: context.memberId } : {}),
    ownerId: context.ownerId,
    roles: context.roles.map((role) => ({
      permissions: role.permissions.toString(),
      ...(role.id !== undefined ? { id: role.id } : {}),
      ...(role.isDefault !== undefined ? { isDefault: role.isDefault } : {}),
      ...(role.name !== undefined ? { name: role.name } : {}),
    })),
    userId: context.userId,
    ...(context.overrides !== undefined
      ? {
          overrides: context.overrides.map((override) => ({
            allow: override.allow.toString(),
            deny: override.deny.toString(),
            targetId: override.targetId,
            targetType: override.targetType,
          })),
        }
      : {}),
  };
}

function parseContext(context: PermissionCacheContext): ChannelPermissionResolutionContext | null {
  if (
    !context ||
    typeof context.ownerId !== "string" ||
    typeof context.userId !== "string" ||
    !Array.isArray(context.roles)
  ) {
    return null;
  }

  const roles = context.roles.map((role) => {
    const permissions = parseBigInt(role.permissions);
    if (permissions === null) {
      return null;
    }

    return {
      id: role.id,
      isDefault: role.isDefault,
      name: role.name,
      permissions,
    };
  });

  if (roles.some((role) => role === null)) {
    return null;
  }

  const overrides = context.overrides?.map((override) => {
    const allow = parseBigInt(override.allow);
    const deny = parseBigInt(override.deny);
    if (
      allow === null ||
      deny === null ||
      typeof override.targetId !== "string" ||
      !["ROLE", "USER"].includes(override.targetType)
    ) {
      return null;
    }

    return {
      allow,
      deny,
      targetId: override.targetId,
      targetType: override.targetType,
    };
  });

  if (overrides?.some((override) => override === null)) {
    return null;
  }

  const hydratedContext: ChannelPermissionResolutionContext = {
    ownerId: context.ownerId,
    roles: roles as ChannelPermissionResolutionContext["roles"],
    userId: context.userId,
  };

  if (context.memberId !== undefined) {
    hydratedContext.memberId = context.memberId;
  }
  if (overrides !== undefined) {
    hydratedContext.overrides =
      overrides as NonNullable<ChannelPermissionResolutionContext["overrides"]>;
  }

  return hydratedContext;
}

function serializeSnapshot(
  snapshot: CachedChannelPermissionSnapshot,
  revisions: { memberVersion: string; serverVersion: string },
): PermissionCacheChannelSnapshot {
  return {
    cachedAt: Date.now(),
    channel: snapshot.channel,
    context: serializeContext(snapshot.context),
    explicitAllowPermissions: snapshot.explicitAllowPermissions.toString(),
    memberVersion: revisions.memberVersion,
    permissions: snapshot.permissions.toString(),
    serverVersion: revisions.serverVersion,
  };
}

function parseSnapshot(raw: string): PermissionCacheChannelSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PermissionCacheChannelSnapshot>;
    if (
      !parsed.channel ||
      typeof parsed.channel.id !== "string" ||
      typeof parsed.channel.locked !== "boolean" ||
      typeof parsed.channel.name !== "string" ||
      !parsed.channel.server ||
      !Array.isArray(parsed.channel.server.features) ||
      parsed.channel.server.features.some((feature) => typeof feature !== "string") ||
      typeof parsed.channel.server.messageCharacterLimit !== "number" ||
      typeof parsed.channel.serverId !== "string" ||
      typeof parsed.channel.type !== "string" ||
      !parsed.context ||
      typeof parsed.explicitAllowPermissions !== "string" ||
      typeof parsed.memberVersion !== "string" ||
      typeof parsed.permissions !== "string" ||
      typeof parsed.serverVersion !== "string"
    ) {
      return null;
    }

    if (typeof parsed.cachedAt !== "number" || !Number.isFinite(parsed.cachedAt)) {
      return null;
    }

    return parsed as PermissionCacheChannelSnapshot;
  } catch {
    return null;
  }
}

function parseChannelList(raw: string): PermissionCacheChannelList | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PermissionCacheChannelList>;
    if (
      !Array.isArray(parsed.channelIds) ||
      typeof parsed.memberVersion !== "string" ||
      typeof parsed.serverVersion !== "string" ||
      parsed.channelIds.some((channelId) => typeof channelId !== "string")
    ) {
      return null;
    }

    if (typeof parsed.cachedAt !== "number" || !Number.isFinite(parsed.cachedAt)) {
      return null;
    }

    return parsed as PermissionCacheChannelList;
  } catch {
    return null;
  }
}

function hydrateSnapshot(snapshot: PermissionCacheChannelSnapshot) {
  const context = parseContext(snapshot.context);
  const permissions = parseBigInt(snapshot.permissions);
  const explicitAllowPermissions = parseBigInt(snapshot.explicitAllowPermissions);

  if (!context || permissions === null || explicitAllowPermissions === null) {
    return null;
  }

  return {
    channel: snapshot.channel,
    context,
    explicitAllowPermissions,
    permissions,
  };
}

async function readRevisionMap(keys: string[]) {
  const redis = getReadyRedis();
  if (!redis || keys.length === 0) {
    return new Map<string, string>();
  }

  const values = await redis.mget(...keys);
  return new Map(keys.map((key, index) => [key, parseVersion(values[index] ?? null)]));
}

export async function readCachedChannelPermissionSnapshot(
  userId: string,
  channelId: string,
  options: PermissionCacheReadOptions = {},
) {
  const snapshots = await readCachedChannelPermissionSnapshots(channelId, [userId], options);
  return snapshots.get(userId) ?? null;
}

export async function readCachedChannelPermissionSnapshots(
  channelId: string,
  userIds: string[],
  options: PermissionCacheReadOptions = {},
) {
  const snapshots = new Map<string, CachedChannelPermissionSnapshot>();
  const redis = getReadyRedis();
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!redis || uniqueUserIds.length === 0) {
    if (uniqueUserIds.length > 0) {
      recordPermissionCacheMetric({
        area: "channelSnapshot",
        count: uniqueUserIds.length,
        event: "bypass",
      });
    }
    return snapshots;
  }

  try {
    const keys = uniqueUserIds.map((userId) => channelPermissionSnapshotKey(channelId, userId));
    const values = await redis.mget(...keys);
    let hitCount = 0;
    let missCount = 0;
    let staleCount = 0;
    const parsedEntries: Array<{
      snapshot: PermissionCacheChannelSnapshot;
      userId: string;
    }> = [];
    const revisionKeys = new Set<string>();

    values.forEach((value, index) => {
      if (!value) {
        missCount += 1;
        return;
      }

      const snapshot = parseSnapshot(value);
      if (!snapshot) {
        missCount += 1;
        return;
      }

      const userId = uniqueUserIds[index];
      if (!userId) {
        return;
      }
      parsedEntries.push({ snapshot, userId });
      revisionKeys.add(serverVersionKey(snapshot.channel.serverId));
      revisionKeys.add(memberVersionKey(snapshot.channel.serverId, userId));
    });

    const revisions = await readRevisionMap([...revisionKeys]);

    for (const entry of parsedEntries) {
      const { snapshot, userId } = entry;
      const currentServerVersion =
        revisions.get(serverVersionKey(snapshot.channel.serverId)) ?? "0";
      const currentMemberVersion =
        revisions.get(memberVersionKey(snapshot.channel.serverId, userId)) ?? "0";

      if (
        snapshot.serverVersion !== currentServerVersion ||
        snapshot.memberVersion !== currentMemberVersion ||
        !isFreshEnough(snapshot.cachedAt, options)
      ) {
        staleCount += 1;
        continue;
      }

      const hydrated = hydrateSnapshot(snapshot);
      if (hydrated) {
        snapshots.set(userId, hydrated);
        hitCount += 1;
      } else {
        missCount += 1;
      }
    }

    if (hitCount > 0) {
      recordPermissionCacheMetric({
        area: "channelSnapshot",
        count: hitCount,
        event: "hit",
      });
    }
    if (missCount > 0) {
      recordPermissionCacheMetric({
        area: "channelSnapshot",
        count: missCount,
        event: "miss",
      });
    }
    if (staleCount > 0) {
      recordPermissionCacheMetric({
        area: "channelSnapshot",
        count: staleCount,
        event: "stale",
      });
    }
  } catch (error) {
    recordPermissionCacheMetric({
      area: "channelSnapshot",
      count: uniqueUserIds.length,
      event: "error",
    });
    logError("[permission-cache] Channel permission cache read failed", error);
  }

  return snapshots;
}

export async function writeCachedChannelPermissionSnapshot(args: {
  channelId: string;
  snapshot: CachedChannelPermissionSnapshot;
  userId: string;
}) {
  await writeCachedChannelPermissionSnapshots([args]);
}

export async function writeCachedChannelPermissionSnapshots(
  entries: Array<{
    channelId: string;
    snapshot: CachedChannelPermissionSnapshot;
    userId: string;
  }>,
) {
  const redis = getReadyRedis();
  if (!redis || entries.length === 0) {
    return;
  }

  try {
    const revisionKeys = new Set<string>();
    for (const entry of entries) {
      revisionKeys.add(serverVersionKey(entry.snapshot.channel.serverId));
      revisionKeys.add(memberVersionKey(entry.snapshot.channel.serverId, entry.userId));
    }
    const revisions = await readRevisionMap([...revisionKeys]);
    const pipeline = redis.pipeline();

    for (const entry of entries) {
      const serverId = entry.snapshot.channel.serverId;
      const payload = serializeSnapshot(entry.snapshot, {
        memberVersion: revisions.get(memberVersionKey(serverId, entry.userId)) ?? "0",
        serverVersion: revisions.get(serverVersionKey(serverId)) ?? "0",
      });

      pipeline.set(
        channelPermissionSnapshotKey(entry.channelId, entry.userId),
        JSON.stringify(payload),
        "EX",
        PERMISSION_CACHE_TTL_SECONDS,
      );
    }

    await pipeline.exec();
    recordPermissionCacheMetric({
      area: "channelSnapshot",
      count: entries.length,
      event: "write",
    });
  } catch (error) {
    recordPermissionCacheMetric({
      area: "channelSnapshot",
      count: entries.length,
      event: "error",
    });
    logError("[permission-cache] Channel permission cache write failed", error);
  }
}

export async function readCachedVisibleChannelIds(args: {
  permission: PermissionKey | PermissionValue;
  maxAgeSeconds?: number;
  serverId: string;
  type?: ChannelType;
  userId: string;
}) {
  const cached = await readCachedVisibleChannelIdsBatch({
    ...(args.maxAgeSeconds !== undefined ? { maxAgeSeconds: args.maxAgeSeconds } : {}),
    permission: args.permission,
    serverId: args.serverId,
    userIds: [args.userId],
    ...(args.type !== undefined ? { type: args.type } : {}),
  });

  return cached.get(args.userId) ?? null;
}

export async function readCachedVisibleChannelIdsBatch(args: {
  maxAgeSeconds?: number;
  permission: PermissionKey | PermissionValue;
  serverId: string;
  type?: ChannelType;
  userIds: string[];
}) {
  const channelIdsByUser = new Map<string, string[]>();
  const uniqueUserIds = Array.from(new Set(args.userIds.filter(Boolean)));
  const redis = getReadyRedis();
  if (!redis || uniqueUserIds.length === 0) {
    if (uniqueUserIds.length > 0) {
      recordPermissionCacheMetric({
        area: "visibleChannelList",
        count: uniqueUserIds.length,
        event: "bypass",
      });
    }
    return channelIdsByUser;
  }

  try {
    const keys = uniqueUserIds.map((userId) =>
      visibleChannelListKey({
        permission: args.permission,
        serverId: args.serverId,
        userId,
        ...(args.type !== undefined ? { type: args.type } : {}),
      }),
    );
    const values = await redis.mget(...keys);
    let hitCount = 0;
    let missCount = 0;
    let staleCount = 0;
    const parsedEntries: Array<{
      cachedAt: number;
      channelIds: string[];
      memberVersion: string;
      serverVersion: string;
      userId: string;
    }> = [];
    const revisionKeys = new Set<string>([serverVersionKey(args.serverId)]);

    values.forEach((value, index) => {
      if (!value) {
        missCount += 1;
        return;
      }

      const parsed = parseChannelList(value);
      if (!parsed) {
        missCount += 1;
        return;
      }

      const userId = uniqueUserIds[index];
      if (!userId) {
        return;
      }

      parsedEntries.push({
        cachedAt: parsed.cachedAt,
        channelIds: parsed.channelIds,
        memberVersion: parsed.memberVersion,
        serverVersion: parsed.serverVersion,
        userId,
      });
      revisionKeys.add(memberVersionKey(args.serverId, userId));
    });

    const revisions = await readRevisionMap([...revisionKeys]);
    const currentServerVersion = revisions.get(serverVersionKey(args.serverId)) ?? "0";

    for (const entry of parsedEntries) {
      const currentMemberVersion =
        revisions.get(memberVersionKey(args.serverId, entry.userId)) ?? "0";

      if (
        entry.serverVersion !== currentServerVersion ||
        entry.memberVersion !== currentMemberVersion ||
        !isFreshEnough(entry.cachedAt, args)
      ) {
        staleCount += 1;
        continue;
      }

      channelIdsByUser.set(entry.userId, entry.channelIds);
      hitCount += 1;
    }

    if (hitCount > 0) {
      recordPermissionCacheMetric({
        area: "visibleChannelList",
        count: hitCount,
        event: "hit",
      });
    }
    if (missCount > 0) {
      recordPermissionCacheMetric({
        area: "visibleChannelList",
        count: missCount,
        event: "miss",
      });
    }
    if (staleCount > 0) {
      recordPermissionCacheMetric({
        area: "visibleChannelList",
        count: staleCount,
        event: "stale",
      });
    }
  } catch (error) {
    recordPermissionCacheMetric({
      area: "visibleChannelList",
      count: uniqueUserIds.length,
      event: "error",
    });
    logError("[permission-cache] Visible channel cache read failed", error);
  }

  return channelIdsByUser;
}

export async function writeCachedVisibleChannelIds(args: {
  channelIds: string[];
  permission: PermissionKey | PermissionValue;
  serverId: string;
  type?: ChannelType;
  userId: string;
}) {
  await writeCachedVisibleChannelIdsBatch([args]);
}

export async function writeCachedVisibleChannelIdsBatch(
  entries: Array<{
    channelIds: string[];
    permission: PermissionKey | PermissionValue;
    serverId: string;
    type?: ChannelType;
    userId: string;
  }>,
) {
  const redis = getReadyRedis();
  if (!redis || entries.length === 0) {
    return;
  }

  try {
    const revisionKeys = new Set<string>();
    for (const entry of entries) {
      revisionKeys.add(serverVersionKey(entry.serverId));
      revisionKeys.add(memberVersionKey(entry.serverId, entry.userId));
    }
    const revisions = await readRevisionMap([...revisionKeys]);
    const pipeline = redis.pipeline();

    for (const entry of entries) {
      pipeline.set(
        visibleChannelListKey(entry),
        JSON.stringify({
          channelIds: entry.channelIds,
          cachedAt: Date.now(),
          memberVersion: revisions.get(memberVersionKey(entry.serverId, entry.userId)) ?? "0",
          serverVersion: revisions.get(serverVersionKey(entry.serverId)) ?? "0",
        }),
        "EX",
        PERMISSION_CACHE_TTL_SECONDS,
      );
    }

    await pipeline.exec();
    recordPermissionCacheMetric({
      area: "visibleChannelList",
      count: entries.length,
      event: "write",
    });
  } catch (error) {
    recordPermissionCacheMetric({
      area: "visibleChannelList",
      count: entries.length,
      event: "error",
    });
    logError("[permission-cache] Visible channel cache write failed", error);
  }
}

export async function invalidateServerPermissionCache(serverId: string) {
  const redis = getReadyRedis();
  if (!redis) {
    return;
  }

  try {
    await redis
      .pipeline()
      .incr(serverVersionKey(serverId))
      .expire(serverVersionKey(serverId), PERMISSION_CACHE_VERSION_TTL_SECONDS)
      .exec();
    recordPermissionCacheInvalidation("server");
  } catch (error) {
    logError("[permission-cache] Server permission cache invalidation failed", error);
  }
}

export async function invalidateMemberPermissionCache(serverId: string, userId: string) {
  const redis = getReadyRedis();
  if (!redis) {
    return;
  }

  try {
    await redis
      .pipeline()
      .incr(memberVersionKey(serverId, userId))
      .expire(memberVersionKey(serverId, userId), PERMISSION_CACHE_VERSION_TTL_SECONDS)
      .exec();
    recordPermissionCacheInvalidation("member");
  } catch (error) {
    logError("[permission-cache] Member permission cache invalidation failed", error);
  }
}
