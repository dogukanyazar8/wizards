import { Prisma, prisma } from "@wizards/db";
import type { MessageSearchHitDTO, MessageSearchPage } from "@wizards/types";
import { ApiError } from "@/lib/api";
import { getDMDisplayName } from "@/lib/dm/service";
import { findMatchRanges } from "@/lib/messages/match-ranges";
import {
  buildSearchFragments,
  decodeSearchCursor,
  encodeSearchCursor,
  normalizeSearchLimit,
  normalizeSearchQuery,
  MIN_SEARCH_QUERY_LENGTH,
} from "@/lib/messages/search-service";

/**
 * Mesajlar karar #6 — görüntüleyenin **tüm** DM ve gruplarında arama.
 *
 * Konuşma başına arama (`searchDMMessages`) yerinde duruyor; bu onun kapsamı
 * genişletilmiş kardeşi. Panel açılırken "Kişi: <karşı taraf>" çipiyle
 * daraltılmış geliyor, çip kaldırılınca global oluyor (SPEC §6.2).
 *
 * ## Yetki
 *
 * Üyelik ve geçmiş penceresi **aynı sorguda**, `DMParticipant` üzerinden bir
 * `INNER JOIN` ile. Görüntüleyenin katılımcı satırı yoksa mesaj hiç
 * dönmez; satır varsa `historyFromAt` o konuşmanın kendi tabanıdır. Konuşma
 * listesini önce çekip sonra `IN (...)` yazmak iki yerde iki kural demek
 * olurdu — ve gruba sonradan katılan biri için taban konuşma başına değişir.
 */

const CONVERSATION_NAME_LOOKUP_LIMIT = 60;

type GlobalSearchRow = {
  authorAvatarUrl: string | null;
  authorDisplayName: string | null;
  authorId: string;
  authorUsername: string;
  content: string;
  conversationId: string;
  createdAt: Date;
  id: string;
};

export type GlobalDMSearchArgs = {
  cursor?: string | null | undefined;
  from?: Date | null | undefined;
  limit?: number | null | undefined;
  personId?: string | null | undefined;
  query: string;
  to?: Date | null | undefined;
  userId: string;
};

export type GlobalDMSearchDependencies = {
  loadConversationNames(input: {
    conversationIds: readonly string[];
    viewerId: string;
  }): Promise<Map<string, string>>;
  now(): Date;
  search(args: GlobalDMSearchArgs & { limit: number }): Promise<GlobalSearchRow[]>;
};

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => Array.from(part)[0] ?? "");

  return letters.join("").toLocaleUpperCase("tr") || "?";
}

