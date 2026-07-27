import { notFound } from "next/navigation";
import { AdminCampaignDetailView } from "@/components/admin/sections/admin-campaign-detail";
import { requireAdminModule } from "@/lib/admin/module-access";
import { getAdminCampaignDetail } from "@/lib/admin/snapshots/campaigns";

type AdminCampaignPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function AdminCampaignPage({ params }: AdminCampaignPageProps) {
  await requireAdminModule("campaign.read");

  const { campaignId } = await params;
  const campaign = await getAdminCampaignDetail(campaignId);

  if (!campaign) {
    notFound();
  }

  return <AdminCampaignDetailView campaign={campaign} />;
}
