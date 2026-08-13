import type { AnalyticsDeviceType, AnalyticsMediaKind } from "@wizards/db";
import { prisma } from "@wizards/db";
import type { AdminSnapshotClient, AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import {
  ACTIVE_SESSION_WINDOW_MS,
  compactText,
  foldUnverifiedClientBreakdown,
  getDashboardDateRange,
  getDisplayName,
  mapCountBreakdown,
} from "@/lib/admin/snapshots/shared";

/**
 * Live sessions, platform breakdowns and the newest messages behind the
 * Aktivite module. Platform counts stay cut by `attributionVerified`: guessed
 * rows land in the UNKNOWN bucket instead of inventing web traffic.
 */
export async function loadAdminActivitySnapshot(
  { days: daysInput, now }: AdminSnapshotInput,
  client: AdminSnapshotClient = prisma,
) {
  const { rangeEnd, rangeStart } = getDashboardDateRange(daysInput, now);
  const activeSince = new Date(now.getTime() - ACTIVE_SESSION_WINDOW_MS);

  const [
    activeSessionRows,
    activeMediaGroups,
    clientGroups,
    deviceGroups,
    countryGroups,
    browserGroups,
    osGroups,
    recentMessages,
  ] = await Promise.all([
    client.appSession.findMany({
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
            id: true,
            status: true,
            username: true,
          },
        },
      },
    }),
    client.mediaUsageSession.groupBy({
      by: ["kind"],
      _count: { _all: true },
      where: { endedAt: null },
    }),
    client.appSession.groupBy({
      by: ["clientType", "attributionVerified"],
      _count: { _all: true },
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    client.appSession.groupBy({
      by: ["deviceType"],
      _count: { _all: true },
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    client.appSession.groupBy({
      by: ["countryCode"],
      _count: { _all: true },
      orderBy: { _count: { countryCode: "desc" } },
      take: 8,
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    client.appSession.groupBy({
      by: ["browser"],
      _count: { _all: true },
      orderBy: { _count: { browser: "desc" } },
      take: 8,
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    client.appSession.groupBy({
      by: ["os"],
      _count: { _all: true },
      orderBy: { _count: { os: "desc" } },
      take: 8,
      where: { startedAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    client.message.findMany({
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
  ]);

  const activeMediaMap = new Map<AnalyticsMediaKind, number>(
    activeMediaGroups.map((group) => [group.kind, group._count._all]),
  );

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
        id: session.user.id,
        status: session.user.status,
        username: session.user.username,
      },
    })),
    breakdowns: {
      browsers: mapCountBreakdown<string | null>(browserGroups, "browser"),
      clients: foldUnverifiedClientBreakdown(clientGroups),
      countries: mapCountBreakdown<string | null>(countryGroups, "countryCode"),
      devices: mapCountBreakdown<AnalyticsDeviceType>(deviceGroups, "deviceType"),
      operatingSystems: mapCountBreakdown<string | null>(osGroups, "os"),
    },
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
  };
}

export type AdminActivitySnapshot = Awaited<ReturnType<typeof loadAdminActivitySnapshot>>;
