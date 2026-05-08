"use client";

import React, { useCallback, useEffect, useRef, useTransition } from "react";
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
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clock3,
  Edit3,
  GripVertical,
  Hash,
  LogOut,
  Mic,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
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
import { AudioDeviceSelect } from "@/components/voice/audio-device-select";
import { useVoiceConnection } from "@/components/providers/voice-provider";
import { cn } from "@/lib/utils";
import {
  applyCategoryReorder,
  applyChannelReorder,
  deleteCategoryRequest,
  reorderCategoriesRequest,
  reorderChannelsRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { useVoiceStates } from "@/hooks/use-voice-states";
import {
  PRESENCE_IDLE_TIMEOUT_OPTIONS,
  usePresenceIdleTimeoutPreference,
} from "@/hooks/use-presence-activity";
import { useAppStore } from "@/lib/store";
import { updatePresenceStatusAction } from "@/lib/account/actions";
import { logoutAction } from "@/lib/auth/actions";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";
import {
  CHANNEL_SIDEBAR_WIDTH_STEP,
  MAX_CHANNEL_SIDEBAR_WIDTH,
  MIN_CHANNEL_SIDEBAR_WIDTH,
} from "@/lib/appearance";

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
  onCurrentUserStatusChange: (status: PresenceStatus) => void;
  onOpenSettings: () => void;
  onPrefetch?: (href: string) => void;
  showUserFooter?: boolean;
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
  testId?: string;
  voiceState?: VoiceChannelStateDTO | null;
};

type SortableCategoryGroupProps = {
  canManage: boolean;
  categoryId: string;
  children: (
    sortable: Pick<ReturnType<typeof useSortable>, "attributes" | "isDragging" | "listeners">,
  ) => React.ReactNode;
};

type CategorySortableHandle = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "isDragging" | "listeners"
>;

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
  testId,
  voiceState = null,
}: SortableChannelRowProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: !canManage,
    id: channel.id,
    data: { categoryId: channel.categoryId ?? null, itemType: "channel" },
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
      <div className="flex min-w-0 items-center gap-0.5">
        {canManage ? (
          <button
            aria-label={`Drag channel ${channel.name}`}
            className="text-app-soft -ml-0.5 rounded-lg p-0.5 transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))]"
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
            mentionCount={channel.mentionCount}
            name={channel.name}
            onDelete={onDelete}
            onEdit={onEdit}
            onSelect={onSelect}
            type={channel.type}
            unreadCount={channel.unreadCount}
            voiceState={voiceState}
            {...(onPrefetch ? { onPrefetch } : {})}
            {...(testId ? { testId } : {})}
          />
        </div>
      </div>
    </div>
  );
});

function SortableCategoryGroup({ canManage, categoryId, children }: SortableCategoryGroupProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: !canManage,
    id: `category-sort:${categoryId}`,
    data: { categoryId, itemType: "category" },
  });
  const verticalTransform = transform ? { ...transform, x: 0 } : null;

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.78 : 1,
        transform: verticalTransform ? CSS.Transform.toString(verticalTransform) : undefined,
        transition,
      }}
    >
      {children({ attributes, isDragging, listeners })}
    </div>
  );
}

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
        "min-h-6 rounded-[20px] border border-transparent px-0.5 py-0.5 transition",
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
  onStatusChange: (status: PresenceStatus) => void;
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

function SidebarTuningControl({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="block rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.36)] p-3">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-app-foreground">{label}</span>
        <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.68)] px-2 py-0.5 text-[11px] font-bold text-app-muted">
          {value}px
        </span>
      </span>
      <input
        className="h-2 w-full cursor-pointer accent-[hsl(var(--primary))]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-app-soft">
        <span>{min}px</span>
        <span>{max}px</span>
      </span>
    </label>
  );
}

