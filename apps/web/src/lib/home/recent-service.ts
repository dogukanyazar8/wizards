import { Prisma, type PrismaClient } from "@wizards/db";

import { buildChannelHref, buildDMHref } from "@/lib/home/href";
import { toUnexpiredFilter } from "@/lib/dm/service";
import {
  HOME_ACTOR_SELECT,
  defaultVisibleChannelResolver,
  resolveHomeChannelAccess,
  type HomePresenceReader,
  type VisibleChannelResolver,
} from "@/lib/home/service";
import type { AppRecentResponse, HomeRecentItem } from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 3 §3.2, "Kaldığın yer".
 *
 * Two sources, each read with its own `take = limit`, merged in memory and cut
 * back to `limit`. Reading everything and sorting afterwards is the trap this
 * card exists to avoid: it grows with the number of servers, not with the four
 * rows the card draws.
 */

const RECENT_PREVIEW_LENGTH = 140;
/** The badge shows "99+", so counting past it buys nothing. */
const RECENT_UNREAD_CAP = 99;

type RecentChannelRow = {
  authorAvatarUrl: string | null;
  authorDisplayName: string | null;
  authorId: string;
  authorUsername: string;
  channelId: string;
  channelName: string;
  content: string;
  createdAt: Date;
  serverId: string;
  serverName: string;
};

type RecentChannelCountRow = {
  channelId: string;
  mentionCount: number;
  unreadCount: number;
};

type RecentDMRow = {
  conversationId: string;
  historyFromAt: Date | null;
  lastMessageAt: Date;
  mentionCount: number;
  unreadCount: number;
};

function preview(content: string): string {
  const collapsed = content.replaceAll(/\s+/g, " ").trim();
  return collapsed.length > RECENT_PREVIEW_LENGTH
    ? `${collapsed.slice(0, RECENT_PREVIEW_LENGTH - 1)}…`
    : collapsed;
}

/**
 * One index probe per visible channel for its newest message, then the newest
 * `limit` of those. `DISTINCT ON` rides `Message(channelId, createdAt)`.
 */
async function listChannelRows(
  database: PrismaClient,
  channelIds: readonly string[],
  limit: number,
): Promise<RecentChannelRow[]> {
  if (channelIds.length === 0) {
    return [];
  }

  return database.$queryRaw<RecentChannelRow[]>(Prisma.sql`
    SELECT
      c."id" AS "channelId",
      c."name" AS "channelName",
      c."serverId" AS "serverId",
      s."name" AS "serverName",
      latest."content" AS "content",
      latest."createdAt" AS "createdAt",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl"
    FROM (
      SELECT DISTINCT ON (m."channelId")
        m."channelId", m."content", m."createdAt", m."userId"
      FROM "Message" m
      WHERE m."channelId" IN (${Prisma.join([...channelIds])})
        AND m."deletedAt" IS NULL
        AND m."threadId" IS NULL
        AND m."threadParentId" IS NULL
      ORDER BY m."channelId", m."createdAt" DESC
    ) latest
    INNER JOIN "Channel" c ON c."id" = latest."channelId"
    INNER JOIN "Server" s ON s."id" = c."serverId"
    INNER JOIN "User" u ON u."id" = latest."userId"
    ORDER BY latest."createdAt" DESC
    LIMIT ${limit}
  `);
}

/** Unread arithmetic only for the rows that survived the cut. */
async function countChannelRows(
  database: PrismaClient,
  userId: string,
  channelIds: readonly string[],
): Promise<Map<string, RecentChannelCountRow>> {
  if (channelIds.length === 0) {
    return new Map();
  }

  const rows = await database.$queryRaw<RecentChannelCountRow[]>(Prisma.sql`
    SELECT
      c."id" AS "channelId",
      COALESCE(crs."mentionCount", 0)::int AS "mentionCount",
      COALESCE(unread."unreadCount", 0)::int AS "unreadCount"
    FROM "Channel" c
    INNER JOIN "ServerMember" sm ON sm."serverId" = c."serverId" AND sm."userId" = ${userId}
    LEFT JOIN "ChannelReadState" crs ON crs."channelId" = c."id" AND crs."userId" = ${userId}
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS "unreadCount"
      FROM (
        SELECT 1
        FROM "Message" m
        WHERE m."channelId" = c."id"
          AND m."deletedAt" IS NULL
          AND m."threadId" IS NULL
          AND m."threadParentId" IS NULL
          AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
        LIMIT ${RECENT_UNREAD_CAP}
      ) capped
    ) unread ON TRUE
    WHERE c."id" IN (${Prisma.join([...channelIds])})
  `);

  return new Map(rows.map((row) => [row.channelId, row]));
}

/**
 * Hidden conversations stay hidden until something new arrives — the same rule
 * `listDirectMessages` applies, expressed once more here because this page is
 * sorted and cut on its own.
 */
async function listDMRows(
  database: PrismaClient,
  userId: string,
  limit: number,
  now: Date,
): Promise<RecentDMRow[]> {
  return database.$queryRaw<RecentDMRow[]>(Prisma.sql`
    SELECT
      p."conversationId" AS "conversationId",
      p."historyFromAt" AS "historyFromAt",
      p."unreadCount"::int AS "unreadCount",
      p."mentionCount"::int AS "mentionCount",
      latest."createdAt" AS "lastMessageAt"
    FROM "DMParticipant" p
    INNER JOIN "DMConversation" c ON c."id" = p."conversationId"
    INNER JOIN LATERAL (
      SELECT m."createdAt"
      FROM "DMMessage" m
      WHERE m."conversationId" = p."conversationId"
        AND m."deletedAt" IS NULL
        AND m."placeholderRemovedAt" IS NULL
        AND (m."expiresAt" IS NULL OR m."expiresAt" > ${now})
        AND (p."historyFromAt" IS NULL OR m."createdAt" >= p."historyFromAt")
        AND (m."threadParentId" IS NULL OR m."alsoSentToChannel" = TRUE)
      ORDER BY m."createdAt" DESC, m."id" DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE p."userId" = ${userId}
      AND (p."hiddenAt" IS NULL OR latest."createdAt" > p."hiddenAt")
    ORDER BY latest."createdAt" DESC, c."id" DESC
    LIMIT ${limit}
  `);
}

