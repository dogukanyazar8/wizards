"use client";

import {
  Bell,
  BellOff,
  Bot,
  Inbox,
  Keyboard,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Trash2,
  UserRoundPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { DMConversationDTO, DMPresenceStatus } from "@wizards/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import type { FriendRequestDto } from "@/lib/friends/types";
import { cn } from "@/lib/utils";

export type DmFilterId = "all" | "requests" | "unread";

export type DmConversationItemView = {
  avatarUrl: string | null | undefined;
  conversation: DMConversationDTO;
  displayName: string;
  handle: string | null;
  isActive: boolean;
  isMuted: boolean;
  preview: string;
  searchText: string;
  status: DMPresenceStatus;
  timestampLabel: string | null;
  unreadCount: number;
};

type DmFilterOption = {
  badge?: number;
  disabled?: boolean;
  id: DmFilterId | "pinned";
  icon?: LucideIcon;
  label: string;
};

type DmSidebarProps = {
  activeFilter: DmFilterId;
  conversations: DmConversationItemView[];
  conversationsLoading: boolean;
  filteredConversations: DmConversationItemView[];
  hasNextPage: boolean;
  incomingRequests: FriendRequestDto[];
  isFetchingNextPage: boolean;
  isHidingConversation: boolean;
  onFilterChange: (filter: DmFilterId) => void;
  onHideConversation: (conversationId: string) => Promise<void>;
  onLoadMore: () => void;
  onMarkConversationRead: (conversationId: string) => Promise<void>;
  onMarkConversationUnread: (conversationId: string) => Promise<void>;
  onNavigate: (href: string) => void;
  onOpenConversation: (conversation: DmConversationItemView) => void;
  onPrefetch?: ((href: string) => void) | undefined;
  onSearchChange: (value: string) => void;
  onSetConversationMuted: (conversationId: string, muted: boolean) => Promise<void>;
  onStartNewChat: () => void;
  searchQuery: string;
  text: {
    all: string;
    directMessages: string;
    emptyDescription: string;
    emptyRequests: string;
    emptySearch: string;
    emptyTitle: string;
    friends: string;
    hideConversation: (name: string) => string;
    loadMore: string;
    loadingMore: string;
    markRead: string;
    markUnread: string;
    moreActions: (name: string) => string;
    mute: string;
    newChat: string;
    pendingRequests: string;
    pinSoon: string;
    pinned: string;
    previewBadge: string;
    quickStart: string;
    requests: string;
    requestsDescription: (count: number) => string;
    searchPlaceholder: string;
    subtitle: string;
    unmute: string;
    unread: string;
    unreadEmpty: string;
    botNotifications: string;
    botNotificationsDescription: string;
  };
  unreadCount: number;
};

function getStatusDotClass(status: DMPresenceStatus) {
  if (status === "ONLINE") {
    return "bg-[hsl(var(--success))]";
  }

  if (status === "IDLE") {
    return "bg-[hsl(42_96%_56%)]";
  }

  if (status === "DND") {
    return "bg-[hsl(var(--danger))]";
  }

  return "bg-[hsl(var(--text-soft))]";
}

function DmSearchInput({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="relative block" data-testid="dm-search">
      <span className="sr-only">{placeholder}</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft"
      />
      <Input
        className="h-10 rounded-[16px] border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.72)] pl-9 pr-12 text-sm shadow-none placeholder:text-app-soft focus-visible:border-[hsl(var(--primary)/0.38)]"
        data-testid="dm-search-input"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-full bg-[hsl(var(--surface-soft)/0.78)] px-2 py-1 text-[10px] font-semibold text-app-soft sm:inline-flex"
      >
        Ctrl K
      </span>
    </label>
  );
}

function DmFilterTabs({
  activeFilter,
  options,
  onChange,
}: {
  activeFilter: DmFilterId;
  onChange: (filter: DmFilterId) => void;
  options: DmFilterOption[];
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" data-testid="dm-filter-tabs" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={activeFilter === option.id}
          aria-disabled={option.disabled ? "true" : undefined}
          className={cn(
            "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]",
            activeFilter === option.id
              ? "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.13)] text-[hsl(var(--primary))]"
              : option.disabled
                ? "cursor-not-allowed border-transparent bg-[hsl(var(--surface-soft)/0.24)] text-app-soft opacity-70"
                : "border-transparent bg-[hsl(var(--surface-soft)/0.38)] text-app-muted hover:bg-[hsl(var(--surface-soft)/0.62)] hover:text-app-foreground",
          )}
          data-testid={`dm-filter-${option.id}`}
          key={option.id}
          onClick={() => {
            if (!option.disabled && option.id !== "pinned") {
              onChange(option.id);
            }
          }}
          role="tab"
          type="button"
        >
          {option.icon ? <option.icon className="h-3.5 w-3.5" /> : null}
          {option.label}
          {option.badge && option.badge > 0 ? (
            <Badge className="px-2 py-0.5 tracking-normal" tone="muted">
              {option.badge}
            </Badge>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function DmLoadingSkeleton() {
  return (
    <div className="space-y-1.5" data-testid="dm-sidebar-loading">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          className="flex min-h-[4.25rem] items-center gap-3 rounded-[20px] px-2.5 py-2.5"
          key={index}
        >
          <div className="h-11 w-11 animate-pulse rounded-[18px] bg-[hsl(var(--surface-soft)/0.78)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-28 animate-pulse rounded-full bg-[hsl(var(--surface-soft)/0.78)]" />
            <div className="h-3 w-36 animate-pulse rounded-full bg-[hsl(var(--surface-soft)/0.62)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DmEmptyState({
  actionLabel,
  description,
  icon: Icon,
  onAction,
  title,
}: {
  actionLabel?: string | undefined;
  description: string;
  icon: LucideIcon;
  onAction?: (() => void) | undefined;
  title: string;
}) {
  return (
    <div
      className="flex min-h-[13rem] flex-col items-center justify-center rounded-[22px] border border-dashed border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.18)] px-4 py-6 text-center"
      data-testid="dm-sidebar-empty"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-app-foreground">{title}</p>
      <p className="mt-1 max-w-[15rem] text-xs leading-5 text-app-muted">{description}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-4 inline-flex min-h-9 items-center justify-center rounded-full border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.1)] px-3 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.14)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function DmRequestsSummary({
  incomingRequests,
  onOpenFriends,
  text,
}: {
  incomingRequests: FriendRequestDto[];
  onOpenFriends: () => void;
  text: DmSidebarProps["text"];
}) {
  if (incomingRequests.length === 0) {
    return (
      <DmEmptyState description={text.emptyRequests} icon={UserRoundPlus} title={text.requests} />
    );
  }

  return (
    <div className="space-y-2" data-testid="dm-requests-summary">
      <button
        className="flex w-full items-center gap-3 rounded-[20px] bg-[hsl(var(--primary)/0.1)] px-3 py-3 text-left transition hover:bg-[hsl(var(--primary)/0.14)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]"
        onClick={onOpenFriends}
        type="button"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]">
          <UserRoundPlus className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-app-foreground">
            {text.pendingRequests}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-app-muted">
            {text.requestsDescription(incomingRequests.length)}
          </span>
        </span>
      </button>
      {incomingRequests.slice(0, 3).map((request) => {
        const displayName = request.sender.displayName ?? request.sender.username;

        return (
          <button
            className="flex w-full items-center gap-3 rounded-[18px] px-2.5 py-2 text-left transition hover:bg-[hsl(var(--surface-soft)/0.42)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
            key={request.id}
            onClick={onOpenFriends}
            type="button"
          >
            <Avatar
              alt={displayName}
              className="h-9 w-9 rounded-[15px] text-[11px]"
              fallback={displayName}
              src={request.sender.avatarUrl}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-app-foreground">
                {displayName}
              </span>
              <span className="block truncate text-xs text-app-muted">
                @{request.sender.username}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DmConversationItem({
  item,
  isHidingConversation,
  onHideConversation,
  onMarkConversationRead,
  onMarkConversationUnread,
  onOpen,
  onPrefetch,
  onSetConversationMuted,
  text,
}: {
  isHidingConversation: boolean;
  item: DmConversationItemView;
  onHideConversation: (conversationId: string) => Promise<void>;
  onMarkConversationRead: (conversationId: string) => Promise<void>;
  onMarkConversationUnread: (conversationId: string) => Promise<void>;
  onOpen: (conversation: DmConversationItemView) => void;
  onPrefetch?: ((href: string) => void) | undefined;
  onSetConversationMuted: (conversationId: string, muted: boolean) => Promise<void>;
  text: DmSidebarProps["text"];
}) {
  const href = `/channels/@me/${item.conversation.id}`;
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const hasUnread = item.unreadCount > 0;
  const canMarkUnread = Boolean(item.conversation.lastMessage) && !hasUnread;

  const closeMenu = () => setMenuPosition(null);

  const runMenuAction = (action: () => Promise<void>) => {
    closeMenu();
    void action();
  };

  return (
    <div className="group relative">
      <button
        aria-current={item.isActive ? "page" : undefined}
        className={cn(
          "relative flex min-h-16 w-full items-center gap-2.5 rounded-[18px] px-2 py-2 pr-9 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]",
          item.isActive
            ? "bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),hsl(var(--surface-soft)/0.28))] text-app-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.16)]"
            : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.42)] hover:text-app-foreground",
        )}
        data-testid={`dm-conversation-${item.conversation.id}`}
        onClick={() => onOpen(item)}
        onMouseEnter={() => onPrefetch?.(href)}
        type="button"
      >
        <span className="relative shrink-0">
          <Avatar
            alt={item.displayName}
            className="h-10 w-10 rounded-[16px] text-xs"
            fallback={item.displayName}
            src={item.avatarUrl}
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--background))]",
              getStatusDotClass(item.status),
            )}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-app-foreground">
              {item.displayName}
            </span>
            {item.timestampLabel ? (
              <span className="ml-auto shrink-0 text-[11px] font-medium text-app-soft">
                {item.timestampLabel}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2">
            {item.handle ? (
              <span className="max-w-[8.75rem] shrink-0 truncate text-[11px] text-app-soft">
                {item.handle}
              </span>
            ) : null}
            {item.isMuted ? (
              <BellOff
                className="ml-auto mr-2 h-3.5 w-3.5 shrink-0 text-app-soft"
                aria-hidden="true"
              />
            ) : null}
            {item.unreadCount > 0 ? (
              <span
                className={cn("shrink-0", item.isMuted ? "" : "ml-auto")}
                data-testid={`dm-conversation-${item.conversation.id}-unread-badge`}
              >
                <Badge className="px-2 py-0.5 tracking-normal">{item.unreadCount}</Badge>
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-xs leading-5 text-app-muted">
            {item.preview}
          </span>
        </span>
      </button>

      <button
        aria-haspopup="menu"
        aria-label={text.moreActions(item.displayName)}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[12px] bg-[hsl(var(--surface-card)/0.94)] text-app-muted opacity-100 shadow-[0_10px_24px_hsl(var(--shadow-color)/0.1)] transition hover:bg-[hsl(var(--surface-card))] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)] disabled:cursor-not-allowed disabled:opacity-50 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
        disabled={isHidingConversation}
        onClick={(event) => {
          event.stopPropagation();
          setMenuPosition({ x: event.clientX, y: event.clientY });
        }}
        type="button"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      <ContextMenu
        onClose={closeMenu}
        open={Boolean(menuPosition)}
        position={menuPosition ?? { x: 0, y: 0 }}
      >
        {hasUnread ? (
          <ContextMenuItem
            disabled={isHidingConversation}
            onClick={() => runMenuAction(() => onMarkConversationRead(item.conversation.id))}
          >
            <Inbox className="mr-2 h-4 w-4" />
            {text.markRead}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            disabled={isHidingConversation || !canMarkUnread}
            onClick={() => runMenuAction(() => onMarkConversationUnread(item.conversation.id))}
          >
            <Inbox className="mr-2 h-4 w-4" />
            {text.markUnread}
          </ContextMenuItem>
        )}
        <ContextMenuItem disabled>
          <Pin className="mr-2 h-4 w-4" />
          {text.pinSoon}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isHidingConversation}
          onClick={() =>
            runMenuAction(() => onSetConversationMuted(item.conversation.id, !item.isMuted))
          }
        >
          {item.isMuted ? <Bell className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
          {item.isMuted ? text.unmute : text.mute}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          destructive
          disabled={isHidingConversation}
          onClick={() => runMenuAction(() => onHideConversation(item.conversation.id))}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {text.hideConversation(item.displayName)}
        </ContextMenuItem>
      </ContextMenu>
    </div>
  );
}

function DmConversationList({
  conversations,
  hasNextPage,
  isFetchingNextPage,
  isHidingConversation,
  onHideConversation,
  onLoadMore,
  onMarkConversationRead,
  onMarkConversationUnread,
  onOpenConversation,
  onPrefetch,
  onSetConversationMuted,
  text,
}: {
  conversations: DmConversationItemView[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isHidingConversation: boolean;
  onHideConversation: (conversationId: string) => Promise<void>;
  onLoadMore: () => void;
  onMarkConversationRead: (conversationId: string) => Promise<void>;
  onMarkConversationUnread: (conversationId: string) => Promise<void>;
  onOpenConversation: (conversation: DmConversationItemView) => void;
  onPrefetch?: ((href: string) => void) | undefined;
  onSetConversationMuted: (conversationId: string, muted: boolean) => Promise<void>;
  text: DmSidebarProps["text"];
}) {
  return (
    <div className="space-y-1" data-testid="dm-conversation-list">
      {conversations.map((conversation) => (
        <DmConversationItem
          isHidingConversation={isHidingConversation}
          item={conversation}
          key={conversation.conversation.id}
          onHideConversation={onHideConversation}
          onMarkConversationRead={onMarkConversationRead}
          onMarkConversationUnread={onMarkConversationUnread}
          onOpen={onOpenConversation}
          onPrefetch={onPrefetch}
          onSetConversationMuted={onSetConversationMuted}
          text={text}
        />
      ))}
      {hasNextPage ? (
        <button
          className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-[16px] bg-[hsl(var(--surface-soft)/0.38)] px-3 text-xs font-semibold text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.62)] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isFetchingNextPage}
          onClick={onLoadMore}
          type="button"
        >
          {isFetchingNextPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isFetchingNextPage ? text.loadingMore : text.loadMore}
        </button>
      ) : null}
    </div>
  );
}

function DmBotNotificationsPreview({ text }: { text: DmSidebarProps["text"] }) {
  return (
    <div className="mt-2 rounded-[18px] bg-[hsl(var(--surface-soft)/0.32)] px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
          <Bot className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-bold text-app-foreground">
              {text.botNotifications}
            </span>
            <span className="shrink-0 rounded-full bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[hsl(var(--primary))]">
              {text.previewBadge}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs font-medium text-app-muted">
            {text.botNotificationsDescription}
          </span>
        </span>
      </div>
    </div>
  );
}

function DmQuickStart({
  onPrefetch,
  onStartNewChat,
  text,
}: {
  onPrefetch?: ((href: string) => void) | undefined;
  onStartNewChat: () => void;
  text: DmSidebarProps["text"];
}) {
  const href = "/channels/@me?dmAction=new";

  return (
    <div className="shrink-0 border-t border-[hsl(var(--border)/0.34)] px-1 pb-2 pt-2.5 sm:px-1.5">
      <button
        className="flex min-h-11 w-full items-center gap-2.5 rounded-[17px] bg-[hsl(var(--surface-card)/0.72)] px-2.5 py-2 text-left text-sm font-bold text-app-foreground shadow-[0_12px_28px_hsl(var(--shadow-color)/0.05)] transition hover:bg-[hsl(var(--surface-card)/0.92)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="dm-quick-start"
        onClick={onStartNewChat}
        onMouseEnter={() => onPrefetch?.(href)}
        type="button"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
          <MessageCircle className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{text.quickStart}</span>
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[hsl(var(--surface-soft)/0.58)] px-2 py-1 text-[10px] font-black text-app-soft sm:inline-flex">
          <Keyboard className="h-3 w-3" />
          Ctrl N
        </span>
      </button>
    </div>
  );
}

export function DmSidebar({
  activeFilter,
  conversations,
  conversationsLoading,
  filteredConversations,
  hasNextPage,
  incomingRequests,
  isFetchingNextPage,
  isHidingConversation,
  onFilterChange,
  onHideConversation,
  onLoadMore,
  onMarkConversationRead,
  onMarkConversationUnread,
  onNavigate,
  onOpenConversation,
  onPrefetch,
  onSearchChange,
  onSetConversationMuted,
  onStartNewChat,
  searchQuery,
  text,
  unreadCount,
}: DmSidebarProps) {
  const filterOptions: DmFilterOption[] = [
    { id: "all", label: text.all },
    { badge: unreadCount, id: "unread", label: text.unread },
    { disabled: true, icon: Pin, id: "pinned", label: text.pinned },
    { badge: incomingRequests.length, id: "requests", label: text.requests },
  ];
  const hasSearch = searchQuery.trim().length > 0;
  return (
    <section
      aria-label={text.directMessages}
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="dm-sidebar"
    >
      <div className="shrink-0 px-1 pb-2.5 pt-1 sm:px-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-app-foreground text-lg font-semibold tracking-tight">
              {text.directMessages}
            </p>
            <p className="mt-0.5 truncate text-xs leading-5 text-app-muted">{text.subtitle}</p>
          </div>
          <button
            aria-label={text.friends}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[hsl(var(--surface-soft)/0.5)] text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.76)] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]"
            onClick={() => onNavigate("/channels/@me")}
            onMouseEnter={() => onPrefetch?.("/channels/@me")}
            type="button"
          >
            <Users className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-2.5">
          <DmSearchInput
            onChange={onSearchChange}
            placeholder={text.searchPlaceholder}
            value={searchQuery}
          />
          <button
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-[16px] border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary))] px-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_14px_30px_hsl(var(--primary)/0.2),inset_0_1px_0_hsl(var(--background)/0.24)] transition hover:bg-[hsl(var(--primary)/0.92)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="dm-new-chat-button"
            onClick={onStartNewChat}
            onMouseEnter={() => onPrefetch?.("/channels/@me?dmAction=new")}
            type="button"
          >
            <Plus className="h-4 w-4" />
            {text.newChat}
          </button>
          <DmFilterTabs
            activeFilter={activeFilter}
            onChange={onFilterChange}
            options={filterOptions}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 sm:px-1.5">
        <div className="mb-1.5 flex items-center px-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-app-soft">
          {text.directMessages}
        </div>

        {conversationsLoading ? (
          <DmLoadingSkeleton />
        ) : activeFilter === "requests" ? (
          <DmRequestsSummary
            incomingRequests={incomingRequests}
            onOpenFriends={() => onNavigate("/channels/@me")}
            text={text}
          />
        ) : filteredConversations.length > 0 ? (
          <>
            <DmConversationList
              conversations={filteredConversations}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isHidingConversation={isHidingConversation}
              onHideConversation={onHideConversation}
              onLoadMore={onLoadMore}
              onMarkConversationRead={onMarkConversationRead}
              onMarkConversationUnread={onMarkConversationUnread}
              onOpenConversation={onOpenConversation}
              onPrefetch={onPrefetch}
              onSetConversationMuted={onSetConversationMuted}
              text={text}
            />
            {activeFilter === "all" && !hasSearch ? (
              <DmBotNotificationsPreview text={text} />
            ) : null}
          </>
        ) : (
          <DmEmptyState
            actionLabel={conversations.length === 0 ? text.newChat : undefined}
            description={
              hasSearch
                ? text.emptySearch
                : activeFilter === "unread"
                  ? text.unreadEmpty
                  : text.emptyDescription
            }
            icon={conversations.length === 0 ? MessageCircle : Inbox}
            onAction={conversations.length === 0 ? onStartNewChat : undefined}
            title={text.emptyTitle}
          />
        )}
      </div>
      <DmQuickStart onPrefetch={onPrefetch} onStartNewChat={onStartNewChat} text={text} />
    </section>
  );
}
