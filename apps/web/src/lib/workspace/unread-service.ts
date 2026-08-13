import { randomUUID } from "node:crypto";
import { ChannelType, Prisma, prisma } from "@wizards/db";
import { getRedisOp } from "@/lib/redis";
import {
  buildServerOnlineKey,
  countServerOnlineMembers,
  readServerOnlineMembers,
  type ServerOnlinePresenceRedis,
} from "@/lib/socket/server-online-presence";
import { getSocketServer } from "@/lib/socket/runtime";
import { recordUnreadFanoutMetric } from "@/lib/workspace/performance-metrics";
import {
  listChannelIdsByServerForUserWithPermission,
  listChannelIdsForUserWithPermission,
  listChannelIdsForUsersWithPermission,
} from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

type ServerUnreadCountRow = {
  mentionCount?: bigint | number;
  serverId: string;
  unreadCount: bigint | number;
};

type ChannelUnreadCountRow = {
  channelId: string;
  mentionCount: bigint | number;
  unreadCount: bigint | number;
};

type VisibleChannelUserGroup = {
  channelIds: string[];
  userIds: string[];
};

/**
 * Counting every message since `lastReadAt` is unbounded work — a user away for
 * a month makes the bootstrap read scan tens of thousands of rows per server.
 * Mobile asks for a capped count and renders the ceiling as "99+", which turns
 * the scan into a bounded `LIMIT` per channel. Web still asks for exact counts.
 */
export const MOBILE_UNREAD_COUNT_CAP = 99;
const UNCAPPED_UNREAD_COUNT = 2_147_483_647;

function toUnreadCount(value: bigint | number) {
  return typeof value === "bigint" ? Number(value) : value;
}

function normalizeUserIds(userIds: string[]) {
  return Array.from(new Set(userIds.filter(Boolean)));
}

function normalizeIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function createUserCountMap(userIds: string[]) {
  const counts = new Map<string, number>();
  for (const userId of userIds) {
    counts.set(userId, 0);
  }
  return counts;
}

async function getVisibleTextChannelIdsByUser(userIds: string[], serverId: string) {
  const uniqueUserIds = normalizeUserIds(userIds);
  const visibleChannelIdsByUser = await listChannelIdsForUsersWithPermission(
    uniqueUserIds,
    serverId,
    PermissionBits.VIEW_CHANNEL,
    ChannelType.TEXT,
  ).catch(() => new Map<string, string[]>());
  const entries = uniqueUserIds.map((userId) => {
    const channelIds = visibleChannelIdsByUser.get(userId) ?? [];

    return [userId, Array.from(new Set(channelIds.filter(Boolean))).sort()] as const;
  });

  return new Map(entries);
}

async function getVisibleTextChannelIdsByServer(userId: string, serverIds: string[]) {
  const uniqueServerIds = normalizeIds(serverIds);
  let visibleChannelIdsByServer: Map<string, string[]>;

  try {
    visibleChannelIdsByServer = await listChannelIdsByServerForUserWithPermission(
      userId,
      uniqueServerIds,
      PermissionBits.VIEW_CHANNEL,
      ChannelType.TEXT,
    );
  } catch {
    const fallbackEntries = await Promise.all(
      uniqueServerIds.map(
        async (serverId) =>
          [
            serverId,
            await listChannelIdsForUserWithPermission(
              userId,
              serverId,
              PermissionBits.VIEW_CHANNEL,
              ChannelType.TEXT,
            ).catch(() => []),
          ] as const,
      ),
    );
    visibleChannelIdsByServer = new Map(fallbackEntries);
  }

  const entries = uniqueServerIds.map((serverId) => {
    const channelIds = visibleChannelIdsByServer.get(serverId) ?? [];

    return [serverId, Array.from(new Set(channelIds.filter(Boolean))).sort()] as const;
  });

  return new Map(entries);
}

function getVisibleChannelIds(visibleChannelIdsByServer: Map<string, string[]>) {
  return Array.from(new Set([...visibleChannelIdsByServer.values()].flat()));
}

export function groupUsersByVisibleChannelIds(
  visibleChannelIdsByUser: Map<string, string[]>,
): VisibleChannelUserGroup[] {
  const groups = new Map<string, VisibleChannelUserGroup>();

  for (const [userId, channelIds] of visibleChannelIdsByUser) {
    if (channelIds.length === 0) {
      continue;
    }

    const key = channelIds.join("\u001f");
    const existing = groups.get(key);
    if (existing) {
      existing.userIds.push(userId);
      continue;
    }

    groups.set(key, {
      channelIds,
      userIds: [userId],
    });
  }

  return [...groups.values()];
}

