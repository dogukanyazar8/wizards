"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";
import { useSocket } from "@/hooks/use-socket";
import { useTyping } from "@/hooks/use-typing";
import { appendMessage, type MessagePages } from "@/hooks/use-messages";

interface ChatAreaProps {
  channelId: string;
  currentUserId: string;
  currentUserDisplayName: string;
  canModerate: boolean;
}

export function ChatArea({ channelId, currentUserId, currentUserDisplayName, canModerate }: ChatAreaProps) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const { typingUsers } = useTyping(channelId);
  const [replyTo, setReplyTo] = useState<{
    id: string;
    authorName: string;
    content: string;
  } | null>(null);

  const handleReply = useCallback((id: string, authorName: string, content: string) => {
    setReplyTo({ id, authorName, content });
  }, []);

  const handleSend = useCallback(
    (content: string, replyToId?: string) => {
      // Optimistic insert — appears instantly, replaced when server echoes back
      const tempId = `optimistic-${Date.now()}`;
      queryClient.setQueryData<MessagePages>(["messages", channelId], (old) =>
        appendMessage(old, {
          id: tempId,
          channelId,
          content,
          author: {
            id: currentUserId,
            displayName: currentUserDisplayName,
            username: currentUserDisplayName,
            avatarUrl: null,
          },
          createdAt: new Date().toISOString(),
          type: "DEFAULT",
          reactions: [],
          attachments: [],
          editedAt: null,
          deletedAt: null,
        }),
      );

      socket.emit("message:send", {
        channelId,
        content,
        ...(replyToId ? { replyToId } : {}),
      });
      setReplyTo(null);
    },
    [channelId, currentUserId, currentUserDisplayName, queryClient, socket],
  );

  return (
    <div className="flex flex-col h-full bg-app-background">
      <MessageList
        channelId={channelId}
        currentUserId={currentUserId}
        canModerate={canModerate}
        onReply={handleReply}
      />
      <TypingIndicator typingUsers={typingUsers} />
      <MessageInput
        channelId={channelId}
        replyTo={replyTo}
        onSend={handleSend}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
