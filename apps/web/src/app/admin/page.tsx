import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { getAdminDashboardSnapshot, normalizeDashboardDays } from "@/lib/admin/dashboard";

type AdminPageProps = {
  searchParams?: Promise<{
    days?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const days = normalizeDashboardDays(params?.days);
  const [admin, dashboard] = await Promise.all([
    requireAdminCapability("dashboard.read"),
    getAdminDashboardSnapshot(days),
  ]);

  return <AdminDashboard admin={admin} dashboard={dashboard} />;
}