export function buildServerChannelUnreadQuery(input: {
  serverId: string;
  unreadCountCap: number;
  userId: string;
  visibleChannelIds: string[];
}): Prisma.Sql {
  const { serverId, unreadCountCap, userId, visibleChannelIds } = input;

  return Prisma.sql`
    SELECT
      c."id" AS "channelId",
      COALESCE(unread."unreadCount", 0)::bigint AS "unreadCount",
      COALESCE(crs."mentionCount", 0)::bigint AS "mentionCount"
    FROM "Channel" c
    INNER JOIN "ServerMember" sm
      ON sm."serverId" = c."serverId"
      AND sm."userId" = ${userId}
    LEFT JOIN "ChannelReadState" crs
      ON crs."channelId" = c."id"
      AND crs."userId" = ${userId}
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS "unreadCount"
      FROM (
        SELECT 1
        FROM "Message" m
        WHERE m."channelId" = c."id"
          AND m."threadId" IS NULL
          AND m."threadParentId" IS NULL
          AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
        LIMIT ${unreadCountCap}
      ) capped
    ) unread ON TRUE
    WHERE c."serverId" = ${serverId}
      AND c."type" = 'TEXT'
      AND c."parentId" IS NULL
      AND c."id" IN (${Prisma.join(visibleChannelIds)})
  `;
}

async function getServerChannelUnreadCountsForVisibleChannelIds(
  userId: string,
  serverId: string,
  visibleChannelIds: string[],
  unreadCountCap = UNCAPPED_UNREAD_COUNT,
) {
  if (visibleChannelIds.length === 0) {
    return new Map<string, { mentionCount: number; unreadCount: number }>();
  }

  const rows = await prisma.$queryRaw<ChannelUnreadCountRow[]>(
    buildServerChannelUnreadQuery({ serverId, unreadCountCap, userId, visibleChannelIds }),
  );

  const counts = new Map<string, { mentionCount: number; unreadCount: number }>();
  for (const row of rows) {
    counts.set(row.channelId, {
      mentionCount: toUnreadCount(row.mentionCount),
      unreadCount: toUnreadCount(row.unreadCount),
    });
  }

  return counts;
}

export async function getServerChannelUnreadCounts(userId: string, serverId: string) {
  const visibleChannelIds = await listChannelIdsForUserWithPermission(
    userId,
    serverId,
    PermissionBits.VIEW_CHANNEL,
    ChannelType.TEXT,
  );

  return getServerChannelUnreadCountsForVisibleChannelIds(userId, serverId, visibleChannelIds);
}

function createServerCountMap(serverIds: string[]) {
  const counts = new Map<string, number>();
  for (const serverId of serverIds) {
    counts.set(serverId, 0);
  }

  return counts;
}

export function buildServerUnreadTotalsQuery(input: {
  uniqueServerIds: string[];
  unreadCountCap: number;
  userId: string;
  visibleChannelIds: string[];
}): Prisma.Sql {
  const { uniqueServerIds, unreadCountCap, userId, visibleChannelIds } = input;

  return Prisma.sql`
    SELECT
      "serverId",
      LEAST(SUM("unreadCount"), ${unreadCountCap})::bigint AS "unreadCount"
    FROM (
      SELECT
        sm."serverId" AS "serverId",
        COALESCE(unread."unreadCount", 0) AS "unreadCount"
      FROM "ServerMember" sm
      INNER JOIN "Channel" c
        ON c."serverId" = sm."serverId"
        AND c."type" = 'TEXT'
      LEFT JOIN "ChannelReadState" crs
        ON crs."channelId" = c."id"
        AND crs."userId" = sm."userId"
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS "unreadCount"
        FROM (
          SELECT 1
          FROM "Message" m
          WHERE m."channelId" = c."id"
            AND m."threadId" IS NULL
            AND m."threadParentId" IS NULL
            AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
          LIMIT ${unreadCountCap}
        ) capped
      ) unread ON TRUE
      WHERE sm."userId" = ${userId}
        AND sm."serverId" IN (${Prisma.join(uniqueServerIds)})
        AND c."id" IN (${Prisma.join(visibleChannelIds)})
    ) "channelUnread"
    GROUP BY "serverId"
  `;
}

