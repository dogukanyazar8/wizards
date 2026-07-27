import { prisma } from "@wizards/db";
import { resetAdminSnapshotCacheForTests, withSnapshotCache } from "@/lib/admin/snapshots/cache";
import type { AdminSnapshotClient } from "@/lib/admin/snapshots/client";
import { composeAdminDashboardSnapshot } from "@/lib/admin/snapshots";
import { normalizeDashboardDays } from "@/lib/admin/snapshots/shared";

export {
  buildDailyMetricSeries,
  foldUnverifiedClientBreakdown,
  getDashboardDateRange,
  normalizeDashboardDays,
} from "@/lib/admin/snapshots/shared";

export type AdminDashboardSnapshot = Awaited<ReturnType<typeof getAdminDashboardSnapshotUncached>>;

export function resetAdminDashboardSnapshotCacheForTests() {
  resetAdminSnapshotCacheForTests();
}

/**
 * Full-page payload: every module slice at once. Module routes load only the
 * slice they render (`lib/admin/snapshots`), so this stays for the combined
 * dashboard view and the `/api/v1/admin/dashboard` contract.
 */
export function getAdminDashboardSnapshot(daysInput?: number | string | null) {
  const days = normalizeDashboardDays(daysInput);

  return withSnapshotCache(`dashboard:${days}`, () => getAdminDashboardSnapshotUncached(days));
}

export function getAdminDashboardSnapshotUncached(
  daysInput?: number | string | null,
  client: AdminSnapshotClient = prisma,
  now = new Date(),
) {
  return composeAdminDashboardSnapshot({ days: normalizeDashboardDays(daysInput), now }, client);
}
