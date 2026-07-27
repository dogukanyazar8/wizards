import { AdminAudit, type AdminAuditFilter } from "@/components/admin/sections/admin-audit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
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
  const [, snapshot] = await Promise.all([
    requireAdminCapability("audit.read"),
    getAdminAuditSnapshot(),
  ]);

  return <AdminAudit filter={filter} snapshot={snapshot} />;
}