async function getServerUnreadCountsForVisibleChannelIds(
  userId: string,
  serverIds: string[],
  visibleChannelIds: string[],
  unreadCountCap = UNCAPPED_UNREAD_COUNT,
) {
  const uniqueServerIds = normalizeIds(serverIds);
  const unreadCounts = createServerCountMap(uniqueServerIds);
  if (uniqueServerIds.length === 0 || visibleChannelIds.length === 0) {
    return unreadCounts;
  }

  const rows = await prisma.$queryRaw<ServerUnreadCountRow[]>(
    buildServerUnreadTotalsQuery({ uniqueServerIds, unreadCountCap, userId, visibleChannelIds }),
  );

  for (const row of rows) {
    unreadCounts.set(row.serverId, toUnreadCount(row.unreadCount));
  }

  return unreadCounts;
}

async function getServerMentionCountsForVisibleChannelIds(
  userId: string,
  serverIds: string[],
  visibleChannelIds: string[],
) {
  const uniqueServerIds = normalizeIds(serverIds);
  const mentionCounts = createServerCountMap(uniqueServerIds);
  if (uniqueServerIds.length === 0 || visibleChannelIds.length === 0) {
    return mentionCounts;
  }

  const rows = await prisma.$queryRaw<
    Array<{ serverId: string; mentionCount: bigint | number }>
  >(Prisma.sql`
    SELECT
      c."serverId" AS "serverId",
      COALESCE(SUM(crs."mentionCount"), 0)::bigint AS "mentionCount"
    FROM "ChannelReadState" crs
    INNER JOIN "Channel" c
      ON c."id" = crs."channelId"
      AND c."type" = 'TEXT'
    WHERE crs."userId" = ${userId}
      AND c."serverId" IN (${Prisma.join(uniqueServerIds)})
      AND c."id" IN (${Prisma.join(visibleChannelIds)})
    GROUP BY c."serverId"
  `);

  for (const row of rows) {
    mentionCounts.set(row.serverId, toUnreadCount(row.mentionCount));
  }

  return mentionCounts;
}

export async function getBoundedMobileServerUnreadSummary(
  userId: string,
  serverId: string,
  visibleTextChannelIds: string[],
) {
  const channelIds = normalizeIds(visibleTextChannelIds);
  if (channelIds.length > 80) {
    throw new RangeError("Mobile unread projection cannot exceed 80 channels");
  }

  const [channelUnreadCounts, unreadCounts, mentionCounts] = await Promise.all([
    getServerChannelUnreadCountsForVisibleChannelIds(
      userId,
      serverId,
      channelIds,
      MOBILE_UNREAD_COUNT_CAP,
    ),
    getServerUnreadCountsForVisibleChannelIds(
      userId,
      [serverId],
      channelIds,
      MOBILE_UNREAD_COUNT_CAP,
    ),
    getServerMentionCountsForVisibleChannelIds(userId, [serverId], channelIds),
  ]);

  return {
    channelUnreadCounts,
    mentionCount: mentionCounts.get(serverId) ?? 0,
    unreadCount: unreadCounts.get(serverId) ?? 0,
  };
}

export async function getServerUnreadCounts(userId: string, serverIds: string[]) {
  const uniqueServerIds = normalizeIds(serverIds);
  const visibleChannelIdsByServer = await getVisibleTextChannelIdsByServer(userId, uniqueServerIds);

  return getServerUnreadCountsForVisibleChannelIds(
    userId,
    uniqueServerIds,
    getVisibleChannelIds(visibleChannelIdsByServer),
  );
}

export async function getServerMentionCounts(userId: string, serverIds: string[]) {
  const uniqueServerIds = normalizeIds(serverIds);
  const visibleChannelIdsByServer = await getVisibleTextChannelIdsByServer(userId, uniqueServerIds);

  return getServerMentionCountsForVisibleChannelIds(
    userId,
    uniqueServerIds,
    getVisibleChannelIds(visibleChannelIdsByServer),
  );
}

