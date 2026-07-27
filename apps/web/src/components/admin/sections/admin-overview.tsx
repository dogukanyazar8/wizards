import React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import {
  formatAdminBytes,
  formatAdminDuration,
  formatAdminInt,
  formatAdminNumber,
  formatAdminPercent,
} from "@/components/admin/format/admin-format";
import {
  AdminAvatarSquare,
  AdminBarChart,
  AdminCard,
  AdminCardHeader,
  AdminKpiCard,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
  AdminProgress,
} from "@/components/admin/kit/admin-primitives";
import type { AdminActivitySnapshot } from "@/lib/admin/snapshots/activity";
import type { AdminOverviewSnapshot } from "@/lib/admin/snapshots/overview";
import type { AdminServersSnapshot } from "@/lib/admin/snapshots/servers";
import { formatFirstResponse } from "@/components/admin/sections/admin-moderation-queue";
import type { getModerationQueueStats } from "@/lib/moderation/case-queries";

type ModerationSummary = Awaited<ReturnType<typeof getModerationQueueStats>>;

const DATE_OPTIONS = [7, 14, 30, 90] as const;

const PLATFORM_BARS = [
  { label: "WEB", title: "Web" },
  { label: "DESKTOP", title: "Masaüstü" },
  { label: "MOBILE", title: "Mobil" },
  { label: "UNKNOWN", title: "UNKNOWN" },
] as const;

function trendChange(value: number) {
  return {
    label: formatAdminPercent(value, { signed: true }),
    tone: value < 0 ? ("danger" as const) : ("success" as const),
  };
}

