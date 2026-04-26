"use client";

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
import { Avatar } from "@/components/ui/avatar";
import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";
import { ChannelItem } from "@/components/shell/channel-item";
import { ChannelSidebarSkeleton } from "@/components/shell/shell-skeletons";
import { cn } from "@/lib/utils";
import {
  applyChannelReorder,
  reorderChannelsRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { useAppStore } from "@/lib/store";
import { logoutAction } from "@/lib/auth/actions";

type ChannelSidebarProps = {
  activeChannelId: string | null;
  currentUser: {
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
  onDelete: () => void;
  onEdit: () => void;
  onPrefetch?: () => void;
  onSelect: () => void;
};

function SortableChannelRow({
  active,
  canManage,
  channel,
  onDelete,
  onEdit,
  onPrefetch,
  onSelect,
}: SortableChannelRowProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: !canManage,
    id: channel.id,
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
            name={channel.name}
            onDelete={onDelete}
            onEdit={onEdit}
            onSelect={onSelect}
            type={channel.type}
            {...(onPrefetch ? { onPrefetch } : {})}
          />
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

export function ChannelSidebar({
  activeChannelId,
  currentUser,
  detail,
  loading,
  onNavigate,
  onOpenSettings,
  onPrefetch,
}: ChannelSidebarProps) {
  const queryClient = useQueryClient();
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

  if (loading) {
    return (
      <aside className="app-sidebar h-full w-full">
        <ChannelSidebarSkeleton />
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="app-sidebar flex h-full w-full flex-col justify-between p-4">
        <div className="rounded-[28px] border border-dashed border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-5 text-app-muted text-sm">
          Pick a server to browse channels, or create one to start building your workspace.
        </div>
        <div className="app-panel rounded-[24px] border p-3">
          <div className="flex items-center gap-3">
            <Avatar
              alt={currentUser.displayName}
              className="h-11 w-11"
              fallback={currentUser.displayName}
              src={currentUser.avatarUrl}
            />
            <div className="min-w-0 flex-1">
              <p className="text-app-foreground truncate text-sm font-semibold">{currentUser.displayName}</p>
              <p className="text-app-soft truncate text-xs">@{currentUser.username}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label="Toggle mute"
                className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
                type="button"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                aria-label="Toggle deafen"
                className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
                type="button"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              <button
                aria-label="Open appearance settings"
                className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
                onClick={onOpenSettings}
                title="Appearance settings"
                type="button"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <form action={logoutAction}>
                <button
                  aria-label="Log out"
                  className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger-foreground))]"
                  title="Log out"
                  type="submit"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const canManage = detail.server.isAdmin;
  const getCategoryCollapsed = (categoryId: string) =>
    collapsedCategories[`${detail.server.id}:${categoryId}`] ?? false;

  const navigateToChannel = (channelId: string) => {
    onNavigate(`/channels/${detail.server.id}/${channelId}`);
  };

  const prefetchChannel = (channelId: string) => {
    onPrefetch?.(`/channels/${detail.server.id}/${channelId}`);
  };

  const handleDragEnd = (categoryId: string | null, channels: WorkspaceChannel[]) => (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const previousIndex = channels.findIndex((channel) => channel.id === active.id);
    const nextIndex = channels.findIndex((channel) => channel.id === over.id);

    if (previousIndex < 0 || nextIndex < 0) {
      return;
    }

    const reordered = arrayMove(channels, previousIndex, nextIndex);
    reorderMutation.mutate(buildReorderPayload(categoryId, reordered));
  };

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
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd(categoryId, channels)}
            sensors={sensors}
          >
            <SortableContext items={channels.map((channel) => channel.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {channels.map((channel) => (
                  <SortableChannelRow
                    active={channel.id === activeChannelId}
                    canManage={canManage}
                    channel={channel}
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
                    onSelect={() => navigateToChannel(channel.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
              {detail.server.memberCount} members
            </p>
          </div>
          <ChevronDown className="text-app-muted h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        {detail.categories.map((category) => renderChannelGroup(category.name, category.id, category.channels))}
        {detail.ungroupedChannels.length > 0
          ? renderChannelGroup("Open Channels", null, detail.ungroupedChannels)
          : null}
      </div>

      <div className="border-t border-[hsl(var(--border)/0.78)] p-3">
        <div className="app-panel rounded-[24px] border p-3">
          <div className="flex items-center gap-3">
            <Avatar
              alt={currentUser.displayName}
              className="h-11 w-11"
              fallback={currentUser.displayName}
              src={currentUser.avatarUrl}
            />
            <div className="min-w-0 flex-1">
              <p className="text-app-foreground truncate text-sm font-semibold">{currentUser.displayName}</p>
              <p className="text-app-soft truncate text-xs">@{currentUser.username}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label="Toggle mute"
                className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
                type="button"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                aria-label="Toggle deafen"
                className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
                type="button"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              <button
                aria-label="Open appearance settings"
                className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
                onClick={onOpenSettings}
                title="Appearance settings"
                type="button"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <form action={logoutAction}>
                <button
                  aria-label="Log out"
                  className="text-app-muted rounded-xl p-2 transition hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger-foreground))]"
                  title="Log out"
                  type="submit"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
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
              Server Settings
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setHeaderMenu((state) => ({ ...state, open: false }));
                openInviteModal(detail.server.id);
              }}
            >
              Create Invite
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setHeaderMenu((state) => ({ ...state, open: false }));
                openCategoryModal(detail.server.id);
              }}
            >
              Create Category
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
              Create Text Channel
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
              Create Voice Channel
            </ContextMenuItem>
          </>
        ) : (
          <div className="text-app-soft px-3 py-2 text-xs uppercase tracking-[0.2em]">Member View</div>
        )}
      </ContextMenu>
    </aside>
  );
}
