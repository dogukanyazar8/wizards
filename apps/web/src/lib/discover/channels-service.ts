import {
  ChannelType,
  PermissionTargetType,
  Prisma,
  prisma,
  type ServerCategory,
} from "@wizards/db";
import type {
  DiscoverChannel,
  DiscoverChannelActivityLabel,
  DiscoverChannelPage,
  DiscoverServerCategoryKey,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { toCategoryKey, toDiscoverInitials } from "@/lib/discover/identity";
import { getStaleVoiceHeartbeatCutoff } from "@/lib/voice/types";
import { getActiveServerMemberUserIds } from "@/lib/workspace/unread-service";
import {
  PermissionBits,
  hasPermission,
  resolveChannelPermissions,
  type ChannelPermissionOverrideRecord,
  type RolePermissionRecord,
} from "@/lib/workspace/permissions";

export const DISCOVER_CHANNEL_BUSY_MIN_MESSAGES = 200;
export const DISCOVER_CHANNEL_OPEN_MIN_MESSAGES = 50;
export const DISCOVER_CHANNEL_NEW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DISCOVER_CHANNEL_PAGE_SIZE = 24;
const DISCOVER_CHANNEL_WINDOW_HOURS = 24;

export type DiscoverChannelSource = {
  createdAt: Date;
  dailyMessageCount: number;
  everyoneViewDenied: boolean;
  features: readonly string[];
  hasLiveVoice: boolean;
  id: string;
  isPrivate: boolean;
  linkedToVoice: boolean;
  name: string;
  serverCategory: DiscoverServerCategoryKey | null;
  serverDiscoverable: boolean;
  serverId: string;
  serverName: string;
  serverPublic: boolean;
  type: ChannelType;
};

type DiscoverChannelCursor = {
  dailyMessageCount: number;
  id: string;
};

type LoadDiscoverChannelsInput = {
  cursor: DiscoverChannelCursor | null;
  now: Date;
  query: string | null;
  take: number;
  windowEnd: Date;
  windowStart: Date;
};

export type DiscoverChannelsDependencies = {
  loadChannels(input: LoadDiscoverChannelsInput): Promise<DiscoverChannelSource[]>;
  loadMemberPreviews(
    serverIds: readonly string[],
  ): Promise<ReadonlyMap<string, DiscoverChannel["memberPreview"]>>;
};

export type DiscoverEveryoneVisibilityInput = {
  ownerId: string;
  overrides: readonly ChannelPermissionOverrideRecord[];
  roles: readonly RolePermissionRecord[];
};

type DiscoverChannelDatabaseRow = {
  createdAt: Date;
  dailyMessageCount: bigint | number;
  features: string[];
  hasLiveVoice: boolean;
  id: string;
  linkedToVoice: boolean;
  name: string;
  serverCategory: ServerCategory | null;
  serverId: string;
  serverName: string;
};

function startOfUtcHour(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()),
  );
}

function cursorSql(cursor: DiscoverChannelCursor | null): Prisma.Sql {
  if (!cursor) {
    return Prisma.sql``;
  }

  return Prisma.sql`
    AND (
      activity."dailyMessageCount" < ${BigInt(cursor.dailyMessageCount)}
      OR (
        activity."dailyMessageCount" = ${BigInt(cursor.dailyMessageCount)}
        AND channel."id" > ${cursor.id}
      )
    )
  `;
}

function searchSql(query: string | null): Prisma.Sql {
  if (!query) {
    return Prisma.sql``;
  }

  const pattern = `%${query}%`;
  return Prisma.sql`
    AND (channel."name" ILIKE ${pattern} OR server."name" ILIKE ${pattern})
  `;
}

