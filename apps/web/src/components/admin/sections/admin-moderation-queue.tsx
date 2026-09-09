import React from "react";
import Link from "next/link";
import {
  AdminCard,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt } from "@/components/admin/format/admin-format";
import {
  AdminCaseClaimButton,
  AdminCaseDismissButton,
} from "@/components/admin/sections/admin-case-actions";
import { AdminManagementPagination } from "@/components/admin/sections/admin-management-pagination";
import { AdminConsoleDetachButton } from "@/components/admin/shell/admin-console-detach-button";
import type {
  getModerationQueueStats,
  listModerationCases,
  ModerationQueueScope,
} from "@/lib/moderation/case-queries";
import { isStaleModerationCase } from "@/lib/moderation/case-queries";

type QueueResult = Awaited<ReturnType<typeof listModerationCases>>;
type QueueStats = Awaited<ReturnType<typeof getModerationQueueStats>>;

const SCOPE_FILTERS: Array<{ id: ModerationQueueScope; label: string }> = [
  { id: "active", label: "Bekleyen" },
  { id: "appealed", label: "İtiraz" },
  { id: "resolved", label: "Çözülen" },
  { id: "all", label: "Tümü" },
];

const PRIORITY_TONE = {
  HIGH: "danger",
  LOW: "neutral",
  NORMAL: "primary",
  URGENT: "danger",
} as const;

const PRIORITY_LABEL = {
  HIGH: "Yüksek",
  LOW: "Düşük",
  NORMAL: "Normal",
  URGENT: "Acil",
} as const;

const STATUS_LABEL = {
  ACTIONED: "İşlem yapıldı",
  APPEALED: "İtiraz",
  CLOSED: "Kapandı",
  DISMISSED: "Reddedildi",
  IN_REVIEW: "İncelemede",
  OPEN: "Bekliyor",
} as const;

const REASON_LABEL: Record<string, string> = {
  HARASSMENT: "Taciz",
  IMPERSONATION: "Kimlik taklidi",
  INAPPROPRIATE: "Uygunsuz içerik",
  OTHER: "Diğer",
  SPAM: "Spam",
};

function formatRelative(value: string, now: Date) {
  const deltaMinutes = Math.round((now.getTime() - new Date(value).getTime()) / 60_000);

  if (deltaMinutes < 60) {
    return `${formatAdminInt(Math.max(1, deltaMinutes))} dk önce`;
  }

  if (deltaMinutes < 60 * 24) {
    return `${formatAdminInt(Math.round(deltaMinutes / 60))} sa önce`;
  }

  return `${formatAdminInt(Math.round(deltaMinutes / (60 * 24)))} gün önce`;
}

export function formatFirstResponse(averageMs: number | null) {
  if (averageMs === null) {
    return "—";
  }

  const minutes = Math.round(averageMs / 60_000);

  return minutes < 60
    ? `${formatAdminInt(minutes)} dk`
    : `${formatAdminInt(Math.round(minutes / 60))} sa`;
}

export function AdminModerationQueue({
  canAct,
  now,
  result,
  scope,
  stats,
}: {
  canAct: boolean;
  now: Date;
  result: QueueResult;
  scope: ModerationQueueScope;
  stats: QueueStats;
}) {
  return (
    <section className="space-y-5">
      <AdminPageHeader
        actions={<AdminConsoleDetachButton />}
        subtitle="Kullanıcı bildirimlerinden açılan vakalar"
        title="Moderasyon"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMiniStat label="Bekleyen" tone="danger" value={formatAdminInt(stats.openCount)} />
        <AdminMiniStat
          label="İncelemede"
          tone="primary"
          value={formatAdminInt(stats.inReviewCount)}
        />
        <AdminMiniStat
          label="Çözülen (7g)"
          tone="success"
          value={formatAdminInt(stats.resolvedThisWeek)}
        />
        <AdminMiniStat
          label="Ort. ilk yanıt"
          tone="neutral"
          value={formatFirstResponse(stats.averageFirstResponseMs)}
        />
      </div>

      <div aria-label="Vaka filtresi" className="flex flex-wrap gap-2" role="tablist">
        {SCOPE_FILTERS.map((filter) => {
          const selected = filter.id === scope;

          return (
            <Link
              aria-selected={selected}
              className={
                selected
                  ? "rounded-[12px] bg-[hsl(var(--primary))] px-3 py-[7px] text-[12.5px] font-semibold text-[hsl(var(--primary-foreground))]"
                  : "text-app-muted rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold hover:bg-[var(--surface-hover)]"
              }
              href={
                filter.id === "active"
                  ? "/admin/moderation"
                  : `/admin/moderation?scope=${filter.id}`
              }
              key={filter.id}
              role="tab"
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {result.cases.length === 0 ? (
        <AdminCard className="min-h-40">
          <p className="text-app-foreground text-[15px] font-semibold">Kuyruk temiz.</p>
          <p className="text-app-muted mt-1 text-[13px]">
            Bekleyen bildirim yok. Yeni bir rapor geldiğinde burada görünür.
          </p>
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {result.cases.map((moderationCase) => {
            const stale = isStaleModerationCase(moderationCase, now);

            return (
              <AdminCard
                {...(stale
                  ? { className: "border-[hsl(var(--danger)/0.55)] bg-[hsl(var(--danger)/0.05)]" }
                  : {})}
                key={moderationCase.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminPill tone={PRIORITY_TONE[moderationCase.priority]}>
                        {PRIORITY_LABEL[moderationCase.priority]}
                      </AdminPill>
                      <span className="text-app-muted text-[12px] font-bold">
                        MOD-{moderationCase.publicNumber}
                      </span>
                      <AdminPill>{STATUS_LABEL[moderationCase.status]}</AdminPill>
                      {stale ? <AdminPill tone="danger">24 saati aştı</AdminPill> : null}
                      {moderationCase.subjectDeleted ? <AdminPill>Hesap silinmiş</AdminPill> : null}
                    </div>
                    <p className="text-app-foreground mt-2 text-[15px] font-semibold">
                      @{moderationCase.subjectHandle}
                    </p>
                    <p className="text-app-muted mt-1 text-[12.5px]">
                      {formatAdminInt(moderationCase.reportCount)} bildirdi ·{" "}
                      {formatRelative(
                        moderationCase.lastReportedAt ?? moderationCase.openedAt,
                        now,
                      )}
                      {moderationCase.lastReason
                        ? ` · ${REASON_LABEL[moderationCase.lastReason] ?? moderationCase.lastReason}`
                        : ""}
                    </p>
                    {moderationCase.assignee ? (
                      <p className="text-app-soft mt-1 text-[11.5px]">
                        Üstlenen: @{moderationCase.assignee.username}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canAct && !moderationCase.assignee ? (
                      <AdminCaseClaimButton caseId={moderationCase.id} />
                    ) : null}
                    <Link
                      className="text-app-foreground rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold hover:bg-[var(--surface-hover)]"
                      href={`/admin/moderation/${moderationCase.id}`}
                    >
                      İncele
                    </Link>
                    {canAct ? <AdminCaseDismissButton caseId={moderationCase.id} /> : null}
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      <AdminManagementPagination
        page={result.pagination.page}
        pathname="/admin/moderation"
        search={scope === "active" ? {} : { scope }}
        total={result.pagination.total}
        totalPages={result.pagination.totalPages}
      />
    </section>
  );
}
