"use client";

import { Crown, ShieldCheck, Users } from "lucide-react";
import type { WorkspaceMember, WorkspaceServerDetail } from "@wizards/types";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

type ServerMemberPanelProps = {
  detail: WorkspaceServerDetail;
};

const statusOrder: Record<WorkspaceMember["status"], number> = {
  ONLINE: 0,
  IDLE: 1,
  DND: 2,
  OFFLINE: 3,
};

function getStatusDotClass(status: WorkspaceMember["status"]) {
  if (status === "ONLINE") {
    return "bg-[hsl(var(--success))] shadow-[0_0_0_3px_hsl(var(--success)/0.12)]";
  }

  if (status === "IDLE") {
    return "bg-amber-400 shadow-[0_0_0_3px_hsl(var(--warning)/0.12)]";
  }

  if (status === "DND") {
    return "bg-[hsl(var(--danger))] shadow-[0_0_0_3px_hsl(var(--danger)/0.12)]";
  }

  return "bg-slate-400 shadow-[0_0_0_3px_hsl(var(--muted)/0.18)]";
}

function getMemberRole(member: WorkspaceMember) {
  if (member.accessLevel === "OWNER") {
    return "owner";
  }

  if (member.accessLevel === "ADMIN") {
    return "admin";
  }

  return "member";
}

function sortMembers(locale: string, members: WorkspaceMember[]) {
  return [...members].sort((left, right) => {
    const statusDelta = statusOrder[left.status] - statusOrder[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return left.displayName.localeCompare(right.displayName, locale, {
      sensitivity: "base",
    });
  });
}

function MemberRow({ member }: { member: WorkspaceMember }) {
  const { t } = useI18n();
  const role = getMemberRole(member);

  return (
    <div className="group/member flex min-w-0 items-center gap-3 rounded-[22px] border border-transparent px-2.5 py-2 transition hover:border-[hsl(var(--border)/0.58)] hover:bg-[hsl(var(--surface-soft)/0.36)]">
      <div className="relative shrink-0">
        <Avatar
          alt={member.displayName}
          className="h-10 w-10"
          fallback={member.displayName}
          src={member.avatarUrl}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[hsl(var(--surface-card))]",
            getStatusDotClass(member.status),
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-app-foreground">
            {member.displayName}
          </p>
          {role === "owner" ? (
            <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : role === "admin" ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--primary))]" />
          ) : null}
        </div>
        <p className="truncate text-xs font-medium text-app-soft">
          @{member.username}
          {member.customStatus ? ` · ${member.customStatus}` : ""}
        </p>
      </div>

      <span className="hidden rounded-full border border-[hsl(var(--border)/0.56)] bg-[hsl(var(--surface-card)/0.74)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-soft group-hover/member:inline-flex">
        {t(`shell.memberPanel.${role}`)}
      </span>
    </div>
  );
}

function MemberSection({
  emptyLabel,
  members,
  title,
}: {
  emptyLabel: string;
  members: WorkspaceMember[];
  title: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-soft">
          {title}
        </h3>
        <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.4)] px-2 py-0.5 text-[10px] font-semibold text-app-muted">
          {members.length}
        </span>
      </div>

      {members.length > 0 ? (
        <div className="space-y-1">
          {members.map((member) => (
            <MemberRow key={member.userId} member={member} />
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-soft)/0.22)] px-4 py-5 text-center text-xs font-medium text-app-muted">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

export function ServerMemberPanel({ detail }: ServerMemberPanelProps) {
  const { locale, t } = useI18n();
  const members = sortMembers(locale, detail.members);
  const onlineMembers = members.filter((member) => member.status !== "OFFLINE");
  const offlineMembers = members.filter((member) => member.status === "OFFLINE");

  return (
    <aside className="hidden h-full w-[312px] shrink-0 border-l border-[hsl(var(--border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.74),hsl(var(--surface-soft)/0.34))] p-4 backdrop-blur-xl xl:flex xl:flex-col">
      <div className="rounded-[30px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.66)] p-4 shadow-[0_22px_54px_hsl(var(--shadow-color)/0.08)]">
        <div className="flex items-center gap-3">
          <div className="app-panel-soft flex h-12 w-12 items-center justify-center rounded-[20px] border">
            <Users className="h-5 w-5 text-app-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-app-foreground">
              {detail.server.name}
            </p>
            <p className="mt-1 text-xs font-medium text-app-muted">
              {t("shell.memberPanel.subtitle", {
                count: detail.server.memberCount,
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <MemberSection
          emptyLabel={t("shell.memberPanel.emptyOnline")}
          members={onlineMembers}
          title={t("shell.memberPanel.online")}
        />
        <MemberSection
          emptyLabel={t("shell.memberPanel.emptyOffline")}
          members={offlineMembers}
          title={t("shell.memberPanel.offline")}
        />
      </div>
    </aside>
  );
}