const defaultDependencies: DiscoverChannelsDependencies = {
  loadChannels: async ({ cursor, now, query, take, windowEnd, windowStart }) => {
    const viewOrAdministrator = PermissionBits.VIEW_CHANNEL | PermissionBits.ADMINISTRATOR;
    const rows = await prisma.$queryRaw<DiscoverChannelDatabaseRow[]>(Prisma.sql`
      WITH activity AS (
        SELECT
          rollup."channelId",
          SUM(rollup."messageCount")::bigint AS "dailyMessageCount"
        FROM "DiscoverChannelActivity" rollup
        WHERE rollup."windowStart" >= ${windowStart}
          AND rollup."windowStart" < ${windowEnd}
        GROUP BY rollup."channelId"
      )
      SELECT
        channel."id",
        channel."name",
        channel."createdAt",
        server."id" AS "serverId",
        server."name" AS "serverName",
        server."category" AS "serverCategory",
        server."features",
        activity."dailyMessageCount",
        (parent."type" IN ('VOICE'::"ChannelType", 'STAGE'::"ChannelType")) AS "linkedToVoice",
        EXISTS (
          SELECT 1
          FROM "VoiceState" voice
          WHERE voice."serverId" = server."id"
            AND voice."lastHeartbeat" >= ${getStaleVoiceHeartbeatCutoff(now)}
        ) AS "hasLiveVoice"
      FROM activity
      INNER JOIN "Channel" channel ON channel."id" = activity."channelId"
      INNER JOIN "Server" server ON server."id" = channel."serverId"
      LEFT JOIN "Channel" parent ON parent."id" = channel."parentId"
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::integer AS "roleCount",
          COALESCE(BIT_OR(role."permissions"), 0)::bigint AS "permissions"
        FROM "Role" role
        WHERE role."serverId" = server."id" AND role."isDefault" = true
      ) everyone ON true
      WHERE channel."type" = ${ChannelType.TEXT}::"ChannelType"
        AND server."discoverable" = true
        AND server."isPublic" = true
        AND (
          everyone."roleCount" = 0
          OR (everyone."permissions" & ${viewOrAdministrator}) <> 0
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "ChannelPermissionOverride" overwrite
          INNER JOIN "Role" role
            ON role."id" = overwrite."targetId"
            AND role."serverId" = server."id"
            AND role."isDefault" = true
          WHERE overwrite."channelId" = channel."id"
            AND overwrite."targetType" = ${PermissionTargetType.ROLE}::"PermissionTargetType"
            AND (overwrite."deny" & ${PermissionBits.VIEW_CHANNEL}) = ${PermissionBits.VIEW_CHANNEL}
        )
        ${searchSql(query)}
        ${cursorSql(cursor)}
      ORDER BY activity."dailyMessageCount" DESC, channel."id" ASC
      LIMIT ${take}
    `);

    return rows.map((row) => ({
      createdAt: row.createdAt,
      dailyMessageCount: Number(row.dailyMessageCount),
      everyoneViewDenied: false,
      features: row.features,
      hasLiveVoice: row.hasLiveVoice,
      id: row.id,
      isPrivate: false,
      linkedToVoice: row.linkedToVoice,
      name: row.name,
      serverCategory: toCategoryKey(row.serverCategory),
      serverDiscoverable: true,
      serverId: row.serverId,
      serverName: row.serverName,
      serverPublic: true,
      type: ChannelType.TEXT,
    }));
  },
  loadMemberPreviews: async (serverIds) => {
    const uniqueServerIds = [...new Set(serverIds.filter(Boolean))];
    const onlineEntries = await Promise.all(
      uniqueServerIds.map(async (serverId) => {
        const userIds = (await getActiveServerMemberUserIds(serverId)).sort().slice(0, 3);
        return [serverId, userIds] as const;
      }),
    );
    const onlineByServerId = new Map(onlineEntries);
    const filters = onlineEntries
      .filter((entry) => entry[1].length > 0)
      .map(([serverId, userIds]) => ({ serverId, userId: { in: userIds } }));

    if (filters.length === 0) {
      return new Map(uniqueServerIds.map((serverId) => [serverId, []]));
    }

    const members = await prisma.serverMember.findMany({
      where: { OR: filters },
      select: {
        serverId: true,
        user: { select: { displayName: true, id: true, username: true } },
        userId: true,
      },
    });
    const memberByServerAndUser = new Map(
      members.map((member) => [`${member.serverId}\u0000${member.userId}`, member]),
    );

    return new Map(
      uniqueServerIds.map((serverId) => {
        const previews = (onlineByServerId.get(serverId) ?? []).flatMap((userId) => {
          const member = memberByServerAndUser.get(`${serverId}\u0000${userId}`);
          if (!member) {
            return [];
          }
          const name = member.user.displayName?.trim() || member.user.username;
          return [{ id: member.user.id, initials: toDiscoverInitials(name, null) }];
        });
        return [serverId, previews] as const;
      }),
    );
  },
};

export function isDiscoverableChannelVisible(channel: DiscoverChannelSource): boolean {
  return (
    channel.type === ChannelType.TEXT &&
    !channel.isPrivate &&
    channel.serverDiscoverable &&
    channel.serverPublic &&
    !channel.everyoneViewDenied
  );
}

/**
 * `Channel.isPrivate` is a response property in this codebase, not a persisted column. Its
 * authority is what the default `@everyone` role can see after channel overwrites. An explicit
 * VIEW_CHANNEL deny is rejected even if a malformed row also carries an allow bit: discovery
 * fails closed instead of resolving an ambiguous overwrite into a public listing.
 */
export function isChannelVisibleToEveryone(input: DiscoverEveryoneVisibilityInput): boolean {
  const defaultRoleIds = new Set(
    input.roles.filter((role) => role.isDefault).flatMap((role) => (role.id ? [role.id] : [])),
  );
  const explicitlyDenied = input.overrides.some(
    (overwrite) =>
      overwrite.targetType === "ROLE" &&
      defaultRoleIds.has(overwrite.targetId) &&
      (overwrite.deny & PermissionBits.VIEW_CHANNEL) === PermissionBits.VIEW_CHANNEL,
  );

  if (explicitlyDenied) {
    return false;
  }

  const permissions = resolveChannelPermissions({
    ownerId: input.ownerId,
    overrides: [...input.overrides],
    roles: [...input.roles],
    userId: "",
  });
  return hasPermission(permissions, PermissionBits.VIEW_CHANNEL);
}

