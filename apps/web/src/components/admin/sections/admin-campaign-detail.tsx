import React from "react";
import Link from "next/link";
import {
  AdminCard,
  AdminCardHeader,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt, formatAdminPercent } from "@/components/admin/format/admin-format";
import type { AdminCampaignDetail } from "@/lib/admin/snapshots/campaigns";

const STATUS_LABEL: Record<string, string> = {
  CANCELLED: "İptal",
  DRAFT: "Taslak",
  FAILED: "Hata",
  PENDING_APPROVAL: "Onay bekliyor",
  SENDING: "Gönderiliyor",
  SENT: "Gönderildi",
};

function formatDateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";
}

export function AdminCampaignDetailView({ campaign }: { campaign: AdminCampaignDetail }) {
  const { report } = campaign;

  return (
    <section className="space-y-5">
      <AdminPageHeader
        actions={
          <Link
            className="text-app-muted rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold hover:bg-[var(--surface-hover)]"
            href="/admin/notifications"
          >
            Kampanyalara dön
          </Link>
        }
        subtitle={STATUS_LABEL[campaign.status] ?? campaign.status}
        title={campaign.title}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMiniStat
          label="Hedeflenen"
          tone="neutral"
          value={formatAdminInt(report.targetedCount)}
        />
        <AdminMiniStat label="Gönderilen" tone="success" value={formatAdminInt(report.sentCount)} />
        <AdminMiniStat
          label="Frekans limiti"
          tone="warning"
          value={formatAdminInt(report.frequencyCappedCount)}
        />
        <AdminMiniStat label="Hata" tone="danger" value={formatAdminInt(report.failedCount)} />
        <AdminMiniStat
          label="Açılma"
          tone="primary"
          value={
            report.openRatePercent === null
              ? "veri yok"
              : formatAdminPercent(report.openRatePercent)
          }
        />
      </div>

      <AdminCard>
        <AdminCardHeader title="İçerik" />
        <p className="text-app-foreground mt-3 text-[14px] font-semibold">{campaign.title}</p>
        <p className="text-app-muted mt-1 text-[13px] whitespace-pre-line">{campaign.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <AdminPill>Uygulama içi</AdminPill>
          <AdminPill tone="neutral">{campaign.type}</AdminPill>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader title="Zaman çizelgesi" />
        <div className="mt-3 space-y-2 text-[13px]">
          <p className="text-app-muted">Oluşturuldu: {formatDateTime(campaign.createdAt)}</p>
          <p className="text-app-muted">Onay: {formatDateTime(campaign.approvedAt)}</p>
          <p className="text-app-muted">Liste donduruldu: {formatDateTime(campaign.frozenAt)}</p>
          <p className="text-app-muted">Gönderim başladı: {formatDateTime(campaign.startedAt)}</p>
          <p className="text-app-muted">Tamamlandı: {formatDateTime(campaign.completedAt)}</p>
          <p className="text-app-soft text-[11.5px]">
            Açılma oranının paydası gönderilen bildirim sayısıdır; atlanan kişiler orana girmez.
          </p>
        </div>
      </AdminCard>
    </section>
  );
}
