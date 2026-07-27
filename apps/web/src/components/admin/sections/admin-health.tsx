import React from "react";
import {
  AdminCard,
  AdminCardHeader,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt, formatAdminPercent } from "@/components/admin/format/admin-format";
import type { AdminHealthSnapshot } from "@/lib/admin/snapshots/health";

const PLATFORM_LABEL: Record<string, string> = {
  DESKTOP: "Masaüstü",
  MOBILE: "Mobil",
  UNKNOWN: "Bilinmiyor",
  WEB: "Web",
};

const NO_DATA = "veri yok";

function formatMs(value: number | null) {
  return value === null ? NO_DATA : `${formatAdminInt(value)} ms`;
}

function formatRate(value: number | null) {
  return value === null ? NO_DATA : formatAdminPercent(value);
}

/** Worst crash rate across platforms drives the band; no data stays neutral. */
export function getHealthBandTone(platforms: AdminHealthSnapshot["platforms"]) {
  const rates = platforms
    .map((platform) => platform.crashRatePercent)
    .filter((rate): rate is number => rate !== null);

  if (rates.length === 0) {
    return "neutral" as const;
  }

  const worst = Math.max(...rates);

  if (worst >= 2) {
    return "danger" as const;
  }

  return worst >= 0.5 ? ("warning" as const) : ("success" as const);
}

export function AdminHealth({ snapshot }: { snapshot: AdminHealthSnapshot }) {
  const tone = getHealthBandTone(snapshot.platforms);
  const maxTick = Math.max(1, ...snapshot.ticks.map((tick) => tick.crashes + tick.errors));

  return (
    <section className="space-y-5">
      <AdminPageHeader
        subtitle="İstemci sağlığı, sürüm dağılımı ve Expo kabul oranı"
        title="Platform Sağlığı"
      />

      <AdminCard>
        <div className="flex flex-wrap items-center gap-3">
          <AdminPill tone={tone}>
            {tone === "danger"
              ? "Çökme oranı yüksek"
              : tone === "warning"
                ? "Çökme oranı izlemede"
                : tone === "success"
                  ? "İstemciler sağlıklı"
                  : "Ölçüm bekleniyor"}
          </AdminPill>
          <span className="text-app-muted text-[12.5px]">
            Son {formatAdminInt(snapshot.range.days)} gün
          </span>
        </div>
      </AdminCard>

      <div className="grid gap-4 xl:grid-cols-2">
        {snapshot.platforms.map((platform) => (
          <AdminCard key={platform.platform}>
            <AdminCardHeader title={PLATFORM_LABEL[platform.platform] ?? platform.platform} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <AdminMiniStat
                label="Şu an açık oturum"
                tone="primary"
                value={formatAdminInt(platform.activeSessions)}
              />
              <AdminMiniStat
                label="Çökme / oturum"
                tone={platform.crashRatePercent === null ? "neutral" : "danger"}
                value={formatRate(platform.crashRatePercent)}
              />
              <AdminMiniStat
                label="Açılış p50"
                tone="neutral"
                value={formatMs(platform.startupP50Ms)}
              />
              <AdminMiniStat
                label="Açılış p95"
                tone="neutral"
                value={formatMs(platform.startupP95Ms)}
              />
            </div>
            <p className="text-app-muted mt-3 text-[12.5px]">
              {formatAdminInt(platform.errorCount)} hata · {formatAdminInt(platform.sessionCount)}{" "}
              oturum
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {platform.versions.length === 0 ? (
                <span className="text-app-soft text-[11.5px]">Sürüm verisi yok.</span>
              ) : (
                platform.versions.map((version) => (
                  <AdminPill key={version.label}>
                    {version.label} · {formatAdminInt(version.count)}
                  </AdminPill>
                ))
              )}
            </div>
          </AdminCard>
        ))}
      </div>

      <AdminCard>
        <AdminCardHeader subtitle="Günlük çökme ve hata sayısı" title="Son 30 gün" />
        <div className="mt-4 flex items-end gap-[3px]" data-testid="admin-health-ticks">
          {snapshot.ticks.map((tick) => {
            const total = tick.crashes + tick.errors;
            const height = Math.max(2, Math.round((total / maxTick) * 56));

            return (
              <span
                className="flex-1 rounded-[3px] bg-[hsl(var(--primary)/0.55)]"
                key={tick.date}
                style={{ height }}
                title={`${tick.date}: ${tick.crashes} çökme, ${tick.errors} hata`}
              />
            );
          })}
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader
          subtitle="Expo bileti kabul etti; cihazda gösterim ayrı bir ölçüm."
          title="Expo kabul oranı"
        />
        {snapshot.pushAcceptance.length === 0 ? (
          <p className="text-app-muted mt-3 text-[13px]">Bu aralıkta push denemesi yok.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {snapshot.pushAcceptance.map((entry) => (
              <AdminMiniStat
                key={entry.platform}
                label={`${entry.platform} · ${formatAdminInt(entry.rejectedCount)} reddedildi`}
                tone={entry.acceptanceRatePercent === null ? "neutral" : "success"}
                value={formatRate(entry.acceptanceRatePercent)}
              />
            ))}
          </div>
        )}
      </AdminCard>
    </section>
  );
}
