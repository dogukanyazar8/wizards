import { Buffer } from "node:buffer";
import { ChannelType, Prisma, prisma } from "@wizards/db";
import type { MessageSearchResponse, MessageSearchResult } from "@wizards/types";
import { ApiError } from "@/lib/api";
import {
  listChannelIdsByServerForUserWithPermission,
  requireChannelPermissionForUser,
} from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const MIN_QUERY_LENGTH = 2;

/** Kapsamı genişletilmiş arama da aynı tabanı kullanır (karar #6). */
export const MIN_SEARCH_QUERY_LENGTH = MIN_QUERY_LENGTH;

type SearchCursor = {
  createdAt: string;
  id: string;
};

type SearchAuthorRow = {
  authorAvatarUrl: string | null;
  authorCustomStatus: string | null;
  authorDisplayName: string | null;
  authorId: string;
  authorStatus: "ONLINE" | "IDLE" | "DND" | "OFFLINE";
  authorUsername: string;
};

type ChannelSearchRow = SearchAuthorRow & {
  channelId: string;
  channelName: string;
  content: string;
  createdAt: Date;
  id: string;
  serverId: string;
};

type DMSearchRow = SearchAuthorRow & {
  content: string;
  conversationId: string;
  createdAt: Date;
  id: string;
};

type MessageSearchFilters = {
  author?: string | null | undefined;
  exact?: boolean | null | undefined;
  from?: Date | null | undefined;
  to?: Date | null | undefined;
};

export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

export function normalizeSearchLimit(limit: number | null | undefined) {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return DEFAULT_SEARCH_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit!), 1), MAX_SEARCH_LIMIT);
}

