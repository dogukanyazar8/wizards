"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Crown,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import type {
  WorkspaceMember,
  WorkspacePermissionKey,
  WorkspaceRole,
  WorkspaceServerDetail,
} from "@wizards/types";
import { useShallow } from "zustand/react/shallow";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type ServerMemberPanelProps = {
  detail: WorkspaceServerDetail;
  onClose?: () => void;
  variant?: "sidebar" | "drawer";
};

type MemberGroupKind = "owner" | "admin" | "role" | "member" | "offline" | "online";

type MemberGroup = {
  color?: number;
  key: string;
  kind: MemberGroupKind;
  members: WorkspaceMember[];
  preview: string;
  rank: number;
  title: string;
};

type MemberRoleDisplay = {
  color?: number;
  kind: MemberGroupKind;
  label: string;
};

const statusOrder: Record<WorkspaceMember["status"], number> = {
  ONLINE: 0,
  IDLE: 1,
  DND: 2,
  OFFLINE: 3,
};

const permissionWeight: Partial<Record<WorkspacePermissionKey, number>> = {
  ADMINISTRATOR: 10_000,
  MANAGE_SERVER: 9_000,
  MANAGE_ROLES: 8_800,
  MANAGE_CHANNELS: 8_200,
  VIEW_AUDIT_LOG: 7_800,
  BAN_MEMBERS: 7_400,
  KICK_MEMBERS: 7_200,
  TIMEOUT_MEMBERS: 7_000,
  MUTE_MEMBERS: 6_600,
  DEAFEN_MEMBERS: 6_500,
  MOVE_MEMBERS: 6_400,
  CLEAR_CHANNEL_HISTORY: 6_200,
  MANAGE_MESSAGES: 6_000,
  MANAGE_INVITES: 5_600,
  STREAM: 4_400,
  USE_VIDEO: 4_200,
  CONNECT_VOICE: 4_000,
  SPEAK: 3_800,
  ATTACH_FILES: 3_200,
  USE_GIFS: 3_000,
  SEND_MESSAGES: 2_800,
  ADD_REACTIONS: 2_400,
  VIEW_CHANNEL: 2_000,
};

const OWNER_GROUP_RANK = 20_000_000;
const ADMIN_GROUP_RANK = 10_000_000;
const MEMBER_GROUP_RANK = 0;
const OFFLINE_GROUP_RANK = -1;

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

function getRoleColorStyle(color: number | undefined) {
  if (!color) {
    return undefined;
  }

  return {
    backgroundColor: `#${color.toString(16).padStart(6, "0")}`,
  };
}

function getRoleRank(role: WorkspaceRole) {
  const strongestPermission = role.permissions.reduce(
    (strongest, permission) => Math.max(strongest, permissionWeight[permission] ?? 0),
    0,
  );

  return strongestPermission * 1_000 + role.position;
}

function getRoleKind(role: WorkspaceRole): MemberGroupKind {
  if (
    role.permissions.includes("ADMINISTRATOR") ||
    role.permissions.includes("MANAGE_SERVER") ||
    role.permissions.includes("MANAGE_ROLES")
  ) {
    return "admin";
  }

  return "role";
}