export function AdminOverview({
  activity,
  canExportActivity,
  moderation,
  overview,
  servers,
}: {
  activity: AdminActivitySnapshot;
  canExportActivity: boolean;
  /** Absent for roles that cannot open the moderation queue. */
  moderation?: ModerationSummary;
  overview: AdminOverviewSnapshot;
  servers: AdminServersSnapshot;
}) {
  const clientCounts = new Map(activity.breakdowns.clients.map((item) => [item.label, item.count]));
  const platformBars = PLATFORM_BARS.map((platform) => ({
    label: platform.title,
    value: clientCounts.get(platform.label) ?? 0,
  }));
  const hasPlatformData = platformBars.some((bar) => bar.value > 0);
  const serverMemberPeak = Math.max(1, ...servers.topServers.map((server) => server.memberCount));

  return (
    <section className="space-y-5">
      <AdminPageHeader
        actions={
          <>
            {canExportActivity ? (
              <Link
                className="inline-flex items-center gap-2 rounded-[12px] bg-[hsl(var(--primary))] px-4 py-[9px] text-[13px] font-bold text-[hsl(var(--primary-foreground))] shadow-[0_8px_22px_hsl(var(--primary)/0.28)]"
                href={`/api/v1/admin/reports/activity.csv?days=${overview.range.days}`}
              >
                <Download size={16} strokeWidth={2} />
                Rapor İndir
              </Link>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {DATE_OPTIONS.map((days) => (
                <Link
                  className={
                    days === overview.range.days
                      ? "rounded-[12px] bg-[hsl(var(--primary))] px-3 py-[7px] text-[12.5px] font-semibold text-[hsl(var(--primary-foreground))]"
                      : "rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))]"
                  }
                  href={`/admin?days=${days}`}
                  key={days}
                >
                  {days}g
                </Link>
              ))}
            </div>
          </>
        }
        subtitle={`${overview.range.days} günlük platform özeti`}
        title="Genel Bakış"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminKpiCard
          change={trendChange(overview.trends.sessions)}
          description={`${formatAdminInt(overview.totals.onlineUsers)} çevrimiçi`}
          label="Kayıtlı Kullanıcı"
          value={formatAdminNumber(overview.totals.registeredUsers)}
        />
        <AdminKpiCard
          description={`${formatAdminInt(overview.totals.offlineUsers)} çevrimdışı`}
          label="Doğrulanmış Kullanıcı"
          value={formatAdminNumber(overview.totals.verifiedUsers)}
        />
        <AdminKpiCard
          change={trendChange(overview.trends.messages)}
          description={`${formatAdminInt(overview.totals.directMessages)} doğrudan mesaj`}
          label="Toplam Mesaj"
          value={formatAdminNumber(overview.totals.totalMessages)}
        />
        <AdminKpiCard
          description={`${formatAdminInt(servers.serverHealth.activeServers)} son 24 saatte aktif`}
          label="Toplam Sunucu"
          value={formatAdminNumber(servers.serverHealth.totalServers)}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <AdminCard>
          <AdminCardHeader
            subtitle="Seçili dönemde kanal ve doğrudan mesajlar"
            title="Mesaj Etkinliği"
          />
          <AdminBarChart
            bars={overview.usageSeries.map((day) => ({
              label: day.date.slice(5),
              value: day.messageCount,
            }))}
          />
        </AdminCard>

        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <AdminMiniStat
            label="Uygulama süresi"
            tone="primary"
            value={formatAdminDuration(overview.totals.appSeconds)}
          />
          <AdminMiniStat
            label="Canlı ses"
            tone="success"
            value={formatAdminDuration(overview.totals.voiceSeconds)}
          />
          <AdminMiniStat
            label="Yüklenen veri"
            tone="warning"
            value={formatAdminBytes(overview.totals.uploadedBytes)}
          />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminCard>
          <AdminCardHeader
            subtitle="Üye sayısına göre en büyük topluluklar"
            title="En Aktif Sunucular"
          />
          {servers.topServers.length === 0 ? (
            <p className="text-app-muted text-sm">Kayıt yok.</p>
          ) : (
            <div className="space-y-4">
              {servers.topServers.slice(0, 5).map((server) => (
                <AdminProgress
                  key={server.id}
                  label={
                    <>
                      <span className="truncate font-semibold">{server.name}</span>
                      <span className="shrink-0">{formatAdminInt(server.memberCount)} üye</span>
                    </>
                  }
                  value={(server.memberCount / serverMemberPeak) * 100}
                />
              ))}
            </div>
          )}
        </AdminCard>

        <AdminCard>
          <AdminCardHeader subtitle="Son iki dakikada etkin oturumlar" title="Şu Anda Canlı" />
          {activity.activeSessions.length === 0 ? (
            <p className="text-app-muted text-sm">Şu anda etkin oturum yok.</p>
          ) : (
            <div className="space-y-3">
              {activity.activeSessions.slice(0, 5).map((session) => (
                <div className="flex min-w-0 items-center gap-3" key={session.id}>
                  <AdminAvatarSquare
                    avatarUrl={session.user.avatarUrl}
                    name={session.user.displayName}
                    seed={session.user.id}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-app-foreground truncate text-[13px] font-semibold">
                      {session.user.displayName}
                    </p>
                    <p className="text-app-muted truncate text-[12px]">
                      {session.clientType} · {session.os ?? "Bilinmiyor"}
                    </p>
                  </div>
                  <AdminPill tone="success">Canlı</AdminPill>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>

      {moderation ? (
        <AdminCard>
          <AdminCardHeader subtitle="Vaka kuyruğunun özeti" title="Moderasyon Özeti" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMiniStat
              label="Bekleyen"
              tone="danger"
              value={formatAdminInt(moderation.openCount)}
            />
            <AdminMiniStat
              label="İncelemede"
              tone="primary"
              value={formatAdminInt(moderation.inReviewCount)}
            />
            <AdminMiniStat
              label="Çözülen (7g)"
              tone="success"
              value={formatAdminInt(moderation.resolvedThisWeek)}
            />
            <AdminMiniStat
              label="Ort. ilk yanıt"
              tone="neutral"
              value={formatFirstResponse(moderation.averageFirstResponseMs)}
            />
          </div>
          <Link
            className="text-app-muted mt-3 inline-flex text-[12.5px] font-semibold hover:underline"
            href="/admin/moderation"
          >
            Kuyruğa git
          </Link>
        </AdminCard>
      ) : null}

      <AdminCard>
        <AdminCardHeader
          subtitle="Doğrulanmamış ve eski istemci verileri UNKNOWN altında gösterilir."
          title="Platform Dağılımı"
        />
        <AdminBarChart bars={platformBars} height={150} />
        {!hasPlatformData ? <p className="text-app-muted text-sm">Platform verisi yok.</p> : null}
      </AdminCard>
    </section>
  );
}
