"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { WorkspaceServerDetail } from "@wizards/types";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { ServerIconField } from "@/components/shell/server-icon-field";
import { useAppStore } from "@/lib/store";
import {
  applyChannelPatch,
  applyChannelRemoval,
  createCategoryRequest,
  createChannelRequest,
  createInviteRequest,
  createServerRequest,
  deleteChannelRequest,
  deleteServerRequest,
  updateChannelRequest,
  updateServerRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

type WorkspaceModalsProps = {
  activeServerDetail: WorkspaceServerDetail | null;
  onNavigate: (href: string) => void;
  uploadthingEnabled: boolean;
};

export function WorkspaceModals({
  activeServerDetail,
  onNavigate,
  uploadthingEnabled,
}: WorkspaceModalsProps) {
  const queryClient = useQueryClient();
  const {
    categoryModal,
    channelModal,
    closeCategoryModal,
    closeChannelModal,
    closeDeleteChannelDialog,
    closeDeleteServerDialog,
    closeInviteModal,
    closeServerModal,
    deleteChannelDialog,
    deleteServerDialog,
    inviteModal,
    serverModal,
  } = useAppStore(
    useShallow((state) => ({
      categoryModal: state.categoryModal,
      channelModal: state.channelModal,
      closeCategoryModal: state.closeCategoryModal,
      closeChannelModal: state.closeChannelModal,
      closeDeleteChannelDialog: state.closeDeleteChannelDialog,
      closeDeleteServerDialog: state.closeDeleteServerDialog,
      closeInviteModal: state.closeInviteModal,
      closeServerModal: state.closeServerModal,
      deleteChannelDialog: state.deleteChannelDialog,
      deleteServerDialog: state.deleteServerDialog,
      inviteModal: state.inviteModal,
      serverModal: state.serverModal,
    })),
  );

  const editingChannel =
    channelModal.mode === "edit" && activeServerDetail
      ? [...activeServerDetail.ungroupedChannels, ...activeServerDetail.categories.flatMap((category) => category.channels)].find(
          (channel) => channel.id === channelModal.channelId,
        ) ?? null
      : null;

  const [serverName, setServerName] = useState("");
  const [serverDescription, setServerDescription] = useState("");
  const [serverIconUrl, setServerIconUrl] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [channelTopic, setChannelTopic] = useState("");
  const [channelCategoryId, setChannelCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [inviteHours, setInviteHours] = useState("24");
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [serverDeleteConfirmation, setServerDeleteConfirmation] = useState("");

  useEffect(() => {
    if (!serverModal.open) {
      return;
    }

    if (serverModal.mode === "edit" && activeServerDetail) {
      setServerName(activeServerDetail.server.name);
      setServerDescription(activeServerDetail.server.description ?? "");
      setServerIconUrl(activeServerDetail.server.iconUrl ?? null);
      return;
    }

    setServerName("");
    setServerDescription("");
    setServerIconUrl(null);
  }, [
    activeServerDetail?.server.description,
    activeServerDetail?.server.iconUrl,
    activeServerDetail?.server.name,
    activeServerDetail,
    serverModal.mode,
    serverModal.open,
  ]);

  useEffect(() => {
    if (!channelModal.open) {
      return;
    }

    setChannelName(editingChannel?.name ?? "");
    setChannelTopic(editingChannel?.topic ?? "");
    setChannelCategoryId(editingChannel?.categoryId ?? channelModal.categoryId ?? null);
  }, [channelModal.categoryId, channelModal.open, editingChannel?.categoryId, editingChannel?.name, editingChannel?.topic]);

  useEffect(() => {
    if (!inviteModal.open) {
      setInviteLink(null);
      setInviteHours("24");
      setInviteMaxUses("");
    }
  }, [inviteModal.open]);

  const invalidateServer = async (serverId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      }),
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(serverId),
      }),
    ]);
  };

  const serverMutation = useMutation({
    mutationFn: async () => {
      if (serverModal.mode === "edit" && activeServerDetail) {
        return updateServerRequest(activeServerDetail.server.id, {
          description: serverDescription,
          iconUrl: serverIconUrl,
          name: serverName,
        });
      }

      return createServerRequest({
        description: serverDescription,
        iconUrl: serverIconUrl,
        name: serverName,
      });
    },
    onSuccess: async (result) => {
      closeServerModal();
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });

      if ("serverId" in result && result.serverId) {
        onNavigate(result.channelId ? `/channels/${result.serverId}/${result.channelId}` : "/channels/@me");
        return;
      }

      if (activeServerDetail) {
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.server(activeServerDetail.server.id),
        });
      }
    },
  });

  const categoryMutation = useMutation({
    mutationFn: async () => {
      if (!categoryModal.serverId) {
        return;
      }

      return createCategoryRequest(categoryModal.serverId, categoryName);
    },
    onSuccess: async () => {
      if (!categoryModal.serverId) {
        return;
      }

      await invalidateServer(categoryModal.serverId);
      closeCategoryModal();
      setCategoryName("");
    },
  });

  const channelMutation = useMutation({
    mutationFn: async () => {
      if (!channelModal.serverId) {
        return;
      }

      if (channelModal.mode === "edit" && channelModal.channelId) {
        return updateChannelRequest(channelModal.channelId, {
          categoryId: channelCategoryId,
          name: channelName,
          topic: channelTopic,
        });
      }

      return createChannelRequest(channelModal.serverId, {
        categoryId: channelCategoryId,
        name: channelName,
        topic: channelTopic,
        type: channelModal.type,
      });
    },
    onMutate: async () => {
      if (
        !activeServerDetail ||
        channelModal.mode !== "edit" ||
        !channelModal.channelId
      ) {
        return { previousDetail: null };
      }

      await queryClient.cancelQueries({
        queryKey: workspaceQueryKeys.server(activeServerDetail.server.id),
      });

      const previousDetail =
        queryClient.getQueryData<WorkspaceServerDetail>(
          workspaceQueryKeys.server(activeServerDetail.server.id),
        ) ?? null;

      if (previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(activeServerDetail.server.id),
          applyChannelPatch(previousDetail, channelModal.channelId, {
            categoryId: channelCategoryId,
            name: channelName,
            topic: channelTopic,
          }),
        );
      }

      return { previousDetail };
    },
    onError: (_error, _variables, context) => {
      if (activeServerDetail && context?.previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(activeServerDetail.server.id),
          context.previousDetail,
        );
      }
    },
    onSuccess: async () => {
      if (!channelModal.serverId) {
        return;
      }

      await invalidateServer(channelModal.serverId);
      closeChannelModal();
      setChannelName("");
      setChannelTopic("");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!inviteModal.serverId) {
        return null;
      }

      const result = await createInviteRequest(inviteModal.serverId, {
        expiresInHours: Number(inviteHours || "24"),
        maxUses: inviteMaxUses ? Number(inviteMaxUses) : null,
      });

      return result;
    },
    onSuccess: async (result) => {
      if (!inviteModal.serverId || !result) {
        return;
      }

      setInviteLink(`${window.location.origin}/invite/${result.code}`);
      await invalidateServer(inviteModal.serverId);
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async () => {
      if (!deleteChannelDialog.channelId) {
        return;
      }

      return deleteChannelRequest(deleteChannelDialog.channelId);
    },
    onMutate: async () => {
      if (!activeServerDetail || !deleteChannelDialog.channelId) {
        return { previousDetail: null };
      }

      await queryClient.cancelQueries({
        queryKey: workspaceQueryKeys.server(activeServerDetail.server.id),
      });

      const previousDetail =
        queryClient.getQueryData<WorkspaceServerDetail>(
          workspaceQueryKeys.server(activeServerDetail.server.id),
        ) ?? null;

      if (previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(activeServerDetail.server.id),
          applyChannelRemoval(previousDetail, deleteChannelDialog.channelId),
        );
      }

      return { previousDetail };
    },
    onError: (_error, _variables, context) => {
      if (activeServerDetail && context?.previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(activeServerDetail.server.id),
          context.previousDetail,
        );
      }
    },
    onSuccess: async () => {
      if (!activeServerDetail) {
        return;
      }

      await invalidateServer(activeServerDetail.server.id);
      closeDeleteChannelDialog();
    },
  });

  const deleteServerMutation = useMutation({
    mutationFn: async () => {
      if (!deleteServerDialog.serverId) {
        return;
      }

      return deleteServerRequest(deleteServerDialog.serverId, serverDeleteConfirmation);
    },
    onSuccess: async () => {
      closeDeleteServerDialog();
      setServerDeleteConfirmation("");
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });
      onNavigate("/channels/@me");
    },
  });

  return (
    <>
      <Modal
        description="Spin up a new server with its first channels already in place."
        onClose={closeServerModal}
        open={serverModal.open}
        title={serverModal.mode === "edit" ? "Edit Server" : "Create Server"}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            serverMutation.mutate();
          }}
        >
          <ServerIconField
            label={serverName || "WZ"}
            onChange={setServerIconUrl}
            uploadthingEnabled={uploadthingEnabled}
            value={serverIconUrl}
          />
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">Name</label>
            <Input
              maxLength={64}
              onChange={(event) => setServerName(event.target.value)}
              placeholder="The Arcane Atelier"
              required
              value={serverName}
            />
          </div>
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">Description</label>
            <Textarea
              maxLength={160}
              onChange={(event) => setServerDescription(event.target.value)}
              placeholder="A polished space for your team, club, or community."
              value={serverDescription}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={closeServerModal} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={serverMutation.isPending || serverName.trim().length < 2} type="submit">
              {serverMutation.isPending ? "Saving..." : serverModal.mode === "edit" ? "Save Changes" : "Create Server"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Add a new category block to organize channels."
        onClose={closeCategoryModal}
        open={categoryModal.open}
        title="Create Category"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            categoryMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">Category Name</label>
            <Input
              maxLength={32}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Launch Zone"
              required
              value={categoryName}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={closeCategoryModal} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={categoryMutation.isPending || categoryName.trim().length < 1} type="submit">
              {categoryMutation.isPending ? "Creating..." : "Create Category"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Create or refine a channel. Renames update optimistically so the sidebar stays snappy."
        onClose={closeChannelModal}
        open={channelModal.open}
        title={channelModal.mode === "edit" ? "Edit Channel" : `Create ${channelModal.type === "VOICE" ? "Voice" : "Text"} Channel`}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            channelMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">Channel Name</label>
            <Input
              maxLength={32}
              onChange={(event) => setChannelName(event.target.value)}
              placeholder={channelModal.type === "VOICE" ? "strategy-room" : "product-updates"}
              required
              value={channelName}
            />
          </div>
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">Topic</label>
            <Textarea
              maxLength={120}
              onChange={(event) => setChannelTopic(event.target.value)}
              placeholder="What belongs in this channel?"
              value={channelTopic}
            />
          </div>
          {activeServerDetail ? (
            <div className="space-y-2">
              <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">Category</label>
              <select
                className="h-11 w-full rounded-2xl border border-[hsl(var(--border)/0.82)] bg-[hsl(var(--surface-soft)/0.55)] px-4 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--ring)/0.55)] focus:ring-4 focus:ring-[hsl(var(--ring)/0.12)]"
                onChange={(event) => setChannelCategoryId(event.target.value || null)}
                value={channelCategoryId ?? ""}
              >
                <option value="">No category</option>
                {activeServerDetail.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button onClick={closeChannelModal} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={channelMutation.isPending || channelName.trim().length < 1} type="submit">
              {channelMutation.isPending ? "Saving..." : channelModal.mode === "edit" ? "Save Channel" : "Create Channel"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Generate a fresh invite code and share it instantly."
        onClose={closeInviteModal}
        open={inviteModal.open}
        title="Create Invite"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">Expires In (Hours)</label>
              <Input
                min={1}
                onChange={(event) => setInviteHours(event.target.value)}
                type="number"
                value={inviteHours}
              />
            </div>
            <div className="space-y-2">
              <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">Max Uses</label>
              <Input
                min={1}
                onChange={(event) => setInviteMaxUses(event.target.value)}
                placeholder="Unlimited"
                type="number"
                value={inviteMaxUses}
              />
            </div>
          </div>
          {inviteLink ? (
            <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Ready to Share</p>
              <p className="mt-2 break-all text-sm text-emerald-100">{inviteLink}</p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            {inviteLink ? (
              <Button
                onClick={async () => {
                  if (inviteLink) {
                    await navigator.clipboard.writeText(inviteLink);
                  }
                }}
                type="button"
                variant="outline"
              >
                Copy Link
              </Button>
            ) : null}
            <Button onClick={closeInviteModal} type="button" variant="outline">
              Close
            </Button>
            <Button disabled={inviteMutation.isPending} onClick={() => inviteMutation.mutate()} type="button">
              {inviteMutation.isPending ? "Generating..." : "Generate Invite"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        description="This removes the channel immediately. Messages can’t be recovered."
        onClose={closeDeleteChannelDialog}
        open={deleteChannelDialog.open}
        title={`Delete #${deleteChannelDialog.channelName ?? "channel"}?`}
      >
        <div className="flex justify-end gap-2">
          <Button onClick={closeDeleteChannelDialog} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            className="bg-rose-500 text-white hover:opacity-95"
            disabled={deleteChannelMutation.isPending}
            onClick={() => deleteChannelMutation.mutate()}
            type="button"
          >
            {deleteChannelMutation.isPending ? "Deleting..." : "Delete Channel"}
          </Button>
        </div>
      </Modal>

      <Modal
        description="Type the server name to confirm permanent deletion."
        onClose={closeDeleteServerDialog}
        open={deleteServerDialog.open}
        title={`Delete ${deleteServerDialog.serverName ?? "server"}?`}
      >
        <div className="space-y-4">
          <Input
            onChange={(event) => setServerDeleteConfirmation(event.target.value)}
            placeholder={deleteServerDialog.serverName ?? "Server name"}
            value={serverDeleteConfirmation}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={closeDeleteServerDialog} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-rose-500 text-white hover:opacity-95"
              disabled={
                deleteServerMutation.isPending ||
                serverDeleteConfirmation !== (deleteServerDialog.serverName ?? "")
              }
              onClick={() => deleteServerMutation.mutate()}
              type="button"
            >
              {deleteServerMutation.isPending ? "Deleting..." : "Delete Server"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
