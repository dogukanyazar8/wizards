import type {
  AnalyticsClientType,
  AnalyticsDeviceType,
  AnalyticsMediaKind,
  ChannelType,
  UserStatus,
} from "@wizards/db";
import { prisma } from "@wizards/db";
import { getUtcDayStart } from "@/lib/analytics/service";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_SESSION_WINDOW_MS = 2 * 60 * 1000;
const MAX_DASHBOARD_DAYS = 90;
const DEFAULT_DASHBOARD_DAYS = 14;

type MetricTotals = {
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

type MetricRow = {
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

export type AdminDashboardSnapshot = Awaited<ReturnType<typeof getAdminDashboardSnapshot>>;

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

function emptyMetricTotals(): MetricTotals {
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

function addMetricRow(totals: MetricTotals, row: MetricRow) {
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

function sumMetricRows(rows: MetricRow[]) {
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

function trendPercent(current: number, previous: number) {
  if (current === 0 && previous === 0) {
    return 0;
  }

  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function getMetricScore(metric: MetricTotals) {
  return (
    metric.appSeconds +
    metric.voiceSeconds * 2 +
    metric.cameraSeconds * 1.5 +
    metric.screenShareSeconds * 2 +
    (metric.messageCount + metric.dmMessageCount) * 30 +
    metric.fileUploadCount * 60
  );
}

function mapCountBreakdown<T extends string | null>(
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

function compactText(value: string, maxLength = 140) {
  const trimmed = value.replace(/\s+/g, " ").trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function segmentLabel(segment: unknown) {
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

function serializeDate(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function getDisplayName(user: { displayName: string | null; username: string }) {
  return user.displayName ?? user.username;
}

export async function getAdminDashboardSnapshot(daysInput?: number | string | null) {
  const now = new Date();
  const { days, previousStart, rangeEnd, rangeStart } = getDashboardDateRange(daysInput, now);
  const activeSince = new Date(now.getTime() - ACTIVE_SESSION_WINDOW_MS);
  const last24h = new Date(now.getTime() - DAY_MS);

  const [
    metrics,
    totalUsers,
    verifiedUsers,
    bannedUsers,
    activeUserSessions,
    statusGroups,
    totalServers,
    publicServers,
    activeServers,
    channelGroups,
    totalChannelMessages,
    totalDirectMessages,
    attachmentAggregate,
    activeSessionRows,
    activeMediaGroups,
    clientGroups,
    deviceGroups,
    countryGroups,
    browserGroups,
    osGroups,
    topServers,
    topChannels,
    latestUsers,
    recentMessages,
    recentCampaigns,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.userDailyMetric.findMany({
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
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: true, isBanned: false } }),
    prisma.user.count({ where: { isBanned: true } }),
    prisma.appSession.findMany({
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
    prisma.user.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.server.count(),
    prisma.server.count({ where: { isPublic: true } }),
    prisma.server.count({
      where: {
        OR: [
          {
            mediaUsageSessions: {
              some: {
                endedAt: null,
                startedAt: { gte: last24h },
              },
            },
          },
          {
            channels: {
              some: {
                messages: {
                  some: {
                    createdAt: { gte: last24h },
                    deletedAt: null,
                  },
                },
              },
            },
          },
        ],
      },
    }),
    prisma.channel.groupBy({
      by: ["type"],
      _count: { _all: true },
    }),
    prisma.message.count({ where: { deletedAt: null } }),
    prisma.dMMessage.count({ where: { deletedAt: null } }),
    prisma.attachment.aggregate({
      _count: { _all: true },
      _sum: { size: true },
    }),
    prisma.appSession.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 12,
      where: {
        endedAt: null,
        lastSeenAt: { gte: activeSince },
      },
      select: {
        browser: true,
        clientType: true,
        countryCode: true,
        deviceType: true,
        durationSeconds: true,
        id: true,
        lastSeenAt: true,
        os: true,
        startedAt: true,
        user: {
          select: {
            avatarUrl: true,
            displayName: true,
            email: true,
            id: true,
            status: true,
            username: true,
          },
        },
      },
    }),
    prisma.mediaUsageSession.groupBy({
      by: ["kind"],
      _count: { _all: true },
      where: { endedAt: null },
    }),
    prisma.appSession.groupBy({
      by: ["clientType"],
      _count: { _all: true },
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    prisma.appSession.groupBy({
      by: ["deviceType"],
      _count: { _all: true },
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    prisma.appSession.groupBy({
      by: ["countryCode"],
      _count: { _all: true },
      orderBy: { _count: { countryCode: "desc" } },
      take: 8,
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    prisma.appSession.groupBy({
      by: ["browser"],
      _count: { _all: true },
      orderBy: { _count: { browser: "desc" } },
      take: 8,
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    prisma.appSession.groupBy({
      by: ["os"],
      _count: { _all: true },
      orderBy: { _count: { os: "desc" } },
      take: 8,
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    prisma.server.findMany({
      orderBy: [{ members: { _count: "desc" } }, { createdAt: "desc" }],
      take: 8,
      select: {
        _count: {
          select: {
            channels: true,
            members: true,
          },
        },
        channels: {
          select: {
            messageCount: true,
            type: true,
          },
        },
        createdAt: true,
        iconUrl: true,
        id: true,
        isPublic: true,
        name: true,
      },
    }),
    prisma.channel.findMany({
      orderBy: [{ messageCount: "desc" }, { createdAt: "desc" }],
      take: 10,
      where: { serverId: { not: null } },
      select: {
        id: true,
        messageCount: true,
        name: true,
        server: {
          select: {
            id: true,
            name: true,
          },
        },
        type: true,
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        avatarUrl: true,
        createdAt: true,
        displayName: true,
        email: true,
        emailVerified: true,
        id: true,
        isBanned: true,
        status: true,
        username: true,
      },
    }),
    prisma.message.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      where: {
        deletedAt: null,
      },
      select: {
        author: {
          select: {
            avatarUrl: true,
            displayName: true,
            id: true,
            username: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            server: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        content: true,
        createdAt: true,
        id: true,
        type: true,
      },
    }),
    prisma.notificationCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        body: true,
        completedAt: true,
        createdAt: true,
        creator: {
          select: {
            displayName: true,
            id: true,
            username: true,
          },
        },
        failedCount: true,
        id: true,
        segment: true,
        sentCount: true,
        startedAt: true,
        status: true,
        title: true,
        type: true,
      },
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        action: true,
        adminUser: {
          select: {
            displayName: true,
            id: true,
            username: true,
          },
        },
        createdAt: true,
        id: true,
        targetId: true,
        targetType: true,
      },
    }),
  ]);

  const currentMetricRows = metrics.filter((metric) => metric.date >= rangeStart);
  const previousMetricRows = metrics.filter((metric) => metric.date < rangeStart);
  const currentTotals = sumMetricRows(currentMetricRows);
  const previousTotals = sumMetricRows(previousMetricRows);
  const activeUsers = activeUserSessions.length;
  const offlineUsers = Math.max(0, verifiedUsers - activeUsers);
  const channelTypeMap = new Map<ChannelType, number>(
    channelGroups.map((group) => [group.type, group._count._all]),
  );
  const statusMap = new Map<UserStatus, number>(
    statusGroups.map((group) => [group.status, group._count._all]),
  );
  const activeMediaMap = new Map<AnalyticsMediaKind, number>(
    activeMediaGroups.map((group) => [group.kind, group._count._all]),
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
    ? await prisma.user.findMany({
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
    activeMedia: {
      camera: activeMediaMap.get("CAMERA") ?? 0,
      screenShare: activeMediaMap.get("SCREEN_SHARE") ?? 0,
      voice: activeMediaMap.get("VOICE") ?? 0,
    },
    activeSessions: activeSessionRows.map((session) => ({
      browser: session.browser,
      clientType: session.clientType,
      countryCode: session.countryCode,
      deviceType: session.deviceType,
      durationSeconds: session.durationSeconds,
      id: session.id,
      lastSeenAt: session.lastSeenAt.toISOString(),
      os: session.os,
      startedAt: session.startedAt.toISOString(),
      user: {
        avatarUrl: session.user.avatarUrl,
        displayName: getDisplayName(session.user),
        email: session.user.email,
        id: session.user.id,
        status: session.user.status,
        username: session.user.username,
      },
    })),
    breakdowns: {
      browsers: mapCountBreakdown<string | null>(browserGroups, "browser"),
      channels: mapCountBreakdown<ChannelType>(channelGroups, "type"),
      clients: mapCountBreakdown<AnalyticsClientType>(clientGroups, "clientType"),
      countries: mapCountBreakdown<string | null>(countryGroups, "countryCode"),
      devices: mapCountBreakdown<AnalyticsDeviceType>(deviceGroups, "deviceType"),
      operatingSystems: mapCountBreakdown<string | null>(osGroups, "os"),
      statuses: mapCountBreakdown<UserStatus>(statusGroups, "status"),
    },
    campaigns: recentCampaigns.map((campaign) => ({
      body: compactText(campaign.body, 120),
      completedAt: serializeDate(campaign.completedAt),
      createdAt: campaign.createdAt.toISOString(),
      creator: campaign.creator
        ? {
            displayName: getDisplayName(campaign.creator),
            id: campaign.creator.id,
            username: campaign.creator.username,
          }
        : null,
      failedCount: campaign.failedCount,
      id: campaign.id,
      segment: segmentLabel(campaign.segment),
      sentCount: campaign.sentCount,
      startedAt: serializeDate(campaign.startedAt),
      status: campaign.status,
      title: campaign.title,
      type: campaign.type,
    })),
    generatedAt: now.toISOString(),
    range: {
      days,
      end: rangeEnd.toISOString(),
      start: rangeStart.toISOString(),
    },
    recentAuditLogs: recentAuditLogs.map((log) => ({
      action: log.action,
      actor: log.adminUser
        ? {
            displayName: getDisplayName(log.adminUser),
            id: log.adminUser.id,
            username: log.adminUser.username,
          }
        : null,
      createdAt: log.createdAt.toISOString(),
      id: log.id,
      targetId: log.targetId,
      targetType: log.targetType,
    })),
    recentMessages: recentMessages.map((message) => ({
      author: {
        avatarUrl: message.author.avatarUrl,
        displayName: getDisplayName(message.author),
        id: message.author.id,
        username: message.author.username,
      },
      channel: {
        id: message.channel.id,
        name: message.channel.name,
      },
      content: compactText(message.content || message.type, 180),
      createdAt: message.createdAt.toISOString(),
      id: message.id,
      server: message.channel.server
        ? {
            id: message.channel.server.id,
            name: message.channel.server.name,
          }
        : null,
      type: message.type,
    })),
    serverHealth: {
      activeServers,
      publicServers,
      textChannels: channelTypeMap.get("TEXT") ?? 0,
      totalChannels: channelGroups.reduce((total, group) => total + group._count._all, 0),
      totalServers,
      voiceChannels: channelTypeMap.get("VOICE") ?? 0,
    },
    topChannels: topChannels.map((channel) => ({
      id: channel.id,
      messageCount: channel.messageCount,
      name: channel.name,
      server: channel.server
        ? {
            id: channel.server.id,
            name: channel.server.name,
          }
        : null,
      type: channel.type,
    })),
    topServers: topServers.map((server) => ({
      channelCount: server._count.channels,
      createdAt: server.createdAt.toISOString(),
      iconUrl: server.iconUrl,
      id: server.id,
      isPublic: server.isPublic,
      memberCount: server._count.members,
      messageCount: server.channels.reduce((total, channel) => total + channel.messageCount, 0),
      name: server.name,
      voiceChannelCount: server.channels.filter((channel) => channel.type === "VOICE").length,
    })),
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
    users: {
      latest: latestUsers.map((user) => ({
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
        displayName: getDisplayName(user),
        email: user.email,
        emailVerified: user.emailVerified,
        id: user.id,
        isBanned: user.isBanned,
        status: user.status,
        username: user.username,
      })),
    },
  };
}
