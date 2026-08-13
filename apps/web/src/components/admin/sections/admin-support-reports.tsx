"use client";

import React, { useState } from "react";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { defaultUrlTransform } from "react-markdown";
import { Button } from "@wizards/ui";

import {
  AdminCard,
  AdminGridTable,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { Modal } from "@/components/ui/modal";
import type { getAdminBugReport, listAdminBugReports } from "@/lib/support/admin-support-service";

type AdminSupportReport = Awaited<ReturnType<typeof listAdminBugReports>>["reports"][number];
type AdminSupportReportDetail = Awaited<ReturnType<typeof getAdminBugReport>>["report"];
type BugReportStatus = AdminSupportReport["status"];

const STATUS_TRANSITIONS: Record<BugReportStatus, BugReportStatus[]> = {
  DISCARDED: [],
  OPEN: ["TRIAGED"],
  RESOLVED: [],
  TRIAGED: ["RESOLVED", "DISCARDED"],
};

export function getAllowedBugReportStatuses(status: BugReportStatus) {
  return STATUS_TRANSITIONS[status];
}

export function getSafeSupportScreenshotUrl(url: string) {
  const transformed = defaultUrlTransform(url);
  return transformed.startsWith("https://") ? transformed : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusTone(status: BugReportStatus) {
  if (status === "RESOLVED") {
    return "success" as const;
  }

  if (status === "DISCARDED") {
    return "neutral" as const;
  }

  return status === "TRIAGED" ? ("primary" as const) : ("warning" as const);
}

export function AdminSupportReports({ reports }: { reports: AdminSupportReport[] }) {
  const [detail, setDetail] = useState<AdminSupportReportDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openDetail(reportId: string) {
    setBusy(reportId);
    setError(null);
    const response = await fetch(`/api/v1/admin/support/reports/${reportId}`);
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      report?: AdminSupportReportDetail;
    } | null;

    if (!response.ok || !payload?.report) {
      setError(payload?.error ?? "Rapor detayı alınamadı.");
      setBusy(null);
      return;
    }

    setDetail(payload.report);
    setBusy(null);
  }

  async function updateStatus(status: BugReportStatus) {
    if (!detail) {
      return;
    }

    setBusy(status);
    setError(null);
    const response = await fetch(`/api/v1/admin/support/reports/${detail.id}`, {
      body: JSON.stringify({ status }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      report?: AdminSupportReportDetail;
    } | null;

    if (!response.ok || !payload?.report) {
      setError(payload?.error ?? "Rapor durumu değiştirilemedi.");
      setBusy(null);
      return;
    }

    setDetail(payload.report);
    setBusy(null);
    window.location.reload();
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        subtitle="90 günlük saklama sözleşmesine tabi mobil hata raporları"
        title="Hata Raporları"
      />

      {error ? (
        <p aria-live="polite" className="text-app-danger text-sm">
          {error}
        </p>
      ) : null}

      <AdminCard>
        <AdminGridTable
          columns="1fr 1fr 1.2fr 1fr 1.2fr 1.2fr 100px"
          emptyLabel="Bekleyen hata raporu yok."
          headers={["Ticket", "Kategori", "Tarih", "Durum", "Kullanıcı", "Silinme tarihi", "Eylem"]}
          rows={reports.map((report) => ({
            cells: [
              <span className="font-mono font-semibold" key="ticket">
                {report.ticket}
              </span>,
              <AdminPill key="category" tone="primary">
                {report.category}
              </AdminPill>,
              <span className="text-app-muted text-xs" key="created">
                {formatDate(report.createdAt)}
              </span>,
              <AdminPill key="status" tone={statusTone(report.status)}>
                {report.status}
              </AdminPill>,
              <div className="min-w-0" key="user">
                <p className="truncate">
                  {report.user?.displayName ?? report.user?.username ?? "Anonim"}
                </p>
                {report.user ? (
                  <p className="text-app-muted truncate text-xs">@{report.user.username}</p>
                ) : null}
              </div>,
              <span className="text-app-muted text-xs" key="purge">
                {formatDate(report.purgeAfter)}
              </span>,
              <Button
                disabled={busy === report.id}
                key="open"
                onClick={() => void openDetail(report.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                {busy === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aç"}
              </Button>,
            ],
            id: report.id,
          }))}
        />
      </AdminCard>

      <Modal
        description={detail ? `${detail.ticket} · Silinme: ${formatDate(detail.purgeAfter)}` : ""}
        onClose={() => setDetail(null)}
        open={detail !== null}
        title={detail ? `${detail.ticket} raporu` : "Hata raporu"}
      >
        {detail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <AdminPill tone={statusTone(detail.status)}>{detail.status}</AdminPill>
              <AdminPill tone="primary">{detail.category}</AdminPill>
              <AdminPill>{detail.platform ?? "Bilinmeyen platform"}</AdminPill>
              <AdminPill>{detail.appVersion ?? "Bilinmeyen sürüm"}</AdminPill>
            </div>

            <div>
              <p className="text-app-muted text-xs font-bold uppercase">Rapor gövdesi</p>
              <p className="text-app-foreground mt-2 whitespace-pre-wrap text-sm">{detail.body}</p>
            </div>

            <div>
              <p className="text-app-muted text-xs font-bold uppercase">Cihaz bilgisi</p>
              {detail.deviceInfo ? (
                <pre className="app-panel-soft mt-2 max-h-48 overflow-auto rounded-[12px] border p-3 text-xs">
                  {JSON.stringify(detail.deviceInfo, null, 2)}
                </pre>
              ) : (
                <p className="text-app-muted mt-2 text-sm">Eklenmedi.</p>
              )}
            </div>

            <div>
              <p className="text-app-muted text-xs font-bold uppercase">Günlük özeti</p>
              {detail.logExcerpt ? (
                <pre className="app-panel-soft mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-[12px] border p-3 text-xs">
                  {detail.logExcerpt}
                </pre>
              ) : (
                <p className="text-app-muted mt-2 text-sm">Eklenmedi.</p>
              )}
            </div>

            {detail.screenshotUrl && getSafeSupportScreenshotUrl(detail.screenshotUrl) ? (
              <a
                className="text-[hsl(var(--primary))] inline-flex items-center gap-2 text-sm font-semibold"
                href={getSafeSupportScreenshotUrl(detail.screenshotUrl) ?? undefined}
                rel="noreferrer"
                target="_blank"
              >
                Ekran görüntüsünü aç
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}

            <div>
              <p className="text-app-muted text-xs font-bold uppercase">Durum değiştir</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {getAllowedBugReportStatuses(detail.status).map((status) => (
                  <Button
                    disabled={busy !== null}
                    key={status}
                    onClick={() => void updateStatus(status)}
                    type="button"
                    variant="outline"
                  >
                    {busy === status ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-2 h-4 w-4" />
                    )}
                    {status}
                  </Button>
                ))}
                {getAllowedBugReportStatuses(detail.status).length === 0 ? (
                  <span className="text-app-muted text-sm">Bu rapor terminal durumda.</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
