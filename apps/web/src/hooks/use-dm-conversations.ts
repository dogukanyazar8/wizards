"use client";

import { useCallback, useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import type { DMConversationDTO } from "@wizards/types";
import {
  applyDMConversationPresenceUpdateToPageData,
  applyDMConversationUpdateToPageData,
  type DMConversationsInfiniteData,
  dmQueryKeys,
  fetchDMConversationsPage,
  flattenDMConversationPages,
  hideDMConversationRequest,
  markDMConversationAsReadInPageData,
  markDMConversationReadRequest,
  removeDMConversationFromPageData,
} from "@/lib/dm/client";
import {
  appendMessage,
  getMessagesQueryKey,
  mapDMMessageToChatMessage,
  type MessagePages,
} from "@/hooks/use-messages";
import type { DMConversationsPageResponse } from "@/lib/dm/types";
import { useSocket } from "./use-socket";

const EMPTY_CONVERSATIONS: DMConversationDTO[] = [];

interface UseDMConversationsOptions {
  autoMarkActiveAsRead?: boolean;
}

export function useDMConversations(
  currentUserId: string,
  options: UseDMConversationsOptions = {},
) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const activeReadRequestsRef = useRef<Set<string>>(new Set());
  const autoMarkActiveAsRead = options.autoMarkActiveAsRead ?? false;
  const params = useParams<{ channelId?: string; serverId?: string }>();
  const activeConversationId =
    params.serverId === "@me" && typeof params.channelId === "string"
      ? params.channelId
      : null;

  const query = useInfiniteQuery<
    DMConversationsPageResponse,
    Error,
    DMConversationsInfiniteData,
    typeof dmQueryKeys.list,
    string | undefined
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchDMConversationsPage(pageParam),
    queryKey: dmQueryKeys.list,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handleConversationUpdated = (event: {
      conversation: DMConversationDTO;
      conversationId: string;
      hiddenAt: null;
      lastMessageAt: string;
      preview: string;
      unreadCount: number;
    }) => {
      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(dmQueryKeys.list, (current) =>
        applyDMConversationUpdateToPageData(
          current,
          event.conversation,
          currentUserId,
          activeConversationId,
        ),
      );

      if (event.conversationId !== activeConversationId) {
        return;
      }

      const lastMessage = event.conversation.lastMessage;
      if (lastMessage) {
        queryClient.setQueryData<MessagePages>(
          getMessagesQueryKey("dm", event.conversationId),
          (current) => appendMessage(current, mapDMMessageToChatMessage(lastMessage)),
        );
      }

      if (
        autoMarkActiveAsRead &&
        event.unreadCount > 0 &&
        !activeReadRequestsRef.current.has(event.conversationId)
      ) {
        activeReadRequestsRef.current.add(event.conversationId);
        void markDMConversationReadRequest(event.conversationId)
          .then(() => {
            queryClient.setQueryData<DMConversationsInfiniteData | undefined>(
              dmQueryKeys.list,
              (current) =>
                markDMConversationAsReadInPageData(
                  current,
                  event.conversationId,
                  currentUserId,
                ),
            );
          })
          .finally(() => {
            activeReadRequestsRef.current.delete(event.conversationId);
          });
      }
    };

    const handlePresenceUpdate = (event: {
      customStatus: string | null;
      status: "ONLINE" | "IDLE" | "DND" | "OFFLINE";
      userId: string;
    }) => {
      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(dmQueryKeys.list, (current) =>
        applyDMConversationPresenceUpdateToPageData(current, event),
      );
    };

    socket.on("dm:conversation:updated", handleConversationUpdated);
    socket.on("presence:update", handlePresenceUpdate);

    return () => {
      socket.off("dm:conversation:updated", handleConversationUpdated);
      socket.off("presence:update", handlePresenceUpdate);
    };
  }, [activeConversationId, autoMarkActiveAsRead, currentUserId, queryClient, socket]);

  const hideMutation = useMutation({
    mutationFn: (conversationId: string) => hideDMConversationRequest(conversationId),
    onSuccess: (_result, conversationId) => {
      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(dmQueryKeys.list, (current) =>
        removeDMConversationFromPageData(current, conversationId),
      );
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: (conversationId: string) => markDMConversationReadRequest(conversationId),
    onSuccess: (_result, conversationId) => {
      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(dmQueryKeys.list, (current) =>
        markDMConversationAsReadInPageData(current, conversationId, currentUserId),
      );
    },
  });

  const hideConversation = useCallback(
    async (conversationId: string) => {
      await hideMutation.mutateAsync(conversationId);
    },
    [hideMutation],
  );

  const markAsRead = useCallback(
    async (conversationId: string) => {
      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(dmQueryKeys.list, (current) =>
        markDMConversationAsReadInPageData(current, conversationId, currentUserId),
      );
      await markAsReadMutation.mutateAsync(conversationId);
    },
    [currentUserId, markAsReadMutation, queryClient],
  );

  return {
    ...query,
    conversations: query.data ? flattenDMConversationPages(query.data) : EMPTY_CONVERSATIONS,
    hideConversation,
    isHidingConversation: hideMutation.isPending,
    isMarkingAsRead: markAsReadMutation.isPending,
    markAsRead,
  };
}