export async function getServerUnreadAndMentionCounts(
  userId: string,
  serverIds: string[],
  options: { unreadCountCap?: number } = {},
) {
  const uniqueServerIds = normalizeIds(serverIds);
  const visibleChannelIdsByServer = await getVisibleTextChannelIdsByServer(userId, uniqueServerIds);
  const visibleChannelIds = getVisibleChannelIds(visibleChannelIdsByServer);
  const [unreadCounts, mentionCounts] = await Promise.all([
    getServerUnreadCountsForVisibleChannelIds(
      userId,
      uniqueServerIds,
      visibleChannelIds,
      options.unreadCountCap ?? UNCAPPED_UNREAD_COUNT,
    ),
    getServerMentionCountsForVisibleChannelIds(userId, uniqueServerIds, visibleChannelIds),
  ]);

  return { mentionCounts, unreadCounts };
}

export async function getServerMentionCount(userId: string, serverId: string) {
  const mentionCounts = await getServerMentionCounts(userId, [serverId]);
  return mentionCounts.get(serverId) ?? 0;
}

type ServerUnreadUserFanoutDependencies = {
  getCounts: typeof getServerUnreadAndMentionCounts;
  getSocketServer: typeof getSocketServer;
};

export async function emitServerUnreadUpdatesToUser(
  userId: string,
  serverIds: string[],
  dependencies: ServerUnreadUserFanoutDependencies = {
    getCounts: getServerUnreadAndMentionCounts,
    getSocketServer,
  },
) {
  const uniqueServerIds = normalizeIds(serverIds);
  if (uniqueServerIds.length === 0) {
    return { mentionCounts: new Map<string, number>(), unreadCounts: new Map<string, number>() };
  }

  // Reading each server separately repeats permission and counter queries. The
  // existing multi-server projection keeps this fan-out to one batched read.
  const counts = await dependencies.getCounts(userId, uniqueServerIds);
  const io = dependencies.getSocketServer();

  if (io) {
    for (const serverId of uniqueServerIds) {
      io.to(`user:${userId}`).emit("server:unread:update", {
        mentionCount: counts.mentionCounts.get(serverId) ?? 0,
        serverId,
        unreadCount: counts.unreadCounts.get(serverId) ?? 0,
      });
    }
  }

  return counts;
}

export async function getServerMentionCountsBatch(userIds: string[], serverId: string) {
  const uniqueUserIds = normalizeUserIds(userIds);
  const visibleChannelIdsByUser = await getVisibleTextChannelIdsByUser(uniqueUserIds, serverId);

  return getServerMentionCountsBatchForVisibleChannels(
    uniqueUserIds,
    serverId,
    visibleChannelIdsByUser,
  );
}

async function getServerMentionCountsBatchForVisibleChannels(
  userIds: string[],
  serverId: string,
  visibleChannelIdsByUser: Map<string, string[]>,
) {
  const groups = groupUsersByVisibleChannelIds(visibleChannelIdsByUser);

  return getServerMentionCountsBatchForVisibleChannelGroups(userIds, serverId, groups);
}

async function getServerMentionCountsBatchForVisibleChannelGroups(
  userIds: string[],
  serverId: string,
  groups: VisibleChannelUserGroup[],
) {
  const uniqueUserIds = normalizeUserIds(userIds);
  const mentionCounts = createUserCountMap(uniqueUserIds);

  if (uniqueUserIds.length === 0) {
    return mentionCounts;
  }

  const rowGroups = await Promise.all(
    groups.map((group) =>
      prisma.$queryRaw<Array<{ userId: string; mentionCount: bigint | number }>>(Prisma.sql`
        SELECT
          crs."userId" AS "userId",
          COALESCE(SUM(crs."mentionCount"), 0)::bigint AS "mentionCount"
        FROM "ChannelReadState" crs
        INNER JOIN "Channel" c
          ON c."id" = crs."channelId"
          AND c."type" = 'TEXT'
        WHERE c."serverId" = ${serverId}
          AND c."id" IN (${Prisma.join(group.channelIds)})
          AND crs."userId" IN (${Prisma.join(group.userIds)})
        GROUP BY crs."userId"
      `),
    ),
  );

  for (const row of rowGroups.flat()) {
    mentionCounts.set(row.userId, toUnreadCount(row.mentionCount));
  }

  return mentionCounts;
}

export async function getServerUnreadCount(userId: string, serverId: string) {
  const unreadCounts = await getServerUnreadCounts(userId, [serverId]);
  return unreadCounts.get(serverId) ?? 0;
}

export async function getServerUnreadCountsBatch(userIds: string[], serverId: string) {
  const uniqueUserIds = normalizeUserIds(userIds);
  const visibleChannelIdsByUser = await getVisibleTextChannelIdsByUser(uniqueUserIds, serverId);

  return getServerUnreadCountsBatchForVisibleChannels(
    uniqueUserIds,
    serverId,
    visibleChannelIdsByUser,
  );
}

