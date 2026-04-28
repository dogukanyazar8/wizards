"use client";

import React, { useCallback, useTransition } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
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
  GripVertical,
  LogOut,
  Mic,
  Settings2,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import type { WorkspaceChannel, WorkspaceServerDetail } from "@wizards/types";
import { useShallow } from "zustand/react/shallow";
import { FriendsSidebar } from "@/components/friends/friends-sidebar";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";
import { ChannelItem } from "@/components/shell/channel-item";
import { ChannelSidebarSkeleton } from "@/components/shell/shell-skeletons";
import { NotificationBell } from "@/components/shared/notification-bell";
import { VoiceConnectionBar } from "@/components/voice/voice-connection-bar";
import { useVoiceConnection } from "@/components/providers/voice-provider";
import {
  APP_THEME_STORAGE_KEY,
  clearLegacyAppearanceStorage,
} from "@/lib/appearance";
import { APP_LOCALE_STORAGE_KEY } from "@/lib/locale";
import { cn } from "@/lib/utils";
import {
  applyChannelReorder,
  reorderChannelsRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { useVoiceStates } from "@/hooks/use-voice-states";
import { useAppStore } from "@/lib/store";
import { logoutAction } from "@/lib/auth/actions";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";

type ChannelSidebarProps = {
  activeChannelId: string | null;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
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

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.75 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="flex items-center gap-1">
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

        <div className="min-w-0 flex-1">
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

type UserProfileFooterProps = {
  user: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    username: string;
  };
  onOpenAppearanceSettings: () => void;
};

function UserProfileFooter({ user, onOpenAppearanceSettings }: UserProfileFooterProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const { activeChannelId, isDeafened, isMuted, leaveChannel, toggleDeafen, toggleMute } =
    useVoiceConnection();

  const handleLogout = () => {
    clearLegacyAppearanceStorage();
    window.localStorage.removeItem(APP_THEME_STORAGE_KEY);
    window.localStorage.removeItem(APP_LOCALE_STORAGE_KEY);
    useAppStore.getState().resetSessionUiState();
    useAppStore.persist.clearStorage();
    startLogoutTransition(async () => {
      await leaveChannel().catch(() => undefined);
      socket.disconnect();
      await logoutAction();
    });
  };

  return (
    <div className="app-panel rounded-[24px] border p-3" data-user-bar-anchor="true">
      <div className="flex items-center gap-3">
        <Avatar
          alt={user.displayName}
          className="h-11 w-11"
          fallback={user.displayName}
          src={user.avatarUrl}
        />
        <div className="min-w-0 flex-1">
          <p className="text-app-foreground truncate text-sm font-semibold">{user.displayName}</p>
          <p className="text-app-soft truncate text-xs">@{user.username}</p>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            aria-label={t("shell.user.toggleMute")}
            className={cn(
              "rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]",
              activeChannelId
                ? "text-app-foreground"
                : "text-app-muted disabled:cursor-not-allowed disabled:opacity-55",
            )}
            disabled={!activeChannelId}
            onClick={() => {
              void toggleMute();
            }}
            type="button"
          >
            <Mic
              className={cn(
                "h-4 w-4",
                isMuted && "text-[hsl(var(--danger))]",
              )}
            />
          </button>
          <button
            aria-label={t("shell.user.toggleDeafen")}
            className={cn(
              "rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]",
              activeChannelId
                ? "text-app-foreground"
                : "text-app-muted disabled:cursor-not-allowed disabled:opacity-55",
            )}
            disabled={!activeChannelId}
            onClick={() => {
              void toggleDeafen();
            }}
            type="button"
          >
            <Volume2
              className={cn(
                "h-4 w-4",
                isDeafened && "text-[hsl(var(--danger))]",
              )}
            />
          </button>
          <button
            aria-label={t("shell.user.appearanceSettings")}
            className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
            onClick={onOpenAppearanceSettings}
            title={t("shell.user.appearanceSettingsTitle")}
            type="button"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            aria-label={t("shell.user.logout")}
            className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger-foreground))] disabled:cursor-not-allowed disabled:opacity-60"
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

      const sourceChannels = getChannelsForCategory(sourceCategoryId, detail);
      const targetChannels = getChannelsForCategory(targetCategoryId, detail);

      const oldIndex = sourceChannels.findIndex((c) => c.id === active.id);
      const newIndex = targetChannels.findIndex((c) => c.id === over.id);

      if (oldIndex < 0 || newIndex < 0) return;

      if (sourceCategoryId === targetCategoryId) {
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
      <aside className="app-sidebar h-full w-full">
        <ChannelSidebarSkeleton />
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="app-sidebar flex h-full w-full flex-col">
        <div className="min-h-0 flex-1 p-4">
          <FriendsSidebar
            currentUserId={currentUser.id}
            onNavigate={onNavigate}
            onPrefetch={onPrefetch}
          />
        </div>
        <div className="border-t border-[hsl(var(--border)/0.78)] p-3">
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
      <div className="space-y-2" key={categoryId ?? "uncategorized"}>
        <button
          className="text-app-soft flex w-full items-center justify-between rounded-xl px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.24em] transition hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-[hsl(var(--foreground))]"
          onClick={() => {
            if (categoryId) {
              toggleCategoryCollapse(detail.server.id, categoryId);
            }
          }}
          type="button"
        >
          <span>{label}</span>
          {categoryId ? (
            <ChevronDown className={cn("h-3.5 w-3.5 transition", collapsed && "-rotate-90")} />
          ) : null}
        </button>

        {!collapsed ? (
          <SortableContext items={channels.map((channel) => channel.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
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
          </SortableContext>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="app-sidebar flex h-full w-full flex-col">
      <div className="border-b border-[hsl(var(--border)/0.78)] p-3">
        <button
          aria-label={`Open ${detail.server.name} menu`}
          className="app-panel flex h-12 w-full items-center justify-between rounded-2xl border px-4 text-left transition hover:opacity-95"
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
          <div>
            <p className="text-app-foreground truncate text-sm font-semibold">{detail.server.name}</p>
            <p className="text-app-soft truncate text-xs">
              {t("shell.channelSidebar.membersCount", { count: detail.server.memberCount })}
            </p>
          </div>
          <ChevronDown className="text-app-muted h-4 w-4" />
        </button>
      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <div className="flex-1 space-y-5 overflow-y-auto p-3">
          {detail.categories.map((category) => renderChannelGroup(category.name, category.id, category.channels))}
          {detail.ungroupedChannels.length > 0
            ? renderChannelGroup(t("shell.channelSidebar.openChannels"), null, detail.ungroupedChannels)
            : null}
        </div>
      </DndContext>

      <div className="border-t border-[hsl(var(--border)/0.78)] p-3">
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
    </aside>
  );
}
