"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkspaceServerDetail, WorkspaceServerSummary } from "@wizards/types";
import { ChatArea } from "@/components/chat/chat-area";
import { getMessagesQueryKey } from "@/hooks/use-messages";
import {
  applyServerUnreadCount,
  markChannelReadRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

interface ChannelConversationPageProps {
  allowFileUploads: boolean;
  allowGifs: boolean;
  canModerate: boolean;
  channelId: string;
  channelLocked: boolean;
  channelName: string;
  channelTopic: string | null;
  currentUserDisplayName: string;
  currentUserId: string;
  currentUserUsername: string;
  messageCharacterLimit: number;
  serverId: string;
  uploadthingEnabled: boolean;
}

export function ChannelConversationPage({
  allowFileUploads,
  allowGifs,
  canModerate,
  channelId,
  channelLocked,
  channelName,
  channelTopic,
  currentUserDisplayName,
  currentUserId,
  currentUserUsername,
  messageCharacterLimit,
  serverId,
  uploadthingEnabled,
}: ChannelConversationPageProps) {
  const queryClient = useQueryClient();
  const markedChannelRef = useRef<string | null>(null);
  const [initialUnreadMessageId, setInitialUnreadMessageId] = useState<string | null>(null);

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
          (current) =>
            applyServerUnreadCount(
              current,
              response.serverId,
              response.unreadCount,
              response.mentionCount,
            ),
        );

        queryClient.setQueryData<WorkspaceServerDetail | undefined>(
          workspaceQueryKeys.server(serverId),
          (current) =>
            current
              ? {
                  ...current,
                  server: {
                    ...current.server,
                    mentionCount: response.mentionCount,
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
        if (response.firstUnreadMessageId) {
          void queryClient.invalidateQueries({
            exact: true,
            queryKey: getMessagesQueryKey("channel", channelId),
          });
        }
        setInitialUnreadMessageId(response.firstUnreadMessageId);
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
      channelLocked={channelLocked}
      channelName={channelName}
      channelTopic={channelTopic}
      currentUserId={currentUserId}
      currentUserDisplayName={currentUserDisplayName}
      currentUserUsername={currentUserUsername}
      canModerate={canModerate}
      serverId={serverId}
      allowFileUploads={allowFileUploads}
      allowGifs={allowGifs}
      initialUnreadMessageId={initialUnreadMessageId}
      messageCharacterLimit={canModerate ? null : messageCharacterLimit}
      uploadthingEnabled={uploadthingEnabled}
    />
  );
}
