import { AdminAnchorShim } from "@/components/admin/shell/admin-anchor-shim";
import { AdminOverview } from "@/components/admin/sections/admin-overview";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
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
  const [admin, activity, overview, servers] = await Promise.all([
    requireAdminModule("dashboard.read"),
    getAdminActivitySnapshot(days),
    getAdminOverviewSnapshot(days),
    getAdminServersSnapshot(days),
  ]);

  return (
    <>
      <AdminAnchorShim />
      <AdminOverview
        activity={activity}
        canExportActivity={adminRoleHasCapability(admin.role, "export.activity")}
        overview={overview}
        servers={servers}
      />
    </>
  );
}
