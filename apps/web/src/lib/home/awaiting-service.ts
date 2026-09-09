import { Prisma, type PrismaClient } from "@wizards/db";

import { buildMentionHref, toRelativeAppHref } from "@/lib/home/href";
import {
  HOME_ACTOR_SELECT,
  defaultVisibleChannelResolver,
  resolveHomeChannelAccess,
  toHomeActor,
  type HomePresenceReader,
  type VisibleChannelResolver,
} from "@/lib/home/service";
import type {
  AppAwaitingFilter,
  AppAwaitingResponse,
  HomeAwaitingItem,
  HomePresence,
} from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 3 §3.3, "Yanıt bekliyor".
 *
 * Four sources, one shape. Every one of them is filtered by the viewer's own
 * read cursor in SQL, so an item that is already read cannot reach the payload
 * and then be filtered out in JavaScript.
 *
 * The card's actions are **not** new endpoints: "Kabul et" calls the existing
 * `friends/request/[id]` and invite-join routes, "Yanıtla" is navigation. This
 * service only produces the row and the link.
 */

/** Anything older than this is history, not something waiting on an answer. */
export const HOME_AWAITING_WINDOW_DAYS = 30;

/**
 * "2 yeni" pill. There is no "inbox last seen" column yet — every item here is
 * unread by construction, so a marker column would be the only way to be exact.
 * Until Faz 6 owns the inbox and can add one, "new" means "arrived today".
 */
export const HOME_AWAITING_NEW_WINDOW_HOURS = 24;

/** Counting stops here; the header shows a number, not an audit. */
export const HOME_AWAITING_COUNT_CAP = 99;

const MENTION_EXCERPT_LENGTH = 160;

export type HomeAwaitingCounts = {
  readonly friendRequests: number;
  readonly mentions: number;
  readonly replies: number;
  readonly serverInvites: number;
  readonly total: number;
};

type AwaitingCountRow = {
  friendRequests: number;
  mentions: number;
  replies: number;
  serverInvites: number;
};

type AwaitingMessageRow = {
  authorAvatarUrl: string | null;
  authorDisplayName: string | null;
  authorId: string;
  authorUsername: string;
  channelId: string;
  channelName: string;
  content: string;
  id: string;
  messageId: string;
  occurredAt: Date;
  serverId: string;
  serverName: string;
};

