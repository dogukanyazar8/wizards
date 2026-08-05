import type { AnalyticsClientType, PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";
import { buildCohortTable } from "@/lib/admin/analytics/cohorts";
import { buildFunnel, type FunnelPlatform } from "@/lib/admin/analytics/funnel";
import { summarizeLegacyMobileClients } from "@/lib/admin/analytics/legacy-clients";
import type { AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import { DAY_MS, getDashboardDateRange } from "@/lib/admin/snapshots/shared";

const COHORT_WEEKS = 8;
const SCAN_LIMIT = 20_000;

export const ANALYTICS_PLATFORMS: FunnelPlatform[] = ["ALL", "WEB", "DESKTOP", "MOBILE", "UNKNOWN"];

export type AdminAnalyticsClient = Pick<PrismaClient, "appSession" | "user" | "userDailyMetric">;

type MetricRow = {
  clientType: AnalyticsClientType;
  date: Date;
  dmMessageCount: number;
  fileUploadCount: number;
  messageCount: number;
  userId: string;
  voiceSeconds: number;
};

/**
 * The first row per user wins. Sessions and metrics arrive ordered oldest
 * first, so the platform recorded here is the one the person actually started
 * on — not the one they happen to use now.
 */
export function countFirstTouchByPlatform<T extends { clientType: AnalyticsClientType }>(
  rows: Array<T & { userId: string }>,
) {
  const seen = new Set<string>();
  const counts: Partial<Record<AnalyticsClientType, number>> & { ALL: number } = { ALL: 0 };

  for (const row of rows) {
    if (seen.has(row.userId)) {
      continue;
    }

    seen.add(row.userId);
    counts.ALL += 1;
    counts[row.clientType] = (counts[row.clientType] ?? 0) + 1;
  }

  return counts;
}

export function buildUsageSeries(rows: MetricRow[], days: number, rangeStart: Date) {
  const byDay = new Map<
    string,
    { directMessages: number; messages: number; uploads: number; voiceMinutes: number }
  >();

  for (const row of rows) {
    const key = row.date.toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? {
      directMessages: 0,
      messages: 0,
      uploads: 0,
      voiceMinutes: 0,
    };

    bucket.directMessages += row.dmMessageCount;
    bucket.messages += row.messageCount;
    bucket.uploads += row.fileUploadCount;
    bucket.voiceMinutes += row.voiceSeconds / 60;
    byDay.set(key, bucket);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(rangeStart.getTime() + index * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? {
      directMessages: 0,
      messages: 0,
      uploads: 0,
      voiceMinutes: 0,
    };

    return {
      date: key,
      directMessages: bucket.directMessages,
      messages: bucket.messages,
      uploads: bucket.uploads,
      voiceMinutes: Math.round(bucket.voiceMinutes),
    };
  });
}

export async function loadAdminAnalyticsSnapshot(
  { days: daysInput, now }: AdminSnapshotInput & { platform?: FunnelPlatform },
  platform: FunnelPlatform = "ALL",
  client: AdminAnalyticsClient = prisma,
) {
  const { days, rangeEnd, rangeStart } = getDashboardDateRange(daysInput, now);
  const cohortStart = new Date(rangeEnd.getTime() - COHORT_WEEKS * 7 * DAY_MS);

  const [metricRows, cohortUsers, signupCount, emailVerifiedCount] = await Promise.all([
    client.userDailyMetric.findMany({
      orderBy: { date: "asc" },
      take: SCAN_LIMIT,
      where: {
        date: { gte: rangeStart, lt: rangeEnd },
        ...(platform === "ALL" ? {} : { clientType: platform }),
      },
      select: {
        clientType: true,
        date: true,
        dmMessageCount: true,
        fileUploadCount: true,
        messageCount: true,
        userId: true,
        voiceSeconds: true,
      },
    }),
    client.user.findMany({
      orderBy: { createdAt: "asc" },
      take: SCAN_LIMIT,
      where: { createdAt: { gte: cohortStart, lt: rangeEnd } },
      select: { createdAt: true, id: true },
    }),
    client.user.count({ where: { createdAt: { gte: rangeStart, lt: rangeEnd } } }),
    client.user.count({
      where: { createdAt: { gte: rangeStart, lt: rangeEnd }, emailVerified: true },
    }),
  ]);

  const cohortUserIds = cohortUsers.map((user) => user.id);
  const newUserIds = cohortUsers
    .filter((user) => user.createdAt >= rangeStart)
    .map((user) => user.id);

  const [cohortActivity, firstSessions, firstMessages] = await Promise.all([
    cohortUserIds.length === 0
      ? Promise.resolve([])
      : client.userDailyMetric.findMany({
          orderBy: { date: "asc" },
          take: SCAN_LIMIT,
          where: { userId: { in: cohortUserIds } },
          select: { date: true, userId: true },
        }),
    newUserIds.length === 0
      ? Promise.resolve([])
      : client.appSession.findMany({
          orderBy: { startedAt: "asc" },
          take: SCAN_LIMIT,
          where: { userId: { in: newUserIds } },
          select: { clientType: true, userId: true },
        }),
    newUserIds.length === 0
      ? Promise.resolve([])
      : client.userDailyMetric.findMany({
          orderBy: { date: "asc" },
          take: SCAN_LIMIT,
          where: {
            userId: { in: newUserIds },
            OR: [{ messageCount: { gt: 0 } }, { dmMessageCount: { gt: 0 } }],
          },
          select: { clientType: true, userId: true },
        }),
  ]);

  // Not part of the analytics story, but the question it answers has no other
  // home: whether the frozen mobile profile field may be removed yet (08 §5).
  const legacyMobileClients = await summarizeLegacyMobileClients({ now, store: client });

  return {
    cohorts: buildCohortTable(cohortUsers, cohortActivity),
    legacyMobileClients,
    funnel: buildFunnel(
      {
        emailVerifiedCount,
        firstMessageCountByPlatform: countFirstTouchByPlatform(firstMessages),
        firstSessionCountByPlatform: countFirstTouchByPlatform(firstSessions),
        signupCount,
      },
      platform,
    ),
    generatedAt: now.toISOString(),
    platform,
    range: { days, end: rangeEnd.toISOString(), start: rangeStart.toISOString() },
    usageSeries: buildUsageSeries(metricRows, days, rangeStart),
  };
}

export type AdminAnalyticsSnapshot = Awaited<ReturnType<typeof loadAdminAnalyticsSnapshot>>;
