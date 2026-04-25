"use client";

import { useState } from "react";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";
import { useSocket } from "@/hooks/use-socket";
import { useTyping } from "@/hooks/use-typing";

interface ChatAreaProps {
  channelId: string;
  currentUserId: string;
  canModerate: boolean;
}

export function ChatArea({ channelId, currentUserId, canModerate }: ChatAreaProps) {
  const socket = useSocket();
  const { typingUsers } = useTyping(channelId);
  const [replyTo, setReplyTo] = useState<{
    id: string;
    authorName: string;
    content: string;
  } | null>(null);

  const handleSend = (content: string, replyToId?: string) => {
    if (replyToId) {
      socket.emit("message:send", {
        channelId,
        content,
        replyToId,
      });
    } else {
      socket.emit("message:send", {
        channelId,
        content,
      });
    }
    setReplyTo(null);
  };

  return (
    <div className="flex flex-col h-full bg-app-background">
      <MessageList
        channelId={channelId}
        currentUserId={currentUserId}
        canModerate={canModerate}
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