function getGroupPreview(title: string, locale: string) {
  return title.replace(/^@/, "").trim().slice(0, 2).toLocaleUpperCase(locale);
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

function pickHighestRole(member: WorkspaceMember, roleById: Map<string, WorkspaceRole>) {
  return member.roles
    .map((roleBadge) => roleById.get(roleBadge.id))
    .filter((role): role is WorkspaceRole => role != null && !role.isDefault)
    .sort((left, right) => getRoleRank(right) - getRoleRank(left))[0];
}

function getRoleDisplay(
  member: WorkspaceMember,
  roleById: Map<string, WorkspaceRole>,
  labels: {
    admin: string;
    member: string;
    owner: string;
  },
): MemberRoleDisplay {
  if (member.accessLevel === "OWNER") {
    return {
      kind: "owner",
      label: labels.owner,
    };
  }

  const highestRole = pickHighestRole(member, roleById);
  if (highestRole) {
    return {
      color: highestRole.color,
      kind: getRoleKind(highestRole),
      label: highestRole.name,
    };
  }

  if (member.accessLevel === "ADMIN") {
    return {
      kind: "admin",
      label: labels.admin,
    };
  }

  return {
    kind: "member",
    label: labels.member,
  };
}

function buildMemberGroups({
  detail,
  locale,
  labels,
}: {
  detail: WorkspaceServerDetail;
  labels: {
    admin: string;
    member: string;
    offline: string;
    online: string;
    owner: string;
  };
  locale: string;
}) {
  const roleById = new Map(detail.roles.map((role) => [role.id, role]));
  const groups = new Map<string, MemberGroup>();
  const offlineGroup: MemberGroup = {
    key: "offline",
    kind: "offline",
    members: [],
    preview: getGroupPreview(labels.offline, locale),
    rank: OFFLINE_GROUP_RANK,
    title: labels.offline,
  };

  const ensureGroup = (group: Omit<MemberGroup, "members">) => {
    const existingGroup = groups.get(group.key);
    if (existingGroup) {
      return existingGroup;
    }

    const nextGroup: MemberGroup = {
      ...group,
      members: [],
    };
    groups.set(group.key, nextGroup);
    return nextGroup;
  };

  for (const member of detail.members) {
    if (member.status === "OFFLINE") {
      offlineGroup.members.push(member);
      continue;
    }

    if (member.accessLevel === "OWNER") {
      ensureGroup({
        key: "owner",
        kind: "owner",
        preview: getGroupPreview(labels.owner, locale),
        rank: OWNER_GROUP_RANK,
        title: labels.owner,
      }).members.push(member);
      continue;
    }

    const highestRole = pickHighestRole(member, roleById);
    if (highestRole) {
      ensureGroup({
        color: highestRole.color,
        key: `role:${highestRole.id}`,
        kind: getRoleKind(highestRole),
        preview: getGroupPreview(highestRole.name, locale),
        rank: getRoleRank(highestRole),
        title: highestRole.name,
      }).members.push(member);
      continue;
    }

    if (member.accessLevel === "ADMIN") {
      ensureGroup({
        key: "admin",
        kind: "admin",
        preview: getGroupPreview(labels.admin, locale),
        rank: ADMIN_GROUP_RANK,
        title: labels.admin,
      }).members.push(member);
      continue;
    }

    ensureGroup({
      key: "member",
      kind: "member",
      preview: getGroupPreview(labels.member, locale),
      rank: MEMBER_GROUP_RANK,
      title: labels.member,
    }).members.push(member);
  }

  const onlineGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      members: sortMembers(locale, group.members),
    }))
    .sort(
      (left, right) =>
        right.rank - left.rank ||
        left.title.localeCompare(right.title, locale, { sensitivity: "base" }),
    );

  return {
    offlineGroup: {
      ...offlineGroup,
      members: sortMembers(locale, offlineGroup.members),
    },
    onlineGroups,
  };
}

function RoleGlyph({ group }: { group: Pick<MemberGroup, "color" | "kind"> }) {
  if (group.kind === "owner") {
    return <Crown className="h-3.5 w-3.5 text-amber-500" />;
  }

  if (group.kind === "admin") {
    return <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />;
  }

  if (group.color) {
    return (
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full shadow-[0_0_0_3px_hsl(var(--surface-soft)/0.58)]"
        style={getRoleColorStyle(group.color)}
      />
    );
  }

  return <Users className="h-3.5 w-3.5 text-app-muted" />;
}

