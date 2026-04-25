"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MessageItem } from "./message-item";
import { useMessages } from "@/hooks/use-messages";
import { useSocket } from "@/hooks/use-socket";

interface MessageListProps {
  channelId: string;
  currentUserId: string;
  canModerate: boolean;
}

export function MessageList({
  channelId,
  currentUserId,
  canModerate,
}: MessageListProps) {
  const socket = useSocket();
  const { data, error, fetchNextPage, hasNextPage, isLoading } = useMessages(channelId);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);

  // Intersection observer for load-more
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && (hasNextPage ?? false) && !isLoading) {
        fetchNextPage();
      }
    });

    if (observerRef.current) observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isLoading, fetchNextPage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!data?.pages) return;
    const allMessages = data.pages.flatMap((p) => p.messages) ?? [];
    if (allMessages.length > lastMessageCountRef.current) {
      lastMessageCountRef.current = allMessages.length;
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
          setShowScrollButton(false);
        }
      }, 0);
    }
  }, [data?.pages]);

  // Handle scroll to show/hide button
  const handleScroll = () => {
    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    }
  };

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setShowScrollButton(false);
    }
  };

  const allMessages = data?.pages ? [...data.pages].reverse().flatMap((p) => p.messages) : [];

  const groupedMessages = allMessages.map((msg, i) => {
    const prev = allMessages[i - 1];
    const isGrouped: boolean =
      i > 0 &&
      prev !== undefined &&
      msg.type === "DEFAULT" &&
      prev.type === "DEFAULT" &&
      prev.author.id === msg.author.id &&
      new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 7 * 60 * 1000;
    return { message: msg, isGrouped };
  });

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-app-background space-y-0"
    >
      <div ref={observerRef} className="h-1" />

      {isLoading && allMessages.length === 0 && (
        <div className="flex items-center justify-center h-full text-app-muted">
          <div className="animate-pulse">Loading messages...</div>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center justify-center h-full text-app-muted">
          <div className="text-center">
            <p className="text-sm">Unable to load messages.</p>
            <p className="text-xs">Please refresh the channel and try again.</p>
          </div>
        </div>
      )}

      {!error && allMessages.length === 0 && !isLoading && (
        <div className="flex items-center justify-center h-full text-app-muted">
          <div className="text-center">
            <p className="text-sm">No messages yet.</p>
            <p className="text-xs">Be the first to send a message!</p>
          </div>
        </div>
      )}

      {groupedMessages.map(({ message, isGrouped }) => (
        <MessageItem
          key={message.id}
          message={message}
          isGrouped={isGrouped}
          currentUserId={currentUserId}
          canModerate={canModerate}
          onReact={(messageId) => {
            // Simple emoji reaction - in full implementation would show emoji picker
            socket.emit("message:react", {
              messageId,
              emoji: "👍",
            });
          }}
          onReply={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      ))}

      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-8 bg-[hsl(var(--primary))] text-white rounded-full p-2 shadow-lg hover:bg-[hsl(var(--primary)/0.9)] transition"
          aria-label="Scroll to latest messages"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
