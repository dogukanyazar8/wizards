"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareMore, Users, X } from "lucide-react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
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

function getStatusDotClass(status: "ONLINE" | "IDLE" | "DND" | "OFFLINE") {
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

export function FriendsSidebar({
  currentUserId,
  onNavigate,
  onPrefetch,
}: FriendsSidebarProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const params = useParams<{ channelId?: string; serverId?: string }>();
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
    hideConversation,
    isHidingConversation,
    isLoading: conversationsLoading,
    markAsRead,
  } = useDMConversations(currentUserId);

  const incomingCount = pendingQuery.data?.incoming.length ?? 0;

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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden sm:gap-4">
      <button
        aria-current={activeConversationId ? undefined : "page"}
        className={`app-panel flex min-h-14 items-center justify-between rounded-[22px] border px-3 py-3 text-left transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:rounded-[24px] sm:px-4 ${
          activeConversationId
            ? ""
            : "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.12)]"
        }`}
        onClick={() => onNavigate("/channels/@me")}
        onMouseEnter={() => onPrefetch?.("/channels/@me")}
        type="button"
      >
        <span className="flex items-center gap-3">
          <span className="app-panel-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border">
            <Users className="h-4 w-4" />
          </span>
          <span className="text-app-foreground text-sm font-semibold">
            {t("friends.sidebar.friends")}
          </span>
        </span>
        {incomingCount > 0 ? <Badge>{incomingCount}</Badge> : null}
      </button>

      <div className="app-panel flex min-h-0 flex-1 flex-col rounded-[24px] border p-3 sm:rounded-[28px] sm:p-4">
        <div className="flex items-center gap-2">
          <MessageSquareMore className="text-app-muted h-4 w-4" />
          <p className="text-app-foreground text-xs font-semibold uppercase tracking-[0.2em]">
            {t("friends.sidebar.directMessages")}
          </p>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {conversationsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  className="rounded-[20px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.28)] p-3"
                  key={index}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-[hsl(var(--surface-soft))]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-24 animate-pulse rounded-full bg-[hsl(var(--surface-soft))]" />
                      <div className="h-3 w-32 animate-pulse rounded-full bg-[hsl(var(--surface-soft))]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex min-h-full items-center justify-center rounded-[24px] border border-dashed border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] px-4 py-6 text-center text-sm leading-6 text-app-muted">
              {t("dm.sidebar.empty")}
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => {
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
                const preview = conversation.lastMessage
                  ? getConversationPreview(
                      conversation,
                      40,
                      t("chat.attachments.image"),
                      t("chat.attachments.file"),
                      t("chat.attachments.gif"),
                    )
                  : t("dm.sidebar.emptyConversation");
                const isActive = activeConversationId === conversation.id;

                return (
                  <div className="group relative" key={conversation.id}>
                    <button
                      aria-current={isActive ? "page" : undefined}
                      className={`flex min-h-16 w-full items-center gap-3 rounded-[20px] border px-3 py-3 pr-11 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:rounded-[22px] ${
                        isActive
                          ? "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.12)]"
                          : "border-transparent hover:border-[hsl(var(--border)/0.72)] hover:bg-[hsl(var(--surface-soft)/0.28)]"
                      }`}
                      onClick={() => {
                        if (unreadCount > 0) {
                          void markAsRead(conversation.id);
                        }
                        onNavigate(`/channels/@me/${conversation.id}`);
                      }}
                      onMouseEnter={() => onPrefetch?.(`/channels/@me/${conversation.id}`)}
                      type="button"
                    >
                      <div className="relative">
                        <Avatar
                          alt={displayName}
                          className="h-10 w-10 text-sm"
                          fallback={displayName}
                          src={otherParticipant?.avatarUrl}
                        />
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--surface-card))] ${getStatusDotClass(otherParticipant?.status ?? "OFFLINE")}`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-app-foreground truncate text-sm font-semibold">
                            {displayName}
                          </p>
                          {unreadCount > 0 ? <Badge>{unreadCount}</Badge> : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-app-muted">{preview}</p>
                      </div>
                    </button>

                    <button
                      aria-label={t("dm.sidebar.hideConversation", {
                        name: displayName,
                      })}
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.92)] text-app-muted opacity-100 shadow-[0_10px_22px_hsl(var(--shadow-color)/0.12)] transition hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                      disabled={isHidingConversation}
                      onClick={async (event) => {
                        event.stopPropagation();
                        await hideConversation(conversation.id);
                      }}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