export function UserProfileFooter({
  user,
  onOpenAppearanceSettings,
  onStatusChange,
}: UserProfileFooterProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const [isUpdatingStatus, startStatusTransition] = useTransition();
  const [status, setStatus] = useState<PresenceStatus>(user.status);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const userBarRef = useRef<HTMLDivElement | null>(null);
  const { idleTimeoutMinutes, setIdleTimeoutMinutes } = usePresenceIdleTimeoutPreference();
  const { isDeafened, isMuted, leaveChannel, toggleDeafen, toggleMute } = useVoiceConnection();

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
    setIsStatusMenuOpen(false);
    const previousStatus = status;
    setStatus(nextStatus);
    onStatusChange(nextStatus);
    startStatusTransition(async () => {
      const result = await updatePresenceStatusAction(nextStatus);

      if (!result.success || !result.status) {
        setStatus(previousStatus);
        onStatusChange(previousStatus);
        return;
      }

      setStatus(result.status);
      onStatusChange(result.status);
    });
  };

  useEffect(() => {
    if (!isQuickMenuOpen && !isStatusMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        userBarRef.current &&
        event.target instanceof Node &&
        !userBarRef.current.contains(event.target)
      ) {
        setIsQuickMenuOpen(false);
        setIsStatusMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsQuickMenuOpen(false);
        setIsStatusMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isQuickMenuOpen, isStatusMenuOpen]);

  const currentStatusOption = USER_STATUS_OPTIONS.find((option) => option.value === status) ?? {
    key: "friends.status.online",
    value: "ONLINE" as const,
  };

  return (
    <div
      className="app-panel relative min-w-0 rounded-[28px] border px-3 py-3 shadow-[0_22px_54px_hsl(var(--shadow-color)/0.1)] sm:rounded-[32px] sm:px-4"
      data-notification-popup-anchor="user"
      data-testid="user-bar"
      data-user-bar-anchor="true"
      ref={userBarRef}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
        <div className="relative shrink-0 drop-shadow-[0_14px_28px_hsl(var(--shadow-color)/0.12)]">
          <Avatar
            alt={user.displayName}
            className="h-14 w-14 sm:h-16 sm:w-16"
            fallback={user.displayName}
            src={user.avatarUrl}
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-[hsl(var(--surface-card))]",
              getStatusDotClass(status),
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-extrabold leading-5 tracking-[-0.02em] text-app-foreground">
            {user.displayName}
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold text-app-muted">@{user.username}</p>
          <div className="relative mt-1.5 inline-flex max-w-full">
            <button
              aria-expanded={isStatusMenuOpen}
              aria-haspopup="listbox"
              aria-label={t("shell.user.status")}
              className="inline-flex max-w-full items-center gap-1.5 bg-transparent p-0 text-left text-[13px] font-semibold text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] disabled:cursor-wait disabled:opacity-70"
              disabled={isUpdatingStatus}
              onClick={() => setIsStatusMenuOpen((open) => !open)}
              title={t("shell.user.statusTitle")}
              type="button"
            >
              <span
                className={cn("h-2.5 w-2.5 shrink-0 rounded-full", getStatusDotClass(status))}
              />
              <span className="truncate">{t(currentStatusOption.key)}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-app-soft" />
            </button>

            {isStatusMenuOpen ? (
              <div
                className="absolute bottom-[calc(100%+0.55rem)] left-0 z-50 w-52 rounded-[24px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.98)] p-2 shadow-[0_24px_70px_hsl(var(--shadow-color)/0.22)] backdrop-blur-2xl"
                role="listbox"
              >
                {USER_STATUS_OPTIONS.map((option) => {
                  const selected = option.value === status;

                  return (
                    <button
                      aria-selected={selected}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[18px] px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]",
                        selected
                          ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                          : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-app-foreground",
                      )}
                      key={option.value}
                      onClick={() => handleStatusChange(option.value)}
                      role="option"
                      type="button"
                    >
                      <span
                        className={cn("h-2.5 w-2.5 rounded-full", getStatusDotClass(option.value))}
                      />
                      <span>{t(option.key)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="ml-auto grid shrink-0 grid-cols-4 gap-1.5 sm:flex sm:items-center sm:gap-2">
          <button
            aria-label={t("shell.user.toggleMute")}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-[hsl(var(--surface-card)/0.72)] text-app-foreground shadow-[0_10px_26px_hsl(var(--shadow-color)/0.08)] transition hover:-translate-y-0.5 hover:bg-[hsl(var(--surface-soft)/0.74)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-12 sm:w-12",
              isMuted
                ? "border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]"
                : "border-[hsl(var(--border)/0.66)]",
            )}
            onClick={() => {
              void toggleMute();
            }}
            type="button"
          >
            <Mic className={cn("h-[18px] w-[18px]", isMuted && "text-[hsl(var(--danger))]")} />
          </button>

          <button
            aria-label={t("shell.user.toggleDeafen")}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-[hsl(var(--surface-card)/0.72)] text-app-foreground shadow-[0_10px_26px_hsl(var(--shadow-color)/0.08)] transition hover:-translate-y-0.5 hover:bg-[hsl(var(--surface-soft)/0.74)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-12 sm:w-12",
              isDeafened
                ? "border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]"
                : "border-[hsl(var(--border)/0.66)]",
            )}
            onClick={() => {
              void toggleDeafen();
            }}
            type="button"
          >
            <Volume2
              className={cn("h-[18px] w-[18px]", isDeafened && "text-[hsl(var(--danger))]")}
            />
          </button>

          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.72)] shadow-[0_10px_26px_hsl(var(--shadow-color)/0.08)] transition hover:-translate-y-0.5 hover:bg-[hsl(var(--surface-soft)/0.74)] sm:h-12 sm:w-12">
            <NotificationBell className="h-12 w-12 rounded-full hover:bg-transparent" />
          </div>

          <button
            aria-label={t("shell.user.appearanceSettings")}
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--primary)/0.28)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),hsl(var(--surface-card)/0.78))] text-[hsl(var(--primary))] shadow-[0_14px_30px_hsl(var(--primary)/0.12)] transition hover:-translate-y-0.5 hover:bg-[hsl(var(--primary)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-12 sm:w-12",
              isQuickMenuOpen && "bg-[hsl(var(--primary)/0.18)]",
            )}
            data-testid="user-settings-button"
            onClick={() => setIsQuickMenuOpen((open) => !open)}
            title={t("shell.user.appearanceSettingsTitle")}
            type="button"
          >
            <Settings2 className="h-[18px] w-[18px]" />
          </button>
        </div>

        {isQuickMenuOpen ? (
          <div
            aria-label={t("shell.user.quickMenu")}
            className="absolute bottom-[calc(100%+0.75rem)] left-2 right-2 z-40 max-h-[min(32rem,calc(100dvh-8rem))] overflow-y-auto rounded-[28px] border border-[hsl(var(--border)/0.76)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.99),hsl(var(--surface-soft)/0.86))] p-4 shadow-[0_28px_78px_hsl(var(--shadow-color)/0.19)] backdrop-blur-2xl sm:left-auto sm:right-[-2px] sm:w-[min(23rem,calc(100vw-2rem))]"
            role="dialog"
          >
            <div className="absolute -bottom-2 right-7 h-4 w-4 rotate-45 border-b border-r border-[hsl(var(--border)/0.76)] bg-[hsl(var(--surface-soft)/0.9)]" />

            <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_8rem] items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.72)] text-app-foreground shadow-[0_10px_24px_hsl(var(--shadow-color)/0.08)]">
                <Clock3 className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-app-foreground">
                  {t("shell.user.idleAfter")}
                </p>
                <p className="mt-0.5 text-[13px] leading-5 text-app-muted">
                  {t("shell.user.idleAfterDescription")}
                </p>
              </div>
              <label className="sr-only" htmlFor="user-presence-idle-timeout">
                {t("shell.user.idleAfterTitle")}
              </label>
              <div className="relative min-w-0">
                <select
                  className="h-10 w-full appearance-none rounded-2xl border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.86)] px-3 pr-8 text-[13px] font-bold text-app-foreground shadow-[inset_0_1px_0_hsl(var(--background)/0.5)] transition hover:bg-[hsl(var(--surface-card))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  id="user-presence-idle-timeout"
                  onChange={(event) => setIdleTimeoutMinutes(Number(event.target.value))}
                  title={t("shell.user.idleAfterTitle")}
                  value={idleTimeoutMinutes}
                >
                  {PRESENCE_IDLE_TIMEOUT_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {t("shell.user.idleMinutes", { count: minutes })}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
              </div>
            </div>

            <div className="my-4 h-px bg-[hsl(var(--border)/0.6)]" />

            <div className="grid gap-3.5">
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.72)] text-app-foreground shadow-[0_10px_24px_hsl(var(--shadow-color)/0.08)]">
                  <Mic className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 space-y-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-app-foreground">
                      {t("shell.user.microphone")}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-app-muted">
                      {t("shell.user.inputDevice")}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <AudioDeviceSelect kind="input" showIcon={false} variant="compact" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.72)] text-app-foreground shadow-[0_10px_24px_hsl(var(--shadow-color)/0.08)]">
                  <Volume2 className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 space-y-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-app-foreground">
                      {t("shell.user.speaker")}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-app-muted">
                      {t("shell.user.outputDevice")}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <AudioDeviceSelect kind="output" showIcon={false} variant="compact" />
                  </div>
                </div>
              </div>
            </div>

            <div className="my-4 h-px bg-[hsl(var(--border)/0.6)]" />

            <button
              className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-[22px] px-0 py-0 text-left transition hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={() => {
                setIsQuickMenuOpen(false);
                onOpenAppearanceSettings();
              }}
              type="button"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]">
                <Settings2 className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-app-foreground">
                  {t("shell.user.appearanceSettingsTitle")}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-app-muted">
                  {t("shell.user.settingsDescription")}
                </span>
              </span>
            </button>

            <button
              aria-label={t("shell.user.logout")}
              className="mt-3.5 grid w-full grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-[22px] px-0 py-0 text-left transition hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="user-logout-button"
              disabled={isLoggingOut}
              onClick={handleLogout}
              title={t("shell.user.logoutTitle")}
              type="button"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]">
                <LogOut className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-[hsl(var(--danger))]">
                  {t("shell.user.logout")}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-app-muted">
                  {t("shell.user.logoutDescription")}
                </span>
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildReorderPayload(categoryId: string | null, channels: WorkspaceChannel[]) {
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
  onCurrentUserStatusChange,
  onOpenSettings,
  onPrefetch,
  showUserFooter = true,
}: ChannelSidebarProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const voiceStatesQuery = useVoiceStates(detail?.server.id ?? null);
  const { prepareForVoiceJoin } = useVoiceConnection();
  const {
    channelSidebarWidth,
    collapsedCategories,
    openCategoryModal,
    openChannelModal,
    openDeleteChannelDialog,
    openInviteModal,
    openServerSettings,
    resetChannelSidebarWidth,
    setChannelSidebarWidth,
    toggleCategoryCollapse,
  } = useAppStore(
    useShallow((state) => ({
      channelSidebarWidth: state.channelSidebarWidth,
      collapsedCategories: state.collapsedCategories,
      openCategoryModal: state.openCategoryModal,
      openChannelModal: state.openChannelModal,
      openDeleteChannelDialog: state.openDeleteChannelDialog,
      openInviteModal: state.openInviteModal,
      openServerSettings: state.openServerSettings,
      resetChannelSidebarWidth: state.resetChannelSidebarWidth,
      setChannelSidebarWidth: state.setChannelSidebarWidth,
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
    onError: (
      _error,
      _variables,
      context: { previousDetail: WorkspaceServerDetail | null } | undefined,
    ) => {
      if (detail && context?.previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(detail.server.id),
          context.previousDetail,
        );
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

  const categoryReorderMutation = useMutation<
    { success: true },
    Error,
    Array<{ id: string; position: number }>,
    { previousDetail: WorkspaceServerDetail | null }
  >({
    mutationKey: ["workspace", "reorder-categories", detail?.server.id],
    mutationFn: (items: Array<{ id: string; position: number }>) => {
      if (!detail) {
        return Promise.resolve({ success: true as const });
      }

      return reorderCategoriesRequest(detail.server.id, items);
    },
    onError: (_error, _variables, context) => {
      if (detail && context?.previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(detail.server.id),
          context.previousDetail,
        );
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
          applyCategoryReorder(previousDetail, items),
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
    (channelId: string, channelType: "TEXT" | "VOICE") => {
      if (!serverId) return;

      if (channelType === "VOICE") {
        void prepareForVoiceJoin().catch(() => {
          // Join flow inside the voice view handles the final fallback state.
        });
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

  const moveCategory = useCallback(
    (categoryId: string, direction: "down" | "up") => {
      if (!detail) {
        return;
      }

      const oldIndex = detail.categories.findIndex((category) => category.id === categoryId);
      if (oldIndex < 0) {
        return;
      }

      const newIndex = direction === "up" ? oldIndex - 1 : oldIndex + 1;
      if (newIndex < 0 || newIndex >= detail.categories.length) {
        return;
      }

      const reordered = arrayMove(detail.categories, oldIndex, newIndex);
      categoryReorderMutation.mutate(
        reordered.map((category, index) => ({
          id: category.id,
          position: index,
        })),
      );
    },
    [categoryReorderMutation, detail],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !detail) return;

      const activeType = active.data.current?.itemType;

      if (activeType === "category") {
        const sourceCategoryId = active.data.current?.categoryId as string | undefined;
        const targetCategoryId = over.data.current?.categoryId as string | undefined;

        if (!sourceCategoryId || !targetCategoryId || sourceCategoryId === targetCategoryId) {
          return;
        }

        const oldIndex = detail.categories.findIndex(
          (category) => category.id === sourceCategoryId,
        );
        const newIndex = detail.categories.findIndex(
          (category) => category.id === targetCategoryId,
        );

        if (oldIndex < 0 || newIndex < 0) {
          return;
        }

        const reordered = arrayMove(detail.categories, oldIndex, newIndex);
        categoryReorderMutation.mutate(
          reordered.map((category, index) => ({
            id: category.id,
            position: index,
          })),
        );
        return;
      }

      const sourceCategoryId = (active.data.current?.categoryId ?? null) as string | null;
      const targetCategoryId = (over.data.current?.categoryId ?? null) as string | null;
      const droppedOnCategory = typeof over.id === "string" && over.id.startsWith("category:");

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
    [categoryReorderMutation, detail, reorderMutation],
  );

  const renderSidebarControls = () => (
    <div className="space-y-2 px-2 py-2">
      <div className="flex items-start gap-2 px-1">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.62)] text-app-muted">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-app-foreground">
            {t("shell.channelSidebar.customize")}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-app-soft">
            {t("shell.channelSidebar.customizeHint")}
          </p>
        </div>
      </div>
      <SidebarTuningControl
        label={t("shell.channelSidebar.width")}
        max={MAX_CHANNEL_SIDEBAR_WIDTH}
        min={MIN_CHANNEL_SIDEBAR_WIDTH}
        onChange={setChannelSidebarWidth}
        step={CHANNEL_SIDEBAR_WIDTH_STEP}
        value={channelSidebarWidth}
      />
      <button
        className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-bold text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.55)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
        onClick={() => {
          resetChannelSidebarWidth();
          setHeaderMenu((state) => ({ ...state, open: false }));
          setEmptyMenu((state) => ({ ...state, open: false }));
          setCategoryMenu((state) => ({ ...state, open: false }));
        }}
        type="button"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t("appearance.resetSidebar")}
      </button>
    </div>
  );

  const setAllCategoriesCollapsed = useCallback(
    (collapsed: boolean) => {
      if (!detail) {
        return;
      }

      detail.categories.forEach((category) => {
        const key = `${detail.server.id}:${category.id}`;
        const isCollapsed = collapsedCategories[key] ?? false;
        if (isCollapsed !== collapsed) {
          toggleCategoryCollapse(detail.server.id, category.id);
        }
      });

      setHeaderMenu((state) => ({ ...state, open: false }));
      setEmptyMenu((state) => ({ ...state, open: false }));
      setCategoryMenu((state) => ({ ...state, open: false }));
    },
    [collapsedCategories, detail, toggleCategoryCollapse],
  );

  if (loading) {
    return (
      <aside
        className="app-sidebar h-full w-full min-w-0 overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0"
        data-testid="channel-sidebar"
      >
        <ChannelSidebarSkeleton />
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside
        className="app-sidebar flex h-full w-full min-w-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0"
        data-testid="channel-sidebar"
      >
        <div className="min-h-0 flex-1 p-4">
          <FriendsSidebar
            currentUserId={currentUser.id}
            onNavigate={onNavigate}
            onPrefetch={onPrefetch}
          />
        </div>
        {showUserFooter ? (
          <div
            className="border-t border-[hsl(var(--border)/0.78)] py-3 pl-3 pr-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3"
            data-notification-popup-anchor="controls-border"
          >
            <UserProfileFooter
              user={currentUser}
              onOpenAppearanceSettings={onOpenSettings}
              onStatusChange={onCurrentUserStatusChange}
            />
          </div>
        ) : null}
      </aside>
    );
  }

  const canManage = detail.server.isAdmin;
  const getCategoryCollapsed = (categoryId: string) =>
    collapsedCategories[`${detail.server.id}:${categoryId}`] ?? false;

  const renderChannelGroup = (
    label: string,
    categoryId: string | null,
    channels: WorkspaceChannel[],
    categorySortable?: CategorySortableHandle,
  ) => {
    const collapsed = categoryId ? getCategoryCollapsed(categoryId) : false;
    const categoryIndex = categoryId
      ? detail.categories.findIndex((category) => category.id === categoryId)
      : -1;
    const canMoveCategoryUp = categoryIndex > 0;
    const canMoveCategoryDown = categoryIndex >= 0 && categoryIndex < detail.categories.length - 1;

    return (
      <div
        className="group/category space-y-1 rounded-[22px] border border-[hsl(var(--border)/0.32)] bg-[hsl(var(--surface-card)/0.18)] px-1.5 py-1.5"
        data-sidebar-interactive="true"
        key={categoryId ?? "uncategorized"}
      >
        <div className="flex items-center gap-1">
          {canManage && categoryId && categorySortable ? (
            <button
              aria-label={t("shell.channelSidebar.dragCategory", { name: label })}
              className={cn(
                "text-app-soft inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-xl transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                categorySortable.isDragging && "cursor-grabbing text-app-foreground",
              )}
              type="button"
              {...categorySortable.attributes}
              {...categorySortable.listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {canManage && categoryId ? (
            <div
              aria-label={t("shell.channelSidebar.categoryMoveControls", { name: label })}
              className="hidden shrink-0 items-center rounded-2xl border border-[hsl(var(--border)/0.48)] bg-[hsl(var(--surface-card)/0.64)] p-0.5 shadow-[0_10px_22px_hsl(var(--shadow-color)/0.08)] group-hover/category:flex group-focus-within/category:flex"
            >
              <button
                aria-label={t("shell.channelSidebar.moveCategoryUp", { name: label })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-app-soft transition hover:bg-[hsl(var(--surface-soft)/0.74)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!canMoveCategoryUp || categoryReorderMutation.isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  moveCategory(categoryId, "up");
                }}
                title={t("shell.channelSidebar.moveCategoryUp", { name: label })}
                type="button"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={t("shell.channelSidebar.moveCategoryDown", { name: label })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-app-soft transition hover:bg-[hsl(var(--surface-soft)/0.74)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!canMoveCategoryDown || categoryReorderMutation.isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  moveCategory(categoryId, "down");
                }}
                title={t("shell.channelSidebar.moveCategoryDown", { name: label })}
                type="button"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <button
            className="text-app-soft flex min-w-0 flex-1 items-center justify-between rounded-2xl px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.24em] transition hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-[hsl(var(--foreground))]"
            onClick={() => {
              if (categoryId) {
                toggleCategoryCollapse(detail.server.id, categoryId);
              }
            }}
            type="button"
          >
            <span className="truncate">{label}</span>
            {categoryId ? (
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 transition", collapsed && "-rotate-90")}
              />
            ) : null}
          </button>
          {canManage && categoryId ? (
            <button
              aria-label={t("shell.channelSidebar.categoryActions")}
              className="text-app-soft inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl border border-transparent opacity-0 transition hover:border-[hsl(var(--border)/0.62)] hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] group-hover/category:opacity-100"
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
        {canManage && categoryId ? (
          <p className="hidden px-2.5 text-[10px] font-medium leading-4 text-app-soft transition group-hover/category:block group-focus-within/category:block">
            {t("shell.channelSidebar.categoryMoveHint")}
          </p>
        ) : null}

        {!collapsed ? (
          <SortableContext
            items={channels.map((channel) => channel.id)}
            strategy={verticalListSortingStrategy}
          >
            <ChannelDropZone
              canManage={canManage}
              categoryId={categoryId}
              empty={channels.length === 0}
              emptyLabel={t("shell.channelSidebar.dropChannelsHere")}
            >
              <div className="space-y-0.5">
                {channels.map((channel) => {
                  const voiceState =
                    channel.type === "VOICE"
                      ? (voiceStatesQuery.data?.find((state) => state.channelId === channel.id) ??
                        null)
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
                      testId={`channel-item-${channel.id}`}
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
    <aside
      className="app-sidebar flex h-full w-full min-w-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0"
      data-testid="channel-sidebar"
    >
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

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
        <div
          className="min-w-0 flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden p-3"
          onContextMenu={(event) => {
            const target = event.target;
            if (
              target instanceof HTMLElement &&
              target.closest("[data-sidebar-interactive='true']")
            ) {
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
          <SortableContext
            items={detail.categories.map((category) => `category-sort:${category.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {detail.categories.map((category) => (
              <SortableCategoryGroup
                canManage={canManage}
                categoryId={category.id}
                key={category.id}
              >
                {(sortable) =>
                  renderChannelGroup(category.name, category.id, category.channels, sortable)
                }
              </SortableCategoryGroup>
            ))}
          </SortableContext>
          {detail.ungroupedChannels.length > 0
            ? renderChannelGroup(
                t("shell.channelSidebar.openChannels"),
                null,
                detail.ungroupedChannels,
              )
            : null}
        </div>
      </DndContext>

      {showUserFooter ? (
        <div
          className="border-t border-[hsl(var(--border)/0.78)] py-3 pl-3 pr-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3"
          data-notification-popup-anchor="controls-border"
        >
          <UserProfileFooter
            user={currentUser}
            onOpenAppearanceSettings={onOpenSettings}
            onStatusChange={onCurrentUserStatusChange}
          />
        </div>
      ) : null}

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
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(false)}
        >
          <ChevronDown className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.expandAllCategories")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(true)}
        >
          <ChevronDown className="mr-2 h-4 w-4 -rotate-90" />
          {t("shell.channelSidebar.collapseAllCategories")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {renderSidebarControls()}
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
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(false)}
        >
          <ChevronDown className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.expandAllCategories")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(true)}
        >
          <ChevronDown className="mr-2 h-4 w-4 -rotate-90" />
          {t("shell.channelSidebar.collapseAllCategories")}
        </ContextMenuItem>
      </ContextMenu>

      <ContextMenu
        onClose={() => setEmptyMenu((state) => ({ ...state, open: false }))}
        open={emptyMenu.open}
        position={emptyMenu}
      >
        {canManage ? (
          <>
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
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(false)}
        >
          <ChevronDown className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.expandAllCategories")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(true)}
        >
          <ChevronDown className="mr-2 h-4 w-4 -rotate-90" />
          {t("shell.channelSidebar.collapseAllCategories")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {renderSidebarControls()}
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
