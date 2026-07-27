import { AdminPageHeader } from "@/components/admin/kit/admin-primitives";
import { NotificationComposer } from "@/components/admin/notification-composer";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";

/**
 * Interim route: it keeps the campaign composer reachable now that the combined
 * dashboard page is gone. Wave 4 (E2) replaces the body with the campaign detail
 * and delivery report module; this file goes with it.
 */
export default async function AdminNotificationsPage() {
  const admin = await requireAdminModule("campaign.read");

  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Kampanya oluşturma ve gönderim durumu" title="Bildirimler" />
      <NotificationComposer canSend={adminRoleHasCapability(admin.role, "campaign.send")} />
    </section>
  );
}
