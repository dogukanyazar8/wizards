"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledInitialRef = useRef(false);
  const initialScrollCompleteRef = useRef(false);
  const lastNewestMessageIdRef = useRef<string | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollTimeoutRefs = useRef<number[]>([]);

  const forceScrollToBottom = useCallback(() => {
    if (!listRef.current) {
      return;
    }

    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    listRef.current.scrollTop = listRef.current.scrollHeight;
    setShowScrollButton(false);
  }, []);

  const scheduleScrollToBottom = useCallback((options: { completeInitial?: boolean } = {}) => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    for (const timeoutId of scrollTimeoutRefs.current) {
      window.clearTimeout(timeoutId);
    }
    scrollTimeoutRefs.current = [];

    const run = (remainingFrames: number) => {
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        forceScrollToBottom();

        if (remainingFrames > 0) {
          run(remainingFrames - 1);
          return;
        }

        scrollFrameRef.current = null;
      });
    };

    run(4);

    for (const delay of [50, 150, 350, 700]) {
      const timeoutId = window.setTimeout(() => {
        forceScrollToBottom();

        if (options.completeInitial && delay === 700) {
          initialScrollCompleteRef.current = true;
        }
      }, delay);
      scrollTimeoutRefs.current.push(timeoutId);
    }
  }, [forceScrollToBottom]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      for (const timeoutId of scrollTimeoutRefs.current) {
        window.clearTimeout(timeoutId);
      }
      scrollTimeoutRefs.current = [];
    },
    [],
  );

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (!initialScrollCompleteRef.current) {
        return;
      }

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
    hasScrolledInitialRef.current = false;
    initialScrollCompleteRef.current = false;
    lastNewestMessageIdRef.current = null;
    setShowScrollButton(false);
  }, [conversationId, mode]);

  useLayoutEffect(() => {
    if (!data?.pages) {
      return;
    }

    const allMessages = [...data.pages].reverse().flatMap((page) => page.messages) ?? [];
    const newestMessageId = allMessages.at(-1)?.id ?? null;

    if (allMessages.length === 0) {
      lastNewestMessageIdRef.current = null;
      hasScrolledInitialRef.current = false;
      initialScrollCompleteRef.current = true;
      setShowScrollButton(false);
      return;
    }

    const isInitialLoad = !hasScrolledInitialRef.current;
    const hasNewLatestMessage =
      newestMessageId !== null && newestMessageId !== lastNewestMessageIdRef.current;

    lastNewestMessageIdRef.current = newestMessageId;

    if (isInitialLoad || hasNewLatestMessage) {
      hasScrolledInitialRef.current = true;
      scheduleScrollToBottom({
        completeInitial: isInitialLoad || !initialScrollCompleteRef.current,
      });
    }
  }, [data?.pages, scheduleScrollToBottom]);

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

    forceScrollToBottom();
  }, [forceScrollToBottom]);

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
    (messageId: string, emoji: string) => {
      if (mode === "channel") {
        socket.emit("message:react", { messageId, emoji });
        return;
      }

      socket.emit("dm:message:react", { messageId, emoji });
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
      className="relative flex-1 space-y-0 overflow-y-auto overscroll-contain bg-transparent px-1 py-3 sm:px-3 md:px-4"
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

      <div ref={bottomRef} className="h-1" />

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
