import type { AdminRole, ChannelType, UserStatus } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { writeAdminAuditLog } from "@/lib/admin/access";
import { getAdminDashboardSnapshot, getDashboardDateRange } from "@/lib/admin/dashboard";

const DEFAULT_MANAGEMENT_LIMIT = 20;
const MAX_MANAGEMENT_LIMIT = 100;
const DEFAULT_ACTIVITY_EXPORT_DAYS = 30;

export type AdminManagementPagination = {
  limit: number;
  page: number;
  skip: number;
};

export type AdminUserListFilters = {
  banned?: boolean | null;
  limit?: number | string | null;
  page?: number | string | null;
  query?: string | null;
  status?: UserStatus | "ALL" | null;
  verified?: boolean | null;
};

export type AdminServerListFilters = {
  limit?: number | string | null;
  page?: number | string | null;
  query?: string | null;
};

type MetricAccumulator = {
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

type CsvValue = boolean | null | number | string | undefined;

function emptyMetrics(): MetricAccumulator {
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

function parsePositiveInt(value: number | string | null | undefined, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : fallback;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(parsed));
}

export function normalizeAdminManagementPagination(
  input: {
    limit?: number | string | null;
    page?: number | string | null;
  } = {},
): AdminManagementPagination {
  const page = parsePositiveInt(input.page, 1);
  const limit = Math.min(
    parsePositiveInt(input.limit, DEFAULT_MANAGEMENT_LIMIT),
    MAX_MANAGEMENT_LIMIT,
  );

  return {
    limit,
    page,
    skip: (page - 1) * limit,
  };
}

export function parseAdminBoolean(value: string | null) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function normalizeSearch(value: string | null | undefined) {
  const query = value?.trim();

  return query ? query.slice(0, 120) : null;
}

function getDisplayName(user: { displayName: string | null; username: string }) {
  return user.displayName ?? user.username;
}

function sumMetrics(
  rows: Array<{
    appSeconds: number;
    cameraSeconds: number;
    dmMessageCount: number;
    fileUploadCount: number;
    messageCount: number;
    screenShareSeconds: number;
    sessionCount: number;
    uploadedBytes: bigint;
    voiceSeconds: number;
  }>,
) {
  const totals = emptyMetrics();

  for (const row of rows) {
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

  return totals;
}

function getUserWhere(filters: AdminUserListFilters) {
  const query = normalizeSearch(filters.query);

  return {
    ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(typeof filters.banned === "boolean" ? { isBanned: filters.banned } : {}),
    ...(typeof filters.verified === "boolean" ? { emailVerified: filters.verified } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" as const } },
            { username: { contains: query, mode: "insensitive" as const } },
            { displayName: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function listAdminUsers(filters: AdminUserListFilters = {}) {
  const pagination = normalizeAdminManagementPagination(filters);
  const where = getUserWhere(filters);
  const { rangeEnd, rangeStart } = getDashboardDateRange(30);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
      where,
      select: {
        _count: {
          select: {
            messages: true,
            serverMembers: true,
          },
        },
        adminMembership: {
          select: {
            role: true,
          },
        },
        appSessions: {
          orderBy: { lastSeenAt: "desc" },
          select: {
            browser: true,
            clientType: true,
            countryCode: true,
            deviceType: true,
            endedAt: true,
            lastSeenAt: true,
            os: true,
            startedAt: true,
          },
          take: 1,
        },
        avatarUrl: true,
        bannedAt: true,
        bannedReason: true,
        createdAt: true,
        dailyMetrics: {
          select: {
            appSeconds: true,
            cameraSeconds: true,
            dmMessageCount: true,
            fileUploadCount: true,
            messageCount: true,
            screenShareSeconds: true,
            sessionCount: true,
            uploadedBytes: true,
            voiceSeconds: true,
          },
          where: {
            date: {
              gte: rangeStart,
              lt: rangeEnd,
            },
          },
        },
        displayName: true,
        email: true,
        emailVerified: true,
        id: true,
        isBanned: true,
        registeredAt: true,
        status: true,
        username: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    pagination: {
      ...pagination,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    },
    users: users.map((user) => {
      const lastSession = user.appSessions[0] ?? null;

      return {
        adminRole: user.adminMembership?.role ?? null,
        avatarUrl: user.avatarUrl,
        bannedAt: user.bannedAt?.toISOString() ?? null,
        bannedReason: user.bannedReason,
        createdAt: user.createdAt.toISOString(),
        displayName: getDisplayName(user),
        email: user.email,
        emailVerified: user.emailVerified,
        id: user.id,
        isBanned: user.isBanned,
        lastSession: lastSession
          ? {
              browser: lastSession.browser,
              clientType: lastSession.clientType,
              countryCode: lastSession.countryCode,
              deviceType: lastSession.deviceType,
              endedAt: lastSession.endedAt?.toISOString() ?? null,
              lastSeenAt: lastSession.lastSeenAt.toISOString(),
              os: lastSession.os,
              startedAt: lastSession.startedAt.toISOString(),
            }
          : null,
        metrics: sumMetrics(user.dailyMetrics),
        registeredAt: user.registeredAt.toISOString(),
        serverCount: user._count.serverMembers,
        status: user.status,
        totalChannelMessages: user._count.messages,
        username: user.username,
      };
    }),
  };
}

function getServerWhere(filters: AdminServerListFilters) {
  const query = normalizeSearch(filters.query);

  return {
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
            { inviteCode: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function listAdminServers(filters: AdminServerListFilters = {}) {
  const pagination = normalizeAdminManagementPagination(filters);
  const where = getServerWhere(filters);

  const [servers, total] = await Promise.all([
    prisma.server.findMany({
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
      where,
      select: {
        _count: {
          select: {
            channels: true,
            members: true,
          },
        },
        channels: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            messageCount: true,
            name: true,
            type: true,
          },
        },
        createdAt: true,
        description: true,
        discoverable: true,
        iconUrl: true,
        id: true,
        isPublic: true,
        name: true,
        owner: {
          select: {
            displayName: true,
            id: true,
            username: true,
          },
        },
        preferredLocale: true,
        updatedAt: true,
      },
    }),
    prisma.server.count({ where }),
  ]);

  return {
    pagination: {
      ...pagination,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    },
    servers: servers.map((server) => {
      const channelCounts = server.channels.reduce(
        (counts, channel) => {
          counts.totalMessages += channel.messageCount;
          counts.byType[channel.type] = (counts.byType[channel.type] ?? 0) + 1;
          return counts;
        },
        { byType: {} as Partial<Record<ChannelType, number>>, totalMessages: 0 },
      );

      return {
        channelCount: server._count.channels,
        channels: server.channels.slice(0, 12).map((channel) => ({
          id: channel.id,
          messageCount: channel.messageCount,
          name: channel.name,
          type: channel.type,
        })),
        createdAt: server.createdAt.toISOString(),
        description: server.description,
        discoverable: server.discoverable,
        iconUrl: server.iconUrl,
        id: server.id,
        isPublic: server.isPublic,
        memberCount: server._count.members,
        messageCount: channelCounts.totalMessages,
        name: server.name,
        owner: {
          displayName: getDisplayName(server.owner),
          id: server.owner.id,
          username: server.owner.username,
        },
        preferredLocale: server.preferredLocale,
        textChannelCount: channelCounts.byType.TEXT ?? 0,
        updatedAt: server.updatedAt.toISOString(),
        voiceChannelCount: channelCounts.byType.VOICE ?? 0,
      };
    }),
  };
}

export async function setAdminUserBanState(args: {
  adminUserId: string;
  banned: boolean;
  headers?: Headers | Record<string, string | string[] | undefined> | null;
  reason?: string | null;
  targetUserId: string;
}) {
  if (args.adminUserId === args.targetUserId) {
    throw new ApiError("Admins cannot change their own ban state.", 400, "INVALID_TARGET");
  }

  const target = await prisma.user.findUnique({
    where: { id: args.targetUserId },
    select: {
      email: true,
      id: true,
      isBanned: true,
      username: true,
    },
  });

  if (!target) {
    throw new ApiError("User not found.", 404, "NOT_FOUND");
  }

  const reason = args.reason?.trim() ? args.reason.trim().slice(0, 500) : null;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: args.banned
        ? {
            bannedAt: new Date(),
            bannedReason: reason,
            isBanned: true,
            status: "OFFLINE",
          }
        : {
            bannedAt: null,
            bannedReason: null,
            isBanned: false,
          },
    }),
    prisma.session.deleteMany({
      where: { userId: target.id },
    }),
    prisma.appSession.updateMany({
      where: {
        endedAt: null,
        userId: target.id,
      },
      data: {
        endedAt: new Date(),
        endReason: args.banned ? "ADMIN_BAN" : "ADMIN_UNBAN",
      },
    }),
  ]);

  await writeAdminAuditLog({
    action: args.banned ? "user.ban" : "user.unban",
    adminUserId: args.adminUserId,
    ...(args.headers !== undefined ? { headers: args.headers } : {}),
    metadata: {
      email: target.email,
      previousBanned: target.isBanned,
      username: target.username,
    },
    reason,
    targetId: target.id,
    targetType: "User",
  });

  return {
    bannedAt: args.banned ? new Date().toISOString() : null,
    id: target.id,
    isBanned: args.banned,
    username: target.username,
  };
}

export function csvEscape(value: CsvValue) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsv(headers: string[], rows: CsvValue[][]) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export async function exportAdminActivityCsv(days: number | string | null | undefined) {
  const snapshot = await getAdminDashboardSnapshot(days ?? DEFAULT_ACTIVITY_EXPORT_DAYS);

  const summary = toCsv(
    ["section", "metric", "value"],
    [
      ["summary", "generatedAt", snapshot.generatedAt],
      ["summary", "rangeStart", snapshot.range.start],
      ["summary", "rangeEnd", snapshot.range.end],
      ["summary", "registeredUsers", snapshot.totals.registeredUsers],
      ["summary", "verifiedUsers", snapshot.totals.verifiedUsers],
      ["summary", "onlineUsers", snapshot.totals.onlineUsers],
      ["summary", "totalMessages", snapshot.totals.totalMessages],
      ["summary", "appSeconds", snapshot.totals.appSeconds],
      ["summary", "voiceSeconds", snapshot.totals.voiceSeconds],
      ["summary", "uploadedBytes", snapshot.totals.uploadedBytes],
    ],
  );
  const daily = toCsv(
    [
      "date",
      "sessions",
      "messages",
      "appSeconds",
      "voiceSeconds",
      "cameraSeconds",
      "screenShareSeconds",
      "files",
      "uploadedBytes",
    ],
    snapshot.usageSeries.map((day) => [
      day.date,
      day.sessionCount,
      day.messageCount,
      day.appSeconds,
      day.voiceSeconds,
      day.cameraSeconds,
      day.screenShareSeconds,
      day.fileUploadCount,
      day.uploadedBytes,
    ]),
  );
  const topUsers = toCsv(
    [
      "userId",
      "username",
      "displayName",
      "status",
      "appSeconds",
      "voiceSeconds",
      "messages",
      "files",
    ],
    snapshot.topUsers.map((user) => [
      user.id,
      user.username,
      user.displayName,
      user.status,
      user.metrics.appSeconds,
      user.metrics.voiceSeconds,
      user.metrics.messageCount + user.metrics.dmMessageCount,
      user.metrics.fileUploadCount,
    ]),
  );
  const topServers = toCsv(
    ["serverId", "name", "members", "channels", "messages", "public"],
    snapshot.topServers.map((server) => [
      server.id,
      server.name,
      server.memberCount,
      server.channelCount,
      server.messageCount,
      server.isPublic,
    ]),
  );

  return [
    "# Whispr Admin Activity Export",
    summary,
    "",
    "# Daily Activity",
    daily,
    "",
    "# Top Users",
    topUsers,
    "",
    "# Top Servers",
    topServers,
    "",
  ].join("\n");
}

export function getAssignableAdminRoles(actorRole: AdminRole) {
  if (actorRole !== "OWNER") {
    return [];
  }

  return ["ADMIN", "SUPPORT", "ANALYST", "MODERATOR"] satisfies AdminRole[];
}
