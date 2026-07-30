import { AdminReleases } from "@/components/admin/sections/admin-releases";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminReleases } from "@/lib/releases/admin-release-service";

export default async function AdminReleasesPage() {
  const [admin, result] = await Promise.all([
    requireAdminModule("release.read"),
    listAdminReleases(),
  ]);

  return (
    <AdminReleases
      canWrite={adminRoleHasCapability(admin.role, "release.write")}
      releases={result.releases}
    />
  );
}
