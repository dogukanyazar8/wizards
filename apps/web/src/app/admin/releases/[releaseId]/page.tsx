import { AdminReleaseEditor } from "@/components/admin/sections/admin-release-editor";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { getAdminRelease } from "@/lib/releases/admin-release-service";

type AdminReleasePageProps = {
  params: Promise<{ releaseId: string }>;
};

export default async function AdminReleasePage({ params }: AdminReleasePageProps) {
  const { releaseId } = await params;
  const [admin, result] = await Promise.all([
    requireAdminModule("release.read"),
    getAdminRelease(releaseId),
  ]);

  return (
    <AdminReleaseEditor
      canWrite={adminRoleHasCapability(admin.role, "release.write")}
      release={result.release}
    />
  );
}
