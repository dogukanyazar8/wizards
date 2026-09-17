import type { AnalyticsClientType, PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";
import {
  percentileMs,
  SCREEN_SHARE_HEALTH_SURFACE_PREFIX,
  summarizeScreenShareHealthRows,
} from "@/lib/telemetry/client-health-rollup";
import {
  ACTIVE_SESSION_WINDOW_MS,
  DAY_MS,
  getDashboardDateRange,
} from "@/lib/admin/snapshots/shared";
import type { AdminSnapshotInput } from "@/lib/admin/snapshots/client";

export const HEALTH_TICK_DAYS = 30;
/** Enough rows to draw the window without reading a burst in full. */
const HEALTH_EVENT_SCAN_LIMIT = 5_000;

export type AdminHealthClient = Pick<
  PrismaClient,
  "appSession" | "clientHealthEvent" | "pushDeliveryAttempt"
>;

const REPORTED_PLATFORMS: AnalyticsClientType[] = ["WEB", "DESKTOP", "MOBILE", "UNKNOWN"];

/**
 * A crash rate needs sessions to divide by. With none, the honest answer is
 * "no data" — not zero, which reads as "nothing is crashing".
 */
export function computeCrashRate(crashes: number, sessions: number) {
  return sessions === 0 ? null : Math.round((crashes / sessions) * 10_000) / 100;
}

export function buildHealthDailyTicks(
  events: Array<{ createdAt: Date; kind: string }>,
  now: Date,
  days = HEALTH_TICK_DAYS,
) {
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const buckets = new Map<string, { crashes: number; errors: number }>();

  for (const event of events) {
    const key = event.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { crashes: 0, errors: 0 };

    if (event.kind === "CRASH") {
      bucket.crashes += 1;
    } else {
      bucket.errors += 1;
    }

    buckets.set(key, bucket);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(todayStart.getTime() - (days - 1 - index) * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { crashes: 0, errors: 0 };

    return { crashes: bucket.crashes, date: key, errors: bucket.errors };
  });
}

export async function loadAdminHealthSnapshot(
  { days: daysInput, now }: AdminSnapshotInput,
  client: AdminHealthClient = prisma,
) {
  const { days, rangeEnd, rangeStart } = getDashboardDateRange(daysInput, now);
  const activeSince = new Date(now.getTime() - ACTIVE_SESSION_WINDOW_MS);
  const tickStart = new Date(now.getTime() - HEALTH_TICK_DAYS * DAY_MS);

  const [
    healthEvents,
    activeSessionGroups,
    sessionGroups,
    versionGroups,
    tickEvents,
    pushGroups,
    screenShareEvents,
  ] = await Promise.all([
    client.clientHealthEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: HEALTH_EVENT_SCAN_LIMIT,
      where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
      select: { clientType: true, kind: true, valueMs: true },
    }),
    client.appSession.groupBy({
      by: ["clientType"],
      _count: { _all: true },
      where: { endedAt: null, lastSeenAt: { gte: activeSince } },
    }),
    client.appSession.groupBy({
      by: ["clientType"],
      _count: { _all: true },
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    client.appSession.groupBy({
      by: ["clientType", "appVersion"],
      _count: { _all: true },
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    client.clientHealthEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: HEALTH_EVENT_SCAN_LIMIT,
      where: { createdAt: { gte: tickStart }, kind: { in: ["CRASH", "ERROR"] } },
      select: { createdAt: true, kind: true },
    }),
    client.pushDeliveryAttempt.groupBy({
      by: ["platform", "success"],
      _count: { _all: true },
      where: { createdAt: { gte: rangeStart, lt: rangeEnd }, stage: "TICKET" },
    }),
    // Ş0.2 / K16: the 60 s screen share summaries. Their number lives in the
    // JSON context (no `value` column yet), so the context comes along.
    client.clientHealthEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: HEALTH_EVENT_SCAN_LIMIT,
      where: {
        createdAt: { gte: rangeStart, lt: rangeEnd },
        surface: { startsWith: SCREEN_SHARE_HEALTH_SURFACE_PREFIX },
      },
      select: { context: true, surface: true, valueMs: true },
    }),
  ]);

  const screenShareMetrics = summarizeScreenShareHealthRows(screenShareEvents);

  const platforms = REPORTED_PLATFORMS.map((platform) => {
    const events = healthEvents.filter((event) => event.clientType === platform);
    const startupValues = events
      .filter((event) => event.kind === "STARTUP" && event.valueMs !== null)
      .map((event) => event.valueMs as number);
    const crashes = events.filter((event) => event.kind === "CRASH").length;
    const errors = events.filter((event) => event.kind === "ERROR").length;
    const activeSessions =
      activeSessionGroups.find((group) => group.clientType === platform)?._count._all ?? 0;
    const sessions = sessionGroups.find((group) => group.clientType === platform)?._count._all ?? 0;

    return {
      activeSessions,
      crashCount: crashes,
      crashRatePercent: computeCrashRate(crashes, sessions),
      errorCount: errors,
      platform,
      sessionCount: sessions,
      startupP50Ms: percentileMs(startupValues, 50),
      startupP95Ms: percentileMs(startupValues, 95),
      versions: versionGroups
        .filter((group) => group.clientType === platform)
        .map((group) => ({ count: group._count._all, label: group.appVersion ?? "bilinmiyor" }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
    };
  });

  const pushTotals = pushGroups.reduce((totals, group) => {
    const platform = group.platform;
    const entry = totals.get(platform) ?? { accepted: 0, rejected: 0 };

    if (group.success) {
      entry.accepted += group._count._all;
    } else {
      entry.rejected += group._count._all;
    }

    totals.set(platform, entry);
    return totals;
  }, new Map<string, { accepted: number; rejected: number }>());

  return {
    generatedAt: now.toISOString(),
    /** Expo accepted the ticket. Whether the phone showed it is a receipt, not this. */
    pushAcceptance: [...pushTotals.entries()]
      .map(([platform, entry]) => ({
        acceptedCount: entry.accepted,
        acceptanceRatePercent:
          entry.accepted + entry.rejected === 0
            ? null
            : Math.round((entry.accepted / (entry.accepted + entry.rejected)) * 10_000) / 100,
        platform,
        rejectedCount: entry.rejected,
      }))
      .sort((left, right) => right.acceptedCount - left.acceptedCount),
    platforms,
    range: { days, end: rangeEnd.toISOString(), start: rangeStart.toISOString() },
    /**
     * Present only when a client reported a screen share window in the range:
     * "no section" is the honest reading of "nobody shared", not a table of
     * zeros. Rows are `screen_share.send.fps` etc. with p50/p95 in their unit.
     */
    ...(screenShareMetrics.length > 0 ? { screenShare: { metrics: screenShareMetrics } } : {}),
    ticks: buildHealthDailyTicks(tickEvents, now),
  };
}

export type AdminHealthSnapshot = Awaited<ReturnType<typeof loadAdminHealthSnapshot>>;
