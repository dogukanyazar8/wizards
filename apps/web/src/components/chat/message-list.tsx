"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import type { ChatMessage, DMParticipantRole } from "@wizards/types";
import { MessageItem } from "./message-item";
import {
  DmSystemMessage,
  type DmSystemMessageParticipant,
} from "@/components/dm/dm-system-message";
import { useI18n } from "@/components/providers/locale-provider";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useMessages, type MessageMode } from "@/hooks/use-messages";
import { useSocket } from "@/hooks/use-socket";
import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { MessageListSkeleton } from "@/components/messages/message-list-skeleton";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

const messageListMetrics = MESSAGES_METRICS.messageList;

const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;
const MESSAGE_ESTIMATED_ROW_HEIGHT_PX = 84;
const MESSAGE_VIRTUAL_OVERSCAN = 8;
const MESSAGE_SCROLL_SETTLE_DELAY_MS = 150;

export const MESSAGE_VIRTUALIZER_OPTIONS = {
  anchorTo: "end",
  followOnAppend: "auto",
  scrollEndThreshold: 100,
  // Row refs measure during React's commit; React 19 rejects a nested synchronous rerender.
  useFlushSync: false,
} as const;

type ScrollMetrics = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">;
type MessageVirtualItem = Pick<VirtualItem, "index" | "key" | "size" | "start">;

export function getVirtualMessageRows<Row>(
  rows: readonly Row[],
  virtualItems: readonly MessageVirtualItem[],
) {
  return virtualItems.flatMap((virtualItem) => {
    const row = rows[virtualItem.index];
    return row === undefined ? [] : [{ row, virtualItem }];
  });
}

export function findMessageVirtualIndex(
  rows: readonly { message: { id: string } }[],
  messageId: string,
) {
  return rows.findIndex((row) => row.message.id === messageId);
}

export function getNewMessageAnnouncement(
  message: {
    authorId: string;
    authorName: string;
    content: string;
    id: string;
  },
  currentUserId: string,
) {
  if (message.authorId === currentUserId) {
    return null;
  }

  return { id: message.id, text: `${message.authorName}: ${message.content}` };
}

export function isMessageListNearBottom(metrics: ScrollMetrics) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < 100;
}

export function scheduleMessageListScrollPass(options: {
  onScroll: () => void;
  onSettled: () => void;
  requestFrame: (callback: () => void) => number;
  scheduleTimeout: (callback: () => void, delay: number) => number;
  shouldSchedule: boolean;
}) {
  if (!options.shouldSchedule) {
    return null;
  }

  return options.requestFrame(() => {
    options.onScroll();
    options.scheduleTimeout(() => {
      options.onScroll();
      options.onSettled();
    }, MESSAGE_SCROLL_SETTLE_DELAY_MS);
  });
}

interface MessageListProps {
  conversationId: string;
  mode: MessageMode;
  currentUserId: string;
  canModerate: boolean;
  initialUnreadMessageId?: string | null;
  /**
   * Faz 6 §19.3. The roster a group system row resolves its ids against. Empty
   * for a channel and for a 1:1, neither of which ever carries one.
   */
  participants?: readonly DmSystemMessageParticipant[] | undefined;
  /**
   * Faz 5 §D3.4. `userId → nameColor`, resolved once by the caller from the
   * conversation it already holds. Empty for a channel and for a 1:1.
   */
  senderColors?: Readonly<Record<string, string>> | undefined;
  /**
   * Mesajlar §5.4. `userId → DMParticipantRole`, çağıranın zaten elinde tuttuğu
   * konuşmadan bir kez çözülür. Kanalda ve 1:1'de boş.
   */
  participantRoles?: Readonly<Record<string, DMParticipantRole>> | undefined;
  /**
   * Mesajlar §5.4. Bahsetme şeridinin girdisi; satır bunu gövdedeki
   * `@kullanıcıadı` ile karşılaştırır.
   */
  currentUsername?: string | undefined;
  /**
   * Mesajlar karar #1. Ş6'nın anket kartını üreten geri çağrı. Liste anketi
   * bilmez; yalnız satıra hangi düğümün geçeceğini sorar.
   */
  renderPollSlot?: ((message: ChatMessage) => React.ReactNode) | undefined;
  /** Mesajlar karar #7. DM sabitlerini konuşma tutuyor; satır yalnız haber verir. */
  onTogglePin?: ((messageId: string, pinned: boolean) => void) | undefined;
  /** SPEC §5.3 `Mesajı ilet`. */
  onForward?: ((messageId: string) => void) | undefined;
  /** SPEC §6.1. Thread panelini kimlikle açar. */
  onOpenThread?: ((messageId: string) => void) | undefined;
  onRemoveOptimistic: (id: string) => void;
  onReply: (id: string, author: string, content: string) => void;
  onRetry: (id: string) => void;
  onThread: (message: ChatMessage) => void;
}

