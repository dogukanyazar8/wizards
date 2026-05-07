"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, Shield, Trash2, UserRoundX, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceServerDetail, WorkspaceServerSummary } from "@wizards/types";
import { Button } from "@wizards/ui";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ServerIconField } from "@/components/shell/server-icon-field";
import { ServerFeatureToggle } from "@/components/shell/server-feature-toggle";
import { useAppStore } from "@/lib/store";
import {
  kickMemberRequest,
  revokeInviteRequest,
  updateServerRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

type SettingsTab = "overview" | "members" | "invites" | "danger";

type ServerSettingsOverlayProps = {
  detail: WorkspaceServerDetail | null;
  onOpenDeleteServer: (serverId: string, serverName: string) => void;
  open: boolean;
  uploadthingEnabled: boolean;
};

const DELETED_NOTICE_OPTIONS = [5, 15, 30, 60, 180, 360, 1440] as const;

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

export function ServerSettingsOverlay({
  detail,
  onOpenDeleteServer,
  open,
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
  const [description, setDescription] = useState(
    detail?.server.description ?? "",
  );
  const [iconUrl, setIconUrl] = useState<string | null>(
    detail?.server.iconUrl ?? null,
  );
  const [allowGifs, setAllowGifs] = useState(detail?.server.allowGifs ?? true);
  const [allowFileUploads, setAllowFileUploads] = useState(
    detail?.server.allowFileUploads ?? true,
  );
  const [allowMemberAdds, setAllowMemberAdds] = useState(
    detail?.server.allowMemberAdds ?? true,
  );
  const [messageCharacterLimit, setMessageCharacterLimit] = useState(
    detail?.server.messageCharacterLimit ?? 2000,
  );
  const [deletedMessageNoticeMinutes, setDeletedMessageNoticeMinutes] = useState(
    detail?.server.deletedMessageNoticeMinutes ?? 60,
  );
  const [overviewSaved, setOverviewSaved] = useState(false);

  useEffect(() => {
    if (!open) {
      setTab("overview");
      setOverviewSaved(false);
      return;
    }

    setName(detail?.server.name ?? "");
    setShortName(detail?.server.shortName ?? "");
    setDescription(detail?.server.description ?? "");
    setIconUrl(detail?.server.iconUrl ?? null);
    setAllowGifs(detail?.server.allowGifs ?? true);
    setAllowFileUploads(detail?.server.allowFileUploads ?? true);
    setAllowMemberAdds(detail?.server.allowMemberAdds ?? true);
    setMessageCharacterLimit(detail?.server.messageCharacterLimit ?? 2000);
    setDeletedMessageNoticeMinutes(detail?.server.deletedMessageNoticeMinutes ?? 60);
  }, [
    detail?.server.allowFileUploads,
    detail?.server.allowGifs,
    detail?.server.allowMemberAdds,
    detail?.server.description,
    detail?.server.iconUrl,
    detail?.server.messageCharacterLimit,
    detail?.server.deletedMessageNoticeMinutes,
    detail?.server.name,
    detail?.server.shortName,
    open,
  ]);

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
      });
    },
    onSuccess: async (result) => {
      if (!detail || !result?.detail) {
        return;
      }

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
                  deletedMessageNoticeMinutes:
                    updatedDetail.server.deletedMessageNoticeMinutes,
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

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "overview", label: t("serverSettings.tab.overview") },
    { id: "members", label: t("serverSettings.tab.members") },
    { id: "invites", label: t("serverSettings.tab.invites") },
    { id: "danger", label: t("serverSettings.tab.danger") },
  ];

  return (
    <AnimatePresence>
      {open ? (
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
                    className={`flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] md:w-full ${
                      tab === item.id
                        ? "bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--foreground))]"
                        : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.52)] hover:text-[hsl(var(--foreground))]"
                    }`}
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    type="button"
                  >
                    <span>{item.label}</span>
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
                    <h2 className="text-app-foreground text-2xl font-semibold tracking-tight md:text-3xl">
                      {tabs.find((item) => item.id === tab)?.label}
                    </h2>
                    <p className="text-app-muted mt-2 text-sm">
                      {t("serverSettings.manageDescription")}
                    </p>
                  </div>
                  <button
                    aria-label={t("serverSettings.closeOverlay")}
                    className="app-panel-soft text-app-muted min-h-11 min-w-11 rounded-2xl border p-3 transition hover:opacity-90 hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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
                          <label
                            className="sr-only"
                            htmlFor="server-deleted-message-notice"
                          >
                            {t("workspace.messages.deletedNoticeTitle")}
                          </label>
                          <select
                            className="h-12 w-full rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.9)] px-3 text-sm font-semibold text-app-foreground shadow-[0_14px_34px_hsl(var(--shadow-color)/0.08)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]"
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
                    <div className="flex justify-stretch sm:justify-end">
                      <Button
                        className="w-full sm:w-auto"
                        data-testid="server-settings-save-overview"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate()}
                        type="button"
                      >
                        {updateMutation.isPending ? t("common.saving") : t("serverSettings.saveOverview")}
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

                {tab === "members" ? (
                  <div className="space-y-3">
                    {detail.members.map((member) => (
                      <div
                        className="app-panel flex flex-col gap-4 rounded-[28px] border p-4 sm:flex-row sm:items-center"
                        key={member.id}
                      >
                        <Avatar
                          alt={member.displayName}
                          className="h-12 w-12"
                          fallback={member.displayName}
                          src={member.avatarUrl}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-app-foreground truncate text-sm font-semibold">
                            {member.displayName}
                          </p>
                          <p className="text-app-soft truncate text-xs">
                            @{member.username}
                          </p>
                        </div>
                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                          <Badge>{member.accessLevel}</Badge>
                          {member.roles.slice(0, 2).map((role) => (
                            <Badge key={role.id} tone="muted">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                        {detail.server.isOwner && member.accessLevel !== "OWNER" ? (
                          <button
                            className="app-danger inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] sm:w-auto"
                            disabled={kickMemberMutation.isPending}
                            onClick={() => kickMemberMutation.mutate(member.id)}
                            type="button"
                          >
                            <UserRoundX className="h-4 w-4" />
                            {t("serverSettings.kick")}
                          </button>
                        ) : null}
                      </div>
                    ))}
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
                              className="app-panel-soft text-app-foreground inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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
                              className="app-danger inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)]"
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
      ) : null}
    </AnimatePresence>
  );
}
