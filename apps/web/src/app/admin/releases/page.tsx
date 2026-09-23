import { listAdminDownloadArtifacts } from "@/lib/downloads/admin-download-service";
import { AdminReleases } from "@/components/admin/sections/admin-releases";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminReleases } from "@/lib/releases/admin-release-service";

export default async function AdminReleasesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; product?: string; channel?: string; status?: string }>;
}) {
  const query = await searchParams;
  const admin = await requireAdminModule("release.read");
  const [result, downloads] = await Promise.all([
    listAdminReleases(Number(query.page ?? 1), query),
    listAdminDownloadArtifacts(),
  ]);

  return (
    <AdminReleases
      canWrite={adminRoleHasCapability(admin.role, "release.write")}
      releases={result.releases}
      artifacts={downloads.artifacts}
      page={result.page}
      hasMore={result.hasMore}
      initialFilters={{
        product: query.product ?? "ALL",
        channel: query.channel ?? "ALL",
        status: query.status ?? "ALL",
      }}
    />
  );
}
