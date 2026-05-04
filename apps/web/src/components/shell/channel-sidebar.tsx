"use client";

import React, { useCallback, useEffect, useTransition } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Edit3,
  GripVertical,
  Hash,
  LogOut,
  Mic,
  MoreHorizontal,
  Plus,
  Settings2,
  Trash2,
  UserPlus,
  Volume2,
} from "lucide-react";
import { Button } from "@wizards/ui";
import { useState } from "react";
import type { WorkspaceChannel, WorkspaceServerDetail } from "@wizards/types";
import { useShallow } from "zustand/react/shallow";
import { FriendsSidebar } from "@/components/friends/friends-sidebar";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Modal } from "@/components/ui/modal";
import { ChannelItem } from "@/components/shell/channel-item";
import { ChannelSidebarSkeleton } from "@/components/shell/shell-skeletons";
import { NotificationBell } from "@/components/shared/notification-bell";
import { VoiceConnectionBar } from "@/components/voice/voice-connection-bar";
import { useVoiceConnection } from "@/components/providers/voice-provider";
import { cn } from "@/lib/utils";
import {
  applyChannelReorder,
  deleteCategoryRequest,
  reorderChannelsRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { useVoiceStates } from "@/hooks/use-voice-states";
import { useAppStore } from "@/lib/store";
import { updatePresenceStatusAction } from "@/lib/account/actions";
import { logoutAction } from "@/lib/auth/actions";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";

type PresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";

type ChannelSidebarProps = {
  activeChannelId: string | null;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    status: PresenceStatus;
    username: string;
  };
  detail: WorkspaceServerDetail | null;
  loading: boolean;
  onNavigate: (href: string) => void;
  onOpenSettings: () => void;
  onPrefetch?: (href: string) => void;
};

type SortableChannelRowProps = {
  active: boolean;
  canManage: boolean;
  channel: WorkspaceChannel;
  currentUserId: string;
  onDelete: () => void;
  onEdit: () => void;
  onPrefetch?: () => void;
  onSelect: () => void;
  voiceState?: VoiceChannelStateDTO | null;
};

type ChannelDropZoneProps = {
  canManage: boolean;
  categoryId: string | null;
  children: React.ReactNode;
  empty: boolean;
  emptyLabel: string;
};

const SortableChannelRow = React.memo(function SortableChannelRow({
  active,
  canManage,
  channel,
  currentUserId,
  onDelete,
  onEdit,
  onPrefetch,
  onSelect,
  voiceState = null,
}: SortableChannelRowProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: !canManage,
    id: channel.id,
    data: { categoryId: channel.categoryId ?? null },
  });
  const verticalTransform = transform ? { ...transform, x: 0 } : null;

  return (
    <div
      ref={setNodeRef}
      className="min-w-0"
      style={{
        opacity: isDragging ? 0.75 : 1,
        transform: verticalTransform ? CSS.Transform.toString(verticalTransform) : undefined,
        transition,
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        {canManage ? (
          <button
            aria-label={`Drag channel ${channel.name}`}
            className="text-app-soft rounded-lg p-1 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="w-[26px]" />
        )}

        <div className="min-w-0 flex-1 overflow-hidden">
          <ChannelItem
            active={active}
            canManage={canManage}
            currentUserId={currentUserId}
            name={channel.name}
            onDelete={onDelete}
            onEdit={onEdit}
            onSelect={onSelect}
            type={channel.type}
            voiceState={voiceState}
            {...(onPrefetch ? { onPrefetch } : {})}
          />
        </div>
      </div>
    </div>
  );
});

function ChannelDropZone({
  canManage,
  categoryId,
  children,
  empty,
  emptyLabel,
}: ChannelDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    disabled: !canManage,
    id: `category:${categoryId ?? "uncategorized"}`,
    data: { categoryId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-8 rounded-[22px] border border-transparent p-1 transition",
        canManage && isOver
          ? "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.08)] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
          : "",
      )}
    >
      {children}
      {canManage && empty ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border)/0.55)] px-3 py-2 text-xs font-medium text-app-soft">
          {emptyLabel}
        </div>
      ) : null}
    </div>
  );
}

