import type { ReactNode } from "react";
import Link from "next/link";
import type { AdminRole } from "@wizards/db";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Flag,
  Gauge,
  HeartPulse,
  LifeBuoy,
  Megaphone,
  Mic,
  Package,
  Scroll,
  Server,
  ShieldAlert,
  ToggleRight,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  getVisibleAdminNavGroups,
  type AdminNavItem,
} from "@/components/admin/shell/admin-nav-items";
import {
  AdminAppSurfaceOnly,
  AdminSurfaceRoot,
} from "@/components/admin/shell/admin-console-surface";
import { AdminNavSearch } from "@/components/admin/shell/admin-nav-search";
import { AdminShellNavLink } from "@/components/admin/shell/admin-shell-nav-link";
import { AdminThemePicker } from "@/components/admin/shell/admin-theme-picker";
import { AdminAvatarSquare, AdminPill, AdminPulseDot } from "./admin-primitives";

const NAV_ICONS: Record<AdminNavItem["icon"], LucideIcon> = {
  activity: Activity,
  book: BookOpen,
  chart: BarChart3,
  flag: Flag,
  gauge: Gauge,
  "life-buoy": LifeBuoy,
  pulse: HeartPulse,
  megaphone: Megaphone,
  mic: Mic,
  package: Package,
  scroll: Scroll,
  server: Server,
  shield: ShieldAlert,
  toggle: ToggleRight,
  users: Users,
};

const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  ADMIN: "Yönetici",
  ANALYST: "Analist",
  MODERATOR: "Moderatör",
  OWNER: "Sahip",
  SUPPORT: "Destek",
};

export type AdminShellUser = {
  email: string;
  id: string;
  role: AdminRole;
  username: string;
};

/**
 * 250px rail, 62px top bar, 1360px content — the measurements are the handoff's
 * and every module inherits them from here rather than restating a layout.
 */
export function AdminShell({
  admin,
  badges = {},
  children,
  topBarActions,
}: {
  admin: AdminShellUser;
  /** Real counts only: a zero badge is not rendered at all. */
  badges?: Partial<Record<string, number>>;
  children: ReactNode;
  topBarActions?: ReactNode;
}) {
  const groups = getVisibleAdminNavGroups(admin.role);
  const navSearchItems = groups.flatMap((group) =>
    group.items.map((item) => ({ href: item.href, key: item.key, label: item.label })),
  );

  return (
    <AdminSurfaceRoot className="flex h-dvh min-h-0 w-full overflow-hidden bg-[hsl(var(--background))]">
      <AdminAppSurfaceOnly>
        <aside
          className="hidden shrink-0 flex-col border-r border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-rail))] px-3 pt-4 pb-3 lg:flex"
          data-testid="admin-rail"
          style={{ width: 250 }}
        >
          <Link className="mb-5 flex items-center gap-2.5 px-1" href="/admin">
            <span
              className="flex items-center justify-center rounded-[12px] bg-linear-to-br from-[hsl(var(--primary))] to-[hsl(var(--ambient-2))] text-[16px] font-bold text-white"
              style={{ height: 38, width: 38 }}
            >
              W
            </span>
            <span className="text-app-foreground font-display text-[15px] font-bold">
              Yönetim Konsolu
            </span>
          </Link>

          <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-app-muted px-3 pb-1.5 text-[10.5px] font-bold tracking-[0.09em] uppercase">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const Icon = NAV_ICONS[item.icon];
                    const badge = badges[item.key];

                    return (
                      <li key={item.key}>
                        <AdminShellNavLink href={item.href}>
                          <Icon className="shrink-0" size={17} strokeWidth={2} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {badge && badge > 0 ? <AdminPill tone="danger">{badge}</AdminPill> : null}
                          {item.comingSoon ? <AdminPill>Yakında</AdminPill> : null}
                          {item.live ? <AdminPulseDot /> : null}
                        </AdminShellNavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="mt-4 rounded-[12px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--card))] p-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <AdminAvatarSquare name={admin.username} seed={admin.id} size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-app-foreground truncate text-[12.5px] font-semibold">
                  {admin.username}
                </p>
                <p className="text-app-muted truncate text-[11px]">
                  {ADMIN_ROLE_LABELS[admin.role]}
                </p>
              </div>
            </div>
            <Link
              className="text-app-muted mt-2 flex items-center justify-center gap-1.5 rounded-[10px] border border-[hsl(var(--border)/0.7)] px-2 py-1.5 text-[12px] font-semibold hover:bg-[hsl(var(--surface-soft))]"
              href="/channels"
            >
              <ArrowLeft size={14} strokeWidth={2} />
              Whispr&apos;a Dön
            </Link>
          </div>
        </aside>
      </AdminAppSurfaceOnly>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-center gap-3 border-b border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-panel))] px-4 sm:px-6"
          data-testid="admin-topbar"
          style={{ height: 62 }}
        >
          <AdminNavSearch items={navSearchItems} />
          <div className="ml-auto flex items-center gap-2">
            <AdminThemePicker />
            {topBarActions}
          </div>
        </header>

        {/* The console window trades the outer padding for rows: same page,
            denser reading, no second layout to keep in sync. */}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-[26px] pb-10 sm:px-7 [[data-admin-surface=console]_&]:pt-4">
          <div className="mx-auto w-full" data-testid="admin-content" style={{ maxWidth: 1360 }}>
            {children}
          </div>
        </main>
      </div>
    </AdminSurfaceRoot>
  );
}
