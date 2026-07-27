import React from "react";
import Link from "next/link";
import {
  AdminCard,
  AdminCardHeader,
  AdminGridTable,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt } from "@/components/admin/format/admin-format";
import type { AdminCampaignListItem } from "@/lib/admin/snapshots/campaigns";

const STATUS_LABEL: Record<string, string> = {
  CANCELLED: "İptal",
  DRAFT: "Taslak",
  FAILED: "Hata",
  PENDING_APPROVAL: "Onay bekliyor",
  SENDING: "Gönderiliyor",
  SENT: "Gönderildi",
};

const STATUS_TONE: Record<string, "danger" | "neutral" | "primary" | "success" | "warning"> = {
  CANCELLED: "neutral",
  DRAFT: "neutral",
  FAILED: "danger",
  PENDING_APPROVAL: "warning",
  SENDING: "primary",
  SENT: "success",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function AdminCampaigns({
  campaigns,
  composer,
}: {
  campaigns: AdminCampaignListItem[];
  /** The composer is a client island; the page mounts it, the list stays server-rendered. */
  composer?: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Uygulama içi duyurular ve teslimat raporu" title="Bildirimler" />

      {composer}

      <AdminCard>
        <AdminCardHeader title="Kampanyalar" />
        <div className="mt-3">
          <AdminGridTable
            columns="2fr 1.1fr 1.3fr 1fr 1fr"
            emptyLabel="Henüz kampanya yok."
            headers={["Başlık", "Durum", "Zaman", "Gönderilen", "Hata"]}
            rows={campaigns.map((campaign) => ({
              cells: [
                <Link
                  className="text-app-foreground min-w-0 truncate font-semibold hover:underline"
                  href={`/admin/notifications/${campaign.id}`}
                  key="title"
                >
                  {campaign.title}
                </Link>,
                <span className="flex flex-wrap items-center gap-1" key="status">
                  <AdminPill tone={STATUS_TONE[campaign.status] ?? "neutral"}>
                    {STATUS_LABEL[campaign.status] ?? campaign.status}
                  </AdminPill>
                  {campaign.isLate ? <AdminPill tone="danger">gecikmiş</AdminPill> : null}
                </span>,
                <span className="text-app-muted text-[12px]" key="time">
                  {campaign.scheduledAt
                    ? `Planlandı · ${formatDateTime(campaign.scheduledAt)}`
                    : formatDateTime(campaign.createdAt)}
                </span>,
                <span className="text-app-foreground text-[12.5px] font-semibold" key="sent">
                  {formatAdminInt(campaign.sentCount)}
                </span>,
                <span className="text-app-muted text-[12.5px]" key="failed">
                  {formatAdminInt(campaign.failedCount)}
                </span>,
              ],
              id: campaign.id,
            }))}
          />
        </div>
      </AdminCard>
    </section>
  );
}