function MemberRow({
  collapsed,
  member,
  role,
}: {
  collapsed: boolean;
  member: WorkspaceMember;
  role: MemberRoleDisplay;
}) {
  const memberTitle = `${member.displayName} - ${role.label}`;

  if (collapsed) {
    return (
      <div
        aria-label={memberTitle}
        className="group/member relative mx-auto flex h-12 w-12 items-center justify-center rounded-[20px] border border-transparent transition hover:border-[hsl(var(--border)/0.62)] hover:bg-[hsl(var(--surface-soft)/0.42)]"
        data-testid={`server-member-${member.username}`}
        title={memberTitle}
      >
        <Avatar
          alt={member.displayName}
          className="h-10 w-10"
          fallback={member.displayName}
          src={member.avatarUrl}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-[hsl(var(--surface-card))]",
            getStatusDotClass(member.status),
          )}
        />
      </div>
    );
  }

  return (
    <div
      className="group/member flex min-w-0 items-center gap-3 rounded-[22px] border border-transparent px-2.5 py-2 transition hover:border-[hsl(var(--border)/0.58)] hover:bg-[hsl(var(--surface-soft)/0.36)]"
      data-testid={`server-member-${member.username}`}
    >
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
          <p className="truncate text-sm font-semibold text-app-foreground">{member.displayName}</p>
          {role.kind === "owner" ? (
            <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : role.kind === "admin" ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--primary))]" />
          ) : role.color ? (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={getRoleColorStyle(role.color)}
            />
          ) : null}
        </div>
        <p className="truncate text-xs font-medium text-app-soft">
          @{member.username}
          {member.customStatus ? ` - ${member.customStatus}` : ""}
        </p>
      </div>

      <span className="hidden max-w-[7rem] truncate rounded-full border border-[hsl(var(--border)/0.56)] bg-[hsl(var(--surface-card)/0.74)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-soft group-hover/member:inline-flex">
        {role.label}
      </span>
    </div>
  );
}

