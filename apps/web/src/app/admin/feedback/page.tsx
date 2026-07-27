import { AdminPageHeader } from "@/components/admin/kit/admin-primitives";
import { AdminFeedbackPanel } from "@/components/admin/admin-feedback-panel";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";

/**
 * Interim route: it keeps feedback triage reachable now that the combined
 * dashboard page is gone. Wave 4 (E3) replaces the body with the clustered
 * feedback module; this file goes with it.
 */
export default async function AdminFeedbackPage() {
  const admin = await requireAdminModule("feedback.read");

  return (
    <section className="space-y-5">
      <AdminPageHeader
        subtitle="Kullanıcı geri bildirimleri ve yol haritası"
        title="Geri Bildirim"
      />
      <AdminFeedbackPanel canManage={adminRoleHasCapability(admin.role, "feedback.write")} />
    </section>
  );
}
