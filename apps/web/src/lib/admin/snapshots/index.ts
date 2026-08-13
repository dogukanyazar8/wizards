import { prisma, type AdminRole } from "@wizards/db";
import { adminRoleHasCapability, type AdminCapability } from "@/lib/admin/capability-roles";
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

// The dashboard is a composite endpoint; every slice keeps the same capability
// boundary as its dedicated admin surface instead of inheriting dashboard.read.
export const ADMIN_DASHBOARD_SLICE_CAPABILITIES = {
  activity: "dashboard.read",
  audit: "audit.read",
  notifications: "campaign.read",
  overview: "dashboard.read",
  servers: "server.read",
  users: "user.read",
} as const satisfies Record<keyof AdminSnapshotSlices, AdminCapability>;

function canMergeAdminSnapshotSlice(role: AdminRole, slice: keyof AdminSnapshotSlices) {
  return adminRoleHasCapability(role, ADMIN_DASHBOARD_SLICE_CAPABILITIES[slice]);
}

/**
 * Assembles the module slices back into the shape the dashboard payload has
 * always had. The equivalence test compares this merge against the captured
 * pre-split output, so consumers can move module by module.
 */
export function mergeAdminSnapshotSlices(
  { activity, audit, notifications, overview, servers, users }: Partial<AdminSnapshotSlices>,
  role: AdminRole,
) {
  if (!activity || !overview) {
    throw new Error("Dashboard snapshot requires activity and overview slices.");
  }

  const includeAudit = Boolean(audit && canMergeAdminSnapshotSlice(role, "audit"));
  const includeNotifications = Boolean(
    notifications && canMergeAdminSnapshotSlice(role, "notifications"),
  );
  const includeServers = Boolean(servers && canMergeAdminSnapshotSlice(role, "servers"));
  const includeUsers = Boolean(users && canMergeAdminSnapshotSlice(role, "users"));

  return {
    activeMedia: activity.activeMedia,
    activeSessions: activity.activeSessions,
    breakdowns: {
      browsers: activity.breakdowns.browsers,
      ...(includeServers && servers ? { channels: servers.channelBreakdown } : {}),
      clients: activity.breakdowns.clients,
      countries: activity.breakdowns.countries,
      devices: activity.breakdowns.devices,
      operatingSystems: activity.breakdowns.operatingSystems,
      ...(includeUsers && users ? { statuses: users.statusBreakdown } : {}),
    },
    ...(includeNotifications && notifications ? { campaigns: notifications.campaigns } : {}),
    generatedAt: overview.generatedAt,
    range: overview.range,
    // The dedicated audit page is `audit.read`-gated and may show the IP hash.
    // The combined dashboard never carries it, so later route reuse cannot leak it.
    ...(includeAudit && audit
      ? {
          recentAuditLogs: audit.recentAuditLogs.map(({ ipHash: _ipHash, ...log }) => log),
        }
      : {}),
    recentMessages: activity.recentMessages,
    ...(includeServers && servers
      ? {
          serverHealth: servers.serverHealth,
          topChannels: servers.topChannels,
          topServers: servers.topServers,
        }
      : {}),
    topUsers: overview.topUsers,
    totals: overview.totals,
    trends: overview.trends,
    usageSeries: overview.usageSeries,
    ...(includeUsers && users ? { users: { latest: users.latest } } : {}),
  };
}

/** Runs all six loaders in parallel — the full-page payload. */
export async function composeAdminDashboardSnapshot(
  input: AdminSnapshotInput,
  role: AdminRole,
  client: AdminSnapshotClient = prisma,
) {
  const canLoad = (slice: keyof AdminSnapshotSlices) => canMergeAdminSnapshotSlice(role, slice);
  const [activity, audit, notifications, overview, servers, users] = await Promise.all([
    loadAdminActivitySnapshot(input, client),
    canLoad("audit") ? loadAdminAuditSnapshot(input, client) : undefined,
    canLoad("notifications") ? loadAdminNotificationsSnapshot(input, client) : undefined,
    loadAdminOverviewSnapshot(input, client),
    canLoad("servers") ? loadAdminServersSnapshot(input, client) : undefined,
    canLoad("users") ? loadAdminUsersSnapshot(input, client) : undefined,
  ]);

  return mergeAdminSnapshotSlices(
    {
      activity,
      ...(audit ? { audit } : {}),
      ...(notifications ? { notifications } : {}),
      overview,
      ...(servers ? { servers } : {}),
      ...(users ? { users } : {}),
    },
    role,
  );
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

// Only the modules that read a snapshot get a cached entry point. The users and
// notifications modules query their own lists, so their loaders exist for the
// combined payload alone.
export const getAdminActivitySnapshot = cachedSnapshotLoader("activity", loadAdminActivitySnapshot);
export const getAdminAuditSnapshot = cachedSnapshotLoader("audit", loadAdminAuditSnapshot);
export const getAdminOverviewSnapshot = cachedSnapshotLoader("overview", loadAdminOverviewSnapshot);
export const getAdminServersSnapshot = cachedSnapshotLoader("servers", loadAdminServersSnapshot);
