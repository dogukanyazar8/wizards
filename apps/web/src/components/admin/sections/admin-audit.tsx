import React from "react";
import Link from "next/link";
import {
  AdminAvatarSquare,
  AdminCard,
  AdminGridTable,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import type { AdminAuditSnapshot } from "@/lib/admin/snapshots/audit";

export type AdminAuditFilter = "all" | "security" | "system" | "user";

const AUDIT_FILTERS: Array<{ id: AdminAuditFilter; label: string }> = [
  { id: "all", label: "Tümü" },
  { id: "user", label: "Kullanıcı" },
  { id: "security", label: "Güvenlik" },
  { id: "system", label: "Sistem" },
];

function getAuditCategory(action: string): Exclude<AdminAuditFilter, "all"> {
  if (action.startsWith("user.")) {
    return "user";
  }

  if (action.startsWith("system.")) {
    return "system";
  }

  return "security";
}

export function filterAdminAuditLogs(
  logs: AdminAuditSnapshot["recentAuditLogs"],
  filter: AdminAuditFilter,
) {
  return filter === "all" ? logs : logs.filter((log) => getAuditCategory(log.action) === filter);
}

export function formatAdminAuditIpHash(ipHash: string | null) {
  return ipHash ? `${ipHash.slice(0, 10)}…` : "—";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminAudit({
  filter,
  snapshot,
}: {
  filter: AdminAuditFilter;
  snapshot: AdminAuditSnapshot;
}) {
  const logs = filterAdminAuditLogs(snapshot.recentAuditLogs, filter);

  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Yönetim eylemleri ve güvenlik kayıtları" title="Denetim Kaydı" />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Denetim filtresi">
        {AUDIT_FILTERS.map((item) => {
          const selected = item.id === filter;

          return (
            <Link
              aria-selected={selected}
              className={
                selected
                  ? "rounded-[12px] bg-[hsl(var(--primary))] px-3 py-[7px] text-[12.5px] font-semibold text-[hsl(var(--primary-foreground))]"
                  : "rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold text-app-muted hover:bg-[var(--surface-hover)]"
              }
              href={item.id === "all" ? "/admin/audit" : `/admin/audit?filter=${item.id}`}
              key={item.id}
              role="tab"
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <AdminCard>
        <AdminGridTable
          columns="130px 1.5fr 1.7fr 1.4fr 120px"
          emptyLabel="Bu filtrede denetim kaydı yok."
          headers={["Tarih", "Aktör", "Eylem", "Hedef", "IP"]}
          rows={logs.map((log) => ({
            cells: [
              <span className="text-app-muted text-[11.5px]" key="date">
                {formatDateTime(log.createdAt)}
              </span>,
              log.actor ? (
                <div className="flex min-w-0 items-center gap-2" key="actor">
                  <AdminAvatarSquare name={log.actor.displayName} seed={log.actor.id} size={28} />
                  <div className="min-w-0">
                    <p className="text-app-foreground truncate text-[12px] font-semibold">
                      {log.actor.displayName}
                    </p>
                    <p className="text-app-muted truncate text-[11px]">@{log.actor.username}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2" key="actor">
                  <AdminAvatarSquare name="system" seed="system" size={28} variant="system" />
                  <span className="text-app-muted text-[12px] font-semibold">system</span>
                </div>
              ),
              <AdminPill
                key="action"
                tone={getAuditCategory(log.action) === "security" ? "warning" : "primary"}
              >
                {log.action}
              </AdminPill>,
              <div className="min-w-0" key="target">
                <p className="text-app-foreground truncate text-[12px] font-semibold">
                  {log.targetType ?? "Sistem"}
                </p>
                <p className="text-app-muted truncate text-[11px]">{log.targetId ?? "—"}</p>
              </div>,
              <span className="text-app-muted font-mono text-[11.5px]" key="ip">
                {formatAdminAuditIpHash(log.ipHash)}
              </span>,
            ],
            id: log.id,
          }))}
        />
      </AdminCard>
    </section>
  );
}
