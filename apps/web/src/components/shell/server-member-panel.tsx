"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ChevronRight,
  Crown,
  Download,
  ExternalLink,
  Hash,
  Info,
  Laptop,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  Volume2,
  X,
} from "lucide-react";
import type {
  WorkspaceChannel,
  WorkspaceMember,
  WorkspacePermissionKey,
  WorkspaceRole,
  WorkspaceServerDetail,
} from "@wizards/types";
import { useShallow } from "zustand/react/shallow";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { useVoiceStates } from "@/hooks/use-voice-states";
import {
  WHISPR_APP_VERSION,
  WHISPR_DESKTOP_DOWNLOAD_URL,
  WHISPR_RELEASE_CHANNEL,
} from "@/lib/app-version";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";

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

function getServerChannels(detail: WorkspaceServerDetail) {
  return [
    ...detail.ungroupedChannels,
    ...detail.categories.flatMap((category) => category.channels),
  ];
}

function getVoiceChannelName(
  channelsById: Map<string, WorkspaceChannel>,
  state: VoiceChannelStateDTO,
) {
  return channelsById.get(state.channelId)?.name ?? null;
}

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
        className="group/member relative mx-auto flex h-12 w-12 items-center justify-center rounded-[20px] transition hover:bg-[hsl(var(--surface-soft)/0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
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
      className="group/member flex min-w-0 items-center gap-3 rounded-[22px] px-2.5 py-2 transition hover:bg-[hsl(var(--surface-soft)/0.36)]"
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

function ServerInfoCard({
  detail,
  memberCountLabel,
}: {
  detail: WorkspaceServerDetail;
  memberCountLabel: string;
}) {
  const description = detail.server.description?.trim();

  return (
    <section className="rounded-[24px] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.42),hsl(var(--surface-soft)/0.18))] p-3.5">
      <div className="flex items-center gap-3">
        <Avatar
          alt={detail.server.name}
          className="h-12 w-12 rounded-[20px] ring-4 ring-[hsl(var(--primary)/0.1)]"
          fallback={detail.server.shortName ?? detail.server.name}
          src={detail.server.iconUrl}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-app-foreground">{detail.server.name}</p>
          <p className="mt-1 text-xs font-semibold text-app-muted">{memberCountLabel}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]">
          <Info className="h-4 w-4" />
        </span>
      </div>
      {description ? (
        <p className="mt-3 line-clamp-3 text-xs leading-5 text-app-muted">{description}</p>
      ) : null}
    </section>
  );
}

