"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type {
  WorkspaceChannel,
  WorkspaceChannelPermissionPreset,
  WorkspaceServerDetail,
} from "@wizards/types";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CreateCategoryModal } from "@/components/servers/modals/create-category-modal";
import { CreateChannelModal } from "@/components/servers/modals/create-channel-modal";
import { CreateServerModal } from "@/components/servers/modals/create-server-modal";
import { DownloadModal } from "@/components/downloads/download-modal";
import { BugReportModal } from "@/components/support/bug-report-modal";
import { BugReportDiscardDialog } from "@/components/support/bug-report-overlays";
import { ChannelInviteModal } from "@/components/servers/modals/channel-invite-modal";
import { ChannelNotificationsModal } from "@/components/servers/modals/channel-notifications-modal";
import { CreateEventModal } from "@/components/servers/modals/create-event-modal";
import {
  createChannelAdvancedSettings,
  getChannelAdvancedSettingsInput,
  hasCreateChannelProgress,
  isChannelAdvancedSettingsValid,
} from "@/components/servers/modals/channel-form-model";
import { useAppStore } from "@/lib/store";
import {
  applyChannelPatch,
  applyChannelRemoval,
  createCategoryRequest,
  createChannelRequest,
  deleteChannelRequest,
  deleteServerRequest,
  fetchChannelPermissionSettings,
  updateChannelRequest,
  updateChannelPermissionSettings,
  updateCategoryRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

type WorkspaceModalsProps = {
  activeServerDetail: WorkspaceServerDetail | null;
  onNavigate: (href: string) => void;
  uploadthingEnabled: boolean;
};

export function WorkspaceModals(props: WorkspaceModalsProps) {
  const { categoryModal, channelModal, inviteModal, supportModal } = useAppStore(
    useShallow((state) => ({
      categoryModal: state.categoryModal,
      channelModal: state.channelModal,
      inviteModal: state.inviteModal,
      supportModal: state.supportModal,
    })),
  );
  const modalKey = [
    categoryModal.open
      ? `${categoryModal.mode}:${categoryModal.categoryId ?? "new"}`
      : "category-closed",
    channelModal.open
      ? `${channelModal.mode}:${channelModal.channelId ?? channelModal.categoryId ?? "new"}`
      : "channel-closed",
    inviteModal.open
      ? `invite-open:${inviteModal.channelId ?? "default"}:${inviteModal.tab ?? "default"}`
      : "invite-closed",
    // SPEC-INDIRME §A.11 — ray düğmesinden yeniden açılan pencere sıfırlanmış
    // gelir; anahtarın değişmesi bileşeni yeniden kurar, eski başarı ekranı kalmaz.
    `support-${supportModal}`,
  ].join("|");

  return <WorkspaceModalsContent {...props} key={modalKey} />;
}

function WorkspaceModalsContent({
  activeServerDetail,
  onNavigate,
  uploadthingEnabled,
}: WorkspaceModalsProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const {
    categoryModal,
    channelModal,
    channelNotificationsModal,
    closeCategoryModal,
    closeChannelModal,
    closeChannelNotificationsModal,
    closeDeleteChannelDialog,
    closeDeleteServerDialog,
    closeInviteModal,
    closeServerEventModal,
    closeServerModal,
    closeSupportModal,
    deleteChannelDialog,
    deleteServerDialog,
    inviteModal,
    serverEventModal,
    serverModal,
    supportModal,
  } = useAppStore(
    useShallow((state) => ({
      categoryModal: state.categoryModal,
      channelModal: state.channelModal,
      channelNotificationsModal: state.channelNotificationsModal,
      closeCategoryModal: state.closeCategoryModal,
      closeChannelModal: state.closeChannelModal,
      closeChannelNotificationsModal: state.closeChannelNotificationsModal,
      closeDeleteChannelDialog: state.closeDeleteChannelDialog,
      closeDeleteServerDialog: state.closeDeleteServerDialog,
      closeInviteModal: state.closeInviteModal,
      closeServerEventModal: state.closeServerEventModal,
      closeServerModal: state.closeServerModal,
      closeSupportModal: state.closeSupportModal,
      deleteChannelDialog: state.deleteChannelDialog,
      deleteServerDialog: state.deleteServerDialog,
      inviteModal: state.inviteModal,
      serverEventModal: state.serverEventModal,
      serverModal: state.serverModal,
      supportModal: state.supportModal,
    })),
  );

  const editingChannel =
    channelModal.mode === "edit" && activeServerDetail
      ? ([
          ...activeServerDetail.ungroupedChannels,
          ...activeServerDetail.categories.flatMap((category) => category.channels),
        ].find((channel) => channel.id === channelModal.channelId) ?? null)
      : null;
  const editingCategory =
    categoryModal.mode === "edit" && activeServerDetail
      ? (activeServerDetail.categories.find(
          (category) => category.id === categoryModal.categoryId,
        ) ?? null)
      : null;
  /**
   * Kanal türü artık **düzenlenebilir**: SPEC §6.2'nin 1. adımı iki kart sunuyor. Başlangıç
   * değeri eskisi gibi düzenlenen kanaldan ya da mağazadaki tetikleyiciden gelir; `edit`
   * kipinde kartlar kilitli (mevcut bir kanalın türü değiştirilemez).
   */
  const [channelType, setChannelType] = useState<WorkspaceChannel["type"]>(
    () => editingChannel?.type ?? channelModal.type,
  );

  const [channelName, setChannelName] = useState(() => editingChannel?.name ?? "");
  const [channelTopic, setChannelTopic] = useState(() => editingChannel?.topic ?? "");
  const [channelCategoryId, setChannelCategoryId] = useState<string | null>(
    () => editingChannel?.categoryId ?? channelModal.categoryId ?? null,
  );
  const [channelLocked, setChannelLocked] = useState(() => editingChannel?.locked ?? false);
  const [channelAdvancedSettings, setChannelAdvancedSettings] = useState(() =>
    createChannelAdvancedSettings(editingChannel),
  );
  const [channelPermissionOverride, setChannelPermissionOverride] = useState<{
    allowedRoleIds: string[];
    preset: WorkspaceChannelPermissionPreset;
  } | null>(null);
  const [categoryName, setCategoryName] = useState(() => editingCategory?.name ?? "");
  const [channelDiscardOpen, setChannelDiscardOpen] = useState(false);
  const [serverDeleteConfirmation, setServerDeleteConfirmation] = useState("");
  const channelPermissionControlsEnabled = Boolean(
    channelModal.open && activeServerDetail?.server.isAdmin,
  );
  const channelPermissionsEnabled = Boolean(
    channelPermissionControlsEnabled &&
    channelModal.open &&
    channelModal.mode === "edit" &&
    channelModal.channelId,
  );
  const channelPermissionQuery = useQuery({
    enabled: channelPermissionsEnabled,
    queryFn: () => fetchChannelPermissionSettings(channelModal.channelId!),
    queryKey: channelModal.channelId
      ? workspaceQueryKeys.channelPermissions(channelModal.channelId)
      : ["workspace", "channel", "idle", "permissions"],
  });
  const channelPermissionPreset =
    channelPermissionOverride?.preset ??
    channelPermissionQuery.data?.preset ??
    (editingChannel?.locked ? "LOCKED_VISIBLE" : "PUBLIC");
  const channelAllowedRoleIds =
    channelPermissionOverride?.allowedRoleIds ?? channelPermissionQuery.data?.allowedRoleIds ?? [];
  const setChannelPermissionPreset = (preset: WorkspaceChannelPermissionPreset) => {
    setChannelPermissionOverride((current) => ({
      allowedRoleIds: current?.allowedRoleIds ?? channelPermissionQuery.data?.allowedRoleIds ?? [],
      preset,
    }));
  };
  const setChannelAllowedRoleIds = (nextValue: string[] | ((current: string[]) => string[])) => {
    setChannelPermissionOverride((current) => {
      const allowedRoleIds =
        current?.allowedRoleIds ?? channelPermissionQuery.data?.allowedRoleIds ?? [];
      return {
        allowedRoleIds: typeof nextValue === "function" ? nextValue(allowedRoleIds) : nextValue,
        preset: current?.preset ?? channelPermissionQuery.data?.preset ?? "PUBLIC",
      };
    });
  };
  const requestChannelClose = () => {
    const baseline = {
      advancedSettings: createChannelAdvancedSettings(),
      allowedRoleIds: [] as string[],
      categoryId: channelModal.categoryId ?? null,
      name: "",
      preset: "PUBLIC" as const,
      topic: "",
      type: channelModal.type,
    };
    const current = {
      advancedSettings: channelAdvancedSettings,
      allowedRoleIds: channelAllowedRoleIds,
      categoryId: channelCategoryId,
      name: channelName,
      preset: channelPermissionPreset,
      topic: channelTopic,
      type: channelType,
    };

    if (channelModal.mode === "create" && hasCreateChannelProgress(current, baseline)) {
      setChannelDiscardOpen(true);
      return;
    }

    closeChannelModal();
  };

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

  const categoryMutation = useMutation({
    mutationFn: async () => {
      if (!categoryModal.serverId) {
        return;
      }

      const nextCategoryName = categoryName.trim();
      if (categoryModal.mode === "edit" && categoryModal.categoryId) {
        await updateCategoryRequest(
          categoryModal.serverId,
          categoryModal.categoryId,
          nextCategoryName,
        );
        return nextCategoryName;
      }

      await createCategoryRequest(categoryModal.serverId, nextCategoryName);
      return nextCategoryName;
    },
    onSuccess: async () => {
      if (!categoryModal.serverId) {
        return;
      }

      await invalidateServer(categoryModal.serverId);
      setCategoryName("");
      closeCategoryModal();
    },
  });

  const channelMutation = useMutation({
    mutationFn: async () => {
      if (!channelModal.serverId) {
        return;
      }

      if (channelModal.mode === "edit" && channelModal.channelId) {
        const nextLocked = channelPermissionControlsEnabled
          ? channelPermissionPreset !== "PUBLIC"
          : channelLocked;

        await updateChannelRequest(channelModal.channelId, {
          ...getChannelAdvancedSettingsInput(channelType, channelAdvancedSettings),
          categoryId: channelCategoryId,
          locked: nextLocked,
          name: channelName,
          topic: channelTopic,
        });

        if (channelPermissionControlsEnabled) {
          await updateChannelPermissionSettings(channelModal.channelId, {
            allowedRoleIds: channelAllowedRoleIds,
            preset: channelPermissionPreset,
          });
        }

        return { success: true as const };
      }

      return createChannelRequest(channelModal.serverId, {
        ...getChannelAdvancedSettingsInput(channelType, channelAdvancedSettings),
        categoryId: channelCategoryId,
        name: channelName,
        permissions: channelPermissionControlsEnabled
          ? {
              allowedRoleIds: channelAllowedRoleIds,
              preset: channelPermissionPreset,
            }
          : undefined,
        topic: channelTopic,
        type: channelType,
      });
    },
    onMutate: async () => {
      if (!activeServerDetail || channelModal.mode !== "edit" || !channelModal.channelId) {
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
            ...getChannelAdvancedSettingsInput(channelType, channelAdvancedSettings),
            categoryId: channelCategoryId,
            locked: channelPermissionControlsEnabled
              ? channelPermissionPreset !== "PUBLIC"
              : channelLocked,
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
      if (channelModal.channelId) {
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.channelPermissions(channelModal.channelId),
        });
      }
      closeChannelModal();
      setChannelName("");
      setChannelTopic("");
      setChannelLocked(false);
      setChannelAdvancedSettings(createChannelAdvancedSettings());
      setChannelPermissionPreset("PUBLIC");
      setChannelAllowedRoleIds([]);
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
      onNavigate("/channels");
    },
  });

  return (
    <>
      {/* SPEC-INDIRME §A — rayın "Sorun bildir" düğmesinin penceresi. */}
      <BugReportModal onClose={closeSupportModal} open={supportModal === "report"} />

      {/* SPEC-INDIRME §B — rayın "Uygulamayı indir" düğmesinin penceresi. */}
      <DownloadModal
        onClose={closeSupportModal}
        onNavigate={onNavigate}
        open={supportModal === "download"}
      />

      {/*
        Ş10 — SPEC-SUNUCU §7. Ray'deki `+` düğmesi 940 px'lik oluşturma penceresini açar.
        Ş14: eski `Modal` tabanlı **düzenleme** kipi silindi; sunucu düzenleme artık
        Sunucu ayarları › Genel'in işi (§8.1) ve `openServerModal` yalnız `create` alıyor.
      */}
      {serverModal.open ? (
        <CreateServerModal
          onClose={closeServerModal}
          onNavigate={onNavigate}
          open
          uploadthingEnabled={uploadthingEnabled}
        />
      ) : null}

      {categoryModal.open ? (
        <CreateCategoryModal
          error={categoryMutation.isError}
          mode={categoryModal.mode}
          name={categoryName}
          onChange={setCategoryName}
          onClose={closeCategoryModal}
          onSubmit={() => categoryMutation.mutate()}
          open
          pending={categoryMutation.isPending}
          serverName={activeServerDetail?.server.name ?? ""}
        />
      ) : null}

      {channelModal.open ? (
        <CreateChannelModal
          advancedSettings={channelAdvancedSettings}
          allowedRoleIds={channelAllowedRoleIds}
          canSubmit={
            channelName.trim().length > 0 &&
            isChannelAdvancedSettingsValid(
              channelType,
              channelAdvancedSettings,
              activeServerDetail?.server.availableRtcRegions ?? [],
            ) &&
            !(
              channelPermissionControlsEnabled &&
              channelPermissionPreset === "ROLE_GATED" &&
              channelAllowedRoleIds.length === 0
            )
          }
          categoryId={channelCategoryId}
          error={channelMutation.isError || channelPermissionQuery.isError}
          mode={channelModal.mode}
          name={channelName}
          onAdvancedSettingsChange={setChannelAdvancedSettings}
          onAllowedRoleIdsChange={setChannelAllowedRoleIds}
          onCategoryChange={setChannelCategoryId}
          onClose={requestChannelClose}
          onNameChange={setChannelName}
          onPresetChange={setChannelPermissionPreset}
          onSubmit={() => channelMutation.mutate()}
          onTopicChange={setChannelTopic}
          onTypeChange={setChannelType}
          open
          pending={channelMutation.isPending}
          permissionsEditable={channelPermissionControlsEnabled}
          preset={channelPermissionPreset}
          serverDetail={activeServerDetail}
          topic={channelTopic}
          type={channelType}
        />
      ) : null}

      <BugReportDiscardDialog
        body={t("server.modal.channel.discard.body")}
        cancelLabel={t("server.modal.channel.discard.cancel")}
        confirmLabel={t("server.modal.channel.discard.confirm")}
        onCancel={() => setChannelDiscardOpen(false)}
        onConfirm={() => {
          setChannelDiscardOpen(false);
          closeChannelModal();
        }}
        open={channelModal.open && channelDiscardOpen}
        testIdPrefix="create-channel"
        title={t("server.modal.channel.discard.title")}
      />

      {inviteModal.open && activeServerDetail ? (
        <ChannelInviteModal
          channelId={inviteModal.channelId}
          detail={activeServerDetail}
          initialTab={inviteModal.tab}
          onClose={closeInviteModal}
          open
        />
      ) : null}

      {channelNotificationsModal.open && channelNotificationsModal.channelId ? (
        <ChannelNotificationsModal
          channelId={channelNotificationsModal.channelId}
          channelName={channelNotificationsModal.channelName ?? ""}
          onClose={closeChannelNotificationsModal}
          open
        />
      ) : null}

      {serverEventModal.open && activeServerDetail ? (
        <CreateEventModal
          detail={activeServerDetail}
          eventId={serverEventModal.eventId}
          onClose={closeServerEventModal}
          open
        />
      ) : null}

      <Modal
        description="This removes the channel immediately. Messages can’t be recovered."
        onClose={closeDeleteChannelDialog}
        open={deleteChannelDialog.open}
        title={t("workspace.modal.deleteChannelTitle", {
          name: deleteChannelDialog.channelName ?? "channel",
        })}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            onClick={closeDeleteChannelDialog}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="app-danger w-full sm:w-auto"
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
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              onClick={closeDeleteServerDialog}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="app-danger w-full sm:w-auto"
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