const defaults: GlobalDMSearchDependencies = {
  /**
   * İkinci ve son sorgu: sonuç sayfasındaki konuşmaların adları.
   *
   * 1:1 DM'in adı yoktur — başlık karşı tarafın adıdır. Onu SQL'de türetmek bir
   * LATERAL gerektirirdi; sayfa başına en çok `limit` farklı konuşma olduğu için
   * tek toplu okuma hem daha ucuz hem okunur.
   */
  loadConversationNames: async ({ conversationIds, viewerId }) => {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const conversations = await prisma.dMConversation.findMany({
      where: { id: { in: [...conversationIds].slice(0, CONVERSATION_NAME_LOOKUP_LIMIT) } },
      select: {
        id: true,
        name: true,
        type: true,
        participants: {
          where: { userId: { not: viewerId } },
          take: 1,
          select: { user: { select: { displayName: true, username: true } } },
        },
      },
    });

    return new Map(
      conversations.map((conversation) => {
        if (conversation.name) {
          return [conversation.id, conversation.name] as const;
        }

        const counterpart = conversation.participants[0]?.user;

        return [conversation.id, counterpart ? getDMDisplayName(counterpart) : ""] as const;
      }),
    );
  },

  now: () => new Date(),

  search: async (args) => {
    const { likePattern, tsQuery } = buildSearchFragments(normalizeSearchQuery(args.query));
    const cursor = decodeSearchCursor(args.cursor);

    if (args.cursor && !cursor) {
      throw new ApiError("Invalid search cursor", 400, "INVALID_CURSOR");
    }

    const cursorSql = cursor
      ? Prisma.sql`
        AND (
          m."createdAt" < ${new Date(cursor.createdAt)}
          OR (m."createdAt" = ${new Date(cursor.createdAt)} AND m."id" < ${cursor.id})
        )
      `
      : Prisma.empty;
    const personSql = args.personId ? Prisma.sql`AND m."userId" = ${args.personId}` : Prisma.empty;
    const fromSql = args.from ? Prisma.sql`AND m."createdAt" >= ${args.from}` : Prisma.empty;
    const toSql = args.to ? Prisma.sql`AND m."createdAt" <= ${args.to}` : Prisma.empty;

    return await prisma.$queryRaw<GlobalSearchRow[]>(Prisma.sql`
      SELECT
        m."id",
        m."conversationId",
        m."content",
        m."createdAt",
        u."id" AS "authorId",
        u."username" AS "authorUsername",
        u."displayName" AS "authorDisplayName",
        u."avatarUrl" AS "authorAvatarUrl"
      FROM "DMMessage" m
      INNER JOIN "DMParticipant" p
        ON p."conversationId" = m."conversationId" AND p."userId" = ${args.userId}
      INNER JOIN "User" u ON u."id" = m."userId"
      WHERE m."deletedAt" IS NULL
        AND m."threadParentId" IS NULL
        AND p."hiddenAt" IS NULL
        AND (p."historyFromAt" IS NULL OR m."createdAt" >= p."historyFromAt")
        AND (m."expiresAt" IS NULL OR m."expiresAt" > ${new Date()})
        AND (
          m."content_search" @@ websearch_to_tsquery('english', ${tsQuery})
          OR m."content" ILIKE ${likePattern} ESCAPE ${"\\"}
        )
        ${personSql}
        ${fromSql}
        ${toSql}
        ${cursorSql}
      ORDER BY m."createdAt" DESC, m."id" DESC
      LIMIT ${args.limit + 1}
    `);
  },
};

export async function searchAllDMMessages(
  args: GlobalDMSearchArgs,
  dependencies: GlobalDMSearchDependencies = defaults,
): Promise<MessageSearchPage> {
  const query = normalizeSearchQuery(args.query);

  if (query.length < MIN_SEARCH_QUERY_LENGTH) {
    return { nextCursor: null, results: [], totalLabel: 0 };
  }

  const limit = normalizeSearchLimit(args.limit);
  const rows = await dependencies.search({ ...args, limit, query });
  const page = rows.slice(0, limit);
  const names = await dependencies.loadConversationNames({
    conversationIds: [...new Set(page.map((row) => row.conversationId))],
    viewerId: args.userId,
  });

  const results: MessageSearchHitDTO[] = page.map((row) => {
    const authorName = getDMDisplayName({
      displayName: row.authorDisplayName,
      username: row.authorUsername,
    });

    return {
      authorAvatarUrl: row.authorAvatarUrl,
      authorId: row.authorId,
      authorInitials: toInitials(authorName),
      authorName,
      conversationId: row.conversationId,
      conversationName: names.get(row.conversationId) ?? "",
      excerpt: row.content,
      // Vurgu sunucudan: istemci aynı aramayı ikinci kez yapsaydı eşleşen
      // kelimeyi bulma kuralının iki kopyası olurdu.
      matchRanges: findMatchRanges(row.content, query),
      messageId: row.id,
      timeLabel: row.createdAt.toISOString(),
    };
  });

  const last = rows.length > limit ? page[page.length - 1] : undefined;

  return {
    nextCursor: last
      ? encodeSearchCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null,
    results,
    // "3 sonuç" etiketi bu sayfanın uzunluğudur, bütün eşleşmelerin sayısı
    // değil: toplam sayım ayrı ve pahalı bir `COUNT(*)` olurdu ve panel onu
    // hiçbir yerde göstermiyor.
    totalLabel: results.length,
  };
}
