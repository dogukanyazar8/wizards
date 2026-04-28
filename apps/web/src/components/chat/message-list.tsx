"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MessageItem } from "./message-item";
import { useI18n } from "@/components/providers/locale-provider";
import { useMessages, type MessageMode } from "@/hooks/use-messages";
import { useSocket } from "@/hooks/use-socket";

interface MessageListProps {
  conversationId: string;
  mode: MessageMode;
  currentUserId: string;
  canModerate: boolean;
  onReply: (id: string, author: string, content: string) => void;
}

export function MessageList({
  conversationId,
  mode,
  currentUserId,
  canModerate,
  onReply,
}: MessageListProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const { data, error, fetchNextPage, hasNextPage, isLoading } = useMessages(
    mode,
    conversationId,
  );
  const [showScrollButton, setShowScrollButton] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && (hasNextPage ?? false) && !isLoading) {
        fetchNextPage();
      }
    });

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isLoading]);

  useEffect(() => {
    if (!data?.pages) {
      return;
    }

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

  const handleScroll = useCallback(() => {
    if (!listRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
    setShowScrollButton(false);
  }, []);

  const allMessages = useMemo(
    () => (data?.pages ? [...data.pages].reverse().flatMap((page) => page.messages) : []),
    [data?.pages],
  );

  const groupedMessages = useMemo(
    () =>
      allMessages.map((message, index) => {
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
        const showGroupSeparator =
          index > 0 &&
          !isGrouped &&
          message.type === "DEFAULT" &&
          previousMessage?.type === "DEFAULT";

        return { isGrouped, message, showGroupSeparator };
      }),
    [allMessages],
  );

  const handleReact = useCallback(
    (messageId: string) => {
      if (mode !== "channel") {
        return;
      }

      socket.emit("message:react", { messageId, emoji: "+1" });
    },
    [mode, socket],
  );

  const handleReply = useCallback(
    (id: string, author: string, content: string) => {
      onReply(id, author, content);
    },
    [onReply],
  );

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="relative flex-1 space-y-0 overflow-y-auto bg-transparent px-2 py-3 sm:px-3 md:px-4"
    >
      <div ref={observerRef} className="h-1" />

      {isLoading && allMessages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-app-muted">
          <div className="animate-pulse">{t("chat.list.loading")}</div>
        </div>
      ) : null}

      {error && !isLoading ? (
        <div className="flex h-full items-center justify-center text-app-muted">
          <div className="text-center">
            <p className="text-sm">{t("chat.list.errorTitle")}</p>
            <p className="text-xs">{t("chat.list.errorDescription")}</p>
          </div>
        </div>
      ) : null}

      {!error && allMessages.length === 0 && !isLoading ? (
        <div className="flex h-full items-center justify-center text-app-muted">
          <div className="text-center">
            <p className="text-sm">{t("chat.list.emptyTitle")}</p>
            <p className="text-xs">{t("chat.list.emptyDescription")}</p>
          </div>
        </div>
      ) : null}

      {groupedMessages.map(({ message, isGrouped, showGroupSeparator }) => (
        <MessageItem
          key={message.id}
          mode={mode}
          message={message}
          isGrouped={isGrouped}
          showGroupSeparator={showGroupSeparator}
          currentUserId={currentUserId}
          canModerate={canModerate}
          onReact={handleReact}
          onReply={handleReply}
        />
      ))}

      {showScrollButton ? (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-4 ml-auto flex rounded-full bg-[hsl(var(--primary))] p-2 text-[hsl(var(--primary-foreground))] shadow-lg transition hover:bg-[hsl(var(--primary)/0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          aria-label={t("chat.list.scrollToLatest")}
          type="button"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}
