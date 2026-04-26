"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, Shield, Trash2, UserRoundX, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { WorkspaceServerDetail } from "@wizards/types";
import { Button } from "@wizards/ui";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ServerIconField } from "@/components/shell/server-icon-field";
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

export function ServerSettingsOverlay({
  detail,
  onOpenDeleteServer,
  open,
  uploadthingEnabled,
}: ServerSettingsOverlayProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const closeServerSettings = useAppStore((state) => state.closeServerSettings);
  const [tab, setTab] = useState<SettingsTab>("overview");
  const [name, setName] = useState(detail?.server.name ?? "");
  const [description, setDescription] = useState(
    detail?.server.description ?? "",
  );
  const [iconUrl, setIconUrl] = useState<string | null>(
    detail?.server.iconUrl ?? null,
  );

  useEffect(() => {
    if (!open) {
      setTab("overview");
      return;
    }

    setName(detail?.server.name ?? "");
    setDescription(detail?.server.description ?? "");
    setIconUrl(detail?.server.iconUrl ?? null);
  }, [detail?.server.description, detail?.server.iconUrl, detail?.server.name, open]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!detail) {
        return;
      }

      return updateServerRequest(detail.server.id, {
        description,
        iconUrl,
        name,
      });
    },
    onSuccess: async () => {
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
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="flex h-full w-full bg-[linear-gradient(180deg,hsl(var(--surface-main-top)/0.96),hsl(var(--surface-main-bottom)/0.98))]"
            exit={{ opacity: 0, scale: 0.98 }}
            initial={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <aside className="flex w-full max-w-[280px] flex-col border-r border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-panel)/0.82)] p-6">
              <div className="flex items-center gap-3">
                <Avatar
                  alt={detail.server.name}
                  className="h-14 w-14 rounded-[20px]"
                  fallback={detail.server.name}
                  src={detail.server.iconUrl}
                />
                <div className="min-w-0">
                  <p className="text-app-foreground truncate text-lg font-semibold">
                    {detail.server.name}
                  </p>
                  <p className="text-app-soft truncate text-xs uppercase tracking-[0.2em]">
                    {t("serverSettings.title")}
                  </p>
                </div>
              </div>

              <nav className="mt-8 space-y-1">
                {tabs.map((item) => (
                  <button
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
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

              <div className="mt-auto">
                <Button onClick={closeServerSettings} type="button" variant="outline">
                  {t("serverSettings.closeOverlay")}
                </Button>
              </div>
            </aside>

            <section className="min-w-0 flex-1 overflow-y-auto p-6 md:p-10">
              <div className="mx-auto max-w-4xl">
                <div className="mb-8 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-app-foreground text-3xl font-semibold tracking-tight">
                      {tabs.find((item) => item.id === tab)?.label}
                    </h2>
                    <p className="text-app-muted mt-2 text-sm">
                      {t("serverSettings.manageDescription")}
                    </p>
                  </div>
                  <button
                    aria-label={t("serverSettings.closeOverlay")}
                    className="app-panel-soft text-app-muted rounded-2xl border p-3 transition hover:opacity-90 hover:text-[hsl(var(--foreground))]"
                    onClick={closeServerSettings}
                    type="button"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {tab === "overview" ? (
                  <div className="space-y-6">
                    <ServerIconField
                      label={name || detail.server.name}
                      onChange={setIconUrl}
                      uploadthingEnabled={uploadthingEnabled}
                      value={iconUrl}
                    />
                    <div className="grid gap-4 md:grid-cols-[1.2fr,0.8fr]">
                      <div className="app-panel rounded-[28px] border p-5">
                        <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                          {t("serverSettings.serverName")}
                        </label>
                        <Input
                          className="mt-3"
                          onChange={(event) => setName(event.target.value)}
                          value={name}
                        />
                      </div>
                      <div className="app-panel rounded-[28px] border p-5">
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
                    <div className="app-panel rounded-[28px] border p-5">
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
                    <div className="flex justify-end">
                      <Button
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate()}
                        type="button"
                      >
                        {updateMutation.isPending ? t("common.saving") : t("serverSettings.saveOverview")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {tab === "members" ? (
                  <div className="space-y-3">
                    {detail.members.map((member) => (
                      <div
                        className="app-panel flex items-center gap-4 rounded-[28px] border p-4"
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
                        <div className="flex flex-wrap gap-2">
                          <Badge>{member.accessLevel}</Badge>
                          {member.roles.slice(0, 2).map((role) => (
                            <Badge key={role.id} tone="muted">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                        {detail.server.isOwner && member.accessLevel !== "OWNER" ? (
                          <button
                            className="app-danger inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90"
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
                    {detail.invites.map((invite) => (
                      <div
                        className="app-panel flex flex-col gap-4 rounded-[28px] border p-5 md:flex-row md:items-center"
                        key={invite.id}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-app-foreground text-sm font-semibold">
                            /invite/{invite.code}
                          </p>
                          <p className="text-app-soft mt-1 text-xs">
                            Created by {invite.createdByDisplayName} • {invite.uses}
                            {invite.maxUses ? ` / ${invite.maxUses}` : ""} uses
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="app-panel-soft text-app-foreground inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90"
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
                            className="app-danger inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:opacity-90"
                            disabled={revokeInviteMutation.isPending}
                            onClick={() => revokeInviteMutation.mutate(invite.id)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                            {t("serverSettings.revoke")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {tab === "danger" ? (
                  <div className="app-danger rounded-[32px] border p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--danger)/0.14)] text-[hsl(var(--danger-foreground))]">
                        <Shield className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-[hsl(var(--danger-foreground))]">
                          {t("serverSettings.deleteTitle")}
                        </h3>
                        <p className="mt-1 text-sm text-[hsl(var(--danger-foreground)/0.78)]">
                          {t("serverSettings.deleteDescription")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <Button
                        className="app-danger"
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
