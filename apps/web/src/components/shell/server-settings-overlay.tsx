"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, Shield, ShieldCheck, Trash2, UserRoundX, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  WorkspaceMember,
  WorkspacePermissionKey,
  WorkspaceRole,
  WorkspaceServerDetail,
  WorkspaceServerSummary,
} from "@wizards/types";
import { Button } from "@wizards/ui";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ServerIconField } from "@/components/shell/server-icon-field";
import { ServerFeatureToggle } from "@/components/shell/server-feature-toggle";
import { ServerEventsPanel } from "@/components/servers/server-events-panel";
import { ServerTagsEditor } from "@/components/servers/server-tags-editor";
import { useAppStore } from "@/lib/store";
import { serverProfileQueryKeys } from "@/lib/servers/client";
import {
  createWorkspaceRoleRequest,
  deleteWorkspaceRoleRequest,
  kickMemberRequest,
  revokeInviteRequest,
  updateWorkspaceMemberRolesRequest,
  updateWorkspaceRoleRequest,
  updateServerRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

type SettingsTab = "overview" | "roles" | "members" | "invites" | "events" | "danger";

type ServerSettingsOverlayProps = {
  detail: WorkspaceServerDetail | null;
  onOpenDeleteServer: (serverId: string, serverName: string) => void;
  open: boolean;
  uploadthingEnabled: boolean;
};

const DELETED_NOTICE_OPTIONS = [5, 15, 30, 60, 180, 360, 1440] as const;
const ROLE_COLOR_OPTIONS = [
  7_958_864, 3_428_765, 16_093_248, 13_925_560, 14_326_805, 5_217_528,
] as const;
const DEFAULT_ROLE_COLOR = ROLE_COLOR_OPTIONS[0];
const MODERATOR_ROLE_COLOR = ROLE_COLOR_OPTIONS[1] ?? DEFAULT_ROLE_COLOR;
const ELEVATED_ROLE_KEYS: WorkspacePermissionKey[] = [
  "ADMINISTRATOR",
  "MANAGE_ROLES",
  "MANAGE_SERVER",
];
const ROLE_PERMISSION_PRESETS: Array<{
  descriptionKey: string;
  id: "admin" | "member" | "moderator";
  labelKey: string;
  ownerOnly?: boolean;
  permissions: WorkspacePermissionKey[];
}> = [
  {
    descriptionKey: "serverSettings.roles.presetMemberDescription",
    id: "member",
    labelKey: "serverSettings.roles.presetMember",
    permissions: [
      "VIEW_CHANNEL",
      "SEND_MESSAGES",
      "ATTACH_FILES",
      "USE_GIFS",
      "ADD_REACTIONS",
      "CONNECT_VOICE",
      "SPEAK",
      "STREAM",
      "USE_VIDEO",
    ],
  },
  {
    descriptionKey: "serverSettings.roles.presetModeratorDescription",
    id: "moderator",
    labelKey: "serverSettings.roles.presetModerator",
    permissions: [
      "VIEW_CHANNEL",
      "SEND_MESSAGES",
      "ATTACH_FILES",
      "USE_GIFS",
      "ADD_REACTIONS",
      "CONNECT_VOICE",
      "SPEAK",
      "STREAM",
      "USE_VIDEO",
      "MANAGE_MESSAGES",
      "CLEAR_CHANNEL_HISTORY",
      "MANAGE_INVITES",
      "KICK_MEMBERS",
      "BAN_MEMBERS",
      "TIMEOUT_MEMBERS",
      "VIEW_AUDIT_LOG",
      "MENTION_EVERYONE",
      "MANAGE_EVENTS",
      "MUTE_MEMBERS",
      "DEAFEN_MEMBERS",
      "MOVE_MEMBERS",
    ],
  },
  {
    descriptionKey: "serverSettings.roles.presetAdminDescription",
    id: "admin",
    labelKey: "serverSettings.roles.presetAdmin",
    ownerOnly: true,
    permissions: ["ADMINISTRATOR"],
  },
];
const DEFAULT_ROLE_PERMISSIONS = ROLE_PERMISSION_PRESETS[0]?.permissions ?? [];

const ROLE_PERMISSION_GROUPS: Array<{
  id: string;
  keys: WorkspacePermissionKey[];
  labelKey: string;
}> = [
  {
    id: "general",
    keys: ["VIEW_CHANNEL", "SEND_MESSAGES", "ATTACH_FILES", "USE_GIFS", "ADD_REACTIONS"],
    labelKey: "serverSettings.roles.groupGeneral",
  },
  {
    id: "voice",
    keys: [
      "CONNECT_VOICE",
      "SPEAK",
      "STREAM",
      "USE_VIDEO",
      "MUTE_MEMBERS",
      "DEAFEN_MEMBERS",
      "MOVE_MEMBERS",
    ],
    labelKey: "serverSettings.roles.groupVoice",
  },
  {
    id: "moderation",
    keys: [
      "MANAGE_MESSAGES",
      "CLEAR_CHANNEL_HISTORY",
      "KICK_MEMBERS",
      "BAN_MEMBERS",
      "TIMEOUT_MEMBERS",
      "MANAGE_INVITES",
      "VIEW_AUDIT_LOG",
      "MENTION_EVERYONE",
      "MANAGE_EVENTS",
    ],
    labelKey: "serverSettings.roles.groupModeration",
  },
  {
    id: "admin",
    keys: ["MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_SERVER", "ADMINISTRATOR"],
    labelKey: "serverSettings.roles.groupAdmin",
  },
];

function formatDeletedNoticeDuration(minutes: number, locale: string) {
  if (minutes < 60) {
    return locale === "tr" ? `${minutes} dakika` : `${minutes} minutes`;
  }

  if (minutes === 60) {
    return locale === "tr" ? "1 saat" : "1 hour";
  }

  if (minutes < 1440) {
    const hours = minutes / 60;
    return locale === "tr" ? `${hours} saat` : `${hours} hours`;
  }

  const days = minutes / 1440;
  return locale === "tr" ? `${days} gün` : `${days} days`;
}

function hasPermissionKey(role: WorkspaceRole, key: WorkspacePermissionKey) {
  return role.permissions.includes("ADMINISTRATOR") || role.permissions.includes(key);
}

function isElevatedRole(role: WorkspaceRole) {
  return role.permissions.some((permission) => ELEVATED_ROLE_KEYS.includes(permission));
}

function isProtectedRole(role: WorkspaceRole) {
  return role.isDefault || role.managed || isElevatedRole(role);
}

function getRoleGuardCopy(role: WorkspaceRole) {
  if (role.isDefault || role.managed) {
    return {
      descriptionKey: "serverSettings.roles.systemRoleHint",
      labelKey: "serverSettings.roles.systemRole",
    };
  }

  if (isElevatedRole(role)) {
    return {
      descriptionKey: "serverSettings.roles.safeRoleHint",
      labelKey: "serverSettings.roles.safeRole",
    };
  }

  return null;
}

function getAccessLevelLabel(member: WorkspaceMember, locale: string) {
  const labels = {
    ADMIN: { en: "Admin", tr: "Admin" },
    MEMBER: { en: "Member", tr: "Üye" },
    OWNER: { en: "Owner", tr: "Sahip" },
  } satisfies Record<WorkspaceMember["accessLevel"], { en: string; tr: string }>;

  return labels[member.accessLevel][locale === "tr" ? "tr" : "en"];
}

function getPermissionLabel(key: WorkspacePermissionKey, locale: string) {
  const labels: Record<WorkspacePermissionKey, { en: string; tr: string }> = {
    ADMINISTRATOR: { en: "Administrator", tr: "Yonetici" },
    ADD_REACTIONS: { en: "Add reactions", tr: "Tepki ekle" },
    ATTACH_FILES: { en: "Attach files", tr: "Dosya ekle" },
    BAN_MEMBERS: { en: "Ban members", tr: "Uyeleri yasakla" },
    CLEAR_CHANNEL_HISTORY: { en: "Clear history", tr: "Gecmisi temizle" },
    CONNECT_VOICE: { en: "Join voice", tr: "Sese katil" },
    DEAFEN_MEMBERS: { en: "Deafen members", tr: "Uyeleri sagirlastir" },
    KICK_MEMBERS: { en: "Kick members", tr: "Uyeleri at" },
    MANAGE_CHANNELS: { en: "Manage channels", tr: "Kanallari yonet" },
    MANAGE_EVENTS: { en: "Manage events", tr: "Etkinlikleri yonet" },
    MANAGE_INVITES: { en: "Manage invites", tr: "Davetleri yonet" },
    MANAGE_MESSAGES: { en: "Manage messages", tr: "Mesajlari yonet" },
    MANAGE_ROLES: { en: "Manage roles", tr: "Rolleri yonet" },
    MANAGE_SERVER: { en: "Manage server", tr: "Sunucuyu yonet" },
    MENTION_EVERYONE: { en: "Mention everyone", tr: "Herkesi etiketle" },
    MOVE_MEMBERS: { en: "Move members", tr: "Uyeleri tasi" },
    MUTE_MEMBERS: { en: "Mute members", tr: "Uyeleri sustur" },
    SEND_MESSAGES: { en: "Send messages", tr: "Mesaj gonder" },
    SPEAK: { en: "Speak", tr: "Konus" },
    STREAM: { en: "Screen share", tr: "Ekran paylas" },
    TIMEOUT_MEMBERS: { en: "Timeout members", tr: "Uyeleri mola moduna al" },
    USE_GIFS: { en: "Use GIFs", tr: "GIF kullan" },
    USE_VIDEO: { en: "Use camera", tr: "Kamera kullan" },
    VIEW_AUDIT_LOG: { en: "View audit log", tr: "Denetim kaydini gor" },
    VIEW_CHANNEL: { en: "View channels", tr: "Kanallari gor" },
  };

  return labels[key][locale === "tr" ? "tr" : "en"];
}

function getAssignableRoles(roles: WorkspaceRole[], isOwner: boolean) {
  return roles.filter(
    (role) => !role.isDefault && !role.managed && (isOwner || !isElevatedRole(role)),
  );
}

function getMemberAssignableRoleIds(member: WorkspaceMember, roles: WorkspaceRole[]) {
  const roleIds = new Set(roles.map((role) => role.id));
  return member.roles.map((role) => role.id).filter((roleId) => roleIds.has(roleId));
}

export function ServerSettingsOverlay(props: ServerSettingsOverlayProps) {
  if (!props.detail) {
    return null;
  }

  return (
    <AnimatePresence>
      {props.open ? <ServerSettingsOverlayContent {...props} key={props.detail.server.id} /> : null}
    </AnimatePresence>
  );
}

function ServerSettingsOverlayContent({
  detail,
  onOpenDeleteServer,
  uploadthingEnabled,
}: ServerSettingsOverlayProps) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const closeServerSettings = useAppStore((state) => state.closeServerSettings);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overviewSavedRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<SettingsTab>("overview");
  const [name, setName] = useState(detail?.server.name ?? "");
  const [shortName, setShortName] = useState(detail?.server.shortName ?? "");
  const [description, setDescription] = useState(detail?.server.description ?? "");
  const [iconUrl, setIconUrl] = useState<string | null>(detail?.server.iconUrl ?? null);
  const [allowGifs, setAllowGifs] = useState(detail?.server.allowGifs ?? true);
  const [allowFileUploads, setAllowFileUploads] = useState(detail?.server.allowFileUploads ?? true);
  const [allowMemberAdds, setAllowMemberAdds] = useState(detail?.server.allowMemberAdds ?? true);
  const [messageCharacterLimit, setMessageCharacterLimit] = useState(
    detail?.server.messageCharacterLimit ?? 2000,
  );
  const [deletedMessageNoticeMinutes, setDeletedMessageNoticeMinutes] = useState(
    detail?.server.deletedMessageNoticeMinutes ?? 60,
  );
  const [overviewSaved, setOverviewSaved] = useState(false);
  const [isPublic, setIsPublic] = useState(detail?.server.isPublic ?? false);
  const [discoverable, setDiscoverable] = useState(detail?.server.discoverable ?? false);
  const [tags, setTags] = useState<string[]>(detail?.server.tags ?? []);
  const [roleEditorId, setRoleEditorId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState<number>(DEFAULT_ROLE_COLOR);
  const [roleMentionable, setRoleMentionable] = useState(false);
  const [rolePermissions, setRolePermissions] =
    useState<WorkspacePermissionKey[]>(DEFAULT_ROLE_PERMISSIONS);

  useEffect(
    () => () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!overviewSaved) {
      return;
    }

    window.setTimeout(() => {
      overviewSavedRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  }, [overviewSaved]);

  const isCommunityServer = detail?.server.type === "COMMUNITY";

  const updateMutation = useMutation({
    onMutate: () => {
      setOverviewSaved(false);
    },
    mutationFn: async () => {
      if (!detail) {
        return;
      }

      return updateServerRequest(detail.server.id, {
        allowFileUploads,
        allowGifs,
        allowMemberAdds,
        description,
        iconUrl,
        messageCharacterLimit,
        deletedMessageNoticeMinutes,
        name,
        shortName,
        tags,
        // A COMMUNITY server's visibility is admin-owned; the service rejects
        // the write, so the fields are left out rather than sent and refused.
        ...(isCommunityServer ? {} : { discoverable, isPublic }),
      });
    },
    onSuccess: async (result) => {
      if (!detail || !result?.detail) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: serverProfileQueryKeys.profile(detail.server.id),
      });

      const updatedDetail = result.detail;
      queryClient.setQueryData<WorkspaceServerDetail>(
        workspaceQueryKeys.server(detail.server.id),
        updatedDetail,
      );
      queryClient.setQueryData<WorkspaceServerSummary[] | undefined>(
        workspaceQueryKeys.servers,
        (current) =>
          current?.map((server) =>
            server.id === updatedDetail.server.id
              ? {
                  ...server,
                  allowFileUploads: updatedDetail.server.allowFileUploads,
                  allowGifs: updatedDetail.server.allowGifs,
                  allowMemberAdds: updatedDetail.server.allowMemberAdds,
                  messageCharacterLimit: updatedDetail.server.messageCharacterLimit,
                  deletedMessageNoticeMinutes: updatedDetail.server.deletedMessageNoticeMinutes,
                  iconUrl: updatedDetail.server.iconUrl,
                  name: updatedDetail.server.name,
                  shortName: updatedDetail.server.shortName,
                }
              : server,
          ),
      );
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });
      router.refresh();
      setOverviewSaved(true);
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = setTimeout(() => setOverviewSaved(false), 2400);
    },
  });

  const resetRoleEditor = () => {
    setRoleEditorId(null);
    setRoleName("");
    setRoleColor(DEFAULT_ROLE_COLOR);
    setRoleMentionable(false);
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
  };

  const invalidateServerDetail = async () => {
    if (!detail) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      }),
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      }),
    ]);
  };

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      if (!detail) {
        return null;
      }

      const input = {
        color: roleColor,
        mentionable: roleMentionable,
        name: roleName,
        permissions: rolePermissions,
      };

      return roleEditorId
        ? updateWorkspaceRoleRequest(detail.server.id, roleEditorId, input)
        : createWorkspaceRoleRequest(detail.server.id, input);
    },
    onSuccess: async () => {
      resetRoleEditor();
      await invalidateServerDetail();
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      if (!detail) {
        return;
      }

      return deleteWorkspaceRoleRequest(detail.server.id, roleId);
    },
    onSuccess: invalidateServerDetail,
  });

  const memberRolesMutation = useMutation({
    mutationFn: async ({ memberId, roleIds }: { memberId: string; roleIds: string[] }) => {
      if (!detail) {
        return;
      }

      return updateWorkspaceMemberRolesRequest(detail.server.id, memberId, { roleIds });
    },
    onSuccess: invalidateServerDetail,
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!detail) {
        return;
      }

      return revokeInviteRequest(detail.server.id, inviteId);
    },
    onSuccess: async () => {
      if (!detail) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });
    },
  });

  const kickMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!detail) {
        return;
      }

      return kickMemberRequest(detail.server.id, memberId);
    },
    onSuccess: async () => {
      if (!detail) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });
    },
  });

  if (!detail) {
    return null;
  }

  const roles = detail.roles;
  const assignableRoles = getAssignableRoles(roles, detail.server.isOwner);
  const isEditingRole = Boolean(roleEditorId);
  const selectedPermissionCount = rolePermissions.length;

  const tabs: Array<{ id: SettingsTab; label: string; preview?: boolean }> = [
    { id: "overview", label: t("serverSettings.tab.overview") },
    { id: "roles", label: t("serverSettings.tab.roles"), preview: true },
    { id: "members", label: t("serverSettings.tab.members") },
    { id: "invites", label: t("serverSettings.tab.invites") },
    { id: "events", label: t("serverSettings.events.title") },
    { id: "danger", label: t("serverSettings.tab.danger") },
  ];

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[95] bg-[hsl(var(--backdrop)/0.6)] backdrop-blur-2xl"
      data-testid="server-settings-overlay"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="flex h-full w-full flex-col bg-[linear-gradient(180deg,hsl(var(--surface-main-top)/0.96),hsl(var(--surface-main-bottom)/0.98))] md:flex-row"
        exit={{ opacity: 0, scale: 0.98 }}
        initial={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <aside className="flex w-full shrink-0 flex-col border-b border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-panel)/0.82)] p-4 pb-3 md:max-w-[280px] md:border-b-0 md:border-r md:p-6">
          <div className="flex items-center gap-3">
            <Avatar
              alt={detail.server.name}
              className="h-12 w-12 rounded-[18px] md:h-14 md:w-14 md:rounded-[20px]"
              fallback={detail.server.name}
              src={detail.server.iconUrl}
            />
            <div className="min-w-0">
              <p className="text-app-foreground truncate text-base font-semibold md:text-lg">
                {detail.server.name}
              </p>
              <p className="text-app-soft truncate text-xs uppercase tracking-[0.2em]">
                {t("serverSettings.title")}
              </p>
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 md:mt-8 md:block md:space-y-1 md:overflow-visible md:pb-0">
            {tabs.map((item) => (
              <button
                className={`flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] md:w-full ${
                  tab === item.id
                    ? "bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--foreground))]"
                    : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.52)] hover:text-[hsl(var(--foreground))]"
                }`}
                key={item.id}
                onClick={() => setTab(item.id)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{item.label}</span>
                  {item.preview ? (
                    <span className="rounded-full border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--primary))]">
                      {t("common.preview")}
                    </span>
                  ) : null}
                </span>
                {item.id === "danger" ? <Trash2 className="h-4 w-4" /> : null}
              </button>
            ))}
          </nav>

          <div className="mt-3 hidden md:mt-auto md:block">
            <Button onClick={closeServerSettings} type="button" variant="outline">
              {t("serverSettings.closeOverlay")}
            </Button>
          </div>
        </aside>

        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-5 flex items-start justify-between gap-4 md:mb-8 md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-app-foreground text-2xl font-semibold tracking-tight md:text-3xl">
                    {tabs.find((item) => item.id === tab)?.label}
                  </h2>
                  {tab === "roles" ? (
                    <span className="rounded-full border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--primary))]">
                      {t("common.preview")}
                    </span>
                  ) : null}
                </div>
                <p className="text-app-muted mt-2 text-sm">
                  {t("serverSettings.manageDescription")}
                </p>
              </div>
              <button
                aria-label={t("serverSettings.closeOverlay")}
                className="app-panel-soft text-app-muted min-h-11 min-w-11 rounded-2xl border p-3 transition hover:opacity-90 hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                data-testid="server-settings-close-button"
                onClick={closeServerSettings}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {tab === "overview" ? (
              <div className="space-y-6">
                <ServerIconField
                  label={shortName || name || detail.server.name}
                  onChange={setIconUrl}
                  uploadthingEnabled={uploadthingEnabled}
                  value={iconUrl}
                />
                <div className="grid gap-4 md:grid-cols-[1.15fr,0.85fr,0.85fr]">
                  <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                    <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                      {t("serverSettings.serverName")}
                    </label>
                    <Input
                      className="mt-3"
                      onChange={(event) => setName(event.target.value)}
                      value={name}
                    />
                  </div>
                  <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                    <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                      {t("serverSettings.serverShortName")}
                    </label>
                    <Input
                      className="mt-3"
                      maxLength={4}
                      onChange={(event) =>
                        setShortName(
                          Array.from(event.target.value.trim().toUpperCase()).slice(0, 4).join(""),
                        )
                      }
                      placeholder={t("serverSettings.serverShortNamePlaceholder")}
                      value={shortName}
                    />
                    <p className="mt-2 text-xs leading-5 text-app-muted">
                      {t("serverSettings.serverShortNameHint")}
                    </p>
                  </div>
                  <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                    <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                      {t("serverSettings.access")}
                    </label>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge>{detail.server.accessLevel}</Badge>
                      <Badge tone="muted">
                        {t("serverSettings.memberCount", {
                          count: detail.server.memberCount,
                        })}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                  <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                    {t("common.description")}
                  </label>
                  <Textarea
                    className="mt-3"
                    maxLength={160}
                    onChange={(event) => setDescription(event.target.value)}
                    value={description}
                  />
                </div>
                <ServerTagsEditor
                  disabled={updateMutation.isPending}
                  onChange={setTags}
                  tags={tags}
                />
                <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                      {t("workspace.media.title")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-app-muted">
                      {t("workspace.media.description")}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <ServerFeatureToggle
                      checked={allowGifs}
                      description={t("workspace.media.gifs.description")}
                      disabled={updateMutation.isPending}
                      onChange={setAllowGifs}
                      testId="server-media-gifs-toggle"
                      title={t("workspace.media.gifs.title")}
                    />
                    <ServerFeatureToggle
                      checked={allowFileUploads}
                      description={t("workspace.media.files.description")}
                      disabled={updateMutation.isPending}
                      onChange={setAllowFileUploads}
                      testId="server-media-files-toggle"
                      title={t("workspace.media.files.title")}
                    />
                  </div>
                </div>
                <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                        {t("workspace.messages.limitTitle")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-app-muted">
                        {t("workspace.messages.limitDescription")}
                      </p>
                    </div>
                    <div className="w-full md:w-[12rem]">
                      <label className="sr-only" htmlFor="server-message-limit">
                        {t("workspace.messages.limitTitle")}
                      </label>
                      <Input
                        id="server-message-limit"
                        max={40000}
                        min={250}
                        onChange={(event) =>
                          setMessageCharacterLimit(
                            Math.min(40000, Math.max(250, Number(event.target.value) || 2000)),
                          )
                        }
                        type="number"
                        value={messageCharacterLimit}
                      />
                    </div>
                  </div>
                  <input
                    aria-label={t("workspace.messages.limitTitle")}
                    className="mt-5 w-full accent-[hsl(var(--primary))]"
                    max={40000}
                    min={250}
                    onChange={(event) => setMessageCharacterLimit(Number(event.target.value))}
                    step={250}
                    type="range"
                    value={messageCharacterLimit}
                  />
                  <div className="mt-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-app-soft">
                    <span>250</span>
                    <span>{t("workspace.messages.adminUnlimited")}</span>
                    <span>40000</span>
                  </div>
                </div>
                <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                        {t("workspace.messages.deletedNoticeTitle")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-app-muted">
                        {t("workspace.messages.deletedNoticeDescription")}
                      </p>
                    </div>
                    <div className="w-full md:w-[13rem]">
                      <label className="sr-only" htmlFor="server-deleted-message-notice">
                        {t("workspace.messages.deletedNoticeTitle")}
                      </label>
                      <select
                        className="h-12 w-full rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.9)] px-3 text-sm font-semibold text-app-foreground shadow-[0_14px_34px_hsl(var(--shadow-color)/0.08)] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]"
                        id="server-deleted-message-notice"
                        onChange={(event) =>
                          setDeletedMessageNoticeMinutes(Number(event.target.value))
                        }
                        value={deletedMessageNoticeMinutes}
                      >
                        {DELETED_NOTICE_OPTIONS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {formatDeletedNoticeDuration(minutes, locale)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                      {t("workspace.members.title")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-app-muted">
                      {t("workspace.members.description")}
                    </p>
                  </div>
                  <ServerFeatureToggle
                    checked={allowMemberAdds}
                    description={t("workspace.members.allowAdds.description")}
                    disabled={updateMutation.isPending}
                    onChange={setAllowMemberAdds}
                    title={t("workspace.members.allowAdds.title")}
                  />
                </div>
                <div className="app-panel rounded-[28px] border p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                      {t("serverSettings.visibility.title")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-app-muted">
                      {t("serverSettings.visibility.description")}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {isCommunityServer ? (
                      <p
                        className="app-panel-soft rounded-2xl border px-4 py-3 text-xs leading-5 text-app-muted"
                        data-testid="server-settings-visibility-community-notice"
                      >
                        {t("serverSettings.visibility.communityLocked")}
                      </p>
                    ) : null}
                    <ServerFeatureToggle
                      checked={isPublic}
                      description={t("serverSettings.visibility.isPublicDescription")}
                      disabled={isCommunityServer || updateMutation.isPending}
                      onChange={(checked) => {
                        setIsPublic(checked);
                        if (!checked) {
                          setDiscoverable(false);
                        }
                      }}
                      testId="server-settings-is-public-toggle"
                      title={t("serverSettings.visibility.isPublicTitle")}
                    />
                    <ServerFeatureToggle
                      checked={discoverable}
                      description={
                        isPublic
                          ? t("serverSettings.visibility.discoverableDescription")
                          : t("serverSettings.visibility.discoverableRequiresPublic")
                      }
                      disabled={isCommunityServer || !isPublic || updateMutation.isPending}
                      onChange={setDiscoverable}
                      testId="server-settings-discoverable-toggle"
                      title={t("serverSettings.visibility.discoverableTitle")}
                    />
                  </div>
                </div>
                <div className="flex justify-stretch sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    data-testid="server-settings-save-overview"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate()}
                    type="button"
                  >
                    {updateMutation.isPending
                      ? t("common.saving")
                      : t("serverSettings.saveOverview")}
                  </Button>
                </div>
                {overviewSaved ? (
                  <div
                    className="app-success rounded-[24px] border p-4"
                    data-testid="server-settings-overview-saved"
                    ref={overviewSavedRef}
                  >
                    <p className="text-app-success text-xs font-semibold uppercase tracking-[0.2em]">
                      {t("serverSettings.overviewSavedTitle")}
                    </p>
                    <p className="text-app-foreground mt-2 text-sm font-medium">
                      {t("serverSettings.overviewSavedDescription")}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "roles" ? (
              <div className="space-y-5">
                <section className="app-panel overflow-hidden rounded-[32px] border p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="app-panel-soft flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-[hsl(var(--primary))] shadow-[0_18px_40px_hsl(var(--primary)/0.12)]">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
                          {t("serverSettings.tab.roles")}
                        </p>
                        <h3 className="text-app-foreground mt-2 text-2xl font-semibold tracking-tight">
                          {t("serverSettings.roles.overviewTitle")}
                        </h3>
                        <p className="text-app-muted mt-2 max-w-2xl text-sm leading-6">
                          {t("serverSettings.roles.overviewDescription")}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[24rem]">
                      {[
                        {
                          label: t("serverSettings.roles.totalRoles"),
                          value: roles.length,
                        },
                        {
                          label: t("serverSettings.roles.assignableRoles"),
                          value: assignableRoles.length,
                        },
                        {
                          label: t("serverSettings.roles.selectedPermissions"),
                          value: selectedPermissionCount,
                        },
                      ].map((item) => (
                        <div
                          className="app-panel-soft rounded-[22px] border px-4 py-3"
                          key={item.label}
                        >
                          <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">
                            {item.label}
                          </p>
                          <p className="text-app-foreground mt-1 text-2xl font-semibold">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="app-panel rounded-[32px] border p-4 sm:p-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-app-foreground text-xl font-semibold">
                        {isEditingRole
                          ? t("serverSettings.roles.editTitle")
                          : t("serverSettings.roles.createTitle")}
                      </h3>
                      <p className="text-app-muted mt-2 max-w-3xl text-sm leading-6">
                        {t("serverSettings.roles.createDescription")}
                      </p>
                    </div>
                    <div className="app-panel-soft flex shrink-0 items-center gap-3 rounded-[22px] border px-4 py-3">
                      <span
                        className="h-9 w-9 rounded-2xl border border-white/40 shadow-xs"
                        style={{
                          backgroundColor: `#${roleColor.toString(16).padStart(6, "0")}`,
                        }}
                      />
                      <div>
                        <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">
                          {t("serverSettings.roles.selectedPermissions")}
                        </p>
                        <p className="text-app-foreground text-sm font-semibold">
                          {selectedPermissionCount}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(280px,0.8fr),minmax(0,1.2fr)]">
                    <div className="space-y-4">
                      <div>
                        <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                          {t("serverSettings.roles.roleName")}
                        </label>
                        <Input
                          className="mt-2"
                          maxLength={48}
                          onChange={(event) => setRoleName(event.target.value)}
                          placeholder={t("serverSettings.roles.roleNamePlaceholder")}
                          value={roleName}
                        />
                      </div>

                      <div className="app-panel-soft rounded-[24px] border p-4">
                        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                          {t("serverSettings.roles.color")}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {ROLE_COLOR_OPTIONS.map((color) => (
                            <button
                              aria-label={`#${color.toString(16).padStart(6, "0")}`}
                              className={`h-10 w-10 rounded-2xl border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] ${
                                roleColor === color
                                  ? "border-[hsl(var(--foreground)/0.72)] ring-4 ring-[hsl(var(--ring)/0.16)]"
                                  : "border-[hsl(var(--border)/0.68)]"
                              }`}
                              key={color}
                              onClick={() => setRoleColor(color)}
                              style={{
                                backgroundColor: `#${color.toString(16).padStart(6, "0")}`,
                              }}
                              type="button"
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                          {t("serverSettings.roles.presets")}
                        </p>
                        <div className="mt-3 grid gap-3">
                          {ROLE_PERMISSION_PRESETS.map((preset) => (
                            <button
                              className="app-panel-soft rounded-[24px] border p-4 text-left transition hover:border-[hsl(var(--primary)/0.36)] hover:bg-[hsl(var(--primary)/0.08)] disabled:cursor-not-allowed disabled:opacity-45"
                              disabled={preset.ownerOnly && !detail.server.isOwner}
                              key={preset.id}
                              onClick={() => {
                                setRolePermissions(preset.permissions);
                                if (!roleName.trim()) {
                                  setRoleName(t(preset.labelKey));
                                }
                                if (preset.id === "moderator") {
                                  setRoleColor(MODERATOR_ROLE_COLOR);
                                }
                              }}
                              type="button"
                            >
                              <span className="text-app-foreground block text-sm font-semibold">
                                {t(preset.labelKey)}
                              </span>
                              <span className="text-app-muted mt-1 block text-xs leading-5">
                                {t(preset.descriptionKey)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        aria-checked={roleMentionable}
                        className="app-panel-soft flex w-full items-center justify-between gap-4 rounded-[24px] border p-4 text-left transition hover:border-[hsl(var(--primary)/0.28)]"
                        onClick={() => setRoleMentionable((value) => !value)}
                        role="switch"
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="text-app-foreground block text-sm font-semibold">
                            {t("serverSettings.roles.mentionable")}
                          </span>
                          <span className="text-app-muted mt-1 block text-xs leading-5">
                            {t("serverSettings.roles.mentionableDescription")}
                          </span>
                        </span>
                        <span
                          className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                            roleMentionable
                              ? "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.18)]"
                              : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)]"
                          }`}
                        >
                          <span
                            className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                              roleMentionable ? "translate-x-5 bg-[hsl(var(--primary))]" : ""
                            }`}
                          />
                        </span>
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                            {t("serverSettings.roles.permissions")}
                          </p>
                          <p className="text-app-muted mt-1 text-xs leading-5">
                            {t("serverSettings.roles.permissionDescription")}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2">
                        {ROLE_PERMISSION_GROUPS.map((group) => (
                          <div className="app-panel-soft rounded-[26px] border p-4" key={group.id}>
                            <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.2em]">
                              {t(group.labelKey)}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {group.keys.map((key) => {
                                const selected = rolePermissions.includes(key);
                                const elevated = ELEVATED_ROLE_KEYS.includes(key);
                                const disabled = elevated && !detail.server.isOwner;

                                return (
                                  <button
                                    className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-45 ${
                                      selected
                                        ? "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.13)] text-app-foreground"
                                        : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.62)] text-app-muted hover:text-app-foreground"
                                    }`}
                                    disabled={disabled}
                                    key={key}
                                    onClick={() =>
                                      setRolePermissions((current) =>
                                        current.includes(key)
                                          ? current.filter((permission) => permission !== key)
                                          : [...current, key],
                                      )
                                    }
                                    type="button"
                                  >
                                    {getPermissionLabel(key, locale)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {saveRoleMutation.error ? (
                    <div className="app-danger mt-5 rounded-[22px] border p-3 text-sm font-medium">
                      {t("serverSettings.roles.saveError")}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[hsl(var(--border)/0.54)] pt-5 sm:flex-row sm:justify-end">
                    {isEditingRole ? (
                      <Button
                        className="w-full sm:w-auto"
                        onClick={resetRoleEditor}
                        type="button"
                        variant="outline"
                      >
                        {t("common.cancel")}
                      </Button>
                    ) : null}
                    <Button
                      className="w-full sm:w-auto"
                      disabled={saveRoleMutation.isPending || roleName.trim().length < 1}
                      onClick={() => saveRoleMutation.mutate()}
                      type="button"
                    >
                      {saveRoleMutation.isPending
                        ? t("common.saving")
                        : isEditingRole
                          ? t("serverSettings.roles.saveRole")
                          : t("serverSettings.roles.createRole")}
                    </Button>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-app-foreground text-xl font-semibold">
                        {t("serverSettings.roles.roleLibrary")}
                      </h3>
                      <p className="text-app-muted mt-1 max-w-3xl text-sm leading-6">
                        {t("serverSettings.roles.roleLibraryDescription")}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {roles.map((role) => {
                      const canMutateRole = !isProtectedRole(role);
                      const visiblePermissions = ROLE_PERMISSION_GROUPS.flatMap(
                        (group) => group.keys,
                      ).filter((key) => hasPermissionKey(role, key));

                      return (
                        <div className="app-panel rounded-[28px] border p-4" key={role.id}>
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{
                                    backgroundColor: `#${role.color.toString(16).padStart(6, "0")}`,
                                  }}
                                />
                                <h3 className="text-app-foreground min-w-0 truncate text-base font-semibold">
                                  {role.name}
                                </h3>
                                {role.isDefault ? (
                                  <span title={t("serverSettings.roles.everyoneRoleHint")}>
                                    <Badge tone="muted">
                                      {t("serverSettings.roles.everyoneRole")}
                                    </Badge>
                                  </span>
                                ) : isElevatedRole(role) ? (
                                  <Badge>Admin</Badge>
                                ) : null}
                                {(() => {
                                  const guardCopy = getRoleGuardCopy(role);
                                  return guardCopy ? (
                                    <span title={t(guardCopy.descriptionKey)}>
                                      <Badge tone="muted">{t(guardCopy.labelKey)}</Badge>
                                    </span>
                                  ) : null;
                                })()}
                                {role.mentionable ? (
                                  <Badge className="normal-case tracking-normal" tone="muted">
                                    {t("serverSettings.roles.mentionableBadge")}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {visiblePermissions.length > 0 ? (
                                  visiblePermissions.slice(0, 10).map((key) => (
                                    <Badge key={key} tone="muted">
                                      {getPermissionLabel(key, locale)}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge tone="muted">
                                    {t("serverSettings.roles.noPermissions")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              {canMutateRole ? (
                                <button
                                  className="app-panel-soft text-app-foreground inline-flex min-h-10 items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition hover:opacity-90"
                                  onClick={() => {
                                    setRoleEditorId(role.id);
                                    setRoleName(role.name);
                                    setRoleColor(role.color);
                                    setRoleMentionable(role.mentionable);
                                    setRolePermissions(role.permissions);
                                  }}
                                  type="button"
                                >
                                  {t("common.edit")}
                                </button>
                              ) : null}
                              {canMutateRole ? (
                                <button
                                  className="app-danger inline-flex min-h-10 items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={deleteRoleMutation.isPending}
                                  onClick={() => deleteRoleMutation.mutate(role.id)}
                                  type="button"
                                >
                                  {t("common.delete")}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : null}

            {tab === "members" ? (
              <div className="space-y-5">
                <section className="app-panel overflow-hidden rounded-[32px] border p-5 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
                        {t("serverSettings.tab.members")}
                      </p>
                      <h3 className="text-app-foreground mt-2 text-2xl font-semibold tracking-tight">
                        {t("serverSettings.members.title")}
                      </h3>
                      <p className="text-app-muted mt-2 max-w-2xl text-sm leading-6">
                        {t("serverSettings.members.description")}
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[18rem]">
                      <div className="app-panel-soft rounded-[22px] border px-4 py-3">
                        <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">
                          {t("serverSettings.members.total")}
                        </p>
                        <p className="text-app-foreground mt-1 text-2xl font-semibold">
                          {detail.members.length}
                        </p>
                      </div>
                      <div className="app-panel-soft rounded-[22px] border px-4 py-3">
                        <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">
                          {t("serverSettings.members.assignable")}
                        </p>
                        <p className="text-app-foreground mt-1 text-2xl font-semibold">
                          {assignableRoles.length}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid gap-3">
                  {detail.members.map((member) => {
                    const selectedRoleIds = getMemberAssignableRoleIds(member, assignableRoles);

                    return (
                      <div
                        className="app-panel rounded-[30px] border p-4 shadow-[0_18px_44px_hsl(var(--shadow-color)/0.06)]"
                        key={member.id}
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Avatar
                              alt={member.displayName}
                              className="h-12 w-12 border border-[hsl(var(--border)/0.72)]"
                              fallback={member.displayName}
                              src={member.avatarUrl}
                            />
                            <div className="min-w-0">
                              <p className="text-app-foreground truncate text-sm font-semibold">
                                {member.displayName}
                              </p>
                              <p className="text-app-soft truncate text-xs">@{member.username}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <Badge>{getAccessLevelLabel(member, locale)}</Badge>
                                {member.roles.slice(0, 3).map((role) => (
                                  <Badge key={role.id} tone="muted">
                                    {role.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 xl:w-[28rem]">
                            <p className="text-app-soft mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]">
                              {t("serverSettings.members.roleAssignment")}
                            </p>
                            {assignableRoles.length > 0 && member.accessLevel !== "OWNER" ? (
                              <div className="flex flex-wrap gap-2">
                                {assignableRoles.map((role) => {
                                  const selected = selectedRoleIds.includes(role.id);

                                  return (
                                    <button
                                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-45 ${
                                        selected
                                          ? "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.13)] text-app-foreground"
                                          : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.62)] text-app-muted hover:text-app-foreground"
                                      }`}
                                      disabled={memberRolesMutation.isPending}
                                      key={role.id}
                                      onClick={() =>
                                        memberRolesMutation.mutate({
                                          memberId: member.id,
                                          roleIds: selected
                                            ? selectedRoleIds.filter((roleId) => roleId !== role.id)
                                            : [...selectedRoleIds, role.id],
                                        })
                                      }
                                      type="button"
                                    >
                                      {selected ? t("serverSettings.members.roleOn") : ""}
                                      {role.name}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-app-muted rounded-2xl border border-dashed border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.22)] px-3 py-2 text-xs">
                                {member.accessLevel === "OWNER"
                                  ? t("serverSettings.members.ownerProtected")
                                  : t("serverSettings.members.noAssignableRoles")}
                              </p>
                            )}
                          </div>

                          {detail.server.isOwner && member.accessLevel !== "OWNER" ? (
                            <button
                              className="app-danger inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] xl:w-auto"
                              disabled={kickMemberMutation.isPending}
                              onClick={() => kickMemberMutation.mutate(member.id)}
                              type="button"
                            >
                              <UserRoundX className="h-4 w-4" />
                              {t("serverSettings.kick")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {tab === "invites" ? (
              <div className="space-y-3">
                {detail.invites.length === 0 ? (
                  <div className="text-app-muted rounded-[28px] border border-dashed border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.2)] p-8 text-sm">
                    {t("serverSettings.noInvites")}
                  </div>
                ) : null}
                {detail.invites.map((invite) => {
                  const expiresLabel = invite.expiresAt
                    ? t("serverSettings.inviteExpiresAt", {
                        date: new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(invite.expiresAt)),
                      })
                    : t("serverSettings.invitePermanent");

                  return (
                    <div
                      className="app-panel flex flex-col gap-4 rounded-[28px] border p-5 md:flex-row md:items-center"
                      key={invite.id}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-app-foreground text-sm font-semibold">
                          /invite/{invite.code}
                        </p>
                        <Badge
                          className={
                            invite.expiresAt
                              ? "mt-2 border-[hsl(var(--warning)/0.28)] bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]"
                              : "mt-2 border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
                          }
                        >
                          {expiresLabel}
                        </Badge>
                        <p className="text-app-soft mt-2 text-xs">
                          {t("serverSettings.inviteCreatedBy", {
                            maxUses: invite.maxUses ? ` / ${invite.maxUses}` : "",
                            name: invite.createdByDisplayName,
                            uses: invite.uses,
                          })}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          className="app-panel-soft text-app-foreground inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}/invite/${invite.code}`,
                            );
                          }}
                          type="button"
                        >
                          <Copy className="h-4 w-4" />
                          {t("serverSettings.copy")}
                        </button>
                        <button
                          className="app-danger inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)]"
                          disabled={revokeInviteMutation.isPending}
                          onClick={() => revokeInviteMutation.mutate(invite.id)}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("serverSettings.revoke")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {tab === "events" ? (
              <ServerEventsPanel
                canManage={detail.server.isAdmin}
                categories={detail.categories}
                serverId={detail.server.id}
                ungroupedChannels={detail.ungroupedChannels}
              />
            ) : null}

            {tab === "danger" ? (
              <div className="app-danger rounded-[32px] border p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--danger)/0.18)] text-[hsl(var(--danger))]">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-app-foreground text-lg font-semibold">
                      {t("serverSettings.deleteTitle")}
                    </h3>
                    <p className="text-app-muted mt-1 text-sm">
                      {t("serverSettings.deleteDescription")}
                    </p>
                    <p className="text-app-muted mt-2 text-xs leading-5">
                      {detail.server.isOwner
                        ? t("serverSettings.deleteOwnerOnly")
                        : t("serverSettings.deleteOwnerOnlyDenied")}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <Button
                    className="app-danger w-full sm:w-auto"
                    disabled={!detail.server.isOwner}
                    onClick={() => onOpenDeleteServer(detail.server.id, detail.server.name)}
                    type="button"
                  >
                    {detail.server.isOwner
                      ? t("serverSettings.deleteOpen")
                      : t("serverSettings.ownerRequired")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </motion.div>
    </motion.div>
  );
}