function windowStart(now: Date): Date {
  return new Date(now.getTime() - HOME_AWAITING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function channelFilter(column: Prisma.Sql, channelIds: readonly string[]): Prisma.Sql {
  return channelIds.length > 0
    ? Prisma.sql`${column} IN (${Prisma.join([...channelIds])})`
    : Prisma.sql`FALSE`;
}

function excerpt(content: string): string {
  const collapsed = content.replaceAll(/\s+/g, " ").trim();
  return collapsed.length > MENTION_EXCERPT_LENGTH
    ? `${collapsed.slice(0, MENTION_EXCERPT_LENGTH - 1)}…`
    : collapsed;
}

/**
 * The header's "N yanıt bekliyor" and the card's own total are the same number,
 * so both read it from here. Each branch is capped: a header badge is not worth
 * a full count of a busy account's history.
 */
export async function countHomeAwaiting(
  database: PrismaClient,
  userId: string,
  channelIds: readonly string[],
  now: Date,
): Promise<HomeAwaitingCounts> {
  const since = windowStart(now);
  const mentionChannels = channelFilter(Prisma.sql`m."channelId"`, channelIds);
  const replyChannels = channelFilter(Prisma.sql`m."channelId"`, channelIds);

  const rows = await database.$queryRaw<AwaitingCountRow[]>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM (
        SELECT 1
        FROM "MessageMention" mm
        INNER JOIN "Message" m ON m."id" = mm."messageId"
        INNER JOIN "Channel" c ON c."id" = m."channelId"
        INNER JOIN "ServerMember" sm ON sm."serverId" = c."serverId" AND sm."userId" = ${userId}
        LEFT JOIN "ChannelReadState" crs
          ON crs."channelId" = m."channelId" AND crs."userId" = ${userId}
        WHERE mm."userId" = ${userId}
          AND mm."createdAt" >= ${since}
          AND m."deletedAt" IS NULL
          AND m."userId" <> ${userId}
          AND ${mentionChannels}
          AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
        LIMIT ${HOME_AWAITING_COUNT_CAP}
      ) capped)::int AS "mentions",
      (SELECT COUNT(*) FROM (
        SELECT 1
        FROM "Message" m
        INNER JOIN "Message" parent ON parent."id" = m."replyToId"
        INNER JOIN "Channel" c ON c."id" = m."channelId"
        INNER JOIN "ServerMember" sm ON sm."serverId" = c."serverId" AND sm."userId" = ${userId}
        LEFT JOIN "ChannelReadState" crs
          ON crs."channelId" = m."channelId" AND crs."userId" = ${userId}
        WHERE parent."userId" = ${userId}
          AND m."userId" <> ${userId}
          AND m."deletedAt" IS NULL
          AND m."createdAt" >= ${since}
          AND ${replyChannels}
          AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
        LIMIT ${HOME_AWAITING_COUNT_CAP}
      ) capped)::int AS "replies",
      (SELECT COUNT(*) FROM (
        SELECT 1 FROM "FriendRequest" fr
        WHERE fr."receiverId" = ${userId} AND fr."status" = 'PENDING'
        LIMIT ${HOME_AWAITING_COUNT_CAP}
      ) capped)::int AS "friendRequests",
      (SELECT COUNT(*) FROM (
        SELECT 1 FROM "Notification" n
        WHERE n."userId" = ${userId} AND n."read" = FALSE AND n."type" = 'SERVER_INVITE'
        LIMIT ${HOME_AWAITING_COUNT_CAP}
      ) capped)::int AS "serverInvites"
  `);

  const row = rows[0] ?? { friendRequests: 0, mentions: 0, replies: 0, serverInvites: 0 };

  return {
    ...row,
    total: row.mentions + row.replies + row.friendRequests + row.serverInvites,
  };
}

async function listMentionRows(
  database: PrismaClient,
  userId: string,
  channelIds: readonly string[],
  now: Date,
  limit: number,
): Promise<AwaitingMessageRow[]> {
  return database.$queryRaw<AwaitingMessageRow[]>(Prisma.sql`
    SELECT
      mm."id" AS "id",
      mm."createdAt" AS "occurredAt",
      m."id" AS "messageId",
      m."content" AS "content",
      m."channelId" AS "channelId",
      c."name" AS "channelName",
      c."serverId" AS "serverId",
      s."name" AS "serverName",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl"
    FROM "MessageMention" mm
    INNER JOIN "Message" m ON m."id" = mm."messageId"
    INNER JOIN "Channel" c ON c."id" = m."channelId"
    INNER JOIN "Server" s ON s."id" = c."serverId"
    INNER JOIN "User" u ON u."id" = m."userId"
    INNER JOIN "ServerMember" sm ON sm."serverId" = c."serverId" AND sm."userId" = ${userId}
    LEFT JOIN "ChannelReadState" crs
      ON crs."channelId" = m."channelId" AND crs."userId" = ${userId}
    WHERE mm."userId" = ${userId}
      AND mm."createdAt" >= ${windowStart(now)}
      AND m."deletedAt" IS NULL
      AND m."userId" <> ${userId}
      AND ${channelFilter(Prisma.sql`m."channelId"`, channelIds)}
      AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
    ORDER BY mm."createdAt" DESC, mm."id" DESC
    LIMIT ${limit}
  `);
}

async function listReplyRows(
  database: PrismaClient,
  userId: string,
  channelIds: readonly string[],
  now: Date,
  limit: number,
): Promise<AwaitingMessageRow[]> {
  return database.$queryRaw<AwaitingMessageRow[]>(Prisma.sql`
    SELECT
      m."id" AS "id",
      m."createdAt" AS "occurredAt",
      m."id" AS "messageId",
      m."content" AS "content",
      m."channelId" AS "channelId",
      c."name" AS "channelName",
      c."serverId" AS "serverId",
      s."name" AS "serverName",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl"
    FROM "Message" m
    INNER JOIN "Message" parent ON parent."id" = m."replyToId"
    INNER JOIN "Channel" c ON c."id" = m."channelId"
    INNER JOIN "Server" s ON s."id" = c."serverId"
    INNER JOIN "User" u ON u."id" = m."userId"
    INNER JOIN "ServerMember" sm ON sm."serverId" = c."serverId" AND sm."userId" = ${userId}
    LEFT JOIN "ChannelReadState" crs
      ON crs."channelId" = m."channelId" AND crs."userId" = ${userId}
    WHERE parent."userId" = ${userId}
      AND m."userId" <> ${userId}
      AND m."deletedAt" IS NULL
      AND m."createdAt" >= ${windowStart(now)}
      AND ${channelFilter(Prisma.sql`m."channelId"`, channelIds)}
      AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
    ORDER BY m."createdAt" DESC, m."id" DESC
    LIMIT ${limit}
  `);
}

function toMessageItem(
  row: AwaitingMessageRow,
  source: "mention" | "reply",
  presenceByUserId: ReadonlyMap<string, HomePresence>,
): HomeAwaitingItem {
  return {
    action: "reply",
    context: `${row.serverName} · #${row.channelName}`,
    href: buildMentionHref({
      channelId: row.channelId,
      messageId: row.messageId,
      serverId: row.serverId,
    }),
    id: `${source}:${row.id}`,
    occurredAt: row.occurredAt.toISOString(),
    // Data, not UI copy: the localized sentence around it is the client's job.
    reason: excerpt(row.content),
    source,
    user: toHomeActor(
      {
        avatarUrl: row.authorAvatarUrl,
        displayName: row.authorDisplayName,
        id: row.authorId,
        username: row.authorUsername,
      },
      presenceByUserId,
    ),
  };
}

