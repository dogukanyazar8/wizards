"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceChannelPermissionPreset, WorkspaceServerDetail } from "@wizards/types";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { ServerIconField } from "@/components/shell/server-icon-field";
import { ServerFeatureToggle } from "@/components/shell/server-feature-toggle";
import { ChannelAdvancedSettingsFields } from "@/components/shell/channel-advanced-settings";
import {
  createChannelAdvancedSettings,
  getChannelAdvancedSettingsInput,
  isChannelAdvancedSettingsValid,
} from "@/components/shell/channel-form-model";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  applyChannelPatch,
  applyChannelRemoval,
  createCategoryRequest,
  createChannelRequest,
  createInviteRequest,
  createServerRequest,
  deleteChannelRequest,
  deleteServerRequest,
  fetchChannelPermissionSettings,
  updateChannelRequest,
  updateChannelPermissionSettings,
  updateCategoryRequest,
  updateServerRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

type WorkspaceModalsProps = {
  activeServerDetail: WorkspaceServerDetail | null;
  onNavigate: (href: string) => void;
  uploadthingEnabled: boolean;
};

export function WorkspaceModals(props: WorkspaceModalsProps) {
  const { categoryModal, channelModal, inviteModal, serverModal } = useAppStore(
    useShallow((state) => ({
      categoryModal: state.categoryModal,
      channelModal: state.channelModal,
      inviteModal: state.inviteModal,
      serverModal: state.serverModal,
    })),
  );
  const modalKey = [
    categoryModal.open
      ? `${categoryModal.mode}:${categoryModal.categoryId ?? "new"}`
      : "category-closed",
    channelModal.open
      ? `${channelModal.mode}:${channelModal.channelId ?? channelModal.categoryId ?? "new"}`
      : "channel-closed",
    inviteModal.open ? "invite-open" : "invite-closed",
    serverModal.open ? serverModal.mode : "server-closed",
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
  const channelType = editingChannel?.type ?? channelModal.type;

  const initialServer = serverModal.mode === "edit" ? activeServerDetail?.server : null;
  const [serverName, setServerName] = useState(() => initialServer?.name ?? "");
  const [serverShortName, setServerShortName] = useState(() => initialServer?.shortName ?? "");
  const [serverDescription, setServerDescription] = useState(
    () => initialServer?.description ?? "",
  );
  const [serverIconUrl, setServerIconUrl] = useState<string | null>(
    () => initialServer?.iconUrl ?? null,
  );
  const [serverAllowGifs, setServerAllowGifs] = useState(() => initialServer?.allowGifs ?? true);
  const [serverAllowFileUploads, setServerAllowFileUploads] = useState(
    () => initialServer?.allowFileUploads ?? true,
  );
  const [serverAllowMemberAdds, setServerAllowMemberAdds] = useState(
    () => initialServer?.allowMemberAdds ?? true,
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
  const [createdCategoryName, setCreatedCategoryName] = useState<string | null>(null);
  const [inviteHours, setInviteHours] = useState("24");
  const [inviteNeverExpires, setInviteNeverExpires] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [serverDeleteConfirmation, setServerDeleteConfirmation] = useState("");
  const categoryCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          allowFileUploads: serverAllowFileUploads,
          allowGifs: serverAllowGifs,
          allowMemberAdds: serverAllowMemberAdds,
          description: serverDescription,
          iconUrl: serverIconUrl,
          name: serverName,
          shortName: serverShortName,
        });
      }

      return createServerRequest({
        allowFileUploads: serverAllowFileUploads,
        allowGifs: serverAllowGifs,
        allowMemberAdds: serverAllowMemberAdds,
        description: serverDescription,
        iconUrl: serverIconUrl,
        name: serverName,
        shortName: serverShortName,
      });
    },
    onSuccess: async (result) => {
      closeServerModal();

      if (result && "serverId" in result && result.serverId) {
        void queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.servers,
        });
        onNavigate(
          result.channelId ? `/channels/${result.serverId}/${result.channelId}` : "/channels",
        );
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });

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
    onSuccess: async (nextCategoryName) => {
      if (!categoryModal.serverId) {
        return;
      }

      await invalidateServer(categoryModal.serverId);
      setCreatedCategoryName(nextCategoryName ?? categoryName.trim());
      if (categoryModal.mode === "create") {
        setCategoryName("");
      }
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

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!inviteModal.serverId) {
        return null;
      }

      const result = await createInviteRequest(inviteModal.serverId, {
        expiresInHours: inviteNeverExpires ? null : Number(inviteHours || "24"),
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
          data-testid={serverModal.mode === "edit" ? "server-edit-form" : "server-create-form"}
          onSubmit={(event) => {
            event.preventDefault();
            serverMutation.mutate();
          }}
        >
          <ServerIconField
            label={serverShortName || serverName || "Whispr"}
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
              data-testid="server-name-input"
              value={serverName}
            />
            {serverName.trim().length > 0 && serverName.trim().length < 2 ? (
              <p className="text-app-danger text-xs">{t("workspace.modal.serverNameMin")}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("workspace.modal.serverShortName")}
            </label>
            <Input
              maxLength={4}
              onChange={(event) =>
                setServerShortName(
                  Array.from(event.target.value.trim().toUpperCase()).slice(0, 4).join(""),
                )
              }
              placeholder={t("workspace.modal.serverShortNamePlaceholder")}
              data-testid="server-short-name-input"
              value={serverShortName}
            />
            <p className="text-xs leading-5 text-app-muted">
              {t("workspace.modal.serverShortNameHint")}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("common.description")}
            </label>
            <Textarea
              maxLength={160}
              onChange={(event) => setServerDescription(event.target.value)}
              placeholder={t("workspace.modal.serverDescriptionPlaceholder")}
              data-testid="server-description-input"
              value={serverDescription}
            />
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.media.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                {t("workspace.media.description")}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ServerFeatureToggle
                checked={serverAllowGifs}
                description={t("workspace.media.gifs.description")}
                onChange={setServerAllowGifs}
                title={t("workspace.media.gifs.title")}
              />
              <ServerFeatureToggle
                checked={serverAllowFileUploads}
                description={t("workspace.media.files.description")}
                onChange={setServerAllowFileUploads}
                title={t("workspace.media.files.title")}
              />
            </div>
            <ServerFeatureToggle
              checked={serverAllowMemberAdds}
              description={t("workspace.members.allowAdds.description")}
              onChange={setServerAllowMemberAdds}
              title={t("workspace.members.allowAdds.title")}
            />
          </div>
          {serverMutation.error ? (
            <div className="app-danger rounded-[24px] border p-4 text-sm font-medium">
              {t("workspace.modal.serverSaveError")}
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              onClick={closeServerModal}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              data-testid="server-submit-button"
              disabled={serverMutation.isPending || serverName.trim().length < 2}
              type="submit"
            >
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
        description={
          categoryModal.mode === "edit"
            ? t("workspace.modal.categoryEditDescription")
            : t("workspace.modal.categoryDescription")
        }
        onClose={closeCategoryModal}
        open={categoryModal.open}
        title={
          categoryModal.mode === "edit"
            ? t("workspace.modal.categoryEditTitle")
            : t("workspace.modal.categoryTitle")
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            categoryMutation.mutate();
          }}
        >
          <div className="app-panel-soft rounded-[24px] border p-4">
            <div className="mb-3">
              <p className="text-app-foreground text-sm font-semibold">
                {t("workspace.modal.categoryName")}
              </p>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                {t("workspace.modal.categoryHint")}
              </p>
            </div>
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("workspace.modal.categoryName")}
            </label>
            <Input
              maxLength={48}
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
                {t(
                  categoryModal.mode === "edit"
                    ? "workspace.modal.categoryUpdated"
                    : "workspace.modal.categoryCreated",
                  { name: createdCategoryName },
                )}
              </p>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              onClick={closeCategoryModal}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={categoryMutation.isPending || categoryName.trim().length < 1}
              type="submit"
            >
              {categoryMutation.isPending
                ? categoryModal.mode === "edit"
                  ? t("workspace.modal.categorySaving")
                  : t("workspace.modal.categoryCreating")
                : categoryModal.mode === "edit"
                  ? t("workspace.modal.categorySave")
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
            : channelType === "VOICE"
              ? t("workspace.modal.channelCreateVoiceTitle")
              : t("workspace.modal.channelCreateTextTitle")
        }
      >
        <form
          className="space-y-4"
          data-testid="channel-form"
          onSubmit={(event) => {
            event.preventDefault();
            channelMutation.mutate();
          }}
        >
          <div className="app-panel-soft rounded-[24px] border p-4">
            <div className="mb-3">
              <p className="text-app-foreground text-sm font-semibold">
                {t("workspace.modal.channelName")}
              </p>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                {t("workspace.modal.channelHint")}
              </p>
            </div>
            <label
              className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]"
              htmlFor="channel-name"
            >
              {t("workspace.modal.channelName")}
            </label>
            <Input
              id="channel-name"
              maxLength={48}
              onChange={(event) => setChannelName(event.target.value)}
              placeholder={
                channelType === "VOICE"
                  ? t("workspace.modal.channelVoicePlaceholder")
                  : t("workspace.modal.channelTextPlaceholder")
              }
              required
              value={channelName}
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]"
              htmlFor="channel-topic"
            >
              {t("workspace.modal.channelTopic")}
            </label>
            <Textarea
              id="channel-topic"
              maxLength={120}
              onChange={(event) => setChannelTopic(event.target.value)}
              placeholder={t("workspace.modal.channelTopicPlaceholder")}
              value={channelTopic}
            />
          </div>
          <ChannelAdvancedSettingsFields
            availableRtcRegions={activeServerDetail?.server.availableRtcRegions ?? []}
            channelType={channelType}
            onChange={setChannelAdvancedSettings}
            value={channelAdvancedSettings}
          />
          {channelPermissionControlsEnabled && activeServerDetail ? (
            <div className="app-panel-soft rounded-[24px] border p-4">
              <div className="mb-4">
                <p className="text-app-foreground text-sm font-semibold">
                  {t("workspace.permissions.title")}
                </p>
                <p className="mt-1 text-xs leading-5 text-app-muted">
                  {channelType === "VOICE"
                    ? t("workspace.permissions.voiceDescription")
                    : t("workspace.permissions.textDescription")}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["PUBLIC", "LOCKED_VISIBLE", "PRIVATE", "ROLE_GATED"] as const).map((preset) => (
                  <button
                    className={cn(
                      "rounded-[20px] border p-3 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      channelPermissionPreset === preset
                        ? "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.12)] text-app-foreground"
                        : "border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.54)] text-app-muted hover:text-app-foreground",
                    )}
                    key={preset}
                    onClick={() => setChannelPermissionPreset(preset)}
                    type="button"
                  >
                    <span className="block text-sm font-semibold">
                      {t(`workspace.permissions.preset.${preset}`)}
                    </span>
                    <span className="mt-1 block text-xs leading-5">
                      {t(`workspace.permissions.preset.${preset}.description`)}
                    </span>
                  </button>
                ))}
              </div>
              {channelPermissionPreset === "ROLE_GATED" ? (
                <div className="mt-4 rounded-[20px] border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.48)] p-3">
                  <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.2em]">
                    {t("workspace.permissions.allowedRoles")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeServerDetail.roles
                      .filter((role) => !role.isDefault && !role.managed)
                      .map((role) => {
                        const selected = channelAllowedRoleIds.includes(role.id);

                        return (
                          <button
                            className={cn(
                              "rounded-2xl border px-3 py-2 text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                              selected
                                ? "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.13)] text-app-foreground"
                                : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.62)] text-app-muted hover:text-app-foreground",
                            )}
                            key={role.id}
                            onClick={() =>
                              setChannelAllowedRoleIds((current) =>
                                selected
                                  ? current.filter((roleId) => roleId !== role.id)
                                  : [...current, role.id],
                              )
                            }
                            type="button"
                          >
                            {role.name}
                          </button>
                        );
                      })}
                  </div>
                  {activeServerDetail.roles.filter((role) => !role.isDefault && !role.managed)
                    .length === 0 ? (
                    <p className="mt-3 text-xs leading-5 text-app-muted">
                      {t("workspace.permissions.noRoles")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {channelPermissionQuery.error ? (
                <div className="app-danger mt-3 rounded-[20px] border p-3 text-xs font-semibold">
                  {t("workspace.permissions.loadError")}
                </div>
              ) : null}
            </div>
          ) : channelModal.mode === "edit" && channelType === "TEXT" ? (
            <ServerFeatureToggle
              checked={channelLocked}
              description={t("workspace.modal.channelReadOnlyDescription")}
              onChange={setChannelLocked}
              title={t("workspace.modal.channelReadOnly")}
            />
          ) : null}
          {activeServerDetail ? (
            <div className="space-y-2">
              <label
                className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]"
                htmlFor="channel-category"
              >
                {t("workspace.modal.channelCategory")}
              </label>
              <select
                id="channel-category"
                className="h-11 w-full rounded-2xl border border-[hsl(var(--border)/0.82)] bg-[hsl(var(--surface-soft)/0.55)] px-4 text-sm text-[hsl(var(--foreground))] outline-hidden transition focus:border-[hsl(var(--ring)/0.55)] focus:ring-4 focus:ring-[hsl(var(--ring)/0.12)]"
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
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              onClick={closeChannelModal}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              data-testid="channel-submit-button"
              disabled={
                channelMutation.isPending ||
                channelName.trim().length < 1 ||
                !isChannelAdvancedSettingsValid(
                  channelType,
                  channelAdvancedSettings,
                  activeServerDetail?.server.availableRtcRegions ?? [],
                ) ||
                (channelPermissionControlsEnabled &&
                  channelPermissionPreset === "ROLE_GATED" &&
                  channelAllowedRoleIds.length === 0)
              }
              type="submit"
            >
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
                disabled={inviteNeverExpires}
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
          <label className="app-panel-soft flex cursor-pointer items-start gap-3 rounded-3xl border p-4 transition hover:border-[hsl(var(--primary)/0.32)] hover:bg-[hsl(var(--primary)/0.08)]">
            <input
              checked={inviteNeverExpires}
              className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
              onChange={(event) => setInviteNeverExpires(event.target.checked)}
              type="checkbox"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-app-foreground">
                {t("workspace.modal.inviteNeverExpires")}
              </span>
              <span className="mt-1 block text-xs leading-5 text-app-muted">
                {t("workspace.modal.inviteNeverExpiresDescription")}
              </span>
            </span>
          </label>
          {inviteLink ? (
            <div className="app-success rounded-[24px] border p-4">
              <p className="text-app-success text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.inviteReady")}
              </p>
              <p className="text-app-foreground mt-2 break-all text-sm font-medium">{inviteLink}</p>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {inviteLink ? (
              <Button
                className={cn(
                  "w-full sm:w-auto",
                  inviteCopied ? "border-[hsl(var(--success)/0.28)] text-app-success" : "",
                )}
                onClick={handleInviteCopy}
                type="button"
                variant="outline"
              >
                {inviteCopied ? t("common.linkCopied") : t("common.copyLink")}
              </Button>
            ) : null}
            <Button
              className="w-full sm:w-auto"
              onClick={closeInviteModal}
              type="button"
              variant="outline"
            >
              {t("common.close")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
              type="button"
            >
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