type UserProfileFooterProps = {
  user: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    status: PresenceStatus;
    username: string;
  };
  onOpenAppearanceSettings: () => void;
};

const USER_STATUS_OPTIONS: Array<{
  key: string;
  value: PresenceStatus;
}> = [
  { key: "friends.status.online", value: "ONLINE" },
  { key: "friends.status.idle", value: "IDLE" },
  { key: "friends.status.dnd", value: "DND" },
  { key: "friends.status.offline", value: "OFFLINE" },
];

function getStatusDotClass(status: PresenceStatus) {
  if (status === "ONLINE") {
    return "bg-emerald-400 shadow-[0_0_0_3px_hsl(var(--success)/0.12)]";
  }

  if (status === "IDLE") {
    return "bg-amber-400 shadow-[0_0_0_3px_hsl(var(--warning)/0.12)]";
  }

  if (status === "DND") {
    return "bg-rose-500 shadow-[0_0_0_3px_hsl(var(--danger)/0.12)]";
  }

  return "bg-slate-400 shadow-[0_0_0_3px_hsl(var(--muted)/0.18)]";
}

function UserProfileFooter({ user, onOpenAppearanceSettings }: UserProfileFooterProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const [isUpdatingStatus, startStatusTransition] = useTransition();
  const [status, setStatus] = useState<PresenceStatus>(user.status);
  const { activeChannelId, isDeafened, isMuted, leaveChannel, toggleDeafen, toggleMute } =
    useVoiceConnection();

  useEffect(() => {
    setStatus(user.status);
  }, [user.status]);

  const handleLogout = () => {
    startLogoutTransition(async () => {
      await leaveChannel().catch(() => undefined);
      socket.disconnect();
      await logoutAction();
    });
  };

  const handleStatusChange = (nextStatus: PresenceStatus) => {
    const previousStatus = status;
    setStatus(nextStatus);
    startStatusTransition(async () => {
      const result = await updatePresenceStatusAction(nextStatus);

      if (!result.success || !result.status) {
        setStatus(previousStatus);
        return;
      }

      setStatus(result.status);
    });
  };

  return (
    <div
      className="app-panel rounded-[26px] border p-3 shadow-[0_18px_45px_hsl(var(--shadow-color)/0.08)]"
      data-notification-popup-anchor="user"
      data-user-bar-anchor="true"
    >
      <div className="space-y-3">
        <div className="rounded-[22px] border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.52)] p-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <Avatar
                alt={user.displayName}
                className="h-12 w-12"
                fallback={user.displayName}
                src={user.avatarUrl}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--surface-card))]",
                  getStatusDotClass(status),
                )}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-5 text-app-foreground">
                {user.displayName}
              </p>
              <p className="truncate text-xs font-medium text-app-muted">@{user.username}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <label className="sr-only" htmlFor="user-presence-status">
              {t("shell.user.status")}
            </label>
            <div className="relative min-w-0 flex-1">
              <select
                className="h-10 w-full appearance-none rounded-2xl border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.42)] px-3 pr-8 text-xs font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-70"
                disabled={isUpdatingStatus}
                id="user-presence-status"
                onChange={(event) => handleStatusChange(event.target.value as PresenceStatus)}
                title={t("shell.user.statusTitle")}
                value={status}
              >
                {USER_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.key)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-muted" />
            </div>

            <button
              aria-label={t("shell.user.toggleMute")}
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                activeChannelId
                  ? "border-[hsl(var(--border)/0.66)] text-app-foreground"
                  : "border-[hsl(var(--border)/0.45)] text-app-muted disabled:cursor-not-allowed disabled:opacity-55",
              )}
              disabled={!activeChannelId}
              onClick={() => {
                void toggleMute();
              }}
              type="button"
            >
              <Mic className={cn("h-4 w-4", isMuted && "text-[hsl(var(--danger))]")} />
            </button>

            <button
              aria-label={t("shell.user.toggleDeafen")}
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                activeChannelId
                  ? "border-[hsl(var(--border)/0.66)] text-app-foreground"
                  : "border-[hsl(var(--border)/0.45)] text-app-muted disabled:cursor-not-allowed disabled:opacity-55",
              )}
              disabled={!activeChannelId}
              onClick={() => {
                void toggleDeafen();
              }}
              type="button"
            >
              <Volume2 className={cn("h-4 w-4", isDeafened && "text-[hsl(var(--danger))]")} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-[hsl(var(--border)/0.58)] pt-3">
          <div className="flex justify-center rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.28)]">
            <NotificationBell className="h-10 w-full rounded-2xl" />
          </div>
          <button
            aria-label={t("shell.user.appearanceSettings")}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.28)] text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={onOpenAppearanceSettings}
            title={t("shell.user.appearanceSettingsTitle")}
            type="button"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            aria-label={t("shell.user.logout")}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoggingOut}
            onClick={handleLogout}
            title={t("shell.user.logoutTitle")}
            type="button"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function buildReorderPayload(
  categoryId: string | null,
  channels: WorkspaceChannel[],
) {
  return channels.map((channel, index) => ({
    categoryId,
    id: channel.id,
    position: index,
  }));
}