export type HomeAwaitingDependencies = {
  readonly database: PrismaClient;
  readonly listVisibleChannels?: VisibleChannelResolver;
  readonly now: Date;
  readonly readPresence: HomePresenceReader;
};

/**
 * Faz 6 §4.1. The inbox's source chips are a **server** filter: a source the
 * caller did not ask for is never queried, so it cannot be trimmed away in
 * JavaScript afterwards and cannot pad the query budget either.
 */
export type ListHomeAwaitingQuery = {
  readonly limit: number;
  readonly source?: AppAwaitingFilter | undefined;
};

function wants(source: AppAwaitingFilter, candidate: AppAwaitingFilter): boolean {
  return source === "all" || source === candidate;
}

export async function listHomeAwaiting(
  userId: string,
  query: ListHomeAwaitingQuery,
  dependencies: HomeAwaitingDependencies,
): Promise<AppAwaitingResponse> {
  const { database, now, readPresence } = dependencies;
  const { limit } = query;
  const source = query.source ?? "all";
  const { textChannelIds } = await resolveHomeChannelAccess(
    database,
    userId,
    dependencies.listVisibleChannels ?? defaultVisibleChannelResolver,
  );

  const [counts, mentionRows, replyRows, friendRequests, invites] = await Promise.all([
    countHomeAwaiting(database, userId, textChannelIds, now),
    wants(source, "mention")
      ? listMentionRows(database, userId, textChannelIds, now, limit)
      : Promise.resolve([]),
    wants(source, "reply")
      ? listReplyRows(database, userId, textChannelIds, now, limit)
      : Promise.resolve([]),
    !wants(source, "friend_request")
      ? Promise.resolve([])
      : database.friendRequest.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            id: true,
            sender: { select: HOME_ACTOR_SELECT },
          },
          take: limit,
          where: { receiverId: userId, status: "PENDING" },
        }),
    !wants(source, "server_invite")
      ? Promise.resolve([])
      : database.notification.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            actionUrl: true,
            body: true,
            createdAt: true,
            id: true,
            title: true,
          },
          take: limit,
          where: { read: false, type: "SERVER_INVITE", userId },
        }),
  ]);

  const presenceByUserId = await readPresence(userId, [
    ...mentionRows.map((row) => row.authorId),
    ...replyRows.map((row) => row.authorId),
    ...friendRequests.map((request) => request.sender.id),
  ]);

  const items: HomeAwaitingItem[] = [
    ...mentionRows.map((row) => toMessageItem(row, "mention", presenceByUserId)),
    ...replyRows.map((row) => toMessageItem(row, "reply", presenceByUserId)),
    ...friendRequests.map((request) => ({
      action: "accept" as const,
      context: "",
      href: "/messages",
      id: `friend_request:${request.id}`,
      occurredAt: request.createdAt.toISOString(),
      reason: "",
      source: "friend_request" as const,
      user: toHomeActor(request.sender, presenceByUserId),
    })),
    ...invites.map((invite) => ({
      action: "accept" as const,
      context: "",
      // `actionUrl` is stored text. It is only ever a link after the guard says
      // it is an in-app path (§5.1.7). Ş13 — `/inbox` silindi (K10); güvenli iniş alanı
      // artık Bahsedilmeler ekranı.
      href: toRelativeAppHref(invite.actionUrl) ?? "/mentions",
      id: `server_invite:${invite.id}`,
      occurredAt: invite.createdAt.toISOString(),
      reason: invite.body,
      source: "server_invite" as const,
      // The invite row does not record who sent it, so the notification's own
      // subject line stands in. No metadata is read, so nothing client-written
      // reaches the screen.
      user: {
        avatarUrl: null,
        displayName: invite.title,
        id: invite.id,
        presence: "OFFLINE" as const,
      },
    })),
  ]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, limit);

  const newSince = new Date(now.getTime() - HOME_AWAITING_NEW_WINDOW_HOURS * 60 * 60 * 1000);

  return {
    items,
    newCount: items.filter((item) => new Date(item.occurredAt) >= newSince).length,
    total: counts.total,
  };
}
