import { AdminServers, type AdminServersFilters } from "@/components/admin/sections/admin-servers";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminServerAuditTrail, listAdminServers } from "@/lib/admin/management";
import { getAdminServersSnapshot } from "@/lib/admin/snapshots";

type AdminServersPageProps = {
  searchParams?: Promise<AdminServersFilters & { page?: string }>;
};

export default async function AdminServersPage({ searchParams }: AdminServersPageProps) {
  const params = await searchParams;
  const query = params?.query?.slice(0, 120);
  const filters: AdminServersFilters = query ? { query } : {};
  const admin = await requireAdminModule("server.read");
  const [result, snapshot, auditTrail] = await Promise.all([
    listAdminServers({
      ...(params?.page ? { page: params.page } : {}),
      ...(filters.query ? { query: filters.query } : {}),
    }),
    getAdminServersSnapshot(),
    listAdminServerAuditTrail(),
  ]);

  return (
    <AdminServers
      auditTrail={auditTrail}
      canWrite={adminRoleHasCapability(admin.role, "server.write")}
      filters={filters}
      result={result}
      serverHealth={snapshot.serverHealth}
    />
  );
}
