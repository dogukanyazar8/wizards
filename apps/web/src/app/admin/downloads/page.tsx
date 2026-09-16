import { AdminDownloads } from "@/components/admin/sections/admin-downloads";
import { listAdminDownloadArtifacts } from "@/lib/downloads/admin-download-service";
import { requireAdminModule } from "@/lib/admin/module-access";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";

export default async function AdminDownloadsPage() {
  const [admin, result] = await Promise.all([
    requireAdminModule("release.read"),
    listAdminDownloadArtifacts(),
  ]);

  return (
    <AdminDownloads
      artifacts={result.artifacts}
      canWrite={adminRoleHasCapability(admin.role, "release.write")}
    />
  );
}
