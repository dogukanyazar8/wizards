"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceServerDetail } from "@wizards/types";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/components/providers/locale-provider";
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
  const { t } = useI18n();
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
  const [createdCategoryName, setCreatedCategoryName] = useState<string | null>(null);
  const [inviteHours, setInviteHours] = useState("24");
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [serverDeleteConfirmation, setServerDeleteConfirmation] = useState("");
  const categoryCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setInviteCopied(false);
    }
  }, [inviteModal.open]);

  useEffect(() => {
    if (!categoryModal.open) {
      if (categoryCloseTimerRef.current) {
        clearTimeout(categoryCloseTimerRef.current);
        categoryCloseTimerRef.current = null;
      }
      setCategoryName("");
      setCreatedCategoryName(null);
    }
  }, [categoryModal.open]);

  useEffect(() => {
    return () => {
      if (categoryCloseTimerRef.current) {
        clearTimeout(categoryCloseTimerRef.current);
      }
    };
  }, []);

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
        onNavigate(result.channelId ? `/channels/${result.serverId}/${result.channelId}` : "/channels");
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

      const nextCategoryName = categoryName.trim();
      await createCategoryRequest(categoryModal.serverId, nextCategoryName);
      return nextCategoryName;
    },
    onSuccess: async (nextCategoryName) => {
      if (!categoryModal.serverId) {
        return;
      }

      await invalidateServer(categoryModal.serverId);
      setCreatedCategoryName(nextCategoryName ?? categoryName.trim());
      setCategoryName("");
      categoryCloseTimerRef.current = setTimeout(() => {
        closeCategoryModal();
      }, 1100);
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
      setInviteCopied(false);
      await invalidateServer(inviteModal.serverId);
    },
  });

  const handleInviteCopy = async () => {
    if (!inviteLink) {
      return;
    }

    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
  };

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
      onNavigate("/channels");
    },
  });

  return (
    <>
      <Modal
        description={t("workspace.modal.serverDescription")}
        onClose={closeServerModal}
        open={serverModal.open}
        title={
          serverModal.mode === "edit"
            ? t("workspace.modal.serverEditTitle")
            : t("workspace.modal.serverCreateTitle")
        }
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
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("common.name")} <span className="text-app-danger">*</span>
            </label>
            <Input
              maxLength={64}
              onChange={(event) => setServerName(event.target.value)}
              placeholder={t("workspace.modal.serverNamePlaceholder")}
              required
              value={serverName}
            />
            {serverName.trim().length > 0 && serverName.trim().length < 2 ? (
              <p className="text-app-danger text-xs">{t("workspace.modal.serverNameMin")}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("common.description")}
            </label>
            <Textarea
              maxLength={160}
              onChange={(event) => setServerDescription(event.target.value)}
              placeholder={t("workspace.modal.serverDescriptionPlaceholder")}
              value={serverDescription}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={closeServerModal} type="button" variant="outline">
              {t("common.cancel")}
            </Button>
            <Button disabled={serverMutation.isPending || serverName.trim().length < 2} type="submit">
              {serverMutation.isPending
                ? t("common.saving")
                : serverModal.mode === "edit"
                  ? t("workspace.modal.saveChanges")
                  : t("workspace.modal.createServer")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description={t("workspace.modal.categoryDescription")}
        onClose={closeCategoryModal}
        open={categoryModal.open}
        title={t("workspace.modal.categoryTitle")}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            categoryMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("workspace.modal.categoryName")}
            </label>
            <Input
              maxLength={32}
              onChange={(event) => {
                setCategoryName(event.target.value);
                if (createdCategoryName) {
                  setCreatedCategoryName(null);
                }
              }}
              placeholder={t("workspace.modal.categoryPlaceholder")}
              required
              value={categoryName}
            />
          </div>
          {createdCategoryName ? (
            <div className="app-success rounded-[24px] border p-4">
              <p className="text-app-success text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.categoryReady")}
              </p>
              <p className="text-app-foreground mt-2 text-sm font-medium">
                {t("workspace.modal.categoryCreated", { name: createdCategoryName })}
              </p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button onClick={closeCategoryModal} type="button" variant="outline">
              {t("common.cancel")}
            </Button>
            <Button disabled={categoryMutation.isPending || categoryName.trim().length < 1} type="submit">
              {categoryMutation.isPending
                ? t("workspace.modal.categoryCreating")
                : t("workspace.modal.categoryTitle")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description={t("workspace.modal.channelDescription")}
        onClose={closeChannelModal}
        open={channelModal.open}
        title={
          channelModal.mode === "edit"
            ? t("workspace.modal.channelEditTitle")
            : channelModal.type === "VOICE"
              ? t("workspace.modal.channelCreateVoiceTitle")
              : t("workspace.modal.channelCreateTextTitle")
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            channelMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("workspace.modal.channelName")}
            </label>
            <Input
              maxLength={32}
              onChange={(event) => setChannelName(event.target.value)}
              placeholder={channelModal.type === "VOICE" ? "strategy-room" : "product-updates"}
              required
              value={channelName}
            />
          </div>
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("workspace.modal.channelTopic")}
            </label>
            <Textarea
              maxLength={120}
              onChange={(event) => setChannelTopic(event.target.value)}
              placeholder={t("workspace.modal.channelTopicPlaceholder")}
              value={channelTopic}
            />
          </div>
          {activeServerDetail ? (
            <div className="space-y-2">
              <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.channelCategory")}
              </label>
              <select
                className="h-11 w-full rounded-2xl border border-[hsl(var(--border)/0.82)] bg-[hsl(var(--surface-soft)/0.55)] px-4 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--ring)/0.55)] focus:ring-4 focus:ring-[hsl(var(--ring)/0.12)]"
                onChange={(event) => setChannelCategoryId(event.target.value || null)}
                value={channelCategoryId ?? ""}
              >
                <option value="">{t("workspace.modal.noCategory")}</option>
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
              {t("common.cancel")}
            </Button>
            <Button disabled={channelMutation.isPending || channelName.trim().length < 1} type="submit">
              {channelMutation.isPending
                ? t("common.saving")
                : channelModal.mode === "edit"
                  ? t("workspace.modal.channelSave")
                  : t("workspace.modal.channelCreate")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description={t("workspace.modal.inviteDescription")}
        onClose={closeInviteModal}
        open={inviteModal.open}
        title={t("workspace.modal.inviteTitle")}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.inviteExpires")}
              </label>
              <Input
                min={1}
                onChange={(event) => setInviteHours(event.target.value)}
                type="number"
                value={inviteHours}
              />
            </div>
            <div className="space-y-2">
              <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.inviteMaxUses")}
              </label>
              <Input
                min={1}
                onChange={(event) => setInviteMaxUses(event.target.value)}
                placeholder={t("workspace.modal.inviteUnlimited")}
                type="number"
                value={inviteMaxUses}
              />
            </div>
          </div>
          {inviteLink ? (
            <div className="app-success rounded-[24px] border p-4">
              <p className="text-app-success text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.inviteReady")}
              </p>
              <p className="text-app-foreground mt-2 break-all text-sm font-medium">
                {inviteLink}
              </p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            {inviteLink ? (
              <Button
                className={inviteCopied ? "border-[hsl(var(--success)/0.28)] text-app-success" : ""}
                onClick={handleInviteCopy}
                type="button"
                variant="outline"
              >
                {inviteCopied ? t("common.linkCopied") : t("common.copyLink")}
              </Button>
            ) : null}
            <Button onClick={closeInviteModal} type="button" variant="outline">
              {t("common.close")}
            </Button>
            <Button disabled={inviteMutation.isPending} onClick={() => inviteMutation.mutate()} type="button">
              {inviteMutation.isPending
                ? t("workspace.modal.inviteGenerating")
                : t("workspace.modal.inviteGenerate")}
            </Button>
          </div>
          {inviteCopied ? (
            <p className="text-app-success text-right text-xs font-medium">
              {t("workspace.modal.inviteCopied")}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        description="This removes the channel immediately. Messages can’t be recovered."
        onClose={closeDeleteChannelDialog}
        open={deleteChannelDialog.open}
        title={t("workspace.modal.deleteChannelTitle", {
          name: deleteChannelDialog.channelName ?? "channel",
        })}
      >
        <div className="flex justify-end gap-2">
          <Button onClick={closeDeleteChannelDialog} type="button" variant="outline">
            {t("common.cancel")}
          </Button>
          <Button
            className="app-danger"
            disabled={deleteChannelMutation.isPending}
            onClick={() => deleteChannelMutation.mutate()}
            type="button"
          >
            {deleteChannelMutation.isPending
              ? t("workspace.modal.deleteChannelDeleting")
              : t("workspace.modal.deleteChannelAction")}
          </Button>
        </div>
      </Modal>

      <Modal
        description={t("workspace.modal.deleteServerDescription")}
        onClose={closeDeleteServerDialog}
        open={deleteServerDialog.open}
        title={t("workspace.modal.deleteServerTitle", {
          name: deleteServerDialog.serverName ?? "server",
        })}
      >
        <div className="space-y-4">
          <Input
            onChange={(event) => setServerDeleteConfirmation(event.target.value)}
            placeholder={
              deleteServerDialog.serverName ?? t("workspace.modal.deleteServerPlaceholder")
            }
            value={serverDeleteConfirmation}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={closeDeleteServerDialog} type="button" variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              className="app-danger"
              disabled={
                deleteServerMutation.isPending ||
                serverDeleteConfirmation !== (deleteServerDialog.serverName ?? "")
              }
              onClick={() => deleteServerMutation.mutate()}
              type="button"
            >
              {deleteServerMutation.isPending
                ? t("workspace.modal.deleteChannelDeleting")
                : t("workspace.modal.deleteServerAction")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
