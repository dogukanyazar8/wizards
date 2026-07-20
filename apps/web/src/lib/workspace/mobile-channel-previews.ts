import { Prisma, prisma } from "@wizards/db";
import type { MobileChannelLastMessagePreview } from "@wizards/types";

import { toMobileChannelMessagePreview } from "@/lib/workspace/mobile-channel-message-preview";

export type MobileChannelPreviewRow = {
  authorDisplayName: string | null;
  authorId: string;
  authorUsername: string;
  channelId: string;
  content: string;
  createdAt: Date;
  id: string;
};

export type MobileChannelPreviewMap = Map<string, MobileChannelLastMessagePreview | null>;

/**
 * Prisma turns a nested `messages: { take: 1 }` on a channel list into one
 * correlated subquery per channel — roughly eighty of them for a full mobile
 * server detail. `DISTINCT ON` collapses that into a single index scan over
 * `Message(channelId, createdAt)`.
 *
 * The filters mirror the nested read this replaced exactly: the newest
 * non-deleted top-level message per channel, thread replies excluded.
 */
export function buildMobileChannelPreviewQuery(channelIds: readonly string[]): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT ON (m."channelId")
      m."channelId" AS "channelId",
      m."id" AS "id",
      m."content" AS "content",
      m."createdAt" AS "createdAt",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName"
    FROM "Message" m
    INNER JOIN "User" u ON u."id" = m."userId"
    WHERE m."channelId" IN (${Prisma.join([...channelIds])})
      AND m."deletedAt" IS NULL
      AND m."threadId" IS NULL
      AND m."threadParentId" IS NULL
    ORDER BY m."channelId", m."createdAt" DESC, m."id" DESC
  `;
}

export function mapMobileChannelPreviewRows(
  rows: readonly MobileChannelPreviewRow[],
): MobileChannelPreviewMap {
  const previews: MobileChannelPreviewMap = new Map();

  for (const row of rows) {
    previews.set(
      row.channelId,
      toMobileChannelMessagePreview({
        author: {
          displayName: row.authorDisplayName,
          id: row.authorId,
          username: row.authorUsername,
        },
        content: row.content,
        createdAt: row.createdAt,
        id: row.id,
      }),
    );
  }

  return previews;
}

export async function loadMobileChannelPreviews(
  channelIds: readonly string[],
): Promise<MobileChannelPreviewMap> {
  const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
  if (uniqueChannelIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<MobileChannelPreviewRow[]>(
    buildMobileChannelPreviewQuery(uniqueChannelIds),
  );

  return mapMobileChannelPreviewRows(rows);
}
