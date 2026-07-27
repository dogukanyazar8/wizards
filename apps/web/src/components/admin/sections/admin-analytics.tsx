import React from "react";
import Link from "next/link";
import {
  AdminBarChart,
  AdminCard,
  AdminCardHeader,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt, formatAdminPercent } from "@/components/admin/format/admin-format";
import { getCohortRetentionPercent } from "@/lib/admin/analytics/cohorts";
import { getFunnelConversionPercent } from "@/lib/admin/analytics/funnel";
import { ANALYTICS_PLATFORMS, type AdminAnalyticsSnapshot } from "@/lib/admin/snapshots/analytics";

const PLATFORM_LABEL: Record<string, string> = {
  ALL: "Tümü",
  DESKTOP: "Masaüstü",
  MOBILE: "Mobil",
  UNKNOWN: "UNKNOWN",
  WEB: "Web",
};

const FUNNEL_LABEL: Record<string, string> = {
  email_verified: "E-posta doğrulandı",
  first_message: "İlk mesaj",
  first_session: "İlk oturum",
  signup: "Kayıt",
};

/** Retention cells shade by strength; a zero cell stays flat, not faintly filled. */
export function getCohortCellAlpha(percent: number | null) {
  return percent === null ? 0 : Math.min(0.55, Math.round((percent / 100) * 55) / 100);
}

export function AdminAnalytics({ snapshot }: { snapshot: AdminAnalyticsSnapshot }) {
  const totals = snapshot.usageSeries.reduce(
    (sum, day) => ({
      directMessages: sum.directMessages + day.directMessages,
      messages: sum.messages + day.messages,
      uploads: sum.uploads + day.uploads,
      voiceMinutes: sum.voiceMinutes + day.voiceMinutes,
    }),
    { directMessages: 0, messages: 0, uploads: 0, voiceMinutes: 0 },
  );

  return (
    <section className="space-y-5">
      <AdminPageHeader
        subtitle="Kullanım serileri, kohort tutunması ve aktivasyon hunisi"
        title="Analitik"
      />

      <div aria-label="Platform filtresi" className="flex flex-wrap gap-2" role="tablist">
        {ANALYTICS_PLATFORMS.map((platform) => {
          const selected = platform === snapshot.platform;

          return (
            <Link
              aria-selected={selected}
              className={
                selected
                  ? "rounded-[12px] bg-[hsl(var(--primary))] px-3 py-[7px] text-[12.5px] font-semibold text-[hsl(var(--primary-foreground))]"
                  : "text-app-muted rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold hover:bg-[hsl(var(--surface-soft))]"
              }
              href={
                platform === "ALL" ? "/admin/analytics" : `/admin/analytics?platform=${platform}`
              }
              key={platform}
              role="tab"
            >
              {PLATFORM_LABEL[platform] ?? platform}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMiniStat label="Mesaj" tone="primary" value={formatAdminInt(totals.messages)} />
        <AdminMiniStat
          label="Direkt mesaj"
          tone="neutral"
          value={formatAdminInt(totals.directMessages)}
        />
        <AdminMiniStat
          label="Ses dakikası"
          tone="success"
          value={formatAdminInt(totals.voiceMinutes)}
        />
        <AdminMiniStat label="Yükleme" tone="warning" value={formatAdminInt(totals.uploads)} />
      </div>

      <AdminCard>
        <AdminCardHeader
          subtitle={`Son ${formatAdminInt(snapshot.range.days)} gün`}
          title="Günlük mesaj hacmi"
        />
        <div className="mt-4">
          <AdminBarChart
            bars={snapshot.usageSeries.map((day) => ({
              label: day.date.slice(5),
              value: day.messages + day.directMessages,
            }))}
          />
        </div>
        <p className="text-app-soft mt-3 text-[11.5px]">
          A migration&apos;ından önceki veri platformsuz kaydedildi; o günler platform filtresinde
          UNKNOWN altında görünür.
        </p>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader subtitle="Haftalık kayıt kohortları" title="Tutunma" />
        {snapshot.cohorts.length === 0 ? (
          <p className="text-app-muted mt-3 text-[13px]">Bu aralıkta kayıt yok.</p>
        ) : (
          <div className="mt-3 min-w-0 overflow-x-auto">
            <div className="min-w-[520px]">
              <div
                className="text-app-muted grid gap-2 px-3 py-2 text-[11px] font-bold tracking-[0.06em] uppercase"
                style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr" }}
              >
                <span>Hafta</span>
                <span>Kayıt</span>
                <span>D1</span>
                <span>D7</span>
                <span>D30</span>
              </div>
              {snapshot.cohorts.map((row) => (
                <div
                  className="text-app-foreground grid items-center gap-2 border-t border-[hsl(var(--border)/0.45)] px-3 py-[10px] text-[13px]"
                  key={row.weekStart}
                  style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr" }}
                >
                  <span>{row.weekStart}</span>
                  <span>{formatAdminInt(row.signups)}</span>
                  {(
                    [
                      ["d1", row.retainedDay1],
                      ["d7", row.retainedDay7],
                      ["d30", row.retainedDay30],
                    ] as const
                  ).map(([key, retained]) => {
                    const percent = getCohortRetentionPercent(retained, row.signups);

                    return (
                      <span
                        className="rounded-[8px] px-2 py-1 text-center"
                        key={key}
                        style={{
                          backgroundColor: `hsl(var(--primary) / ${getCohortCellAlpha(percent)})`,
                        }}
                      >
                        {percent === null ? "—" : formatAdminPercent(percent)}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <AdminCardHeader subtitle="Kayıttan ilk mesaja" title="Aktivasyon hunisi" />
        <div className="mt-4 space-y-3">
          {snapshot.funnel.map((step, index) => {
            const previous = index === 0 ? undefined : snapshot.funnel[index - 1];
            const conversion = getFunnelConversionPercent(step, previous);

            return (
              <div
                className={
                  step.platformSplittable
                    ? "rounded-[12px] border border-[hsl(var(--border)/0.6)] p-3"
                    : "rounded-[12px] border border-dashed border-[hsl(var(--border)/0.8)] bg-[hsl(var(--surface-soft)/0.5)] p-3"
                }
                key={step.step}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-app-foreground text-[13.5px] font-semibold">
                    {FUNNEL_LABEL[step.step] ?? step.step}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {step.platformSplittable ? null : <AdminPill>platform kırılımı yok</AdminPill>}
                    {conversion === null ? null : (
                      <AdminPill tone="primary">{formatAdminPercent(conversion)}</AdminPill>
                    )}
                    <span className="text-app-foreground text-[14px] font-bold">
                      {formatAdminInt(step.count)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </AdminCard>
    </section>
  );
}
