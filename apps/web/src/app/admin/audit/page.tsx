import { AdminAudit, type AdminAuditFilter } from "@/components/admin/sections/admin-audit";
import { requireAdminModule } from "@/lib/admin/module-access";
import { getAdminAuditSnapshot } from "@/lib/admin/snapshots";

type AdminAuditPageProps = {
  searchParams?: Promise<{ filter?: string }>;
};

function normalizeAuditFilter(value: string | undefined): AdminAuditFilter {
  return value === "user" || value === "security" || value === "system" ? value : "all";
}

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const params = await searchParams;
  const filter = normalizeAuditFilter(params?.filter);
  await requireAdminModule("audit.read");
  const [snapshot] = await Promise.all([getAdminAuditSnapshot()]);

  return <AdminAudit filter={filter} snapshot={snapshot} />;
}
