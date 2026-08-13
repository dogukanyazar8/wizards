import React from "react";
import Link from "next/link";
import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt } from "@/components/admin/format/admin-format";
import {
  AdminCaseActionMenu,
  AdminCaseAppealForm,
  AdminCaseDeleteMessageButton,
  AdminCaseNoteForm,
} from "@/components/admin/sections/admin-case-actions";
import type { getModerationCaseFile } from "@/lib/moderation/case-queries";

type CaseFile = NonNullable<Awaited<ReturnType<typeof getModerationCaseFile>>>;

const EVENT_LABEL: Record<string, string> = {
  ACTION_TAKEN: "Aksiyon",
  APPEAL_OPENED: "İtiraz açıldı",
  APPEAL_RESOLVED: "İtiraz sonuçlandı",
  ASSIGNED: "Üstlenildi",
  NOTE: "Not",
  REPORT_ADDED: "Bildirim",
  STATUS_CHANGED: "Durum değişti",
};

const REASON_LABEL: Record<string, string> = {
  HARASSMENT: "Taciz",
  IMPERSONATION: "Kimlik taklidi",
  INAPPROPRIATE: "Uygunsuz içerik",
  OTHER: "Diğer",
  SPAM: "Spam",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIONED: "İşlem yapıldı",
  APPEALED: "İtiraz",
  CLOSED: "Kapandı",
  DISMISSED: "Reddedildi",
  IN_REVIEW: "İncelemede",
  OPEN: "Bekliyor",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function accountAgeDays(createdAt: string, now: Date) {
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)),
  );
}

function olderRecordsHref(caseFile: CaseFile, relation: "evidence" | "events" | "reports") {
  const parameterNames = {
    evidence: "evidencePage",
    events: "eventPage",
    reports: "reportPage",
  } as const;
  const params = new URLSearchParams();

  for (const key of ["evidence", "events", "reports"] as const) {
    const page = caseFile.pagination[key].page;
    if (page > 1 || key === relation) {
      params.set(parameterNames[key], String(key === relation ? page + 1 : page));
    }
  }

  return `/admin/moderation/${encodeURIComponent(caseFile.id)}?${params.toString()}`;
}

