import type { ReactNode } from "react";
import Link from "next/link";
import type { AdminRole } from "@wizards/db";
import {
  Activity,
  ArrowLeft,
  Flag,
  Gauge,
  Megaphone,
  Scroll,
  Server,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getVisibleAdminNavGroups,
  type AdminNavItem,
} from "@/components/admin/shell/admin-nav-items";
import { AdminAvatarSquare, AdminPill, AdminPulseDot } from "./admin-primitives";

const NAV_ICONS: Record<AdminNavItem["icon"], LucideIcon> = {
  activity: Activity,
  flag: Flag,
  gauge: Gauge,
  megaphone: Megaphone,
  scroll: Scroll,
  server: Server,
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
  activeKey,
  admin,
  badges = {},
  children,
  topBarActions,
}: {
  activeKey: string;
  admin: AdminShellUser;
  /** Real counts only: a zero badge is not rendered at all. */
  badges?: Partial<Record<string, number>>;
  children: ReactNode;
  topBarActions?: ReactNode;
}) {
  const groups = getVisibleAdminNavGroups(admin.role);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-[hsl(var(--background))]">
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
                  const isActive = item.key === activeKey;

                  return (
                    <li key={item.key}>
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[12px] px-3 py-[9px] text-[13.5px] font-semibold transition-colors",
                          isActive
                            ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                            : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))]",
                        )}
                        href={item.href}
                      >
                        <Icon className="shrink-0" size={17} strokeWidth={2} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {badge && badge > 0 ? <AdminPill tone="danger">{badge}</AdminPill> : null}
                        {item.key === "activity" ? <AdminPulseDot /> : null}
                      </Link>
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
              <p className="text-app-muted truncate text-[11px]">{ADMIN_ROLE_LABELS[admin.role]}</p>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-center gap-3 border-b border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-panel))] px-4 sm:px-6"
          data-testid="admin-topbar"
          style={{ height: 62 }}
        >
          {topBarActions}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-[26px] pb-10 sm:px-7">
          <div className="mx-auto w-full" data-testid="admin-content" style={{ maxWidth: 1360 }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
