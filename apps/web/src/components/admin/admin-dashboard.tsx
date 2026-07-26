import Link from "next/link";
import type React from "react";
import {
  Activity,
  BellRing,
  Camera,
  Clock3,
  Database,
  Download,
  FileUp,
  Gauge,
  HardDrive,
  Hash,
  LayoutDashboard,
  MessageSquareHeart,
  MessageSquareText,
  MonitorSmartphone,
  Radio,
  Server,
  ShieldCheck,
  Signal,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { AdminFeedbackPanel } from "@/components/admin/admin-feedback-panel";
import { AdminManagementPanel } from "@/components/admin/admin-management-panel";
import { NotificationComposer } from "@/components/admin/notification-composer";
import type { AdminAccessUser } from "@/lib/admin/access";
import type { AdminDashboardSnapshot } from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";

type AdminDashboardProps = {
  admin: AdminAccessUser;
  dashboard: AdminDashboardSnapshot;
};

type MetricCardProps = {
  detail: string;
  icon: typeof LayoutDashboard;
  label: string;
  tone?: "accent" | "danger" | "success" | "warning";
  trend?: number;
  value: string;
};

const NAV_ITEMS = [
  { href: "#overview", icon: LayoutDashboard, label: "Overview" },
  { href: "#users", icon: Users, label: "Users" },
  { href: "#activity", icon: Activity, label: "Activity" },
  { href: "#servers", icon: Server, label: "Servers" },
  { href: "#management", icon: ShieldCheck, label: "Operations" },
  { href: "#feedback", icon: MessageSquareHeart, label: "Feedback" },
  { href: "#notifications", icon: BellRing, label: "Notifications" },
  { href: "#audit", icon: ShieldCheck, label: "Audit" },
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${formatNumber(hours)}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function trendLabel(trend: number | undefined) {
  if (trend === undefined) {
    return null;
  }

  if (trend === 0) {
    return "0%";
  }

  return `${trend > 0 ? "+" : ""}${trend}%`;
}

function statusTone(status: string) {
  if (status === "ONLINE") {
    return "bg-[hsl(var(--success)/0.14)] text-app-success";
  }

  if (status === "IDLE") {
    return "bg-[hsl(var(--warning)/0.14)] text-app-warning";
  }

  if (status === "DND") {
    return "bg-[hsl(var(--danger)/0.14)] text-app-danger";
  }

  return "app-panel-soft text-app-muted";
}

function campaignTone(status: string) {
  if (status === "SENT") {
    return "bg-[hsl(var(--success)/0.14)] text-app-success";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "bg-[hsl(var(--danger)/0.14)] text-app-danger";
  }

  if (status === "SENDING") {
    return "bg-[hsl(var(--warning)/0.14)] text-app-warning";
  }

  return "app-panel-soft text-app-muted";
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border border-[hsl(var(--border)/0.58)] px-2.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

function MetricCard({ detail, icon: Icon, label, tone = "accent", trend, value }: MetricCardProps) {
  const toneClass =
    tone === "success"
      ? "text-app-success bg-[hsl(var(--success)/0.12)]"
      : tone === "warning"
        ? "text-app-warning bg-[hsl(var(--warning)/0.12)]"
        : tone === "danger"
          ? "text-app-danger bg-[hsl(var(--danger)/0.12)]"
          : "text-app-accent bg-[hsl(var(--primary)/0.12)]";

  return (
    <article className="app-panel min-w-0 rounded-[24px] border p-4">
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            toneClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        {trendLabel(trend) ? (
          <Pill
            className={cn(
              trend && trend > 0
                ? "border-[hsl(var(--success)/0.22)] text-app-success"
                : trend && trend < 0
                  ? "border-[hsl(var(--danger)/0.24)] text-app-danger"
                  : "text-app-muted",
            )}
          >
            {trendLabel(trend)}
          </Pill>
        ) : null}
      </div>
      <p className="text-app-muted mt-4 text-sm">{label}</p>
      <p className="text-app-foreground mt-2 text-2xl font-semibold">{value}</p>
      <p className="text-app-soft mt-1 text-xs">{detail}</p>
    </article>
  );
}

function SectionHeader({
  action,
  icon: Icon,
  subtitle,
  title,
}: {
  action?: React.ReactNode;
  icon: typeof LayoutDashboard;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="app-panel-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[hsl(var(--primary))]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-app-foreground text-xl font-semibold">{title}</h2>
          <p className="text-app-muted mt-1 text-sm leading-6">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function BreakdownList({
  items,
  title,
}: {
  items: Array<{ count: number; label: string }>;
  title: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <section className="app-panel min-w-0 rounded-[24px] border p-4">
      <h3 className="text-app-foreground text-sm font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-app-muted text-sm">No data yet.</p>
        ) : (
          items.slice(0, 6).map((item) => (
            <div className="min-w-0" key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-app-muted">{item.label}</span>
                <span className="shrink-0 text-app-foreground">{formatNumber(item.count)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--surface-soft)/0.72)]">
                <span
                  className="block h-full rounded-full bg-[hsl(var(--primary)/0.7)]"
                  style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function UsageChart({ series }: { series: AdminDashboardSnapshot["usageSeries"] }) {
  const max = Math.max(
    1,
    ...series.map((day) => day.messageCount + Math.round(day.voiceSeconds / 60)),
  );

  return (
    <section className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6" id="activity">
      <SectionHeader
        icon={Signal}
        subtitle="Messages and voice minutes collected from the selected date window."
        title="Activity Trend"
      />
      <div className="mt-6 flex h-56 items-end gap-2 overflow-x-auto pb-2">
        {series.map((day) => {
          const value = day.messageCount + Math.round(day.voiceSeconds / 60);
          const height = Math.max(8, (value / max) * 100);

          return (
            <div
              className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2"
              key={day.date}
            >
              <div className="flex h-40 w-full items-end justify-center rounded-2xl bg-[hsl(var(--surface-soft)/0.35)] px-1">
                <div
                  aria-label={`${formatShortDate(day.date)} activity ${value}`}
                  className="w-full rounded-xl bg-[linear-gradient(180deg,hsl(var(--primary)),hsl(var(--ambient-2)))]"
                  style={{ height: `${height}%` }}
                  title={`${formatNumber(day.messageCount)} messages, ${formatDuration(day.voiceSeconds)} voice`}
                />
              </div>
              <span className="text-app-soft text-[11px]">{formatShortDate(day.date)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Sidebar({ admin }: { admin: AdminAccessUser }) {
  return (
    <aside className="app-panel h-fit rounded-[28px] border p-4 lg:sticky lg:top-6">
      <Link
        className="app-panel-soft inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold text-app-foreground transition hover:opacity-90"
        href="/channels"
      >
        <Radio className="h-4 w-4" />
        Back to Whispr
      </Link>
      <div className="mt-6">
        <p className="text-app-muted text-sm">Admin Console</p>
        <h1 className="text-app-foreground mt-2 text-3xl font-semibold">Command Center</h1>
        <div className="mt-4 flex items-center gap-3">
          <Avatar alt={admin.username} className="h-10 w-10" fallback={admin.username} src={null} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-app-foreground">{admin.username}</p>
            <Pill className="mt-1 border-[hsl(var(--primary)/0.24)] text-app-accent">
              {admin.role}
            </Pill>
          </div>
        </div>
      </div>
      <nav className="mt-6 grid gap-2">
        {NAV_ITEMS.map((item) => (
          <a
            className="app-panel-soft flex min-h-11 items-center gap-3 rounded-2xl border px-3 text-sm font-medium text-app-muted transition hover:text-app-foreground"
            href={item.href}
            key={item.href}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

export function AdminDashboard({ admin, dashboard }: AdminDashboardProps) {
  const canSendCampaigns = admin.role === "OWNER" || admin.role === "ADMIN";
  const canModerateUsers =
    admin.role === "OWNER" || admin.role === "ADMIN" || admin.role === "MODERATOR";
  // Mirrors the roles the feedback API accepts for writes. Hiding the controls
  // is cosmetic — the route is what actually refuses a read-only role.
  const canManageFeedback =
    admin.role === "OWNER" || admin.role === "ADMIN" || admin.role === "SUPPORT";
  const totalPeriodMessages = dashboard.usageSeries.reduce(
    (total, day) => total + day.messageCount,
    0,
  );

  return (
    <div className="mx-auto grid w-full max-w-[1720px] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Sidebar admin={admin} />

      <div className="min-w-0 space-y-5">
        <section
          className="app-panel min-w-0 overflow-hidden rounded-[28px] border p-5 sm:p-6"
          id="overview"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-app-muted text-sm">
                Generated {formatDateTime(dashboard.generatedAt)}
              </p>
              <h2 className="text-app-foreground mt-2 text-3xl font-semibold">Platform Overview</h2>
              <p className="text-app-muted mt-2 max-w-3xl text-sm leading-6">
                {formatDateTime(dashboard.range.start)} to {formatDateTime(dashboard.range.end)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="app-panel-soft inline-flex min-h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold text-app-foreground transition hover:opacity-90"
                download
                href={`/api/v1/admin/reports/activity.csv?days=${dashboard.range.days}`}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Link>
              {[7, 14, 30, 90].map((days) => (
                <Link
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold transition",
                    dashboard.range.days === days
                      ? "border-[hsl(var(--primary)/0.36)] bg-[hsl(var(--primary)/0.14)] text-app-foreground"
                      : "app-panel-soft text-app-muted hover:text-app-foreground",
                  )}
                  href={`/admin?days=${days}`}
                  key={days}
                >
                  {days}d
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              detail={`${formatNumber(dashboard.totals.verifiedUsers)} verified, ${formatNumber(dashboard.totals.offlineUsers)} offline`}
              icon={Users}
              label="Users"
              tone="success"
              value={formatNumber(dashboard.totals.registeredUsers)}
            />
            <MetricCard
              detail={`${formatNumber(dashboard.totals.onlineUsers)} currently active`}
              icon={Gauge}
              label="Online"
              tone="accent"
              value={formatNumber(dashboard.totals.onlineUsers)}
            />
            <MetricCard
              detail={`${formatNumber(totalPeriodMessages)} in selected period`}
              icon={MessageSquareText}
              label="Messages"
              trend={dashboard.trends.messages}
              value={formatNumber(dashboard.totals.totalMessages)}
            />
            <MetricCard
              detail={`${formatNumber(dashboard.serverHealth.activeServers)} active in 24h`}
              icon={Server}
              label="Servers"
              tone="warning"
              value={formatNumber(dashboard.serverHealth.totalServers)}
            />
            <MetricCard
              detail={`${formatNumber(dashboard.totals.sessionCount)} sessions`}
              icon={Clock3}
              label="App Time"
              trend={dashboard.trends.appSeconds}
              value={formatDuration(dashboard.totals.appSeconds)}
            />
            <MetricCard
              detail={`${formatNumber(dashboard.activeMedia.voice)} live voice sessions`}
              icon={Video}
              label="Voice"
              trend={dashboard.trends.voiceSeconds}
              value={formatDuration(dashboard.totals.voiceSeconds)}
            />
            <MetricCard
              detail={`${formatDuration(dashboard.totals.screenShareSeconds)} screen sharing`}
              icon={Camera}
              label="Camera"
              value={formatDuration(dashboard.totals.cameraSeconds)}
            />
            <MetricCard
              detail={`${formatNumber(dashboard.totals.attachmentCount)} total attachments`}
              icon={FileUp}
              label="Uploads"
              trend={dashboard.trends.files}
              value={formatBytes(dashboard.totals.uploadedBytes)}
            />
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
          <UsageChart series={dashboard.usageSeries} />
          <section className="grid gap-4">
            <BreakdownList items={dashboard.breakdowns.clients} title="Client Mix" />
            <BreakdownList items={dashboard.breakdowns.devices} title="Device Types" />
          </section>
        </div>

        <section className="grid gap-4 xl:grid-cols-4">
          <BreakdownList items={dashboard.breakdowns.countries} title="Countries" />
          <BreakdownList items={dashboard.breakdowns.operatingSystems} title="Operating Systems" />
          <BreakdownList items={dashboard.breakdowns.browsers} title="Browsers" />
          <BreakdownList items={dashboard.breakdowns.statuses} title="Presence" />
        </section>

        <section
          className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]"
          id="users"
        >
          <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
            <SectionHeader
              icon={Sparkles}
              subtitle="Highest engagement by app time, voice, screen share, messages and files."
              title="Most Active Users"
            />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-left text-sm">
                <thead className="text-app-soft">
                  <tr>
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="px-3 py-2 font-medium">App time</th>
                    <th className="px-3 py-2 font-medium">Voice</th>
                    <th className="px-3 py-2 font-medium">Messages</th>
                    <th className="px-3 py-2 font-medium">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.topUsers.map((user) => (
                    <tr className="app-panel-soft rounded-2xl" key={user.id}>
                      <td className="rounded-l-2xl border-y border-l border-[hsl(var(--border)/0.58)] px-3 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            alt={user.displayName}
                            className="h-9 w-9"
                            fallback={user.username}
                            src={user.avatarUrl}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-app-foreground">
                              {user.displayName}
                            </p>
                            <p className="truncate text-xs text-app-soft">@{user.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="border-y border-[hsl(var(--border)/0.58)] px-3 py-3 text-app-muted">
                        {formatDuration(user.metrics.appSeconds)}
                      </td>
                      <td className="border-y border-[hsl(var(--border)/0.58)] px-3 py-3 text-app-muted">
                        {formatDuration(user.metrics.voiceSeconds)}
                      </td>
                      <td className="border-y border-[hsl(var(--border)/0.58)] px-3 py-3 text-app-muted">
                        {formatNumber(user.metrics.messageCount + user.metrics.dmMessageCount)}
                      </td>
                      <td className="rounded-r-2xl border-y border-r border-[hsl(var(--border)/0.58)] px-3 py-3 text-app-muted">
                        {formatNumber(user.metrics.fileUploadCount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
            <SectionHeader
              icon={MonitorSmartphone}
              subtitle="Live web, desktop and mobile sessions."
              title="Active Sessions"
            />
            <div className="mt-5 space-y-3">
              {dashboard.activeSessions.length === 0 ? (
                <p className="text-app-muted text-sm">No active sessions.</p>
              ) : (
                dashboard.activeSessions.map((session) => (
                  <div className="app-panel-soft rounded-2xl border p-3" key={session.id}>
                    <div className="flex items-center gap-3">
                      <Avatar
                        alt={session.user.displayName}
                        className="h-9 w-9"
                        fallback={session.user.username}
                        src={session.user.avatarUrl}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-app-foreground">
                          {session.user.displayName}
                        </p>
                        <p className="truncate text-xs text-app-soft">
                          {session.clientType} / {session.os ?? "Unknown"} /{" "}
                          {session.browser ?? "Unknown"}
                        </p>
                      </div>
                      <Pill className={statusTone(session.user.status)}>{session.user.status}</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-app-muted">
                      <Pill>{session.countryCode ?? "Unknown country"}</Pill>
                      <Pill>{formatDuration(session.durationSeconds)}</Pill>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2" id="servers">
          <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
            <SectionHeader
              icon={HardDrive}
              subtitle="Servers ordered by member count."
              title="Top Servers"
            />
            <div className="mt-5 space-y-3">
              {dashboard.topServers.map((server) => (
                <div className="app-panel-soft rounded-2xl border p-4" key={server.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-app-foreground">{server.name}</p>
                      <p className="text-app-soft mt-1 text-xs">
                        {formatNumber(server.memberCount)} members /{" "}
                        {formatNumber(server.channelCount)} channels
                      </p>
                    </div>
                    <Pill>{server.isPublic ? "Public" : "Private"}</Pill>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <Pill>{formatNumber(server.messageCount)} messages</Pill>
                    <Pill>{formatNumber(server.voiceChannelCount)} voice</Pill>
                    <Pill>{formatDateTime(server.createdAt)}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
            <SectionHeader
              icon={Hash}
              subtitle="Text and voice channels with the most activity."
              title="Channels"
            />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-app-soft">
                  <tr>
                    <th className="pb-3 font-medium">Channel</th>
                    <th className="pb-3 font-medium">Server</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 text-right font-medium">Messages</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border)/0.48)]">
                  {dashboard.topChannels.map((channel) => (
                    <tr key={channel.id}>
                      <td className="py-3 pr-3 text-app-foreground">{channel.name}</td>
                      <td className="py-3 pr-3 text-app-muted">
                        {channel.server?.name ?? "No server"}
                      </td>
                      <td className="py-3 pr-3">
                        <Pill>{channel.type}</Pill>
                      </td>
                      <td className="py-3 text-right text-app-muted">
                        {formatNumber(channel.messageCount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <AdminManagementPanel canModerate={canModerateUsers} />

        <AdminFeedbackPanel canManage={canManageFeedback} />

        <section
          className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]"
          id="notifications"
        >
          <NotificationComposer canSend={canSendCampaigns} />

          <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
            <SectionHeader
              icon={BellRing}
              subtitle="Recent broadcast campaigns and delivery status."
              title="Campaigns"
            />
            <div className="mt-5 space-y-3">
              {dashboard.campaigns.length === 0 ? (
                <p className="text-app-muted text-sm">No campaigns yet.</p>
              ) : (
                dashboard.campaigns.map((campaign) => (
                  <div className="app-panel-soft rounded-2xl border p-4" key={campaign.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-app-foreground">
                          {campaign.title}
                        </p>
                        <p className="text-app-muted mt-1 line-clamp-2 text-sm">{campaign.body}</p>
                      </div>
                      <Pill className={campaignTone(campaign.status)}>{campaign.status}</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-app-muted">
                      <Pill>{campaign.segment}</Pill>
                      <Pill>{formatNumber(campaign.sentCount)} sent</Pill>
                      {campaign.failedCount > 0 ? (
                        <Pill>{formatNumber(campaign.failedCount)} failed</Pill>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2" id="audit">
          <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
            <SectionHeader
              icon={Database}
              subtitle="Latest channel messages for moderation awareness."
              title="Recent Channel Messages"
            />
            <div className="mt-5 space-y-3">
              {dashboard.recentMessages.map((message) => (
                <div className="app-panel-soft rounded-2xl border p-4" key={message.id}>
                  <div className="flex items-center gap-3">
                    <Avatar
                      alt={message.author.displayName}
                      className="h-9 w-9"
                      fallback={message.author.username}
                      src={message.author.avatarUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-app-foreground">
                        {message.author.displayName}
                      </p>
                      <p className="truncate text-xs text-app-soft">
                        {message.server?.name ?? "Direct"} / #{message.channel.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-app-soft">
                      {formatDateTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="text-app-muted mt-3 line-clamp-2 text-sm leading-6">
                    {message.content}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
            <SectionHeader
              icon={ShieldCheck}
              subtitle="Administrative actions recorded by the platform."
              title="Audit Trail"
            />
            <div className="mt-5 space-y-3">
              {dashboard.recentAuditLogs.length === 0 ? (
                <p className="text-app-muted text-sm">No audit events yet.</p>
              ) : (
                dashboard.recentAuditLogs.map((log) => (
                  <div className="app-panel-soft rounded-2xl border p-4" key={log.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-app-foreground">{log.action}</p>
                      <span className="text-xs text-app-soft">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <p className="text-app-muted mt-2 text-sm">
                      {log.actor?.displayName ?? "System"} / {log.targetType ?? "Platform"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