function MemberSection({
  collapsed,
  emptyLabel,
  group,
  roleById,
  roleLabels,
}: {
  collapsed: boolean;
  emptyLabel: string;
  group: MemberGroup;
  roleById: Map<string, WorkspaceRole>;
  roleLabels: {
    admin: string;
    member: string;
    owner: string;
  };
}) {
  if (collapsed) {
    return (
      <section className="space-y-2" title={group.title}>
        <div className="flex flex-col items-center gap-1">
          <span className="grid h-8 w-8 place-items-center rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.72)] text-[10px] font-black uppercase tracking-[0.08em] text-app-muted">
            {group.preview}
          </span>
          <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.42)] px-1.5 py-0.5 text-[10px] font-bold text-app-muted">
            {group.members.length}
          </span>
        </div>

        {group.members.length > 0 ? (
          <div className="space-y-1.5">
            {group.members.map((member) => (
              <MemberRow
                collapsed
                key={member.userId}
                member={member}
                role={getRoleDisplay(member, roleById, roleLabels)}
              />
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-2">
        <div className="flex min-w-0 items-center gap-2">
          <RoleGlyph group={group} />
          <h3 className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-app-soft">
            {group.title}
          </h3>
        </div>
        <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.4)] px-2 py-0.5 text-[10px] font-semibold text-app-muted">
          {group.members.length}
        </span>
      </div>

      {group.members.length > 0 ? (
        <div className="space-y-1">
          {group.members.map((member) => (
            <MemberRow
              collapsed={false}
              key={member.userId}
              member={member}
              role={getRoleDisplay(member, roleById, roleLabels)}
            />
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

export function ServerMemberPanel({
  detail,
  onClose,
  variant = "sidebar",
}: ServerMemberPanelProps) {
  const { locale, t } = useI18n();
  const { memberPanelCollapsed, setMemberPanelCollapsed } = useAppStore(
    useShallow((state) => ({
      memberPanelCollapsed: state.memberPanelCollapsed,
      setMemberPanelCollapsed: state.setMemberPanelCollapsed,
    })),
  );
  const [panelMenu, setPanelMenu] = useState({
    open: false,
    x: 0,
    y: 0,
  });
  const roleLabels = useMemo(
    () => ({
      admin: t("shell.memberPanel.admin"),
      member: t("shell.memberPanel.member"),
      owner: t("shell.memberPanel.owner"),
    }),
    [t],
  );
  const roleById = useMemo(
    () => new Map(detail.roles.map((role) => [role.id, role])),
    [detail.roles],
  );
  const { offlineGroup, onlineGroups } = useMemo(
    () =>
      buildMemberGroups({
        detail,
        labels: {
          ...roleLabels,
          offline: t("shell.memberPanel.offline"),
          online: t("shell.memberPanel.online"),
        },
        locale,
      }),
    [detail, locale, roleLabels, t],
  );
  const visibleGroups =
    onlineGroups.length > 0
      ? onlineGroups
      : [
          {
            key: "online-empty",
            kind: "online" as const,
            members: [],
            preview: getGroupPreview(t("shell.memberPanel.online"), locale),
            rank: 0,
            title: t("shell.memberPanel.online"),
          },
        ];

  const closePanelMenu = useCallback(() => {
    setPanelMenu((current) => (current.open ? { open: false, x: 0, y: 0 } : current));
  }, []);

  const handlePanelContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setPanelMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const toggleMemberPanelCollapsed = useCallback(() => {
    setMemberPanelCollapsed(!memberPanelCollapsed);
    closePanelMenu();
  }, [closePanelMenu, memberPanelCollapsed, setMemberPanelCollapsed]);
  const isDrawer = variant === "drawer";
  const isCollapsed = !isDrawer && memberPanelCollapsed;

  return (
    <aside
      className={cn(
        "h-full shrink-0 border-l border-[hsl(var(--border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.82),hsl(var(--surface-soft)/0.36))] backdrop-blur-xl transition-[width,padding] duration-200",
        isDrawer ? "flex w-full flex-col p-4" : "hidden min-[1440px]:flex min-[1440px]:flex-col",
        !isDrawer && (isCollapsed ? "w-[88px] p-3" : "w-[312px] p-4"),
      )}
      data-testid={isDrawer ? "server-member-panel-drawer" : "server-member-panel"}
      onContextMenu={isDrawer ? undefined : handlePanelContextMenu}
      suppressHydrationWarning
    >
      {isDrawer && onClose ? (
        <div className="mb-3 flex items-center justify-end">
          <button
            aria-label={t("common.close")}
            className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-2xl border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "rounded-[30px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.66)] shadow-[0_22px_54px_hsl(var(--shadow-color)/0.08)]",
          isCollapsed ? "p-2.5" : "p-4",
        )}
      >
        <div
          className={cn("flex", isCollapsed ? "flex-col items-center gap-2" : "items-center gap-3")}
        >
          <div className="app-panel-soft flex h-12 w-12 items-center justify-center rounded-[20px] border">
            <Users className="h-5 w-5 text-app-foreground" />
          </div>
          {isCollapsed ? (
            <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.42)] px-2 py-0.5 text-[10px] font-bold text-app-muted">
              {detail.server.memberCount}
            </span>
          ) : (
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
          )}
        </div>
      </div>

      <div
        className={cn(
          "mt-4 min-h-0 flex-1 overflow-y-auto",
          isCollapsed ? "space-y-4 px-0.5" : "space-y-5 pr-1",
        )}
      >
        {visibleGroups.map((group) => (
          <MemberSection
            collapsed={isCollapsed}
            emptyLabel={t("shell.memberPanel.emptyOnline")}
            group={group}
            key={group.key}
            roleById={roleById}
            roleLabels={roleLabels}
          />
        ))}
        <MemberSection
          collapsed={isCollapsed}
          emptyLabel={t("shell.memberPanel.emptyOffline")}
          group={offlineGroup}
          roleById={roleById}
          roleLabels={roleLabels}
        />
      </div>

      <ContextMenu onClose={closePanelMenu} open={!isDrawer && panelMenu.open} position={panelMenu}>
        <ContextMenuItem className="gap-2" onClick={toggleMemberPanelCollapsed}>
          {memberPanelCollapsed ? (
            <PanelRightOpen className="h-4 w-4" />
          ) : (
            <PanelRightClose className="h-4 w-4" />
          )}
          {memberPanelCollapsed
            ? t("shell.memberPanel.expandPanel")
            : t("shell.memberPanel.collapsePanel")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <div className="w-64 max-w-[calc(100vw-2.5rem)] space-y-3 px-2 py-2">
          <div className="flex items-start gap-2 px-1">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.62)] text-app-muted">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-app-foreground">
                {t("shell.memberPanel.contextTitle")}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-app-soft">
                {t("shell.memberPanel.contextHint")}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            {[...onlineGroups, offlineGroup].map((group) => (
              <div
                className="flex items-center justify-between rounded-2xl border border-[hsl(var(--border)/0.48)] bg-[hsl(var(--surface-soft)/0.28)] px-3 py-2 text-xs"
                key={group.key}
              >
                <span className="flex min-w-0 items-center gap-2 font-semibold text-app-foreground">
                  <RoleGlyph group={group} />
                  <span className="truncate">{group.title}</span>
                </span>
                <span className="font-bold text-app-muted">{group.members.length}</span>
              </div>
            ))}
          </div>
        </div>
      </ContextMenu>
    </aside>
  );
}