export function deriveDiscoverChannelActivityLabel(
  channel: DiscoverChannelSource,
  now: Date,
): DiscoverChannelActivityLabel {
  if (channel.features.includes("VERIFIED")) {
    return "official";
  }
  if (channel.hasLiveVoice) {
    return "live";
  }
  if (channel.dailyMessageCount >= DISCOVER_CHANNEL_BUSY_MIN_MESSAGES) {
    return "busy";
  }
  if (channel.linkedToVoice || channel.dailyMessageCount >= DISCOVER_CHANNEL_OPEN_MIN_MESSAGES) {
    return "open";
  }
  if (now.getTime() - channel.createdAt.getTime() <= DISCOVER_CHANNEL_NEW_MAX_AGE_MS) {
    return "new";
  }
  return "weekly";
}

export function normalizeDiscoverChannelQuery(query: string | undefined): string | null {
  const normalized = query?.trim().replace(/^#+/u, "").trim();
  return normalized ? normalized : null;
}

export function encodeDiscoverChannelCursor(cursor: DiscoverChannelCursor): string {
  return `c|${cursor.dailyMessageCount}|${cursor.id}`;
}

export function decodeDiscoverChannelCursor(
  cursor: string | undefined,
): DiscoverChannelCursor | null {
  if (!cursor) {
    return null;
  }

  const match = /^c\|(\d+)\|([^|]+)$/u.exec(cursor);
  const dailyMessageCount = match?.[1] ? Number(match[1]) : Number.NaN;
  const id = match?.[2] ?? "";
  if (!Number.isSafeInteger(dailyMessageCount) || dailyMessageCount < 0 || !id) {
    throw new ApiError("Invalid discover channel cursor", 400, "INVALID_CURSOR");
  }

  return { dailyMessageCount, id };
}

function isAfterCursor(channel: DiscoverChannelSource, cursor: DiscoverChannelCursor | null) {
  return (
    !cursor ||
    channel.dailyMessageCount < cursor.dailyMessageCount ||
    (channel.dailyMessageCount === cursor.dailyMessageCount && channel.id > cursor.id)
  );
}

function matchesChannelQuery(channel: DiscoverChannelSource, query: string | null) {
  if (!query) {
    return true;
  }

  const term = query.toLocaleLowerCase("tr");
  return [channel.name, channel.serverName].some((value) =>
    value.toLocaleLowerCase("tr").includes(term),
  );
}

export async function listDiscoverChannels(
  input: { cursor?: string; query?: string },
  context: { limit?: number; now?: Date } = {},
  dependencies: DiscoverChannelsDependencies = defaultDependencies,
): Promise<DiscoverChannelPage> {
  const now = context.now ?? new Date();
  const limit = Math.min(Math.max(Math.trunc(context.limit ?? DISCOVER_CHANNEL_PAGE_SIZE), 1), 50);
  const cursor = decodeDiscoverChannelCursor(input.cursor);
  const query = normalizeDiscoverChannelQuery(input.query);
  const windowEnd = startOfUtcHour(now);
  const windowStart = new Date(
    windowEnd.getTime() - DISCOVER_CHANNEL_WINDOW_HOURS * 60 * 60 * 1000,
  );
  const loaded = await dependencies.loadChannels({
    cursor,
    now,
    query,
    take: limit + 1,
    windowEnd,
    windowStart,
  });
  const visible = loaded
    .filter(isDiscoverableChannelVisible)
    .filter((channel) => matchesChannelQuery(channel, query))
    .filter((channel) => isAfterCursor(channel, cursor))
    .sort(
      (left, right) =>
        right.dailyMessageCount - left.dailyMessageCount || left.id.localeCompare(right.id),
    );
  const page = visible.slice(0, limit);

  if (page.length === 0) {
    return { items: [], nextCursor: null };
  }

  const previewsByServerId = await dependencies.loadMemberPreviews(
    page.map((channel) => channel.serverId),
  );
  const last = page.at(-1);

  return {
    items: page.map((channel) => ({
      activityLabel: deriveDiscoverChannelActivityLabel(channel, now),
      dailyMessageCount: channel.dailyMessageCount,
      id: channel.id,
      memberPreview: previewsByServerId.get(channel.serverId) ?? [],
      name: channel.name,
      serverCategory: channel.serverCategory,
      serverId: channel.serverId,
      serverName: channel.serverName,
    })),
    nextCursor: visible.length > limit && last ? encodeDiscoverChannelCursor(last) : null,
  };
}
