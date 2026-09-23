import { AdminAnalytics } from "@/components/admin/sections/admin-analytics";
import type { FunnelPlatform } from "@/lib/admin/analytics/funnel";
import { requireAdminModule } from "@/lib/admin/module-access";
import { loadAdminAnalyticsSnapshot } from "@/lib/admin/snapshots/analytics";
import { normalizeDashboardDays } from "@/lib/admin/snapshots/shared";

type AdminAnalyticsPageProps = {
  searchParams?: Promise<{ days?: string; platform?: string }>;
};

const PLATFORMS = new Set<FunnelPlatform>(["ALL", "WEB", "DESKTOP", "MOBILE", "UNKNOWN"]);

function normalizePlatform(value: string | undefined): FunnelPlatform {
  return value && PLATFORMS.has(value as FunnelPlatform) ? (value as FunnelPlatform) : "ALL";
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const params = await searchParams;
  const days = normalizeDashboardDays(params?.days);
  const platform = normalizePlatform(params?.platform);
  await requireAdminModule("dashboard.read");
  const [snapshot] = await Promise.all([
    loadAdminAnalyticsSnapshot({ days, now: new Date() }, platform),
  ]);

  return <AdminAnalytics snapshot={snapshot} />;
}
