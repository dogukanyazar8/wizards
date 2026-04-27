"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkspaceServerDetail, WorkspaceServerSummary } from "@wizards/types";
import { ChatArea } from "@/components/chat/chat-area";
import {
  applyServerUnreadCount,
  markChannelReadRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

interface ChannelConversationPageProps {
  canModerate: boolean;
  channelId: string;
  currentUserDisplayName: string;
  currentUserId: string;
  currentUserUsername: string;
  serverId: string;
}

export function ChannelConversationPage({
  canModerate,
  channelId,
  currentUserDisplayName,
  currentUserId,
  currentUserUsername,
  serverId,
}: ChannelConversationPageProps) {
  const queryClient = useQueryClient();
  const markedChannelRef = useRef<string | null>(null);

  useEffect(() => {
    if (markedChannelRef.current === channelId) {
      return;
    }

    markedChannelRef.current = channelId;
    let cancelled = false;

    void markChannelReadRequest(channelId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        queryClient.setQueryData<WorkspaceServerSummary[] | undefined>(
          workspaceQueryKeys.servers,
          (current) => applyServerUnreadCount(current, response.serverId, response.unreadCount),
        );

        queryClient.setQueryData<WorkspaceServerDetail | undefined>(
          workspaceQueryKeys.server(serverId),
          (current) =>
            current
              ? {
                  ...current,
                  server: {
                    ...current.server,
                    unreadCount: response.unreadCount,
                  },
                }
              : current,
        );

        void queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.servers,
        });
        void queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.server(serverId),
        });
      })
      .catch(() => {
        // Ignore transient read-sync failures; a socket refresh can reconcile later.
      });

    return () => {
      cancelled = true;
    };
  }, [channelId, queryClient, serverId]);

  return (
    <ChatArea
      conversationId={channelId}
      mode="channel"
      currentUserId={currentUserId}
      currentUserDisplayName={currentUserDisplayName}
      currentUserUsername={currentUserUsername}
      canModerate={canModerate}
    />
  );
}
