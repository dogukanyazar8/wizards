"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { DmSidebar, type DmConversationItemView, type DmFilterId } from "@/components/dm/dm-sidebar";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import {
  findOtherParticipant,
  getConversationPreview,
} from "@/lib/dm/client";
import { fetchPendingFriends, friendsQueryKeys } from "@/lib/friends/client";

type FriendsSidebarProps = {
  currentUserId: string;
  onNavigate: (href: string) => void;
  onPrefetch?: ((href: string) => void) | undefined;
};

function normalizeSearch(value: string, locale: string) {
  return value.trim().toLocaleLowerCase(locale);
}

function formatConversationTime(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  return new Intl.DateTimeFormat(locale, sameDay ? {
    hour: "2-digit",
    minute: "2-digit",
  } : {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function FriendsSidebar({
  currentUserId,
  onNavigate,
  onPrefetch,
}: FriendsSidebarProps) {
  const { locale, t } = useI18n();
  const socket = useSocket();
  const params = useParams<{ channelId?: string; serverId?: string }>();
  const [activeFilter, setActiveFilter] = useState<DmFilterId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const newChatHref = "/channels/@me?dmAction=new";
  const activeConversationId =
    params.serverId === "@me" && typeof params.channelId === "string"
      ? params.channelId
      : null;
  const pendingQuery = useQuery({
    queryFn: fetchPendingFriends,
    queryKey: friendsQueryKeys.pending,
    staleTime: 30_000,
  });
  const { refetch: refetchPending } = pendingQuery;
  const {
    conversations,
    fetchNextPage,
    hasNextPage,
    hideConversation,
    isFetchingNextPage,
    isHidingConversation,
    isMarkingAsRead,
    isMarkingAsUnread,
    isLoading: conversationsLoading,
    isUpdatingMuted,
    markAsRead,
    markAsUnread,
    setMuted,
  } = useDMConversations(currentUserId);

  const incomingRequests = pendingQuery.data?.incoming ?? [];
  const conversationItems = useMemo<DmConversationItemView[]>(
    () =>
      conversations.map((conversation) => {
        const otherParticipant = findOtherParticipant(conversation, currentUserId);
        const unreadCount =
          conversation.participants.find(
            (participant) => participant.userId === currentUserId,
          )?.unreadCount ?? 0;
        const displayName =
          conversation.name ??
          otherParticipant?.displayName ??
          otherParticipant?.username ??
          t("dm.sidebar.unknownUser");
        const handle = otherParticipant?.username ? `@${otherParticipant.username}` : null;
        const preview = conversation.lastMessage
          ? getConversationPreview(
              conversation,
              58,
              t("chat.attachments.image"),
              t("chat.attachments.file"),
              t("chat.attachments.gif"),
            )
          : t("dm.sidebar.emptyConversation");
        const status = otherParticipant?.status ?? "OFFLINE";
        const searchText = normalizeSearch(
          [displayName, handle, preview].filter(Boolean).join(" "),
          locale,
        );

        return {
          avatarUrl: otherParticipant?.avatarUrl,
          conversation,
          displayName,
          handle,
          isMuted:
            conversation.participants.find((participant) => participant.userId === currentUserId)
              ?.muted ?? false,
          isActive: activeConversationId === conversation.id,
          preview,
          searchText,
          status,
          timestampLabel: formatConversationTime(conversation.lastMessageAt, locale),
          unreadCount,
        };
      }),
    [activeConversationId, conversations, currentUserId, locale, t],
  );
  const unreadCount = useMemo(
    () => conversationItems.reduce((total, item) => total + item.unreadCount, 0),
    [conversationItems],
  );
  const filteredConversations = useMemo(() => {
    const normalizedSearch = normalizeSearch(searchQuery, locale);
    const byFilter =
      activeFilter === "unread"
        ? conversationItems.filter((item) => item.unreadCount > 0)
        : conversationItems;

    if (!normalizedSearch) {
      return byFilter;
    }

    return byFilter.filter((item) => item.searchText.includes(normalizedSearch));
  }, [activeFilter, conversationItems, locale, searchQuery]);

  useEffect(() => {
    const handleFriendsUpdated = () => {
      void refetchPending();
    };

    socket.on("friends:updated", handleFriendsUpdated);

    return () => {
      socket.off("friends:updated", handleFriendsUpdated);
    };
  }, [refetchPending, socket]);

  return (
    <DmSidebar
      activeFilter={activeFilter}
      conversations={conversationItems}
      conversationsLoading={conversationsLoading}
      filteredConversations={filteredConversations}
      hasNextPage={Boolean(hasNextPage) && activeFilter === "all" && searchQuery.trim().length === 0}
      incomingRequests={incomingRequests}
      isFetchingNextPage={isFetchingNextPage}
      isHidingConversation={
        isHidingConversation || isMarkingAsRead || isMarkingAsUnread || isUpdatingMuted
      }
      onFilterChange={setActiveFilter}
      onHideConversation={hideConversation}
      onLoadMore={() => {
        void fetchNextPage();
      }}
      onMarkConversationRead={markAsRead}
      onMarkConversationUnread={markAsUnread}
      onNavigate={onNavigate}
      onOpenConversation={(item) => {
        if (item.unreadCount > 0) {
          void markAsRead(item.conversation.id);
        }
        onNavigate(`/channels/@me/${item.conversation.id}`);
      }}
      onPrefetch={onPrefetch}
      onSetConversationMuted={setMuted}
      onSearchChange={setSearchQuery}
      onStartNewChat={() => {
        setActiveFilter("all");
        setSearchQuery("");
        onNavigate(newChatHref);
      }}
      searchQuery={searchQuery}
      text={{
        all: t("dm.sidebar.filters.all"),
        botNotifications: t("dm.sidebar.botNotifications"),
        botNotificationsDescription: t("dm.sidebar.botNotificationsDescription"),
        directMessages: t("friends.sidebar.directMessages"),
        emptyDescription: t("dm.sidebar.empty"),
        emptyRequests: t("dm.sidebar.emptyRequests"),
        emptySearch: t("dm.sidebar.emptySearch"),
        emptyTitle: t("dm.sidebar.emptyTitle"),
        friends: t("friends.sidebar.friends"),
        hideConversation: (name) => t("dm.sidebar.hideConversation", { name }),
        loadMore: t("dm.sidebar.loadMore"),
        loadingMore: t("dm.sidebar.loadingMore"),
        markRead: t("dm.sidebar.actions.markRead"),
        markUnread: t("dm.sidebar.actions.markUnread"),
        moreActions: (name) => t("dm.sidebar.actions.more", { name }),
        mute: t("dm.sidebar.actions.mute"),
        newChat: t("dm.sidebar.newChat"),
        pendingRequests: t("dm.sidebar.pendingRequests"),
        pinSoon: t("dm.sidebar.actions.pinSoon"),
        pinned: t("dm.sidebar.filters.pinned"),
        previewBadge: t("dm.sidebar.previewBadge"),
        quickStart: t("dm.sidebar.quickStart"),
        requests: t("dm.sidebar.filters.requests"),
        requestsDescription: (count) => t("dm.sidebar.requestsDescription", { count }),
        searchPlaceholder: t("dm.sidebar.searchPlaceholder"),
        subtitle: t("dm.sidebar.subtitle"),
        unmute: t("dm.sidebar.actions.unmute"),
        unread: t("dm.sidebar.filters.unread"),
        unreadEmpty: t("dm.sidebar.unreadEmpty"),
      }}
      unreadCount={unreadCount}
    />
  );
}
