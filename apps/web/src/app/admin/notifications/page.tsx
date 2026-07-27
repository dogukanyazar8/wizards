import { AdminCampaigns } from "@/components/admin/sections/admin-campaigns";
import { NotificationComposer } from "@/components/admin/notification-composer";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminCampaigns } from "@/lib/admin/snapshots/campaigns";

export default async function AdminNotificationsPage() {
  const [admin, campaigns] = await Promise.all([
    requireAdminModule("campaign.read"),
    listAdminCampaigns(),
  ]);

  return (
    <AdminCampaigns
      campaigns={campaigns}
      composer={
        <NotificationComposer canSend={adminRoleHasCapability(admin.role, "campaign.send")} />
      }
    />
  );
}