function getChannelsForCategory(
  categoryId: string | null,
  detail: WorkspaceServerDetail,
): WorkspaceChannel[] {
  if (categoryId === null) return [...detail.ungroupedChannels];
  return [...(detail.categories.find((cat) => cat.id === categoryId)?.channels ?? [])];
}

export function ChannelSidebar({
  activeChannelId,
  currentUser,
  detail,
  loading,
  onNavigate,
  onOpenSettings,
  onPrefetch,
}: ChannelSidebarProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const voiceStatesQuery = useVoiceStates(detail?.server.id ?? null);
  const { prepareForVoiceJoin } = useVoiceConnection();
  const {
    collapsedCategories,
    openCategoryModal,
    openChannelModal,
    openDeleteChannelDialog,
    openInviteModal,
    openServerSettings,
    toggleCategoryCollapse,
  } = useAppStore(
    useShallow((state) => ({
      collapsedCategories: state.collapsedCategories,
      openCategoryModal: state.openCategoryModal,
      openChannelModal: state.openChannelModal,
      openDeleteChannelDialog: state.openDeleteChannelDialog,
      openInviteModal: state.openInviteModal,
      openServerSettings: state.openServerSettings,
      toggleCategoryCollapse: state.toggleCategoryCollapse,
    })),
  );

  const [headerMenu, setHeaderMenu] = useState({
    open: false,
    x: 0,
    y: 0,
  });
  const [categoryMenu, setCategoryMenu] = useState<{
    categoryId: string | null;
    categoryName: string;
    open: boolean;
    x: number;
    y: number;
  }>({
    categoryId: null,
    categoryName: "",
    open: false,
    x: 0,
    y: 0,
  });
  const [emptyMenu, setEmptyMenu] = useState({
    open: false,
    x: 0,
    y: 0,
  });
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );

  const reorderMutation = useMutation<
    { success: true },
    Error,
    Array<{ categoryId: string | null; id: string; position: number }>,
    { previousDetail: WorkspaceServerDetail | null }
  >({
    mutationKey: ["workspace", "reorder-channels", detail?.server.id],
    mutationFn: (items: Array<{ categoryId: string | null; id: string; position: number }>) => {
      if (!detail) {
        return Promise.resolve({ success: true as const });
      }

      return reorderChannelsRequest(detail.server.id, items);
    },
    onError: (_error, _variables, context: { previousDetail: WorkspaceServerDetail | null } | undefined) => {
      if (detail && context?.previousDetail) {
        queryClient.setQueryData(workspaceQueryKeys.server(detail.server.id), context.previousDetail);
      }
    },
    onMutate: async (items) => {
      if (!detail) {
        return { previousDetail: null };
      }

      await queryClient.cancelQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });

      const previousDetail =
        queryClient.getQueryData<WorkspaceServerDetail>(
          workspaceQueryKeys.server(detail.server.id),
        ) ?? null;

      if (previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(detail.server.id),
          applyChannelReorder(previousDetail, items),
        );
      }

      return { previousDetail };
    },
    onSettled: () => {
      if (!detail) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!detail || !categoryToDelete) {
        return;
      }

      return deleteCategoryRequest(detail.server.id, categoryToDelete.id);
    },
    onSuccess: async () => {
      if (!detail) {
        return;
      }

      setCategoryToDelete(null);
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });
    },
  });

  const serverId = detail?.server.id ?? null;

  const navigateToChannel = useCallback(
    async (channelId: string, channelType: "TEXT" | "VOICE") => {
      if (!serverId) return;

      if (channelType === "VOICE") {
        try {
          await prepareForVoiceJoin();
        } catch {
          // Join flow inside the voice view handles the final fallback state.
        }
      }

      onNavigate(`/channels/${serverId}/${channelId}`);
    },
    [onNavigate, prepareForVoiceJoin, serverId],
  );

  const prefetchChannel = useCallback(
    (channelId: string) => {
      if (!serverId) return;
      onPrefetch?.(`/channels/${serverId}/${channelId}`);
    },
    [serverId, onPrefetch],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !detail) return;

      const sourceCategoryId = (active.data.current?.categoryId ?? null) as string | null;
      const targetCategoryId = (over.data.current?.categoryId ?? null) as string | null;
      const droppedOnCategory =
        typeof over.id === "string" && over.id.startsWith("category:");

      const sourceChannels = getChannelsForCategory(sourceCategoryId, detail);
      const targetChannels = getChannelsForCategory(targetCategoryId, detail);

      const oldIndex = sourceChannels.findIndex((c) => c.id === active.id);
      const newIndex = droppedOnCategory
        ? targetChannels.length
        : targetChannels.findIndex((c) => c.id === over.id);

      if (oldIndex < 0 || newIndex < 0) return;

      if (sourceCategoryId === targetCategoryId) {
        if (droppedOnCategory) {
          return;
        }

        const reordered = arrayMove(sourceChannels, oldIndex, newIndex);
        reorderMutation.mutate(buildReorderPayload(sourceCategoryId, reordered));
      } else {
        const movingChannel = sourceChannels[oldIndex]!;
        const newSourceChannels = sourceChannels.filter((c) => c.id !== movingChannel.id);
        const newTargetChannels = [...targetChannels];
        newTargetChannels.splice(newIndex, 0, { ...movingChannel, categoryId: targetCategoryId });
        reorderMutation.mutate([
          ...buildReorderPayload(sourceCategoryId, newSourceChannels),
          ...buildReorderPayload(targetCategoryId, newTargetChannels),
        ]);
      }
    },
    [detail, reorderMutation],
  );

  if (loading) {
    return (
      <aside className="app-sidebar h-full w-full min-w-0 overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0">
        <ChannelSidebarSkeleton />
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="app-sidebar flex h-full w-full min-w-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0">
        <div className="min-h-0 flex-1 p-4">
          <FriendsSidebar
            currentUserId={currentUser.id}
            onNavigate={onNavigate}
            onPrefetch={onPrefetch}
          />
        </div>
        <div
          className="border-t border-[hsl(var(--border)/0.78)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3"
          data-notification-popup-anchor="controls-border"
        >
          <VoiceConnectionBar />
          <UserProfileFooter user={currentUser} onOpenAppearanceSettings={onOpenSettings} />
        </div>
      </aside>
    );
  }

  const canManage = detail.server.isAdmin;
  const getCategoryCollapsed = (categoryId: string) =>
    collapsedCategories[`${detail.server.id}:${categoryId}`] ?? false;

  const renderChannelGroup = (label: string, categoryId: string | null, channels: WorkspaceChannel[]) => {
    const collapsed = categoryId ? getCategoryCollapsed(categoryId) : false;

    return (
      <div
        className="group/category space-y-2 rounded-[26px] border border-[hsl(var(--border)/0.32)] bg-[hsl(var(--surface-card)/0.18)] p-2"
        data-sidebar-interactive="true"
        key={categoryId ?? "uncategorized"}
      >
        <div className="flex items-center gap-1">
          <button
            className="text-app-soft flex min-w-0 flex-1 items-center justify-between rounded-2xl px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.26em] transition hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-[hsl(var(--foreground))]"
            onClick={() => {
              if (categoryId) {
                toggleCategoryCollapse(detail.server.id, categoryId);
              }
            }}
            type="button"
          >
            <span className="truncate">{label}</span>
            {categoryId ? (
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition", collapsed && "-rotate-90")} />
            ) : null}
          </button>
          {canManage && categoryId ? (
            <button
              aria-label={t("shell.channelSidebar.categoryActions")}
              className="text-app-soft inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-transparent opacity-0 transition hover:border-[hsl(var(--border)/0.62)] hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] group-hover/category:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setCategoryMenu({
                  categoryId,
                  categoryName: label,
                  open: true,
                  x: rect.left,
                  y: rect.bottom + 8,
                });
              }}
              type="button"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {!collapsed ? (
          <SortableContext items={channels.map((channel) => channel.id)} strategy={verticalListSortingStrategy}>
            <ChannelDropZone
              canManage={canManage}
              categoryId={categoryId}
              empty={channels.length === 0}
              emptyLabel={t("shell.channelSidebar.dropChannelsHere")}
            >
              <div className="space-y-1.5">
                {channels.map((channel) => {
                  const voiceState =
                    channel.type === "VOICE"
                      ? voiceStatesQuery.data?.find((state) => state.channelId === channel.id) ?? null
                      : null;

                  return (
                    <SortableChannelRow
                      active={channel.id === activeChannelId}
                      canManage={canManage}
                      channel={channel}
                      currentUserId={currentUser.id}
                      key={channel.id}
                      onDelete={() => openDeleteChannelDialog(channel.id, channel.name)}
                      onEdit={() =>
                        openChannelModal({
                          categoryId: channel.categoryId,
                          channelId: channel.id,
                          mode: "edit",
                          serverId: detail.server.id,
                          type: channel.type,
                        })
                      }
                      onPrefetch={() => prefetchChannel(channel.id)}
                      onSelect={() => {
                        void navigateToChannel(channel.id, channel.type);
                      }}
                      voiceState={voiceState}
                    />
                  );
                })}
              </div>
            </ChannelDropZone>
          </SortableContext>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="app-sidebar flex h-full w-full min-w-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0">
      <div className="border-b border-[hsl(var(--border)/0.78)] p-3">
        <button
          aria-label={`Open ${detail.server.name} menu`}
          className="app-panel flex min-h-[4.25rem] w-full min-w-0 items-center justify-between gap-3 rounded-[26px] border px-4 py-3 text-left shadow-[0_18px_38px_hsl(var(--shadow-color)/0.08)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-sidebar-interactive="true"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setHeaderMenu({
              open: true,
              x: rect.left,
              y: rect.bottom + 8,
            });
          }}
          type="button"
        >
          <div className="min-w-0">
            <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.22em]">
              {t("shell.channelSidebar.manageServer")}
            </p>
            <p className="text-app-foreground mt-1 truncate text-base font-semibold leading-5">
              {detail.server.name}
            </p>
            <p className="text-app-soft mt-0.5 truncate text-xs">
              {t("shell.channelSidebar.membersCount", { count: detail.server.memberCount })}
            </p>
          </div>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.42)] text-app-muted">
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>
        {canManage ? (
          <div className="mt-2 grid grid-cols-3 gap-2" data-sidebar-interactive="true">
            <button
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.28)] px-2 text-xs font-semibold text-app-muted transition hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--primary)/0.08)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={() =>
                openChannelModal({
                  mode: "create",
                  serverId: detail.server.id,
                  type: "TEXT",
                })
              }
              type="button"
            >
              <Hash className="h-3.5 w-3.5" />
              <span>{t("shell.channelSidebar.addTextChannel")}</span>
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.28)] px-2 text-xs font-semibold text-app-muted transition hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--primary)/0.08)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={() =>
                openChannelModal({
                  mode: "create",
                  serverId: detail.server.id,
                  type: "VOICE",
                })
              }
              type="button"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>{t("shell.channelSidebar.addVoiceChannel")}</span>
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.28)] px-2 text-xs font-semibold text-app-muted transition hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--primary)/0.08)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={() => openInviteModal(detail.server.id)}
              type="button"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>{t("shell.channelSidebar.createInvite")}</span>
            </button>
          </div>
        ) : null}
      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <div
          className="min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-3"
          onContextMenu={(event) => {
            if (!canManage) {
              return;
            }

            const target = event.target;
            if (target instanceof HTMLElement && target.closest("[data-sidebar-interactive='true']")) {
              return;
            }

            event.preventDefault();
            setEmptyMenu({
              open: true,
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          {detail.categories.map((category) => renderChannelGroup(category.name, category.id, category.channels))}
          {detail.ungroupedChannels.length > 0 || canManage
            ? renderChannelGroup(t("shell.channelSidebar.openChannels"), null, detail.ungroupedChannels)
            : null}
        </div>
      </DndContext>

      <div
        className="border-t border-[hsl(var(--border)/0.78)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3"
        data-notification-popup-anchor="controls-border"
      >
        <VoiceConnectionBar />
        <UserProfileFooter user={currentUser} onOpenAppearanceSettings={onOpenSettings} />
      </div>

      <ContextMenu
        onClose={() => setHeaderMenu((state) => ({ ...state, open: false }))}
        open={headerMenu.open}
        position={headerMenu}
      >
        {canManage ? (
          <>
            <ContextMenuItem
              onClick={() => {
                setHeaderMenu((state) => ({ ...state, open: false }));
                openServerSettings(detail.server.id);
              }}
            >
              {t("shell.channelSidebar.serverSettings")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setHeaderMenu((state) => ({ ...state, open: false }));
                openInviteModal(detail.server.id);
              }}
            >
              {t("shell.channelSidebar.createInvite")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => {
                setHeaderMenu((state) => ({ ...state, open: false }));
                openCategoryModal(detail.server.id);
              }}
            >
              {t("shell.channelSidebar.createCategory")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setHeaderMenu((state) => ({ ...state, open: false }));
                openChannelModal({
                  mode: "create",
                  serverId: detail.server.id,
                  type: "TEXT",
                });
              }}
            >
              {t("shell.channelSidebar.createTextChannel")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setHeaderMenu((state) => ({ ...state, open: false }));
                openChannelModal({
                  mode: "create",
                  serverId: detail.server.id,
                  type: "VOICE",
                });
              }}
            >
              {t("shell.channelSidebar.createVoiceChannel")}
            </ContextMenuItem>
          </>
        ) : (
          <div className="text-app-soft px-3 py-2 text-xs uppercase tracking-[0.2em]">
            {t("shell.channelSidebar.memberView")}
          </div>
        )}
      </ContextMenu>

      <ContextMenu
        onClose={() => setCategoryMenu((state) => ({ ...state, open: false }))}
        open={categoryMenu.open}
        position={categoryMenu}
      >
        <div className="px-3 py-2">
          <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">
            {t("shell.channelSidebar.categoryActions")}
          </p>
          <p className="mt-0.5 max-w-48 truncate text-sm font-semibold text-app-foreground">
            {categoryMenu.categoryName}
          </p>
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            if (!categoryMenu.categoryId) return;
            setCategoryMenu((state) => ({ ...state, open: false }));
            openCategoryModal(detail.server.id, {
              categoryId: categoryMenu.categoryId,
              mode: "edit",
            });
          }}
        >
          <Edit3 className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.editCategory")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            if (!categoryMenu.categoryId) return;
            setCategoryMenu((state) => ({ ...state, open: false }));
            openChannelModal({
              categoryId: categoryMenu.categoryId,
              mode: "create",
              serverId: detail.server.id,
              type: "TEXT",
            });
          }}
        >
          <Hash className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.createTextChannel")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            if (!categoryMenu.categoryId) return;
            setCategoryMenu((state) => ({ ...state, open: false }));
            openChannelModal({
              categoryId: categoryMenu.categoryId,
              mode: "create",
              serverId: detail.server.id,
              type: "VOICE",
            });
          }}
        >
          <Volume2 className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.createVoiceChannel")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          destructive
          onClick={() => {
            if (!categoryMenu.categoryId) return;
            setCategoryToDelete({
              id: categoryMenu.categoryId,
              name: categoryMenu.categoryName,
            });
            setCategoryMenu((state) => ({ ...state, open: false }));
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.deleteCategory")}
        </ContextMenuItem>
      </ContextMenu>

      <ContextMenu
        onClose={() => setEmptyMenu((state) => ({ ...state, open: false }))}
        open={emptyMenu.open}
        position={emptyMenu}
      >
        <div className="px-3 py-2">
          <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">
            {t("shell.channelSidebar.emptyAreaMenu")}
          </p>
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            setEmptyMenu((state) => ({ ...state, open: false }));
            openChannelModal({
              mode: "create",
              serverId: detail.server.id,
              type: "TEXT",
            });
          }}
        >
          <Hash className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.createTextChannel")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            setEmptyMenu((state) => ({ ...state, open: false }));
            openChannelModal({
              mode: "create",
              serverId: detail.server.id,
              type: "VOICE",
            });
          }}
        >
          <Volume2 className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.createVoiceChannel")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            setEmptyMenu((state) => ({ ...state, open: false }));
            openCategoryModal(detail.server.id);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.createCategory")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            setEmptyMenu((state) => ({ ...state, open: false }));
            openInviteModal(detail.server.id);
          }}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.createInvite")}
        </ContextMenuItem>
      </ContextMenu>

      <Modal
        onClose={() => setCategoryToDelete(null)}
        open={Boolean(categoryToDelete)}
        title={
          categoryToDelete
            ? t("workspace.modal.categoryDeleteTitle", { name: categoryToDelete.name })
            : t("shell.channelSidebar.deleteCategory")
        }
        {...(categoryToDelete
          ? { description: t("shell.channelSidebar.deleteCategoryDescription") }
          : {})}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            className="h-11 rounded-2xl"
            disabled={deleteCategoryMutation.isPending}
            onClick={() => setCategoryToDelete(null)}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="h-11 rounded-2xl border border-[hsl(var(--danger)/0.32)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.18)]"
            disabled={deleteCategoryMutation.isPending}
            onClick={() => deleteCategoryMutation.mutate()}
            type="button"
            variant="outline"
          >
            {deleteCategoryMutation.isPending
              ? t("workspace.modal.categoryDeleting")
              : t("workspace.modal.categoryDeleteAction")}
          </Button>
        </div>
      </Modal>
    </aside>
  );
}