export function AdminCaseFile({
  canAct,
  caseFile,
  now,
}: {
  canAct: boolean;
  caseFile: CaseFile;
  now: Date;
}) {
  const resolved = caseFile.resolvedAt !== null;

  return (
    <section className="space-y-5">
      <AdminPageHeader
        actions={
          <Link
            className="text-app-muted rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold hover:bg-[hsl(var(--surface-soft))]"
            href="/admin/moderation"
          >
            Kuyruğa dön
          </Link>
        }
        subtitle={`@${caseFile.subjectHandle} hakkında ${formatAdminInt(caseFile.reportCount)} bildirim`}
        title={`MOD-${caseFile.publicNumber}`}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <AdminCard>
            <AdminCardHeader title="Zaman çizelgesi" />
            <ol className="mt-3 space-y-3">
              {caseFile.timeline.map((entry) => (
                <li className="border-l-2 border-[hsl(var(--border)/0.7)] pl-3" key={entry.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminPill tone={entry.kind === "ACTION_TAKEN" ? "danger" : "neutral"}>
                      {EVENT_LABEL[entry.kind] ?? entry.kind}
                    </AdminPill>
                    {entry.reason ? (
                      <span className="text-app-muted text-[12px]">
                        {REASON_LABEL[entry.reason] ?? entry.reason}
                      </span>
                    ) : null}
                    <span className="text-app-soft text-[11.5px]">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="text-app-foreground mt-1 text-[13px]">
                    {entry.actor ? `@${entry.actor.username}` : "sistem"}
                    {entry.body ? ` · ${entry.body}` : ""}
                  </p>
                </li>
              ))}
            </ol>
            {caseFile.pagination.reports.hasOlderRecords ||
            caseFile.pagination.events.hasOlderRecords ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {caseFile.pagination.reports.hasOlderRecords ? (
                  <Link
                    className="text-app-muted text-[12px] font-semibold"
                    href={olderRecordsHref(caseFile, "reports")}
                  >
                    Daha eski raporlar
                  </Link>
                ) : null}
                {caseFile.pagination.events.hasOlderRecords ? (
                  <Link
                    className="text-app-muted text-[12px] font-semibold"
                    href={olderRecordsHref(caseFile, "events")}
                  >
                    Daha eski olaylar
                  </Link>
                ) : null}
              </div>
            ) : null}
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              subtitle="Rapor anında alınan kopya; kaynak silinse de burada kalır."
              title="Delil"
            />
            {caseFile.evidence.length === 0 ? (
              <p className="text-app-muted mt-3 text-[13px]">Bu vakada delil yok.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {caseFile.evidence.map((entry) => (
                  <li
                    className="rounded-[12px] border border-[hsl(var(--border)/0.6)] p-3"
                    key={entry.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminPill tone="primary">
                        {entry.snapshot?.source === "dm" ? "Direkt mesaj" : "Kanal"}
                      </AdminPill>
                      {entry.snapshot?.scope ? (
                        <span className="text-app-muted text-[12px]">{entry.snapshot.scope}</span>
                      ) : null}
                      {entry.sourceDeleted ? (
                        <AdminPill tone="danger">kaynak silinmiş</AdminPill>
                      ) : null}
                      <span className="text-app-soft text-[11.5px]">
                        {formatDateTime(entry.snapshot?.sentAt ?? entry.capturedAt)}
                      </span>
                    </div>
                    <p className="text-app-foreground mt-2 text-[13px] whitespace-pre-line">
                      {entry.snapshot?.content || "(boş mesaj)"}
                    </p>
                    {entry.snapshot?.authorHandle ? (
                      <p className="text-app-muted mt-1 text-[11.5px]">
                        @{entry.snapshot.authorHandle}
                      </p>
                    ) : null}
                    {canAct && entry.messageId && !entry.sourceDeleted ? (
                      <div className="mt-2">
                        <AdminCaseDeleteMessageButton caseId={caseFile.id} evidenceId={entry.id} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {caseFile.pagination.evidence.hasOlderRecords ? (
              <Link
                className="text-app-muted mt-4 inline-flex text-[12px] font-semibold"
                href={olderRecordsHref(caseFile, "evidence")}
              >
                Daha eski deliller
              </Link>
            ) : null}
          </AdminCard>

          {canAct ? (
            <AdminCard>
              <AdminCardHeader title="Not ekle" />
              <div className="mt-3">
                <AdminCaseNoteForm caseId={caseFile.id} />
              </div>
            </AdminCard>
          ) : null}
        </div>

        <div className="space-y-5">
          <AdminCard>
            <AdminCardHeader title="Konu" />
            <div className="mt-3 space-y-2 text-[13px]">
              <p className="text-app-foreground font-semibold">@{caseFile.subjectHandle}</p>
              {caseFile.subjectDeleted ? (
                <AdminPill tone="danger">Hesap silinmiş</AdminPill>
              ) : (
                <>
                  <p className="text-app-muted">
                    Hesap yaşı:{" "}
                    {formatAdminInt(accountAgeDays(caseFile.subject?.createdAt ?? "", now))} gün
                  </p>
                  <p className="text-app-muted">
                    Doğrulama: {caseFile.subject?.emailVerified ? "Doğrulanmış" : "Doğrulanmamış"}
                  </p>
                  <p className="text-app-muted">
                    Geçmiş vaka: {formatAdminInt(caseFile.subject?.priorCaseCount ?? 0)}
                  </p>
                  <p className="text-app-muted">
                    Sunucu: {formatAdminInt(caseFile.subject?.serverCount ?? 0)}
                  </p>
                  {caseFile.subject?.isBanned ? <AdminPill tone="danger">Engelli</AdminPill> : null}
                </>
              )}
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader title="Vaka" />
            <div className="mt-3 space-y-2 text-[13px]">
              <p className="text-app-muted">Durum: {STATUS_LABEL[caseFile.status]}</p>
              <p className="text-app-muted">Açılış: {formatDateTime(caseFile.openedAt)}</p>
              <p className="text-app-muted">
                İlk bakış: {caseFile.firstSeenAt ? formatDateTime(caseFile.firstSeenAt) : "—"}
              </p>
              <p className="text-app-muted">
                Üstlenen: {caseFile.assignee ? `@${caseFile.assignee.username}` : "—"}
              </p>
              {caseFile.resolution ? (
                <p className="text-app-foreground">Karar: {caseFile.resolution}</p>
              ) : null}
            </div>
          </AdminCard>

          {canAct && caseFile.status === "APPEALED" ? (
            <AdminCard>
              <AdminCardHeader
                subtitle="Kabul vakayı reddedilmiş sayar, ret kararı geri getirir."
                title="İtiraz"
              />
              <div className="mt-3">
                <AdminCaseAppealForm caseId={caseFile.id} />
              </div>
            </AdminCard>
          ) : null}

          {canAct && !resolved && caseFile.status !== "APPEALED" ? (
            <AdminCard>
              <AdminCardHeader title="Karar" />
              <div className="mt-3">
                <AdminCaseActionMenu caseId={caseFile.id} />
              </div>
            </AdminCard>
          ) : null}
        </div>
      </div>
    </section>
  );
}
