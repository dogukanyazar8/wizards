"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import type { DMConversationDTO } from "@wizards/types";
import {
  applyDMConversationPresenceUpdate,
  applyDMConversationUpdate,
  dmQueryKeys,
  fetchDMConversations,
  hideDMConversationRequest,
  markDMConversationAsReadInCache,
  markDMConversationReadRequest,
  removeDMConversationFromCache,
} from "@/lib/dm/client";
import { useSocket } from "./use-socket";

const EMPTY_CONVERSATIONS: DMConversationDTO[] = [];

export function useDMConversations(currentUserId: string) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const params = useParams<{ channelId?: string; serverId?: string }>();
  const activeConversationId =
    params.serverId === "@me" && typeof params.channelId === "string"
      ? params.channelId
      : null;

  const query = useQuery({
    queryFn: fetchDMConversations,
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
      queryClient.setQueryData<DMConversationDTO[] | undefined>(dmQueryKeys.list, (current) =>
        applyDMConversationUpdate(
          current,
          event.conversation,
          currentUserId,
          activeConversationId,
        ),
      );
    };

    const handlePresenceUpdate = (event: {
      customStatus: string | null;
      status: "ONLINE" | "IDLE" | "DND" | "OFFLINE";
      userId: string;
    }) => {
      queryClient.setQueryData<DMConversationDTO[] | undefined>(dmQueryKeys.list, (current) =>
        applyDMConversationPresenceUpdate(current, event),
      );
    };

    socket.on("dm:conversation:updated", handleConversationUpdated);
    socket.on("presence:update", handlePresenceUpdate);

    return () => {
      socket.off("dm:conversation:updated", handleConversationUpdated);
      socket.off("presence:update", handlePresenceUpdate);
    };
  }, [activeConversationId, currentUserId, queryClient, socket]);

  const hideMutation = useMutation({
    mutationFn: (conversationId: string) => hideDMConversationRequest(conversationId),
    onSuccess: (_result, conversationId) => {
      queryClient.setQueryData<DMConversationDTO[] | undefined>(dmQueryKeys.list, (current) =>
        removeDMConversationFromCache(current, conversationId),
      );
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: (conversationId: string) => markDMConversationReadRequest(conversationId),
    onSuccess: (_result, conversationId) => {
      queryClient.setQueryData<DMConversationDTO[] | undefined>(dmQueryKeys.list, (current) =>
        markDMConversationAsReadInCache(current, conversationId, currentUserId),
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
      await markAsReadMutation.mutateAsync(conversationId);
    },
    [markAsReadMutation],
  );

  return {
    ...query,
    conversations: query.data ?? EMPTY_CONVERSATIONS,
    hideConversation,
    isHidingConversation: hideMutation.isPending,
    isMarkingAsRead: markAsReadMutation.isPending,
    markAsRead,
  };
}
