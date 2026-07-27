import { AdminAnchorShim } from "@/components/admin/shell/admin-anchor-shim";
import { AdminOverview } from "@/components/admin/sections/admin-overview";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { getModerationQueueStats } from "@/lib/moderation/case-queries";
import { requireAdminModule } from "@/lib/admin/module-access";
import {
  getAdminActivitySnapshot,
  getAdminOverviewSnapshot,
  getAdminServersSnapshot,
} from "@/lib/admin/snapshots";
import { normalizeDashboardDays } from "@/lib/admin/snapshots/shared";

type AdminPageProps = {
  searchParams?: Promise<{
    days?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const days = normalizeDashboardDays(params?.days);
  const now = new Date();
  const [admin, activity, overview, servers] = await Promise.all([
    requireAdminModule("dashboard.read"),
    getAdminActivitySnapshot(days),
    getAdminOverviewSnapshot(days),
    getAdminServersSnapshot(days),
  ]);

  // The queue summary is only fetched for roles that may open the queue.
  const moderation = adminRoleHasCapability(admin.role, "case.read")
    ? await getModerationQueueStats(now)
    : undefined;

  return (
    <>
      <AdminAnchorShim />
      <AdminOverview
        activity={activity}
        {...(moderation ? { moderation } : {})}
        canExportActivity={adminRoleHasCapability(admin.role, "export.activity")}
        overview={overview}
        servers={servers}
      />
    </>
  );
}
