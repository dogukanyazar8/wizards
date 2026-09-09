import { AdminDownloads } from "@/components/admin/sections/admin-downloads";
import { listAdminDownloadArtifacts } from "@/lib/downloads/admin-download-service";
import { requireAdminModule } from "@/lib/admin/module-access";

export default async function AdminDownloadsPage() {
  const [, result] = await Promise.all([
    requireAdminModule("release.read"),
    listAdminDownloadArtifacts(),
  ]);

  return <AdminDownloads artifacts={result.artifacts} />;
}
