import { prisma } from "@wizards/db";
import { withSnapshotCache } from "@/lib/admin/snapshots/cache";
import type { AdminSnapshotClient, AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import {
  loadAdminActivitySnapshot,
  type AdminActivitySnapshot,
} from "@/lib/admin/snapshots/activity";
import { loadAdminAuditSnapshot, type AdminAuditSnapshot } from "@/lib/admin/snapshots/audit";
import {
  loadAdminNotificationsSnapshot,
  type AdminNotificationsSnapshot,
} from "@/lib/admin/snapshots/notifications";
import {
  loadAdminOverviewSnapshot,
  type AdminOverviewSnapshot,
} from "@/lib/admin/snapshots/overview";
import { loadAdminServersSnapshot, type AdminServersSnapshot } from "@/lib/admin/snapshots/servers";
import { normalizeDashboardDays } from "@/lib/admin/snapshots/shared";
import { loadAdminUsersSnapshot, type AdminUsersSnapshot } from "@/lib/admin/snapshots/users";

export { loadAdminActivitySnapshot } from "@/lib/admin/snapshots/activity";
export { loadAdminAuditSnapshot } from "@/lib/admin/snapshots/audit";
export { loadAdminNotificationsSnapshot } from "@/lib/admin/snapshots/notifications";
export { loadAdminOverviewSnapshot } from "@/lib/admin/snapshots/overview";
export { loadAdminServersSnapshot } from "@/lib/admin/snapshots/servers";
export { loadAdminUsersSnapshot } from "@/lib/admin/snapshots/users";
export { resetAdminSnapshotCacheForTests } from "@/lib/admin/snapshots/cache";
export type { AdminSnapshotClient, AdminSnapshotInput } from "@/lib/admin/snapshots/client";
export type { AdminActivitySnapshot } from "@/lib/admin/snapshots/activity";
export type { AdminAuditSnapshot } from "@/lib/admin/snapshots/audit";
export type { AdminNotificationsSnapshot } from "@/lib/admin/snapshots/notifications";
export type { AdminOverviewSnapshot } from "@/lib/admin/snapshots/overview";
export type { AdminServersSnapshot } from "@/lib/admin/snapshots/servers";
export type { AdminUsersSnapshot } from "@/lib/admin/snapshots/users";

export type AdminSnapshotSlices = {
  activity: AdminActivitySnapshot;
  audit: AdminAuditSnapshot;
  notifications: AdminNotificationsSnapshot;
  overview: AdminOverviewSnapshot;
  servers: AdminServersSnapshot;
  users: AdminUsersSnapshot;
};

/**
 * Assembles the module slices back into the shape the dashboard payload has
 * always had. The equivalence test compares this merge against the captured
 * pre-split output, so consumers can move module by module.
 */
export function mergeAdminSnapshotSlices({
  activity,
  audit,
  notifications,
  overview,
  servers,
  users,
}: AdminSnapshotSlices) {
  return {
    activeMedia: activity.activeMedia,
    activeSessions: activity.activeSessions,
    breakdowns: {
      browsers: activity.breakdowns.browsers,
      channels: servers.channelBreakdown,
      clients: activity.breakdowns.clients,
      countries: activity.breakdowns.countries,
      devices: activity.breakdowns.devices,
      operatingSystems: activity.breakdowns.operatingSystems,
      statuses: users.statusBreakdown,
    },
    campaigns: notifications.campaigns,
    generatedAt: overview.generatedAt,
    range: overview.range,
    recentAuditLogs: audit.recentAuditLogs,
    recentMessages: activity.recentMessages,
    serverHealth: servers.serverHealth,
    topChannels: servers.topChannels,
    topServers: servers.topServers,
    topUsers: overview.topUsers,
    totals: overview.totals,
    trends: overview.trends,
    usageSeries: overview.usageSeries,
    users: {
      latest: users.latest,
    },
  };
}

/** Runs all six loaders in parallel — the full-page payload. */
export async function composeAdminDashboardSnapshot(
  input: AdminSnapshotInput,
  client: AdminSnapshotClient = prisma,
) {
  const [activity, audit, notifications, overview, servers, users] = await Promise.all([
    loadAdminActivitySnapshot(input, client),
    loadAdminAuditSnapshot(input, client),
    loadAdminNotificationsSnapshot(input, client),
    loadAdminOverviewSnapshot(input, client),
    loadAdminServersSnapshot(input, client),
    loadAdminUsersSnapshot(input, client),
  ]);

  return mergeAdminSnapshotSlices({ activity, audit, notifications, overview, servers, users });
}

function cachedSnapshotLoader<T>(
  name: string,
  load: (input: AdminSnapshotInput, client?: AdminSnapshotClient) => Promise<T>,
) {
  return (daysInput?: number | string | null, now = new Date()) => {
    const days = normalizeDashboardDays(daysInput);

    return withSnapshotCache(`${name}:${days}`, () => load({ days, now }));
  };
}

export const getAdminActivitySnapshot = cachedSnapshotLoader("activity", loadAdminActivitySnapshot);
export const getAdminAuditSnapshot = cachedSnapshotLoader("audit", loadAdminAuditSnapshot);
export const getAdminNotificationsSnapshot = cachedSnapshotLoader(
  "notifications",
  loadAdminNotificationsSnapshot,
);
export const getAdminOverviewSnapshot = cachedSnapshotLoader("overview", loadAdminOverviewSnapshot);
export const getAdminServersSnapshot = cachedSnapshotLoader("servers", loadAdminServersSnapshot);
export const getAdminUsersSnapshot = cachedSnapshotLoader("users", loadAdminUsersSnapshot);
