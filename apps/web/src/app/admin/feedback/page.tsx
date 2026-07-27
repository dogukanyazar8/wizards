import { AdminPageHeader } from "@/components/admin/kit/admin-primitives";
import { AdminFeedbackPanel } from "@/components/admin/admin-feedback-panel";
import { AdminFeedbackClusters } from "@/components/admin/sections/admin-feedback-clusters";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listClusterSuggestions } from "@/lib/feedback/cluster-service";

export default async function AdminFeedbackPage() {
  const [admin, suggestions] = await Promise.all([
    requireAdminModule("feedback.read"),
    listClusterSuggestions(),
  ]);
  const canManage = adminRoleHasCapability(admin.role, "feedback.write");

  return (
    <section className="space-y-5">
      <AdminPageHeader
        subtitle="Kullanıcı geri bildirimleri, kümeler ve yol haritası"
        title="Geri Bildirim"
      />
      {canManage ? <AdminFeedbackClusters suggestions={suggestions} /> : null}
      <AdminFeedbackPanel canManage={canManage} />
    </section>
  );
}
