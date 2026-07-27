import type { UserStatus } from "@wizards/db";
import { prisma } from "@wizards/db";
import type { AdminSnapshotClient, AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import {
  ACTIVE_SESSION_WINDOW_MS,
  addMetricRow,
  buildDailyMetricSeries,
  emptyMetricTotals,
  getDashboardDateRange,
  getDisplayName,
  getMetricScore,
  sumMetricRows,
  trendPercent,
  type MetricTotals,
} from "@/lib/admin/snapshots/shared";

/**
 * Counters, trends and the daily series behind the Genel Bakış module. The
 * status groupBy is repeated by the users loader on purpose: each module owns
 * its own queries so opening one page never drags in another module's tables.
 */
export async function loadAdminOverviewSnapshot(
  { days: daysInput, now }: AdminSnapshotInput,
  client: AdminSnapshotClient = prisma,
) {
  const { days, previousStart, rangeEnd, rangeStart } = getDashboardDateRange(daysInput, now);
  const activeSince = new Date(now.getTime() - ACTIVE_SESSION_WINDOW_MS);

  const [
    metrics,
    totalUsers,
    verifiedUsers,
    bannedUsers,
    activeUserSessions,
    statusGroups,
    totalChannelMessages,
    totalDirectMessages,
    attachmentAggregate,
  ] = await Promise.all([
    client.userDailyMetric.findMany({
      where: {
        date: {
          gte: previousStart,
          lt: rangeEnd,
        },
      },
      orderBy: { date: "asc" },
      select: {
        appSeconds: true,
        cameraSeconds: true,
        date: true,
        dmMessageCount: true,
        fileUploadCount: true,
        messageCount: true,
        screenShareSeconds: true,
        sessionCount: true,
        uploadedBytes: true,
        userId: true,
        voiceSeconds: true,
      },
    }),
    client.user.count(),
    client.user.count({ where: { emailVerified: true, isBanned: false } }),
    client.user.count({ where: { isBanned: true } }),
    client.appSession.findMany({
      distinct: ["userId"],
      where: {
        endedAt: null,
        lastSeenAt: { gte: activeSince },
        user: {
          emailVerified: true,
          isBanned: false,
        },
      },
      select: { userId: true },
    }),
    client.user.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    client.message.count({ where: { deletedAt: null } }),
    client.dMMessage.count({ where: { deletedAt: null } }),
    client.attachment.aggregate({
      _count: { _all: true },
      _sum: { size: true },
    }),
  ]);

  const currentMetricRows = metrics.filter((metric) => metric.date >= rangeStart);
  const previousMetricRows = metrics.filter((metric) => metric.date < rangeStart);
  const currentTotals = sumMetricRows(currentMetricRows);
  const previousTotals = sumMetricRows(previousMetricRows);
  const activeUsers = activeUserSessions.length;
  const offlineUsers = Math.max(0, verifiedUsers - activeUsers);
  const statusMap = new Map<UserStatus, number>(
    statusGroups.map((group) => [group.status, group._count._all]),
  );
  const totalsByUser = new Map<string, MetricTotals>();

  for (const row of currentMetricRows) {
    const totals = totalsByUser.get(row.userId) ?? emptyMetricTotals();
    addMetricRow(totals, row);
    totalsByUser.set(row.userId, totals);
  }

  const topUserMetrics = Array.from(totalsByUser.entries())
    .map(([userId, metric]) => ({
      metric,
      score: getMetricScore(metric),
      userId,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
  const topUserRows = topUserMetrics.length
    ? await client.user.findMany({
        where: { id: { in: topUserMetrics.map((entry) => entry.userId) } },
        select: {
          avatarUrl: true,
          displayName: true,
          email: true,
          id: true,
          status: true,
          username: true,
        },
      })
    : [];
  const topUserMap = new Map(topUserRows.map((user) => [user.id, user]));

  return {
    generatedAt: now.toISOString(),
    range: {
      days,
      end: rangeEnd.toISOString(),
      start: rangeStart.toISOString(),
    },
    topUsers: topUserMetrics.map((entry) => {
      const user = topUserMap.get(entry.userId);

      return {
        avatarUrl: user?.avatarUrl ?? null,
        displayName: user ? getDisplayName(user) : "Unknown user",
        email: user?.email ?? null,
        id: entry.userId,
        metrics: entry.metric,
        score: Math.round(entry.score),
        status: user?.status ?? "OFFLINE",
        username: user?.username ?? "unknown",
      };
    }),
    totals: {
      appSeconds: currentTotals.appSeconds,
      attachmentCount: attachmentAggregate._count._all,
      bannedUsers,
      cameraSeconds: currentTotals.cameraSeconds,
      directMessages: totalDirectMessages,
      fileUploadCount: currentTotals.fileUploadCount,
      offlineUsers,
      onlineUsers: activeUsers,
      registeredUsers: totalUsers,
      screenShareSeconds: currentTotals.screenShareSeconds,
      sessionCount: currentTotals.sessionCount,
      statusCounts: {
        dnd: statusMap.get("DND") ?? 0,
        idle: statusMap.get("IDLE") ?? 0,
        invisible: statusMap.get("INVISIBLE") ?? 0,
        offline: statusMap.get("OFFLINE") ?? 0,
        online: statusMap.get("ONLINE") ?? 0,
      },
      totalMessages: totalChannelMessages + totalDirectMessages,
      uploadedBytes: currentTotals.uploadedBytes || attachmentAggregate._sum.size || 0,
      verifiedUsers,
      voiceSeconds: currentTotals.voiceSeconds,
    },
    trends: {
      appSeconds: trendPercent(currentTotals.appSeconds, previousTotals.appSeconds),
      files: trendPercent(currentTotals.fileUploadCount, previousTotals.fileUploadCount),
      messages: trendPercent(
        currentTotals.messageCount + currentTotals.dmMessageCount,
        previousTotals.messageCount + previousTotals.dmMessageCount,
      ),
      sessions: trendPercent(currentTotals.sessionCount, previousTotals.sessionCount),
      voiceSeconds: trendPercent(currentTotals.voiceSeconds, previousTotals.voiceSeconds),
    },
    usageSeries: buildDailyMetricSeries(days, currentMetricRows, now),
  };
}

export type AdminOverviewSnapshot = Awaited<ReturnType<typeof loadAdminOverviewSnapshot>>;
