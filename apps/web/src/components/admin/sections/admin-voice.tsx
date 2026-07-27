import React from "react";
import {
  AdminCard,
  AdminCardHeader,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
  AdminPulseDot,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminDuration, formatAdminInt } from "@/components/admin/format/admin-format";
import type { AdminVoiceSnapshot } from "@/lib/admin/snapshots/voice";

const PLATFORM_LABEL: Record<string, string> = {
  DESKTOP: "Masaüstü",
  MOBILE: "Mobil",
  UNKNOWN: "Bilinmiyor",
  WEB: "Web",
};

export function AdminVoice({ snapshot }: { snapshot: AdminVoiceSnapshot }) {
  const peak = Math.max(1, ...snapshot.hourly.map((hour) => hour.count));

  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Canlı ses kanalları ve görüşme yoğunluğu" title="Ses" />

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminMiniStat
          label="Şu an seste"
          tone="success"
          value={formatAdminInt(snapshot.concurrentVoice)}
        />
        <AdminMiniStat
          label="24s görüşme"
          tone="primary"
          value={formatAdminInt(snapshot.callsLast24h)}
        />
        <AdminMiniStat
          label="Ortalama süre"
          tone="neutral"
          value={
            snapshot.averageCallSeconds === null
              ? "veri yok"
              : formatAdminDuration(snapshot.averageCallSeconds)
          }
        />
      </div>

      <AdminCard>
        <AdminCardHeader subtitle="UTC saat başına başlayan görüşme" title="Saatlik yoğunluk" />
        <div className="mt-4 flex items-end gap-1" data-testid="admin-voice-hourly">
          {snapshot.hourly.map((hour) => (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5" key={hour.hour}>
              <div
                className="w-full rounded-[5px] bg-linear-to-b from-[hsl(var(--ambient-2))] to-[hsl(var(--primary))]"
                style={{ height: Math.max(3, Math.round((hour.count / peak) * 96)) }}
                title={`${hour.label}: ${hour.count}`}
              />
              <span className="text-app-soft text-[9.5px]">
                {hour.isCurrent ? hour.label : hour.hour % 3 === 0 ? hour.hour : ""}
              </span>
            </div>
          ))}
        </div>
      </AdminCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard>
          <AdminCardHeader title="Canlı kanallar" />
          {snapshot.liveChannels.length === 0 ? (
            <p className="text-app-muted mt-3 text-[13px]">Şu anda açık ses kanalı yok.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {snapshot.liveChannels.map((channel) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--border)/0.45)] pt-2 first:border-t-0 first:pt-0"
                  key={channel.channelId}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <AdminPulseDot />
                    <span className="text-app-foreground truncate text-[13px] font-semibold">
                      {channel.name}
                    </span>
                    {channel.server ? (
                      <span className="text-app-muted truncate text-[11.5px]">
                        {channel.server.name}
                      </span>
                    ) : null}
                  </span>
                  <AdminPill tone="primary">
                    {formatAdminInt(channel.participantCount)} kişi
                  </AdminPill>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            subtitle="Ses oturumlarının istemci dağılımı"
            title="Platform kırılımı"
          />
          {snapshot.platforms.length === 0 ? (
            <p className="text-app-muted mt-3 text-[13px]">Son 24 saatte ses oturumu yok.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {snapshot.platforms.map((entry) => (
                <AdminPill key={entry.platform}>
                  {PLATFORM_LABEL[entry.platform] ?? entry.platform} · {formatAdminInt(entry.count)}
                </AdminPill>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </section>
  );
}