export type HomeRecentDependencies = {
  readonly database: PrismaClient;
  readonly listVisibleChannels?: VisibleChannelResolver;
  /**
   * The DM row draws a presence dot, so the counterpart's presence has to be
   * read — and redacted — like every other presence on this screen (§5.1.3).
   * It is a Redis read, not a query: the endpoint's SQL budget is unchanged.
   *
   * Required, not defaulted: a defaulted reader lets a test reach the real
   * Redis by forgetting to pass one, and the failure looks like a hang.
   */
  readonly readPresence: HomePresenceReader;
};

export async function listHomeRecent(
  userId: string,
  limit: number,
  dependencies: HomeRecentDependencies,
): Promise<AppRecentResponse> {
  const { database } = dependencies;
  const now = new Date();
  const { textChannelIds } = await resolveHomeChannelAccess(
    database,
    userId,
    dependencies.listVisibleChannels ?? defaultVisibleChannelResolver,
  );

  const [channelRows, dmRows] = await Promise.all([
    listChannelRows(database, textChannelIds, limit),
    listDMRows(database, userId, limit, now),
  ]);

  const [channelCounts, conversations] = await Promise.all([
    countChannelRows(
      database,
      userId,
      channelRows.map((row) => row.channelId),
    ),
    dmRows.length > 0
      ? database.dMConversation.findMany({
          select: {
            id: true,
            messages: {
              orderBy: { createdAt: "desc" },
              select: {
                author: { select: HOME_ACTOR_SELECT },
                content: true,
                createdAt: true,
              },
              take: 1,
              where: {
                AND: [
                  toUnexpiredFilter(now),
                  {
                    OR: dmRows.map((row) => ({
                      conversationId: row.conversationId,
                      ...(row.historyFromAt ? { createdAt: { gte: row.historyFromAt } } : {}),
                    })),
                  },
                ],
                deletedAt: null,
                placeholderRemovedAt: null,
              },
            },
            name: true,
            participants: { select: { user: { select: HOME_ACTOR_SELECT } } },
            type: true,
          },
          where: { id: { in: dmRows.map((row) => row.conversationId) } },
        })
      : Promise.resolve([]),
  ]);

  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );

  const channelItems: HomeRecentItem[] = channelRows.map((row) => {
    const counts = channelCounts.get(row.channelId);

    return {
      avatarUrl: null,
      href: buildChannelHref(row.serverId, row.channelId),
      id: row.channelId,
      kind: "channel",
      // A channel has no single person behind it.
      presence: null,
      lastMessage: {
        authorAvatarUrl: row.authorAvatarUrl,
        authorName: row.authorDisplayName ?? row.authorUsername,
        text: preview(row.content),
      },
      lastMessageAt: row.createdAt.toISOString(),
      mentioned: (counts?.mentionCount ?? 0) > 0,
      name: row.channelName,
      serverName: row.serverName,
      unreadCount: counts?.unreadCount ?? 0,
    };
  });

  const counterpartByConversationId = new Map(
    conversations.flatMap((conversation) => {
      if (conversation.type === "GROUP_DM") {
        return [];
      }

      const counterpart = conversation.participants.find(
        (participant) => participant.user.id !== userId,
      );

      return counterpart ? [[conversation.id, counterpart.user.id] as const] : [];
    }),
  );
  const presenceByUserId = await dependencies.readPresence(userId, [
    ...counterpartByConversationId.values(),
  ]);

  const dmItems: HomeRecentItem[] = dmRows.flatMap((row) => {
    const conversation = conversationById.get(row.conversationId);
    if (!conversation) {
      return [];
    }

    const counterpart = conversation.participants.find(
      (participant) => participant.user.id !== userId,
    );
    const lastMessage = conversation.messages[0];
    const counterpartId = counterpartByConversationId.get(conversation.id);

    return [
      {
        // The counterpart is already resolved for `name`; the avatar costs nothing extra.
        avatarUrl: conversation.type === "GROUP_DM" ? null : (counterpart?.user.avatarUrl ?? null),
        href: buildDMHref(conversation.id),
        id: conversation.id,
        kind: "dm" as const,
        lastMessage: lastMessage
          ? {
              authorAvatarUrl: lastMessage.author.avatarUrl,
              authorName: lastMessage.author.displayName ?? lastMessage.author.username,
              text: preview(lastMessage.content),
            }
          : null,
        lastMessageAt: row.lastMessageAt.toISOString(),
        mentioned: row.mentionCount > 0,
        presence: counterpartId ? (presenceByUserId.get(counterpartId) ?? "OFFLINE") : null,
        name:
          conversation.type === "GROUP_DM"
            ? (conversation.name ?? "")
            : (counterpart?.user.displayName ?? counterpart?.user.username ?? ""),
        serverName: null,
        unreadCount: row.unreadCount,
      },
    ];
  });

  return {
    items: [...channelItems, ...dmItems]
      .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))
      .slice(0, limit),
  };
}
