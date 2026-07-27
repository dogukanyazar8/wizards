import type { AnalyticsClientType } from "@wizards/db";
import { getUtcDayStart } from "@/lib/analytics/service";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_SESSION_WINDOW_MS = 2 * 60 * 1000;
const MAX_DASHBOARD_DAYS = 90;
const DEFAULT_DASHBOARD_DAYS = 14;

export type MetricTotals = {
  appSeconds: number;
  cameraSeconds: number;
  dmMessageCount: number;
  fileUploadCount: number;
  messageCount: number;
  screenShareSeconds: number;
  sessionCount: number;
  uploadedBytes: number;
  voiceSeconds: number;
};

export type MetricRow = {
  appSeconds: number;
  cameraSeconds: number;
  date: Date;
  dmMessageCount: number;
  fileUploadCount: number;
  messageCount: number;
  screenShareSeconds: number;
  sessionCount: number;
  uploadedBytes: bigint;
  userId: string;
  voiceSeconds: number;
};

export function normalizeDashboardDays(value: number | string | null | undefined) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : DEFAULT_DASHBOARD_DAYS;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_DASHBOARD_DAYS;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_DASHBOARD_DAYS);
}

export function getDashboardDateRange(
  daysInput: number | string | null | undefined,
  now = new Date(),
) {
  const days = normalizeDashboardDays(daysInput);
  const todayStart = getUtcDayStart(now);
  const rangeStart = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const rangeEnd = new Date(todayStart.getTime() + DAY_MS);
  const previousStart = new Date(rangeStart.getTime() - days * DAY_MS);

  return {
    days,
    previousStart,
    rangeEnd,
    rangeStart,
    todayStart,
  };
}

export function emptyMetricTotals(): MetricTotals {
  return {
    appSeconds: 0,
    cameraSeconds: 0,
    dmMessageCount: 0,
    fileUploadCount: 0,
    messageCount: 0,
    screenShareSeconds: 0,
    sessionCount: 0,
    uploadedBytes: 0,
    voiceSeconds: 0,
  };
}

export function addMetricRow(totals: MetricTotals, row: MetricRow) {
  totals.appSeconds += row.appSeconds;
  totals.cameraSeconds += row.cameraSeconds;
  totals.dmMessageCount += row.dmMessageCount;
  totals.fileUploadCount += row.fileUploadCount;
  totals.messageCount += row.messageCount;
  totals.screenShareSeconds += row.screenShareSeconds;
  totals.sessionCount += row.sessionCount;
  totals.uploadedBytes += Number(row.uploadedBytes);
  totals.voiceSeconds += row.voiceSeconds;
}

export function sumMetricRows(rows: MetricRow[]) {
  const totals = emptyMetricTotals();

  for (const row of rows) {
    addMetricRow(totals, row);
  }

  return totals;
}

export function buildDailyMetricSeries(
  daysInput: number | string | null | undefined,
  rows: MetricRow[],
  now = new Date(),
) {
  const { days, rangeStart } = getDashboardDateRange(daysInput, now);
  const byDay = new Map<string, MetricTotals>();

  for (const row of rows) {
    const key = getUtcDayStart(row.date).toISOString().slice(0, 10);
    const totals = byDay.get(key) ?? emptyMetricTotals();
    addMetricRow(totals, row);
    byDay.set(key, totals);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(rangeStart.getTime() + index * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    const totals = byDay.get(key) ?? emptyMetricTotals();

    return {
      appSeconds: totals.appSeconds,
      cameraSeconds: totals.cameraSeconds,
      date: key,
      fileUploadCount: totals.fileUploadCount,
      messageCount: totals.messageCount + totals.dmMessageCount,
      screenShareSeconds: totals.screenShareSeconds,
      sessionCount: totals.sessionCount,
      uploadedBytes: totals.uploadedBytes,
      voiceSeconds: totals.voiceSeconds,
    };
  });
}

export function trendPercent(current: number, previous: number) {
  if (current === 0 && previous === 0) {
    return 0;
  }

  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

export function getMetricScore(metric: MetricTotals) {
  return (
    metric.appSeconds +
    metric.voiceSeconds * 2 +
    metric.cameraSeconds * 1.5 +
    metric.screenShareSeconds * 2 +
    (metric.messageCount + metric.dmMessageCount) * 30 +
    metric.fileUploadCount * 60
  );
}

/**
 * Sessions recorded before the client header contract hold a guessed
 * `clientType` — mostly `WEB`, because that is what the user-agent fallback
 * returns for React Native. Reporting them as measurements would invent a
 * platform shift on the migration day, so every unverified row is counted as
 * UNKNOWN regardless of what is stored.
 */
export function foldUnverifiedClientBreakdown(
  groups: Array<{
    _count: { _all: number };
    attributionVerified: boolean;
    clientType: AnalyticsClientType;
  }>,
) {
  const counts = new Map<string, number>();

  for (const group of groups) {
    const label = group.attributionVerified ? group.clientType : "UNKNOWN";
    counts.set(label, (counts.get(label) ?? 0) + group._count._all);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ count, label }))
    .sort((left, right) => right.count - left.count);
}

export function mapCountBreakdown<T extends string | null>(
  groups: Array<{ _count: { _all: number }; [key: string]: T | { _all: number } }>,
  key: string,
  fallbackLabel = "Unknown",
) {
  return groups
    .map((group) => {
      const value = group[key];

      return {
        count: group._count._all,
        label: typeof value === "string" && value.trim() ? value : fallbackLabel,
      };
    })
    .sort((left, right) => right.count - left.count);
}

export function compactText(value: string, maxLength = 140) {
  const trimmed = value.replace(/\s+/g, " ").trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3)}...`;
}

export function segmentLabel(segment: unknown) {
  if (!segment || typeof segment !== "object" || !("type" in segment)) {
    return "All users";
  }

  const typedSegment = segment as {
    clientType?: string;
    countryCode?: string;
    days?: number;
    type?: string;
    userIds?: string[];
  };

  switch (typedSegment.type) {
    case "ONLINE_USERS":
      return "Online users";
    case "RECENTLY_ACTIVE":
      return `Active in ${typedSegment.days ?? 14}d`;
    case "CLIENT_TYPE":
      return `${typedSegment.clientType ?? "Client"} users`;
    case "COUNTRY":
      return `${typedSegment.countryCode ?? "Country"} users`;
    case "USER_IDS":
      return `${typedSegment.userIds?.length ?? 0} selected users`;
    default:
      return "All users";
  }
}

export function serializeDate(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export function getDisplayName(user: { displayName: string | null; username: string }) {
  return user.displayName ?? user.username;
}
