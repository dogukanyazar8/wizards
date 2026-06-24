"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ChatMessage } from "@wizards/types";
import { MessageItem } from "./message-item";
import { useI18n } from "@/components/providers/locale-provider";
import { useMessages, type MessageMode } from "@/hooks/use-messages";
import { useSocket } from "@/hooks/use-socket";

const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

interface MessageListProps {
  conversationId: string;
  mode: MessageMode;
  currentUserId: string;
  canModerate: boolean;
  initialUnreadMessageId?: string | null;
  onRemoveOptimistic: (id: string) => void;
  onReply: (id: string, author: string, content: string) => void;
  onRetry: (id: string) => void;
  onThread: (message: ChatMessage) => void;
}

export function MessageList({
  conversationId,
  mode,
  currentUserId,
  canModerate,
  initialUnreadMessageId = null,
  onRemoveOptimistic,
  onReply,
  onRetry,
  onThread,
}: MessageListProps) {
  const { locale, t } = useI18n();
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
  const lastNewestMessageActivityRef = useRef<string | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollTimeoutRefs = useRef<number[]>([]);
  const lastHighlightedMessageIdRef = useRef<string | null>(null);
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [unreadJumpDismissed, setUnreadJumpDismissed] = useState(false);
  const [deletedNoticeNow, setDeletedNoticeNow] = useState(() => Date.now());

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
    const readTargetMessage = () => {
      setTargetMessageId(new URLSearchParams(window.location.search).get("message"));
    };

    readTargetMessage();
    window.addEventListener("popstate", readTargetMessage);

    return () => {
      window.removeEventListener("popstate", readTargetMessage);
    };
  }, []);

  useEffect(() => {
    hasScrolledInitialRef.current = false;
    initialScrollCompleteRef.current = false;
    lastNewestMessageIdRef.current = null;
    lastNewestMessageActivityRef.current = null;
    lastHighlightedMessageIdRef.current = null;
    setShowScrollButton(false);
    setUnreadJumpDismissed(false);
  }, [conversationId, mode]);

  const scrollToMessage = useCallback((messageId: string) => {
    window.requestAnimationFrame(() => {
      const target = document.querySelector(`[data-message-id="${messageId}"]`);

      if (!(target instanceof HTMLElement)) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.dataset.jumpHighlight = "true";
      lastHighlightedMessageIdRef.current = messageId;
      window.setTimeout(() => {
        delete target.dataset.jumpHighlight;
      }, 1600);
    });
  }, []);

  useLayoutEffect(() => {
    if (!data?.pages) {
      return;
    }

    const allMessages = [...data.pages].reverse().flatMap((page) => page.messages) ?? [];
    const newestMessage = allMessages.at(-1) ?? null;
    const newestMessageId = newestMessage?.id ?? null;
    const newestMessageActivity = newestMessage
      ? [
          newestMessage.id,
          newestMessage.content,
          newestMessage.editedAt ?? "",
          newestMessage.deletedAt ?? "",
          newestMessage.reactions
            .map((reaction) => `${reaction.emoji}:${reaction.count}:${reaction.userIds.join(",")}`)
            .join("|"),
          newestMessage.threadSummary?.replyCount ?? 0,
          newestMessage.threadSummary?.lastReplyAt ?? "",
          newestMessage.attachments.length,
          newestMessage.deliveryStatus ?? "",
        ].join("::")
      : null;

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
    const hasLatestInteraction =
      newestMessageActivity !== null &&
      newestMessageActivity !== lastNewestMessageActivityRef.current;
    const hasTargetMessage =
      Boolean(targetMessageId) &&
      allMessages.some((message) => message.id === targetMessageId);

    lastNewestMessageIdRef.current = newestMessageId;
    lastNewestMessageActivityRef.current = newestMessageActivity;

    if (
      targetMessageId &&
      hasTargetMessage &&
      lastHighlightedMessageIdRef.current !== targetMessageId
    ) {
      hasScrolledInitialRef.current = true;
      initialScrollCompleteRef.current = true;
      scrollToMessage(targetMessageId);
      return;
    }

    if (isInitialLoad || hasNewLatestMessage || hasLatestInteraction) {
      hasScrolledInitialRef.current = true;
      scheduleScrollToBottom({
        completeInitial: isInitialLoad || !initialScrollCompleteRef.current,
      });
    }
  }, [data?.pages, scheduleScrollToBottom, scrollToMessage, targetMessageId]);

  useEffect(() => {
    if (!targetMessageId || !data?.pages || !(hasNextPage ?? false) || isLoading) {
      return;
    }

    const allMessages = [...data.pages].reverse().flatMap((page) => page.messages);
    if (allMessages.some((message) => message.id === targetMessageId)) {
      return;
    }

    void fetchNextPage();
  }, [data?.pages, fetchNextPage, hasNextPage, isLoading, targetMessageId]);

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
    () =>
      (data?.pages ? [...data.pages].reverse().flatMap((page) => page.messages) : []).filter(
        (message) => {
          if (!message.deletedAt || !message.placeholderExpiresAt) {
            return true;
          }

          return Date.parse(message.placeholderExpiresAt) > deletedNoticeNow;
        },
      ),
    [data?.pages, deletedNoticeNow],
  );

  useEffect(() => {
    const nextExpiry = allMessages
      .filter((message) => message.deletedAt && message.placeholderExpiresAt)
      .map((message) => Date.parse(message.placeholderExpiresAt!))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > deletedNoticeNow)
      .sort((left, right) => left - right)[0];

    if (!nextExpiry) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setDeletedNoticeNow(Date.now()),
      Math.max(1000, nextExpiry - Date.now() + 100),
    );

    return () => window.clearTimeout(timeoutId);
  }, [allMessages, deletedNoticeNow]);

  const groupedMessages = useMemo(
    () =>
      allMessages.map((message, index) => {
        const previousMessage = allMessages[index - 1];
        const messageDate = new Date(message.createdAt);
        const previousDate = previousMessage ? new Date(previousMessage.createdAt) : null;
        const showDateSeparator =
          index === 0 ||
          !previousDate ||
          messageDate.toDateString() !== previousDate.toDateString();
        const isGrouped =
          index > 0 &&
          previousMessage !== undefined &&
          message.type === "DEFAULT" &&
          previousMessage.type === "DEFAULT" &&
          previousMessage.author.id === message.author.id &&
          Math.abs(
            new Date(message.createdAt).getTime() -
              new Date(previousMessage.createdAt).getTime(),
          ) < MESSAGE_GROUP_WINDOW_MS;
        return { isGrouped, message, showDateSeparator };
      }),
    [allMessages],
  );

  const formatDateSeparator = useCallback(
    (isoDate: string) => {
      const date = new Date(isoDate);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return t("chat.date.today");
      }

      if (date.toDateString() === yesterday.toDateString()) {
        return t("chat.date.yesterday");
      }

      return date.toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
      });
    },
    [locale, t],
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
      className="relative min-w-0 flex-1 space-y-0 overflow-y-auto overflow-x-hidden overscroll-contain scroll-pb-[max(7.5rem,calc(env(safe-area-inset-bottom)+6.75rem))] bg-transparent px-2.5 py-1 sm:px-4 md:px-5 md:py-2"
      aria-label={t("chat.list.ariaLabel")}
      aria-live="polite"
      aria-relevant="additions text"
      data-testid="message-list"
      role="log"
    >
      <div ref={observerRef} className="h-1" />

      {initialUnreadMessageId && !unreadJumpDismissed ? (
        <div className="sticky top-3 z-20 mb-3 flex justify-center">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.12)] px-4 py-2 text-xs font-bold text-[hsl(var(--primary))] shadow-[0_14px_34px_hsl(var(--primary)/0.12)] backdrop-blur-xl transition hover:bg-[hsl(var(--primary)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="jump-to-unread-button"
            onClick={() => {
              setUnreadJumpDismissed(true);
              scrollToMessage(initialUnreadMessageId);
            }}
            type="button"
          >
            {t("chat.unread.jump")}
          </button>
        </div>
      ) : null}

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
        <div className="flex h-full items-center justify-center px-4 text-app-muted">
          <div className="max-w-[18rem] rounded-[22px] bg-[hsl(var(--surface-card)/0.74)] px-5 py-4 text-center shadow-[0_14px_32px_hsl(var(--shadow-color)/0.045)] backdrop-blur-xl">
            <p className="text-sm font-bold text-app-foreground">{t("chat.list.emptyTitle")}</p>
            <p className="mt-1 text-xs leading-5 text-app-muted">
              {t("chat.list.emptyDescription")}
            </p>
          </div>
        </div>
      ) : null}

      {groupedMessages.map(({ message, isGrouped, showDateSeparator }) => (
        <div key={message.id}>
          {showDateSeparator ? (
            <div
              className="sticky top-2 z-10 my-2 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-app-soft"
              data-testid="message-date-separator"
              role="separator"
            >
              <span className="h-px flex-1 bg-[hsl(var(--border)/0.62)]" />
              <span className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.9)] px-2.5 py-0.5 shadow-[0_10px_24px_hsl(var(--shadow-color)/0.08)] backdrop-blur-xl">
                {formatDateSeparator(message.createdAt)}
              </span>
              <span className="h-px flex-1 bg-[hsl(var(--border)/0.62)]" />
            </div>
          ) : null}
          <MessageItem
            mode={mode}
            message={message}
            isGrouped={isGrouped}
            currentUserId={currentUserId}
            canModerate={canModerate}
            onReact={handleReact}
            onRemoveOptimistic={onRemoveOptimistic}
            onReply={handleReply}
            onRetry={onRetry}
            onThread={onThread}
          />
        </div>
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
