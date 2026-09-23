import { AdminReleaseEditor } from "@/components/admin/sections/admin-release-editor";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { getAdminRelease } from "@/lib/releases/admin-release-service";

type AdminReleasePageProps = {
  params: Promise<{ releaseId: string }>;
};

export default async function AdminReleasePage({ params }: AdminReleasePageProps) {
  const { releaseId } = await params;
  const admin = await requireAdminModule("release.read");
  const [result] = await Promise.all([getAdminRelease(releaseId)]);

  return (
    <AdminReleaseEditor
      canWrite={adminRoleHasCapability(admin.role, "release.write")}
      release={result.release}
    />
  );
}
