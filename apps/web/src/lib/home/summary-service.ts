import { Prisma, type PrismaClient } from "@wizards/db";

import { countHomeAwaiting } from "@/lib/home/awaiting-service";
import {
  resolveExpiredFocus,
  resolveFocusState,
  type ExpiredFocusResolution,
  type FocusRow,
} from "@/lib/home/focus";
import {
  defaultVisibleChannelResolver,
  resolveHomeChannelAccess,
  type VisibleChannelResolver,
} from "@/lib/home/service";
import type { AppSummaryResponse } from "@/lib/home/types";
import { buildUnreadMentionScope, countMentionsInScope } from "@/lib/mentions/mentions-service";

/**
 * Ana Sayfa 1a — Faz 3 §3.1. The header's own payload.
 *
 * Five queries, none of which walk rows per card:
 *   1. server membership (the authorization scope every counter is filtered by)
 *   2. the viewer's own row (name, presence, focus window)
 *   3. one counters query — DM unread
 *   4. the awaiting counts, shared with `app/awaiting` so the header and the
 *      card can never disagree
 *   5. Bahsedilmeler K4: the unread mention count, shared with
 *      `GET /api/v1/mentions/counts` so the badge and the screen can never
 *      disagree either
 *
 * A fifth write happens only when the read finds a focus window that has
 * already closed (§1.1's lazy resolution).
 */

type SummaryCounterRow = {
  dmUnread: number;
};

export type HomeSummaryDependencies = {
  /** Lazy resolution of an expired focus window: write it back and announce it. */
  readonly applyExpiredFocus: (input: ExpiredFocusResolution) => Promise<void>;
  readonly database: PrismaClient;
  readonly listVisibleChannels?: VisibleChannelResolver;
  readonly now: Date;
};

/**
 * Bahsedilmeler karar K4: `unreadMentions` bu sorgudan **çıkarıldı**.
 *
 * `ChannelReadState.mentionCount` ve `DMParticipant.mentionCount` yerinde duruyor ve kanal
 * ile DM satırlarındaki rozetleri beslemeye devam ediyor; kesilen tek bağ bu. Sebep ölçülmüş
 * bir ayrışma: `Okunmadı işaretle` bir bahsetmeyi geri açtığında sayaç kolonu bunu bilmiyor,
 * bilse bile `Sonra oku` ve `Listeden kaldır` gibi triyaj durumlarını hiç bilmiyor. Ekrandaki
 * sayı ile paneldeki sayı asla farklı olamaz, bu yüzden ikisi aynı sorgudan okunur.
 */
async function readCounters(database: PrismaClient, userId: string): Promise<SummaryCounterRow> {
  const rows = await database.$queryRaw<SummaryCounterRow[]>(Prisma.sql`
    SELECT
      (SELECT COALESCE(SUM(p."unreadCount"), 0)
         FROM "DMParticipant" p
         INNER JOIN "DMConversation" c ON c."id" = p."conversationId"
        WHERE p."userId" = ${userId}
          AND (p."hiddenAt" IS NULL OR c."lastMessageAt" > p."hiddenAt"))::int AS "dmUnread"
  `);

  return rows[0] ?? { dmUnread: 0 };
}

export async function getHomeSummary(
  userId: string,
  dependencies: HomeSummaryDependencies,
): Promise<AppSummaryResponse> {
  const { applyExpiredFocus, database, now } = dependencies;
  const { textChannelIds } = await resolveHomeChannelAccess(
    database,
    userId,
    dependencies.listVisibleChannels ?? defaultVisibleChannelResolver,
  );

  const [user, counters, awaiting, mentionCounts] = await Promise.all([
    database.user.findUnique({
      select: {
        displayName: true,
        id: true,
        status: true,
        statusExpiresAt: true,
        statusFocusMinutes: true,
        statusRestoreTo: true,
        username: true,
      },
      where: { id: userId },
    }),
    readCounters(database, userId),
    countHomeAwaiting(database, userId, textChannelIds, now),
    // K4: bahsetme sayacı ile Bahsedilmeler ekranının sayaçları **tek** yardımcıdan gelir.
    // Kanal erişimi yukarıda çözüldüğü için buraya hazır geçiyor; ikinci bir izin sorgusu
    // tek bir sayı için iki kat maliyet demekti.
    countMentionsInScope(database, buildUnreadMentionScope(userId, textChannelIds, now)),
  ]);

  if (!user) {
    // The session survived the account: treat it as unauthenticated data rather
    // than inventing a greeting.
    throw new Error("Home summary requested for a user that no longer exists");
  }

  const row: FocusRow = {
    id: user.id,
    status: user.status,
    statusExpiresAt: user.statusExpiresAt,
    statusFocusMinutes: user.statusFocusMinutes,
    statusRestoreTo: user.statusRestoreTo,
  };
  const focusState = resolveFocusState(row, now);

  if (focusState.expired) {
    const resolution = resolveExpiredFocus([row], now)[0];
    if (resolution) {
      await applyExpiredFocus(resolution);
    }
  }

  return {
    // ISO instant. "18 Ağustos Pazartesi" is formatted on the client, which is
    // the only side that knows the reader's zone and language.
    dateLabel: now.toISOString(),
    dmUnread: counters.dmUnread,
    focus: focusState.focus,
    greetingName: user.displayName ?? user.username,
    pendingReplies: awaiting.total,
    presence: focusState.presence,
    unreadMentions: mentionCounts.unread,
  };
}
