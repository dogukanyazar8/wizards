import { AdminServers, type AdminServersFilters } from "@/components/admin/sections/admin-servers";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { listAdminServers } from "@/lib/admin/management";
import { getAdminServersSnapshot } from "@/lib/admin/snapshots";

type AdminServersPageProps = {
  searchParams?: Promise<AdminServersFilters & { page?: string }>;
};

export default async function AdminServersPage({ searchParams }: AdminServersPageProps) {
  const params = await searchParams;
  const query = params?.query?.slice(0, 120);
  const filters: AdminServersFilters = query ? { query } : {};
  const [, result, snapshot] = await Promise.all([
    requireAdminCapability("server.read"),
    listAdminServers({
      ...(params?.page ? { page: params.page } : {}),
      ...(filters.query ? { query: filters.query } : {}),
    }),
    getAdminServersSnapshot(),
  ]);

  return <AdminServers filters={filters} result={result} serverHealth={snapshot.serverHealth} />;
}