export function encodeSearchCursor(cursor: SearchCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSearchCursor(cursor: string | null | undefined): SearchCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<SearchCursor>;
    if (typeof parsed.id !== "string" || typeof parsed.createdAt !== "string") {
      return null;
    }

    const date = new Date(parsed.createdAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return {
      createdAt: date.toISOString(),
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

function escapeLikePattern(query: string) {
  return query.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function escapeRegexPattern(query: string) {
  return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildSearchFragments(query: string) {
  return {
    likePattern: `%${escapeLikePattern(query)}%`,
    regexPattern: `(^|[^[:alnum:]_])${escapeRegexPattern(query)}([^[:alnum:]_]|$)`,
    tsQuery: query,
  };
}

function buildAdvancedFilterSql(filters: MessageSearchFilters | undefined) {
  const author = normalizeSearchQuery(filters?.author ?? "");
  const authorSql =
    author.length > 0
      ? Prisma.sql`
        AND (
          u."username" ILIKE ${`%${escapeLikePattern(author)}%`} ESCAPE ${"\\"}
          OR COALESCE(u."displayName", '') ILIKE ${`%${escapeLikePattern(author)}%`} ESCAPE ${"\\"}
        )
      `
      : Prisma.empty;

  const fromSql = filters?.from ? Prisma.sql`AND m."createdAt" >= ${filters.from}` : Prisma.empty;
  const toSql = filters?.to ? Prisma.sql`AND m."createdAt" <= ${filters.to}` : Prisma.empty;

  return Prisma.sql`
    ${authorSql}
    ${fromSql}
    ${toSql}
  `;
}

function mapAuthor(row: SearchAuthorRow) {
  return {
    avatarUrl: row.authorAvatarUrl,
    customStatus: row.authorCustomStatus,
    displayName: row.authorDisplayName ?? row.authorUsername,
    id: row.authorId,
    status: row.authorStatus,
    username: row.authorUsername,
  };
}

function getNextCursor<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  if (rows.length <= limit) {
    return null;
  }

  const last = rows[limit - 1]!;
  return encodeSearchCursor({
    createdAt: last.createdAt.toISOString(),
    id: last.id,
  });
}

async function assertChannelSearchAccess(userId: string, channelId: string) {
  const { channel } = await requireChannelPermissionForUser(
    userId,
    channelId,
    PermissionBits.VIEW_CHANNEL,
    {
      requiredType: ChannelType.TEXT,
    },
  );

  return channel;
}

/**
 * Membership plus 2c §7's history floor. Search is the fifth read path over DM
 * messages, and a floor enforced on four of them is a floor a member walks
 * around by typing a word from the history they were not given.
 */
async function assertDMSearchAccess(
  userId: string,
  conversationId: string,
): Promise<{ historyFromAt: Date | null }> {
  const participant = await prisma.dMParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    select: { historyFromAt: true },
  });

  if (!participant) {
    throw new ApiError("Conversation not found", 404, "CONVERSATION_NOT_FOUND");
  }

  return participant;
}

export async function searchChannelMessages(args: {
  channelId: string;
  cursor?: string | null | undefined;
  filters?: MessageSearchFilters | undefined;
  limit?: number | null | undefined;
  query: string;
  userId: string;
}): Promise<MessageSearchResponse> {
  const query = normalizeSearchQuery(args.query);
  if (query.length < MIN_QUERY_LENGTH) {
    return { nextCursor: null, results: [] };
  }

  await assertChannelSearchAccess(args.userId, args.channelId);

  const limit = normalizeSearchLimit(args.limit);
  const cursor = decodeSearchCursor(args.cursor);
  if (args.cursor && !cursor) {
    throw new ApiError("Invalid search cursor", 400, "INVALID_CURSOR");
  }

  const { likePattern, regexPattern, tsQuery } = buildSearchFragments(query);
  const filterSql = buildAdvancedFilterSql(args.filters);
  const contentMatchSql = args.filters?.exact
    ? Prisma.sql`m."content" ~* ${regexPattern}`
    : Prisma.sql`
      (
        m."content_search" @@ websearch_to_tsquery('english', ${tsQuery})
        OR m."content" ILIKE ${likePattern} ESCAPE ${"\\"}
      )
    `;
  const cursorSql = cursor
    ? Prisma.sql`
      AND (
        m."createdAt" < ${new Date(cursor.createdAt)}
        OR (m."createdAt" = ${new Date(cursor.createdAt)} AND m."id" < ${cursor.id})
      )
    `
    : Prisma.empty;

  const rows = await prisma.$queryRaw<ChannelSearchRow[]>(Prisma.sql`
    SELECT
      m."id",
      m."channelId",
      m."content",
      m."createdAt",
      c."name" AS "channelName",
      c."serverId",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl",
      u."status" AS "authorStatus",
      u."customStatus" AS "authorCustomStatus"
    FROM "Message" m
    INNER JOIN "Channel" c ON c."id" = m."channelId"
    INNER JOIN "User" u ON u."id" = m."userId"
    WHERE m."channelId" = ${args.channelId}
      AND m."deletedAt" IS NULL
      AND m."threadParentId" IS NULL
      AND m."threadId" IS NULL
      AND ${contentMatchSql}
      ${filterSql}
      ${cursorSql}
    ORDER BY m."createdAt" DESC, m."id" DESC
    LIMIT ${limit + 1}
  `);

  const results: MessageSearchResult[] = rows.slice(0, limit).map((row) => ({
    author: mapAuthor(row),
    channelId: row.channelId,
    channelName: row.channelName,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    messageId: row.id,
    scope: "channel",
    serverId: row.serverId,
  }));

  return {
    nextCursor: getNextCursor(rows, limit),
    results,
  };
}

/**
 * 6b's search box says "Kanallarda ve mesajlarda ara", so the message half has
 * to span the whole server rather than one open channel. Same content match and
 * same keyset paging as `searchChannelMessages`; the only new thing is the
 * channel set, and that comes from the permission service's own visible-channel
 * read — the filter is never rewritten here, so a channel this viewer cannot
 * see can never surface through search.
 *
 * A viewer with no visible text channel (non-member, or every channel closed to
 * them) gets an empty page rather than an error: the servers screen renders it
 * as "no results", and a 403 would tell them the server exists.
 */
export async function searchServerMessages(args: {
  cursor?: string | null | undefined;
  filters?: MessageSearchFilters | undefined;
  limit?: number | null | undefined;
  query: string;
  serverId: string;
  userId: string;
}): Promise<MessageSearchResponse> {
  const query = normalizeSearchQuery(args.query);
  if (query.length < MIN_QUERY_LENGTH) {
    return { nextCursor: null, results: [] };
  }

  const channelIdsByServer = await listChannelIdsByServerForUserWithPermission(
    args.userId,
    [args.serverId],
    PermissionBits.VIEW_CHANNEL,
    ChannelType.TEXT,
  );
  const channelIds = channelIdsByServer.get(args.serverId) ?? [];
  if (channelIds.length === 0) {
    return { nextCursor: null, results: [] };
  }

  const limit = normalizeSearchLimit(args.limit);
  const cursor = decodeSearchCursor(args.cursor);
  if (args.cursor && !cursor) {
    throw new ApiError("Invalid search cursor", 400, "INVALID_CURSOR");
  }

  const { likePattern, regexPattern, tsQuery } = buildSearchFragments(query);
  const filterSql = buildAdvancedFilterSql(args.filters);
  const contentMatchSql = args.filters?.exact
    ? Prisma.sql`m."content" ~* ${regexPattern}`
    : Prisma.sql`
      (
        m."content_search" @@ websearch_to_tsquery('english', ${tsQuery})
        OR m."content" ILIKE ${likePattern} ESCAPE ${"\\"}
      )
    `;
  const cursorSql = cursor
    ? Prisma.sql`
      AND (
        m."createdAt" < ${new Date(cursor.createdAt)}
        OR (m."createdAt" = ${new Date(cursor.createdAt)} AND m."id" < ${cursor.id})
      )
    `
    : Prisma.empty;

  const rows = await prisma.$queryRaw<ChannelSearchRow[]>(Prisma.sql`
    SELECT
      m."id",
      m."channelId",
      m."content",
      m."createdAt",
      c."name" AS "channelName",
      c."serverId",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl",
      u."status" AS "authorStatus",
      u."customStatus" AS "authorCustomStatus"
    FROM "Message" m
    INNER JOIN "Channel" c ON c."id" = m."channelId"
    INNER JOIN "User" u ON u."id" = m."userId"
    WHERE c."serverId" = ${args.serverId}
      AND m."channelId" IN (${Prisma.join(channelIds)})
      AND m."deletedAt" IS NULL
      AND m."threadParentId" IS NULL
      AND m."threadId" IS NULL
      AND ${contentMatchSql}
      ${filterSql}
      ${cursorSql}
    ORDER BY m."createdAt" DESC, m."id" DESC
    LIMIT ${limit + 1}
  `);

  const results: MessageSearchResult[] = rows.slice(0, limit).map((row) => ({
    author: mapAuthor(row),
    channelId: row.channelId,
    channelName: row.channelName,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    messageId: row.id,
    scope: "channel",
    serverId: row.serverId,
  }));

  return {
    nextCursor: getNextCursor(rows, limit),
    results,
  };
}

export async function searchDMMessages(args: {
  conversationId: string;
  cursor?: string | null | undefined;
  filters?: MessageSearchFilters | undefined;
  limit?: number | null | undefined;
  query: string;
  userId: string;
}): Promise<MessageSearchResponse> {
  const query = normalizeSearchQuery(args.query);
  if (query.length < MIN_QUERY_LENGTH) {
    return { nextCursor: null, results: [] };
  }

  const { historyFromAt } = await assertDMSearchAccess(args.userId, args.conversationId);

  const limit = normalizeSearchLimit(args.limit);
  const cursor = decodeSearchCursor(args.cursor);
  if (args.cursor && !cursor) {
    throw new ApiError("Invalid search cursor", 400, "INVALID_CURSOR");
  }

  const { likePattern, regexPattern, tsQuery } = buildSearchFragments(query);
  const filterSql = buildAdvancedFilterSql(args.filters);
  const contentMatchSql = args.filters?.exact
    ? Prisma.sql`m."content" ~* ${regexPattern}`
    : Prisma.sql`
      (
        m."content_search" @@ websearch_to_tsquery('english', ${tsQuery})
        OR m."content" ILIKE ${likePattern} ESCAPE ${"\\"}
      )
    `;
  const cursorSql = cursor
    ? Prisma.sql`
      AND (
        m."createdAt" < ${new Date(cursor.createdAt)}
        OR (m."createdAt" = ${new Date(cursor.createdAt)} AND m."id" < ${cursor.id})
      )
    `
    : Prisma.empty;
  const historyFloorSql = historyFromAt
    ? Prisma.sql`AND m."createdAt" >= ${historyFromAt}`
    : Prisma.empty;
  // C4. Search is the third read path into DM messages; a filter on the other
  // two would just make this the way to read an expired message.
  const unexpiredSql = Prisma.sql`AND (m."expiresAt" IS NULL OR m."expiresAt" > ${new Date()})`;

  const rows = await prisma.$queryRaw<DMSearchRow[]>(Prisma.sql`
    SELECT
      m."id",
      m."conversationId",
      m."content",
      m."createdAt",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl",
      u."status" AS "authorStatus",
      u."customStatus" AS "authorCustomStatus"
    FROM "DMMessage" m
    INNER JOIN "User" u ON u."id" = m."userId"
    WHERE m."conversationId" = ${args.conversationId}
      AND m."deletedAt" IS NULL
      AND m."threadParentId" IS NULL
      AND ${contentMatchSql}
      ${historyFloorSql}
      ${unexpiredSql}
      ${filterSql}
      ${cursorSql}
    ORDER BY m."createdAt" DESC, m."id" DESC
    LIMIT ${limit + 1}
  `);

  const results: MessageSearchResult[] = rows.slice(0, limit).map((row) => ({
    author: mapAuthor(row),
    content: row.content,
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    messageId: row.id,
    scope: "dm",
  }));

  return {
    nextCursor: getNextCursor(rows, limit),
    results,
  };
}