export function MessageList(props: MessageListProps) {
  return <MessageListContent {...props} key={`${props.mode}:${props.conversationId}`} />;
}

function MessageListContent({
  conversationId,
  mode,
  currentUserId,
  canModerate,
  initialUnreadMessageId = null,
  participants = [],
  senderColors,
  participantRoles,
  currentUsername,
  renderPollSlot,
  onTogglePin,
  onForward,
  onOpenThread,
  onRemoveOptimistic,
  onReply,
  onRetry,
  onThread,
}: MessageListProps) {
  "use no memo";

  // TanStack Virtual exposes mutable instance methods; React Compiler cannot
  // safely memoize this boundary without making scroll measurements stale.
  const { t } = useI18n();
  const { formatDate } = useAccountPreferenceRuntime();
  const socket = useSocket();
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useMessages(
    mode,
    conversationId,
  );
  const [showScrollButton, setShowScrollButton] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const virtualSizerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledInitialRef = useRef(false);
  const initialScrollCompleteRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastNewestMessageIdRef = useRef<string | null>(null);
  const lastNewestMessageActivityRef = useRef<string | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const lastHighlightedMessageIdRef = useRef<string | null>(null);
  const targetMessageId = useSearchParams().get("message");
  const [unreadJumpDismissed, setUnreadJumpDismissed] = useState(false);
  const [deletedNoticeNow, setDeletedNoticeNow] = useState(() => Date.now());
  const [virtualScrollMargin, setVirtualScrollMargin] = useState(0);
  const [newMessageAnnouncement, setNewMessageAnnouncement] = useState<{
    id: string;
    text: string;
  } | null>(null);

  // The cache remains complete; virtualization bounds browser work without
  // creating pagination gaps or moving realtime writes into an older page.
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
            new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime(),
          ) < MESSAGE_GROUP_WINDOW_MS;
        return { isGrouped, message, showDateSeparator };
      }),
    [allMessages],
  );
  // This component explicitly opts out above; virtualizer methods are mutable
  // by design and must observe the live scroll element and measurement cache.
  // eslint-disable-next-line react-hooks/incompatible-library
  const messageVirtualizer = useVirtualizer({
    ...MESSAGE_VIRTUALIZER_OPTIONS,
    count: groupedMessages.length,
    estimateSize: () => MESSAGE_ESTIMATED_ROW_HEIGHT_PX,
    getItemKey: (index) => groupedMessages[index]?.message.id ?? `message-row-${index}`,
    getScrollElement: () => listRef.current,
    overscan: MESSAGE_VIRTUAL_OVERSCAN,
    scrollMargin: virtualScrollMargin,
  });
  const virtualRows = getVirtualMessageRows(groupedMessages, messageVirtualizer.getVirtualItems());

  useLayoutEffect(() => {
    const list = listRef.current;
    const sizer = virtualSizerRef.current;
    if (!list || !sizer) {
      return;
    }

    const updateScrollMargin = () => {
      setVirtualScrollMargin((current) =>
        current === sizer.offsetTop ? current : sizer.offsetTop,
      );
    };
    updateScrollMargin();

    const resizeObserver = new ResizeObserver(updateScrollMargin);
    resizeObserver.observe(list);
    resizeObserver.observe(sizer);
    return () => resizeObserver.disconnect();
  }, []);

  const forceScrollToBottom = useCallback(() => {
    if (!listRef.current) {
      return;
    }

    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    listRef.current.scrollTop = listRef.current.scrollHeight;
    isNearBottomRef.current = true;
    setShowScrollButton(false);
  }, []);

  const scheduleScrollToBottom = useCallback(
    (options: { completeInitial?: boolean } = {}) => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }

      // The old five-frame/four-timeout burst forced layout nine times. One frame
      // plus one settlement pass covers late Markdown height without the churn.
      scrollFrameRef.current = scheduleMessageListScrollPass({
        onScroll: forceScrollToBottom,
        onSettled: () => {
          if (options.completeInitial) {
            initialScrollCompleteRef.current = true;
          }
        },
        requestFrame: (callback) =>
          window.requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            callback();
          }),
        scheduleTimeout: (callback, delay) => {
          const timeoutId = window.setTimeout(() => {
            scrollTimeoutRef.current = null;
            callback();
          }, delay);
          scrollTimeoutRef.current = timeoutId;
          return timeoutId;
        },
        // Read the position captured before new content changed scrollHeight. A
        // large incoming message can otherwise make a reader at bottom look far away.
        shouldSchedule: Boolean(options.completeInitial) || isNearBottomRef.current,
      });
    },
    [forceScrollToBottom],
  );

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    },
    [],
  );

  const fetchOlderMessages = useCallback(async () => {
    if (isFetchingNextPage) {
      return;
    }

    await fetchNextPage();
  }, [fetchNextPage, isFetchingNextPage]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (!initialScrollCompleteRef.current) {
        return;
      }

      if (
        entries[0]?.isIntersecting &&
        (hasNextPage ?? false) &&
        !isFetchingNextPage &&
        !isLoading
      ) {
        void fetchOlderMessages();
      }
    });

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [fetchOlderMessages, hasNextPage, isFetchingNextPage, isLoading]);

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const index = findMessageVirtualIndex(groupedMessages, messageId);
      if (index < 0) {
        return;
      }

      // Offscreen rows have no DOM node by design. Scroll by stable message
      // index first, then highlight after the virtual row mounts and measures.
      messageVirtualizer.scrollToIndex(index, { align: "center" });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const target = document.querySelector(`[data-message-id="${messageId}"]`);

          if (!(target instanceof HTMLElement)) {
            return;
          }

          target.dataset.jumpHighlight = "true";
          lastHighlightedMessageIdRef.current = messageId;
          window.setTimeout(() => {
            delete target.dataset.jumpHighlight;
          }, 1600);
        });
      });
    },
    [groupedMessages, messageVirtualizer],
  );

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
      return;
    }

    const isInitialLoad = !hasScrolledInitialRef.current;
    const hasNewLatestMessage =
      newestMessageId !== null && newestMessageId !== lastNewestMessageIdRef.current;
    const hasLatestInteraction =
      newestMessageActivity !== null &&
      newestMessageActivity !== lastNewestMessageActivityRef.current;
    const hasTargetMessage =
      Boolean(targetMessageId) && allMessages.some((message) => message.id === targetMessageId);

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
      if (!isInitialLoad && hasNewLatestMessage && newestMessage) {
        const authorName = newestMessage.author.displayName ?? newestMessage.author.username;
        setNewMessageAnnouncement(
          getNewMessageAnnouncement(
            {
              authorId: newestMessage.author.id,
              authorName,
              content: newestMessage.content,
              id: newestMessage.id,
            },
            currentUserId,
          ),
        );
      }
      hasScrolledInitialRef.current = true;
      scheduleScrollToBottom({
        completeInitial: isInitialLoad || !initialScrollCompleteRef.current,
      });
    }
  }, [currentUserId, data?.pages, scheduleScrollToBottom, scrollToMessage, targetMessageId]);

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

    const isNearBottom = isMessageListNearBottom(listRef.current);
    isNearBottomRef.current = isNearBottom;
    setShowScrollButton(!isNearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!listRef.current) {
      return;
    }

    forceScrollToBottom();
  }, [forceScrollToBottom]);

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

  /**
   * §D3.4 / §11.3/25. Which single message carries the receipt: the newest
   * one, and only when the viewer wrote it. Derived from the whole transcript,
   * which is exactly why a row cannot decide it for itself. System rows are
   * skipped — a group event landing after your message must not take the
   * receipt away from it.
   */
  const readReceiptMessageId = useMemo(() => {
    if (!senderColors) {
      return null;
    }

    for (let index = allMessages.length - 1; index >= 0; index -= 1) {
      const message = allMessages[index];
      if (!message || message.systemType) {
        continue;
      }

      return message.author.id === currentUserId ? message.id : null;
    }

    return null;
  }, [allMessages, currentUserId, senderColors]);

  const formatDateSeparator = useCallback(
    (isoDate: string) => {
      const date = new Date(isoDate);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return t("messages.conversation.dateToday");
      }

      if (date.toDateString() === yesterday.toDateString()) {
        return t("messages.conversation.dateYesterday");
      }

      return formatDate(date);
    },
    [formatDate, t],
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
    <>
      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {newMessageAnnouncement ? (
          <span key={newMessageAnnouncement.id}>{newMessageAnnouncement.text}</span>
        ) : null}
      </div>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="relative min-w-0 flex-1 space-y-0 overflow-y-auto overflow-x-hidden overscroll-contain scroll-pb-[max(7.5rem,calc(env(safe-area-inset-bottom)+6.75rem))] bg-transparent"
        aria-label={t("chat.list.ariaLabel")}
        aria-live="off"
        data-testid="message-list"
        role="log"
        tabIndex={0}
        style={{
          // SPEC §5.3: dikey boşluk listede, yatay boşluk **satırda**. Yatayı
          // buraya koymak sabitlenen şeridi ve tarih ayracını da içeri iter ve
          // ayracın çizgisi kenara ulaşmazdı.
          paddingBottom: pxToRem(messageListMetrics.paddingBottom),
          paddingTop: pxToRem(messageListMetrics.paddingTop),
          // Satır yatay boşluğu bir değişkene yazılıyor çünkü satır onu
          // **duyarlı** kullanıyor (dar ekranda dar, `sm` üstünde SPEC ölçüsü) ve
          // Tailwind'in duyarlı sınıfı satır içi bir `style` ile verilemez.
          ["--m-row-pad-x" as string]: pxToRem(messageListMetrics.rowPaddingX),
        }}
      >
        <div ref={observerRef} className="absolute left-0 top-0 h-px w-full" />

        {initialUnreadMessageId && !unreadJumpDismissed ? (
          <div className="pointer-events-none sticky top-3 z-20 flex h-0 justify-center">
            <button
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.12)] px-4 py-2 text-xs font-bold text-[hsl(var(--primary))] shadow-[0_14px_34px_hsl(var(--primary)/0.12)] backdrop-blur-xl transition hover:bg-[hsl(var(--primary)/0.18)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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

        {/*
          SPEC-MESAJLAR §10: yükleme durumu artık ortada duran bir metin değil,
          gerçek satır ölçüsünü taşıyan altı satırlık iskelet. Ekran okuyucu
          için iskelet `aria-hidden`; durumu aşağıdaki `sr-only` bölge söylüyor.
        */}
        {isLoading && allMessages.length === 0 ? (
          <>
            <span className="sr-only" role="status">
              {t("chat.list.loading")}
            </span>
            <MessageListSkeleton />
          </>
        ) : null}

        {error && !isLoading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center text-app-muted">
            <div className="text-center">
              <p className="text-sm">{t("chat.list.errorTitle")}</p>
              <p className="text-xs">{t("chat.list.errorDescription")}</p>
            </div>
          </div>
        ) : null}

        {!error && allMessages.length === 0 && !isLoading ? (
          <div className="flex h-full items-center justify-center px-4 text-app-muted">
            <div className="max-w-[18rem] rounded-[1.375rem] bg-[hsl(var(--surface-card)/0.74)] px-5 py-4 text-center shadow-[0_14px_32px_hsl(var(--shadow-color)/0.045)] backdrop-blur-xl">
              <p className="text-sm font-bold text-app-foreground">{t("chat.list.emptyTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                {t("chat.list.emptyDescription")}
              </p>
            </div>
          </div>
        ) : null}

        <div
          ref={virtualSizerRef}
          className="relative w-full"
          style={{ height: `${messageVirtualizer.getTotalSize()}px` }}
        >
          {virtualRows.map(({ row: { message, isGrouped, showDateSeparator }, virtualItem }) => (
            <div
              /*
               * Sanal satırın `transform`ı her satırı ayrı bir **yığın bağlamı**
               * yapar: satırın içindeki `z-30` menü yalnız kendi satırının içinde
               * yükselir, sonraki satırlar DOM sırasıyla onun üstüne boyanır ve
               * `...` menüsünün satırlarına giden tıklama menüye değil altta
               * kalan mesaja düşerdi. Menüsü açık satır bu yüzden kardeşlerinin
               * üstüne alınıyor; menü kapanınca sıra yine DOM sırası.
               */
              className="absolute left-0 top-0 w-full has-[[data-actions-open]]:z-30"
              data-index={virtualItem.index}
              data-virtual-message-row
              key={virtualItem.key}
              ref={messageVirtualizer.measureElement}
              style={{
                transform: `translateY(${virtualItem.start - messageVirtualizer.options.scrollMargin}px)`,
              }}
            >
              {showDateSeparator ? (
                <div
                  className={cn("relative flex items-center uppercase text-app-soft", DISPLAY_FONT)}
                  data-testid="message-date-separator"
                  role="separator"
                  style={{
                    fontSize: pxToRem(messageListMetrics.dividerChipFontSize),
                    fontWeight: 600,
                    gap: pxToRem(messageListMetrics.dividerGap),
                    letterSpacing: messageListMetrics.dividerChipTracking,
                    margin: `${pxToRem(messageListMetrics.dividerMarginY)} 0`,
                    padding: `0 ${pxToRem(messageListMetrics.rowPaddingX)}`,
                  }}
                >
                  <span
                    className="flex-1 bg-[hsl(var(--border)/0.5)]"
                    style={{ height: pxToRem(messageListMetrics.dividerRuleHeight) }}
                  />
                  <span
                    className="bg-[hsl(var(--surface-soft)/0.7)]"
                    style={{
                      borderRadius: pxToRem(messageListMetrics.dividerChipRadius),
                      padding: `${pxToRem(messageListMetrics.dividerChipPaddingY)} ${pxToRem(messageListMetrics.dividerChipPaddingX)}`,
                    }}
                  >
                    {formatDateSeparator(message.createdAt)}
                  </span>
                  <span
                    className="flex-1 bg-[hsl(var(--border)/0.5)]"
                    style={{ height: pxToRem(messageListMetrics.dividerRuleHeight) }}
                  />
                </div>
              ) : null}
              {/* §19.3: a group event is a note about the conversation, so it is
              drawn before — and instead of — anything a bubble would add. */}
              {message.systemType ? (
                <DmSystemMessage
                  actorFallbackName={message.author.displayName ?? message.author.username}
                  actorUserId={message.author.id}
                  currentUserId={currentUserId}
                  participants={participants}
                  systemTargetUserIds={message.systemTargetUserIds}
                  systemType={message.systemType}
                  systemValue={message.systemValue}
                />
              ) : (
                <MessageItem
                  mode={mode}
                  message={message}
                  isGrouped={isGrouped}
                  {...(currentUsername ? { currentUsername } : {})}
                  {...(participantRoles?.[message.author.id]
                    ? { authorRole: participantRoles[message.author.id] }
                    : {})}
                  {...(renderPollSlot ? { pollSlot: renderPollSlot(message) } : {})}
                  {...(senderColors?.[message.author.id]
                    ? { authorColor: senderColors[message.author.id] }
                    : {})}
                  {...(message.id === readReceiptMessageId && message.readReceipt
                    ? {
                        readReceipt: {
                          count: message.readReceipt.count,
                          everyone: message.readReceipt.everyone,
                        },
                      }
                    : {})}
                  currentUserId={currentUserId}
                  canModerate={canModerate}
                  onReact={handleReact}
                  onRemoveOptimistic={onRemoveOptimistic}
                  onReply={handleReply}
                  onRetry={onRetry}
                  onThread={onThread}
                  {...(onTogglePin ? { onTogglePin } : {})}
                  {...(onForward ? { onForward } : {})}
                  {...(onOpenThread ? { onOpenThread } : {})}
                />
              )}
            </div>
          ))}
        </div>

        <div ref={bottomRef} className="h-1" />

        {showScrollButton ? (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-4 ml-auto flex rounded-full bg-[hsl(var(--primary))] p-2 text-[hsl(var(--primary-foreground))] shadow-lg transition hover:bg-[hsl(var(--primary)/0.9)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            aria-label={t("chat.list.scrollToLatest")}
            type="button"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </>
  );
}