function ActiveVoiceCard({
  channelsById,
  liveLabel,
  states,
  title,
  voiceParticipantsLabel,
}: {
  channelsById: Map<string, WorkspaceChannel>;
  liveLabel: string;
  states: VoiceChannelStateDTO[];
  title: string;
  voiceParticipantsLabel: (count: number) => string;
}) {
  const activeStates = states
    .filter((state) => state.participants.length > 0)
    .map((state) => ({
      channelName: getVoiceChannelName(channelsById, state),
      state,
    }))
    .filter(
      (entry): entry is { channelName: string; state: VoiceChannelStateDTO } =>
        entry.channelName != null,
    );

  if (activeStates.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[26px] border border-[hsl(var(--primary)/0.14)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.11),hsl(var(--surface-card)/0.72)_45%,hsl(var(--accent)/0.07))] p-4 shadow-[0_12px_34px_hsl(var(--primary)/0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
            <Radio className="h-4 w-4" />
          </span>
          <h2 className="truncate text-xs font-black uppercase tracking-[0.18em] text-app-muted">
            {title}
          </h2>
        </div>
        <span className="rounded-full border border-[hsl(var(--success)/0.24)] bg-[hsl(var(--success)/0.1)] px-2 py-1 text-[10px] font-bold text-[hsl(var(--success))]">
          {liveLabel}
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        {activeStates.map(({ channelName, state }) => {
          return (
            <div
              className="rounded-[20px] bg-[hsl(var(--surface-card)/0.54)] px-3 py-2.5"
              key={state.channelId}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Volume2 className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
                  <p className="truncate text-sm font-semibold text-app-foreground">
                    {channelName}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-app-muted">
                  {voiceParticipantsLabel(state.participants.length)}
                </span>
              </div>
              <div className="mt-2 flex -space-x-2 overflow-hidden">
                {state.participants.slice(0, 5).map((participant) => (
                  <Avatar
                    alt={participant.displayName ?? participant.username}
                    className="h-7 w-7 rounded-full border-2 border-[hsl(var(--surface-card))]"
                    fallback={participant.displayName ?? participant.username}
                    key={participant.userId}
                    src={participant.avatarUrl}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type QuickAction = {
  icon: typeof Settings2;
  label: string;
  onClick: () => void;
};

function QuickAccessCard({
  actions,
  hint,
  title,
}: {
  actions: QuickAction[];
  hint: string;
  title: string;
}) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[24px] bg-[hsl(var(--surface-card)/0.38)] p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--surface-soft)/0.44)] text-app-muted">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-app-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-app-muted">{hint}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              className="group/action flex min-h-11 w-full items-center gap-3 rounded-[18px] px-2.5 py-2 text-left transition hover:bg-[hsl(var(--surface-soft)/0.44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              key={action.label}
              onClick={action.onClick}
              type="button"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--surface-card)/0.62)] text-app-muted transition group-hover/action:text-[hsl(var(--primary))]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app-foreground">
                {action.label}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-app-soft" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DesktopDownloadCard({
  ctaLabel,
  description,
  downloadUrl,
  hint,
  title,
  versionLabel,
}: {
  ctaLabel: string;
  description: string;
  downloadUrl: string;
  hint: string;
  title: string;
  versionLabel: string;
}) {
  return (
    <section
      aria-label={title}
      className="mt-4 rounded-[24px] bg-[linear-gradient(135deg,hsl(var(--primary)/0.1),hsl(var(--surface-card)/0.64)_48%,hsl(var(--accent)/0.08))] p-3.5"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[18px] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <Laptop className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-app-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="max-w-full truncate rounded-full bg-[hsl(var(--surface-card)/0.72)] px-2.5 py-1 text-[11px] font-bold text-app-muted">
          {versionLabel}
        </span>
        <span className="rounded-full bg-[hsl(var(--primary)/0.1)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[hsl(var(--primary))]">
          {WHISPR_RELEASE_CHANNEL}
        </span>
      </div>

      <a
        aria-label={ctaLabel}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] bg-[hsl(var(--primary))] px-3 py-2 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_14px_32px_hsl(var(--primary)/0.18)] transition hover:translate-y-[-1px] hover:bg-[hsl(var(--primary)/0.92)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.6)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface-card))] motion-reduce:transform-none"
        href={downloadUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Download className="h-4 w-4" />
        <span>{ctaLabel}</span>
        <ExternalLink className="h-3.5 w-3.5 opacity-75" />
      </a>

      <p className="mt-2 text-[11px] leading-4 text-app-soft">{hint}</p>
    </section>
  );
}

