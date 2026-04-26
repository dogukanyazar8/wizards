"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const { data, error, fetchNextPage, hasNextPage, isLoading } =
    useMessages(channelId);
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
    const allMessages = data.pages.flatMap((page) => page.messages) ?? [];
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

  const allMessages = data?.pages
    ? [...data.pages].reverse().flatMap((page) => page.messages)
    : [];

  const groupedMessages = allMessages.map((message, index) => {
    const previousMessage = allMessages[index - 1];
    const isGrouped =
      index > 0 &&
      previousMessage !== undefined &&
      message.type === "DEFAULT" &&
      previousMessage.type === "DEFAULT" &&
      previousMessage.author.id === message.author.id &&
      new Date(message.createdAt).getTime() -
        new Date(previousMessage.createdAt).getTime() <
        7 * 60 * 1000;

    return { isGrouped, message };
  });

  return (
    <div
      className="bg-app-background flex-1 space-y-0 overflow-y-auto"
      onScroll={handleScroll}
      ref={listRef}
    >
      <div className="h-1" ref={observerRef} />

      {isLoading && allMessages.length === 0 ? (
        <div className="text-app-muted flex h-full items-center justify-center">
          <div className="animate-pulse">Loading messages...</div>
        </div>
      ) : null}

      {error && !isLoading ? (
        <div className="text-app-muted flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-sm">Unable to load messages.</p>
            <p className="text-xs">Please refresh the channel and try again.</p>
          </div>
        </div>
      ) : null}

      {!error && allMessages.length === 0 && !isLoading ? (
        <div className="text-app-muted flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-sm">No messages yet.</p>
            <p className="text-xs">Be the first to send a message!</p>
          </div>
        </div>
      ) : null}

      {groupedMessages.map(({ message, isGrouped }) => (
        <MessageItem
          canModerate={canModerate}
          currentUserId={currentUserId}
          isGrouped={isGrouped}
          key={message.id}
          message={message}
          onDelete={() => {}}
          onEdit={() => {}}
          onReact={(messageId) => {
            // Simple emoji reaction. A full picker can slot in here later.
            socket.emit("message:react", {
              emoji: "\u{1F44D}",
              messageId,
            });
          }}
          onReply={() => {}}
        />
      ))}

      {showScrollButton ? (
        <button
          aria-label="Scroll to latest messages"
          className="fixed bottom-24 right-8 rounded-full bg-[hsl(var(--primary))] p-2 text-[hsl(var(--primary-foreground))] shadow-[0_16px_36px_hsl(var(--shadow-color)/0.18)] transition hover:bg-[hsl(var(--primary)/0.9)]"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}