async function getServerUnreadCountsBatchForVisibleChannels(
  userIds: string[],
  serverId: string,
  visibleChannelIdsByUser: Map<string, string[]>,
) {
  const groups = groupUsersByVisibleChannelIds(visibleChannelIdsByUser);

  return getServerUnreadCountsBatchForVisibleChannelGroups(userIds, serverId, groups);
}

async function getServerUnreadCountsBatchForVisibleChannelGroups(
  userIds: string[],
  serverId: string,
  groups: VisibleChannelUserGroup[],
) {
  const uniqueUserIds = normalizeUserIds(userIds);
  const unreadCounts = createUserCountMap(uniqueUserIds);

  if (uniqueUserIds.length === 0) {
    return unreadCounts;
  }

  const rowGroups = await Promise.all(
    groups.map((group) =>
      prisma.$queryRaw<Array<{ userId: string; unreadCount: bigint | number }>>(Prisma.sql`
        SELECT
          sm."userId" AS "userId",
          COUNT(m."id")::bigint AS "unreadCount"
        FROM "ServerMember" sm
        LEFT JOIN "Channel" c
          ON c."serverId" = sm."serverId"
          AND c."type" = 'TEXT'
          AND c."id" IN (${Prisma.join(group.channelIds)})
        LEFT JOIN "ChannelReadState" crs
          ON crs."channelId" = c."id"
          AND crs."userId" = sm."userId"
        LEFT JOIN "Message" m
          ON m."channelId" = c."id"
          AND m."threadId" IS NULL
          AND m."threadParentId" IS NULL
          AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
        WHERE sm."serverId" = ${serverId}
          AND sm."userId" IN (${Prisma.join(group.userIds)})
        GROUP BY sm."userId"
      `),
    ),
  );

  for (const row of rowGroups.flat()) {
    unreadCounts.set(row.userId, toUnreadCount(row.unreadCount));
  }

  return unreadCounts;
}

export async function markChannelReadState(args: {
  channelId: string;
  lastReadAt: Date;
  lastReadMessageId?: string | null;
  userId: string;
}) {
  await prisma.channelReadState.upsert({
    where: {
      channelId_userId: {
        channelId: args.channelId,
        userId: args.userId,
      },
    },
    update: {
      lastReadAt: args.lastReadAt,
      lastReadMessageId: args.lastReadMessageId ?? null,
      mentionCount: 0,
    },
    create: {
      channelId: args.channelId,
      userId: args.userId,
      lastReadAt: args.lastReadAt,
      lastReadMessageId: args.lastReadMessageId ?? null,
      mentionCount: 0,
    },
  });
}