export function ServerMemberPanel({
  detail,
  onClose,
  variant = "sidebar",
}: ServerMemberPanelProps) {
  const { locale, t } = useI18n();
  const {
    memberPanelCollapsed,
    openChannelModal,
    openInviteModal,
    openServerSettings,
    setMemberPanelCollapsed,
  } = useAppStore(
    useShallow((state) => ({
      memberPanelCollapsed: state.memberPanelCollapsed,
      openChannelModal: state.openChannelModal,
      openInviteModal: state.openInviteModal,
      openServerSettings: state.openServerSettings,
      setMemberPanelCollapsed: state.setMemberPanelCollapsed,
    })),
  );
  const voiceStatesQuery = useVoiceStates(detail.server.id);
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
  const channelsById = useMemo(
    () => new Map(getServerChannels(detail).map((channel) => [channel.id, channel])),
    [detail],
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
  const showDesktopDownloadCard = !isCollapsed && !isWhisprDesktopRuntime();
  const canManageServer = detail.server.isAdmin || detail.server.isOwner;
  const quickActions = useMemo<QuickAction[]>(() => {
    if (!canManageServer) {
      return [];
    }

    const runAction = (action: () => void) => {
      action();
      onClose?.();
    };

    return [
      {
        icon: Settings2,
        label: t("shell.channelSidebar.serverSettings"),
        onClick: () => runAction(() => openServerSettings(detail.server.id)),
      },
      {
        icon: Hash,
        label: t("shell.channelSidebar.createTextChannel"),
        onClick: () =>
          runAction(() =>
            openChannelModal({
              mode: "create",
              serverId: detail.server.id,
              type: "TEXT",
            }),
          ),
      },
      {
        icon: Volume2,
        label: t("shell.channelSidebar.createVoiceChannel"),
        onClick: () =>
          runAction(() =>
            openChannelModal({
              mode: "create",
              serverId: detail.server.id,
              type: "VOICE",
            }),
          ),
      },
      {
        icon: UserPlus,
        label: t("shell.channelSidebar.createInvite"),
        onClick: () => runAction(() => openInviteModal(detail.server.id)),
      },
    ];
  }, [
    canManageServer,
    detail.server.id,
    onClose,
    openChannelModal,
    openInviteModal,
    openServerSettings,
    t,
  ]);

  return (
    <aside
      className={cn(
        "h-full shrink-0 border-l border-[hsl(var(--border)/0.48)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.62),hsl(var(--surface-soft)/0.24))] backdrop-blur-xl transition-[width,padding] duration-200",
        isDrawer ? "flex w-full flex-col p-4" : "hidden xl:flex xl:flex-col",
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
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--surface-soft)/0.42)] text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.68)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {isCollapsed ? (
        <div className="rounded-[30px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.66)] p-2.5 shadow-[0_22px_54px_hsl(var(--shadow-color)/0.08)]">
          <div className="flex flex-col items-center gap-2">
            <div className="app-panel-soft flex h-12 w-12 items-center justify-center rounded-[20px] border">
              <Users className="h-5 w-5 text-app-foreground" />
            </div>
            <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.42)] px-2 py-0.5 text-[10px] font-bold text-app-muted">
              {detail.server.memberCount}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <ServerInfoCard
            detail={detail}
            memberCountLabel={t("shell.memberPanel.subtitle", {
              count: detail.server.memberCount,
            })}
          />
          <ActiveVoiceCard
            channelsById={channelsById}
            liveLabel={t("shell.memberPanel.activeVoiceLive")}
            states={voiceStatesQuery.data ?? []}
            title={t("shell.memberPanel.activeVoice")}
            voiceParticipantsLabel={(count) =>
              t("shell.memberPanel.voiceParticipants", {
                count,
              })
            }
          />
          <QuickAccessCard
            actions={quickActions}
            hint={t("shell.memberPanel.quickAccessHint")}
            title={t("shell.memberPanel.quickAccess")}
          />
        </div>
      )}

      <div
        className={cn(
          "mt-4 min-h-0 flex-1 overflow-y-auto",
          isCollapsed ? "space-y-4 px-0.5" : "pr-1",
        )}
      >
        <section
          className={cn(
            isCollapsed
              ? "space-y-4"
              : "space-y-5 rounded-[24px] bg-[hsl(var(--surface-card)/0.32)] p-3.5",
          )}
        >
          {!isCollapsed ? (
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex min-w-0 items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-app-muted" />
                <h2 className="truncate text-xs font-black uppercase tracking-[0.18em] text-app-muted">
                  {t("shell.memberPanel.membersTitle")}
                </h2>
              </div>
              <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.42)] px-2 py-0.5 text-[10px] font-bold text-app-muted">
                {detail.server.memberCount}
              </span>
            </div>
          ) : null}
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
        </section>
      </div>

      {showDesktopDownloadCard ? (
        <DesktopDownloadCard
          ctaLabel={t("shell.memberPanel.desktopDownloadCta")}
          description={t("shell.memberPanel.desktopDownloadDescription")}
          downloadUrl={WHISPR_DESKTOP_DOWNLOAD_URL}
          hint={t("shell.memberPanel.desktopDownloadHint")}
          title={t("shell.memberPanel.desktopDownloadTitle")}
          versionLabel={WHISPR_APP_VERSION}
        />
      ) : null}

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
