import { AdminHealth } from "@/components/admin/sections/admin-health";
import { requireAdminModule } from "@/lib/admin/module-access";
import { loadAdminHealthSnapshot } from "@/lib/admin/snapshots/health";
import { normalizeDashboardDays } from "@/lib/admin/snapshots/shared";

type AdminHealthPageProps = {
  searchParams?: Promise<{ days?: string }>;
};

export default async function AdminHealthPage({ searchParams }: AdminHealthPageProps) {
  const params = await searchParams;
  const days = normalizeDashboardDays(params?.days);
  await requireAdminModule("health.read");
  const [snapshot] = await Promise.all([loadAdminHealthSnapshot({ days, now: new Date() })]);

  return <AdminHealth snapshot={snapshot} />;
}