export async function markChannelReadStates(args: {
  channelId: string;
  lastReadAt: Date;
  lastReadMessageId?: string | null;
  userIds: string[];
}) {
  const uniqueUserIds = Array.from(new Set(args.userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return;
  }

  const lastReadMessageId = args.lastReadMessageId ?? null;
  const values = uniqueUserIds.map(
    (userId) => Prisma.sql`
    (${randomUUID()}, ${args.channelId}, ${userId}, ${args.lastReadAt}, ${lastReadMessageId}, 0)
  `,
  );

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ChannelReadState"
      ("id", "channelId", "userId", "lastReadAt", "lastReadMessageId", "mentionCount")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("channelId", "userId")
    DO UPDATE SET
      "lastReadAt" = EXCLUDED."lastReadAt",
      "lastReadMessageId" = EXCLUDED."lastReadMessageId",
      "mentionCount" = 0
  `);
}

type ActiveUserSetRedis = {
  smembers(key: string): Promise<string[]>;
  status: string;
};

export function buildChannelViewersKey(channelId: string) {
  return `channel:${channelId}:viewers`;
}

async function readActiveUserSet(redis: ActiveUserSetRedis, key: string) {
  if (redis.status !== "ready") {
    return [];
  }

  try {
    return Array.from(new Set((await redis.smembers(key)).filter(Boolean)));
  } catch {
    // These sets are derived presence hints. A Redis outage must not reject a
    // committed message; later socket joins repopulate the missing data.
    return [];
  }
}

export function getActiveChannelViewerUserIds(
  channelId: string,
  redis: ActiveUserSetRedis = getRedisOp(),
) {
  return readActiveUserSet(redis, buildChannelViewersKey(channelId));
}

export function getActiveServerMemberUserIds(
  serverId: string,
  redis: ActiveUserSetRedis = getRedisOp(),
) {
  return readActiveUserSet(redis, buildServerOnlineKey(serverId));
}

let onlineServerMemberCountRedisForTest: ServerOnlinePresenceRedis | null = null;

export function setOnlineServerMemberCountRedisForTest(redis: ServerOnlinePresenceRedis | null) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setOnlineServerMemberCountRedisForTest is not available in production.");
  }
  onlineServerMemberCountRedisForTest = redis;
}

/**
 * Counts distinct server-room members whose live socket presence is visible.
 * Reads the `server:<id>:online` Redis set (Task 8) that the socket lifecycle
 * — join, disconnect, and presence transitions — keeps in sync, instead of
 * serialising the room's sockets on every call.
 *
 * The pre-Task-8 version returned 0 whenever the socket server hadn't been
 * initialized yet rather than throwing; a not-yet-`ready` Redis client is the
 * same situation under the new backing store, so it gets the same fail-open
 * treatment instead of surfacing a connection error to an unrelated caller —
 * and so does a command that fails *after* that check passes (a mid-flight
 * timeout or connection reset): this is one of the two callers in the
 * `Promise.all` at server-service.ts, and an uncaught rejection there would
 * fail the whole mobile server-detail load over what is, by design, best-effort
 * derived state.
 */
export async function getOnlineServerMemberCount(
  serverId: string,
  redis: ServerOnlinePresenceRedis = onlineServerMemberCountRedisForTest ?? getRedisOp(),
) {
  if (redis.status !== "ready") {
    return 0;
  }

  try {
    return await countServerOnlineMembers(redis, serverId);
  } catch {
    return 0;
  }
}

/**
 * The per-user half of the same read. Shares the default client (and the test
 * override) with `getOnlineServerMemberCount` on purpose: the profile card
 * prints the count and the per-admin dot side by side, so they must never be
 * able to answer from two different stores.
 */
export async function getOnlineServerMemberIds(
  serverId: string,
  userIds: readonly string[],
  redis: ServerOnlinePresenceRedis = onlineServerMemberCountRedisForTest ?? getRedisOp(),
): Promise<ReadonlySet<string>> {
  return readServerOnlineMembers(redis, serverId, userIds);
}

export async function emitServerUnreadUpdateToUser(userId: string, serverId: string) {
  const { mentionCounts, unreadCounts } = await emitServerUnreadUpdatesToUser(userId, [serverId]);
  const mentionCount = mentionCounts.get(serverId) ?? 0;
  const unreadCount = unreadCounts.get(serverId) ?? 0;

  return { mentionCount, unreadCount };
}

export async function emitServerUnreadUpdatesForServer(serverId: string, memberUserIds?: string[]) {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  const userIds = memberUserIds
    ? Array.from(new Set(memberUserIds.filter(Boolean)))
    : await getActiveServerMemberUserIds(serverId);

  if (userIds.length === 0) {
    return;
  }

  const startedAt = Date.now();
  const visibleChannelIdsByUser = await getVisibleTextChannelIdsByUser(userIds, serverId);
  const visibleChannelGroups = groupUsersByVisibleChannelIds(visibleChannelIdsByUser);
  const [unreadCounts, mentionCounts] = await Promise.all([
    getServerUnreadCountsBatchForVisibleChannelGroups(userIds, serverId, visibleChannelGroups),
    getServerMentionCountsBatchForVisibleChannelGroups(userIds, serverId, visibleChannelGroups),
  ]);

  for (const userId of userIds) {
    io.to(`user:${userId}`).emit("server:unread:update", {
      mentionCount: mentionCounts.get(userId) ?? 0,
      serverId,
      unreadCount: unreadCounts.get(userId) ?? 0,
    });
  }

  recordUnreadFanoutMetric({
    durationMs: Date.now() - startedAt,
    mentionQueryCount: visibleChannelGroups.length,
    targetUserCount: userIds.length,
    unreadQueryCount: visibleChannelGroups.length,
    visibilityGroupCount: visibleChannelGroups.length,
    visibleUserCount: [...visibleChannelIdsByUser.values()].filter(
      (channelIds) => channelIds.length > 0,
    ).length,
  });
}
