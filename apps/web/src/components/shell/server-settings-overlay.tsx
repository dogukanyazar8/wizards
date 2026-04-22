"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, Shield, Trash2, UserRoundX, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { WorkspaceServerDetail } from "@wizards/types";
import { Button } from "@wizards/ui";
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
  const queryClient = useQueryClient();
  const closeServerSettings = useAppStore((state) => state.closeServerSettings);
  const [tab, setTab] = useState<SettingsTab>("overview");
  const [name, setName] = useState(detail?.server.name ?? "");
  const [description, setDescription] = useState(detail?.server.description ?? "");
  const [iconUrl, setIconUrl] = useState<string | null>(detail?.server.iconUrl ?? null);

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
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members" },
    { id: "invites", label: "Invites" },
    { id: "danger", label: "Danger Zone" },
  ];

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-2xl"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="flex h-full w-full bg-[linear-gradient(180deg,rgba(17,24,39,0.76),rgba(9,9,11,0.92))]"
            exit={{ opacity: 0, scale: 0.98 }}
            initial={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <aside className="flex w-full max-w-[280px] flex-col border-r border-white/8 bg-white/[0.04] p-6">
              <div className="flex items-center gap-3">
                <Avatar
                  alt={detail.server.name}
                  className="h-14 w-14 rounded-[20px]"
                  fallback={detail.server.name}
                  src={detail.server.iconUrl}
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-zinc-50">{detail.server.name}</p>
                  <p className="truncate text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Server Settings
                  </p>
                </div>
              </div>

              <nav className="mt-8 space-y-1">
                {tabs.map((item) => (
                  <button
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
                      tab === item.id
                        ? "bg-sky-500/15 text-sky-100"
                        : "text-zinc-400 hover:bg-white/6 hover:text-zinc-200"
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
                  Close Overlay
                </Button>
              </div>
            </aside>

            <section className="min-w-0 flex-1 overflow-y-auto p-6 md:p-10">
              <div className="mx-auto max-w-4xl">
                <div className="mb-8 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-zinc-50">
                      {tabs.find((item) => item.id === tab)?.label}
                    </h2>
                    <p className="mt-2 text-sm text-zinc-400">
                      Manage the look, structure, and membership experience for this server.
                    </p>
                  </div>
                  <button
                    aria-label="Close settings overlay"
                    className="rounded-2xl border border-white/10 p-3 text-zinc-400 transition hover:bg-white/6 hover:text-zinc-100"
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
                      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                          Server Name
                        </label>
                        <Input className="mt-3" onChange={(event) => setName(event.target.value)} value={name} />
                      </div>
                      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                          Access
                        </label>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge>{detail.server.accessLevel}</Badge>
                          <Badge tone="muted">{detail.server.memberCount} Members</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        Description
                      </label>
                      <Textarea
                        className="mt-3"
                        maxLength={160}
                        onChange={(event) => setDescription(event.target.value)}
                        value={description}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()} type="button">
                        {updateMutation.isPending ? "Saving..." : "Save Overview"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {tab === "members" ? (
                  <div className="space-y-3">
                    {detail.members.map((member) => (
                      <div
                        className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-4"
                        key={member.id}
                      >
                        <Avatar
                          alt={member.displayName}
                          className="h-12 w-12"
                          fallback={member.displayName}
                          src={member.avatarUrl}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-100">{member.displayName}</p>
                          <p className="truncate text-xs text-zinc-500">@{member.username}</p>
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
                            className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/15"
                            disabled={kickMemberMutation.isPending}
                            onClick={() => kickMemberMutation.mutate(member.id)}
                            type="button"
                          >
                            <UserRoundX className="h-4 w-4" />
                            Kick
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {tab === "invites" ? (
                  <div className="space-y-3">
                    {detail.invites.length === 0 ? (
                      <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] p-8 text-sm text-zinc-400">
                        No active invites yet. Generate one from the server menu or the quick invite modal.
                      </div>
                    ) : null}
                    {detail.invites.map((invite) => (
                      <div
                        className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center"
                        key={invite.id}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-zinc-100">/invite/{invite.code}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Created by {invite.createdByDisplayName} • {invite.uses}
                            {invite.maxUses ? ` / ${invite.maxUses}` : ""} uses
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/6"
                            onClick={async () => {
                              await navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.code}`);
                            }}
                            type="button"
                          >
                            <Copy className="h-4 w-4" />
                            Copy
                          </button>
                          <button
                            className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/15"
                            disabled={revokeInviteMutation.isPending}
                            onClick={() => revokeInviteMutation.mutate(invite.id)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {tab === "danger" ? (
                  <div className="rounded-[32px] border border-rose-500/20 bg-[linear-gradient(180deg,rgba(244,63,94,0.08),rgba(244,63,94,0.02))] p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-200">
                        <Shield className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-zinc-50">Delete This Server</h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          This removes the entire server, its channels, invites, and membership data.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <Button
                        className="bg-rose-500 text-white hover:opacity-95"
                        disabled={!detail.server.isOwner}
                        onClick={() => onOpenDeleteServer(detail.server.id, detail.server.name)}
                        type="button"
                      >
                        {detail.server.isOwner ? "Open Delete Confirmation" : "Owner Access Required"}
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
