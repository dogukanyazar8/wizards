"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  AtSign,
  Bell,
  BellOff,
  ChevronDown,
  Hash,
  Lock,
  Pin,
  Search,
  Users,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChatMessage,
  DMConversationDTO,
  DMMessagePayload,
  DMParticipantDTO,
  DMParticipantRole,
  PollDTO,
  MessageAttachment,
  UploadedAttachmentInput,
} from "@wizards/types";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { MESSAGES_METRICS } from "@/lib/messages/metrics";
import { MessageSearchPanel } from "./message-search-panel";
import { ConversationHeader } from "@/components/messages/conversation-header";
import { MessagePoll } from "@/components/messages/message-poll";
import { MessagesSearchPanel } from "@/components/messages/messages-search-panel";
import { PinnedListSheet } from "@/components/messages/pinned-list-sheet";
import { PinnedStrip } from "@/components/messages/pinned-strip";
import { PollComposer } from "@/components/messages/poll-composer";
import { PollVotersSheet } from "@/components/messages/poll-voters-sheet";
import { ForwardMessageSheet } from "@/components/messages/forward-message-sheet";
import { useConversationRows } from "@/hooks/use-conversation-rows";
import { selectPollCountdown } from "@wizards/types";
import { usePoll } from "@/hooks/use-poll";
import {
  MessagesClientError,
  createPoll,
  fetchConversationPins,
  fetchPollVoters,
  forwardDmMessage,
  pinDmMessage,
  unpinDmMessage,
} from "@/lib/messages/screen-client";
import { ThreadPanel } from "./thread-panel";
import { TypingIndicator } from "./typing-indicator";
import { createRafThrottledCallback } from "@/lib/ui/raf-throttle";
import { shouldFocusComposer } from "@/lib/home/href";
import { ServerMemberPanel } from "@/components/shell/server-member-panel";
import { DmComposer, DmMessageSurface } from "@/components/dm/dm-conversation";
import {
  getGroupConversationTitle,
  isGroupConversation as isGroupDm,
} from "@/lib/dm/group-presentation";
import { useI18n } from "@/components/providers/locale-provider";
import {
  appendMessage,
  getMessagesQueryKey,
  OPTIMISTIC_MESSAGE_PREFIX,
  type MessageMode,
  type MessagePages,
} from "@/hooks/use-messages";
import { useSocket } from "@/hooks/use-socket";
import { DmCallView } from "@/components/dm/dm-call-view";
import { useDMCallActions } from "@/components/providers/dm-call-provider";
import { useDMCallStore } from "@/store/dm-call-store";
import { useBodyScrollLock, useResponsiveLayout } from "@/hooks/use-responsive-layout";
import { useTyping } from "@/hooks/use-typing";
import {
  fetchChannelNotificationSettings,
  fetchChannelPinnedMessages,
  fetchWorkspaceServer,
  updateChannelNotificationSettings,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { useAppStore } from "@/lib/store";
import { RESPONSIVE_SHELL_SIZES } from "@/lib/responsive";

interface ChatAreaProps {
  conversationId: string;
  mode: MessageMode;
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  channelLocked?: boolean;
  channelReadOnly?: boolean;
  channelName?: string;
  channelTopic?: string | null;
  currentUserId: string;
  currentUserDisplayName: string;
  currentUserUsername: string;
  canModerate: boolean;
  directMessageSearchRequestId?: number;
  directMessageParticipant?: DMParticipantDTO | null;
  /**
   * Faz 6 §19.3. Present for a DM route so the header can tell a group from a
   * 1:1 and a system row can resolve the ids it names.
   */
  directMessageConversation?: DMConversationDTO | null;
  initialUnreadMessageId?: string | null;
  messageCharacterLimit?: number | null;
  onOpenDirectMessageDetails?: (() => void) | undefined;
  serverId?: string;
  uploadthingEnabled: boolean;
}

/** Stable identity: `?? []` would hand the message list a new array per render. */
const EMPTY_PARTICIPANTS: readonly [] = [];
/** Sorgu boşken yeni bir dizi üretmemek için; her render'da yeni dizi memoyu bozar. */
const EMPTY_PINS: readonly [] = [];
const EMPTY_VOTERS: readonly [] = [];

/**
 * Anket kartını kendi kancasıyla saran ince sarmalayıcı.
 *
 * `usePoll` bir kanca; satırın içinde çağrılsaydı anketi olmayan her satır da
 * bir kanca kurar ve React'in kanca sırası kuralı gereği koşullu çağrılamazdı.
 */
function MessagePollSlot({ poll }: { poll: PollDTO }) {
  const { t } = useI18n();
  const state = usePoll({ poll });
  const [votersOpen, setVotersOpen] = useState(false);
  /**
   * Oy verenler yalnız sheet açılınca çekilir: her anket kartı için bir istek,
   * hiç tıklanmayacak bir listeyi otuz kez indirmek olurdu. Anonim ankette uç
   * 403 verir ve bağlantı zaten çizilmez, o yüzden sorgu da hiç kurulmaz.
   */
  const votersQuery = useQuery({
    enabled: votersOpen && state.poll.canSeeVoters,
    queryFn: () => fetchPollVoters(state.poll.id),
    queryKey: ["messages", "poll", state.poll.id, "voters"],
    staleTime: 10_000,
  });

  const countdown = selectPollCountdown(state.poll, new Date());

  return (
    <>
      <MessagePoll
        closesInLabel={
          countdown
            ? t(
                countdown.unit === "minute"
                  ? "messages.poll.countdownMinute"
                  : countdown.unit === "hour"
                    ? "messages.poll.countdownHour"
                    : "messages.poll.countdownDay",
                { count: countdown.value },
              )
            : null
        }
        disabled={state.isVoting}
        errorText={state.hasError ? t("messages.errors.voteFailed") : null}
        onOpenVoters={() => setVotersOpen(true)}
        onToggleOption={state.toggleOption}
        poll={state.poll}
      />

      <PollVotersSheet
        onClose={() => setVotersOpen(false)}
        open={votersOpen}
        poll={state.poll}
        voters={votersQuery.data ?? EMPTY_VOTERS}
      />
    </>
  );
}

let optimisticMessageSequence = 0;

/**
 * The id an optimistic bubble is rendered under, and the `clientNonce` the send
 * carries so the server can hand it back on the author's own echo. The counter
 * is what makes it a key: two sends inside the same millisecond would otherwise
 * share an id, and the echo for one would land in the other's bubble.
 */
function createOptimisticMessageId(): string {
  optimisticMessageSequence += 1;
  return `${OPTIMISTIC_MESSAGE_PREFIX}${Date.now()}-${optimisticMessageSequence}`;
}

function buildOptimisticMessage(input: {
  content: string;
  conversationId: string;
  currentUserDisplayName: string;
  currentUserId: string;
  currentUserUsername: string;
  replyTo:
    | {
        authorName: string;
        content: string;
        id: string;
      }
    | null
    | undefined;
  tempId: string;
  attachments: MessageAttachment[];
}): ChatMessage {
  return {
    id: input.tempId,
    channelId: input.conversationId,
    author: {
      id: input.currentUserId,
      displayName: input.currentUserDisplayName,
      username: input.currentUserUsername,
      avatarUrl: null,
    },
    content: input.content,
    replyTo: input.replyTo
      ? {
          id: input.replyTo.id,
          authorName: input.replyTo.authorName,
          content: input.replyTo.content,
        }
      : undefined,
    createdAt: new Date().toISOString(),
    deliveryStatus: "sending",
    type: "DEFAULT",
    reactions: [],
    attachments: input.attachments,
    editedAt: null,
    deletedAt: null,
    deletedById: null,
    placeholderExpiresAt: null,
  };
}

type PendingMessagePayload = {
  attachments: UploadedAttachmentInput[];
  content: string;
  optimisticAttachments: MessageAttachment[];
  replyTo: {
    authorName: string;
    content: string;
    id: string;
  } | null;
  replyToId?: string | undefined;
  tempId: string;
};

type FloatingPanelPosition = {
  left: number;
  top: number;
  width: number;
};

function getFloatingPanelPosition(anchor: HTMLElement | null): FloatingPanelPosition | null {
  if (!anchor || typeof window === "undefined") {
    return null;
  }

  const rect = anchor.getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const width = Math.min(320, window.innerWidth - margin * 2);
  const left = Math.min(Math.max(rect.right - width, margin), window.innerWidth - width - margin);
  const top = Math.min(rect.bottom + gap, window.innerHeight - margin);

  return { left, top, width };
}

/** `useSyncExternalStore` aboneliği — konum değişimi `popstate` ile duyurulur. */
function subscribeToLocation(listener: () => void) {
  window.addEventListener("popstate", listener);

  return () => window.removeEventListener("popstate", listener);
}

function readComposerFocusFlag(): boolean {
  return shouldFocusComposer(window.location.search);
}

function readServerComposerFocusFlag(): boolean {
  return false;
}

export function ChatArea(props: ChatAreaProps) {
  return <ChatAreaContent {...props} key={`${props.mode}:${props.conversationId}`} />;
}

function ChatAreaContent({
  conversationId,
  mode,
  allowFileUploads = true,
  allowGifs = true,
  channelLocked = false,
  channelReadOnly = false,
  channelName,
  channelTopic,
  currentUserId,
  currentUserDisplayName,
  currentUserUsername,
  canModerate,
  directMessageSearchRequestId = 0,
  directMessageParticipant = null,
  directMessageConversation = null,
  initialUnreadMessageId = null,
  messageCharacterLimit = 2000,
  onOpenDirectMessageDetails,
  serverId,
  uploadthingEnabled,
}: ChatAreaProps) {
  const { locale, t } = useI18n();
  const isGroupConversation = Boolean(
    directMessageConversation && isGroupDm(directMessageConversation),
  );
  const groupTitle = directMessageConversation
    ? getGroupConversationTitle(
        directMessageConversation,
        currentUserId,
        t("dm.sidebar.unknownUser"),
        locale,
      )
    : "";
  const socket = useSocket();
  const queryClient = useQueryClient();
  const responsiveLayout = useResponsiveLayout();
  const router = useRouter();
  /**
   * `<1100px`'te sağ panel ana alanın üstüne biner (Ş0.1'in `sidePanelOverlayBelow`
   * eşiği). Eşik burada okunuyor çünkü `useResponsiveLayout` kabuğun kendi
   * kırılma noktalarını taşıyor ve bu eşik Mesajlar ekranına özgü.
   */
  const overlaySidePanel =
    responsiveLayout.viewportWidth > 0 &&
    responsiveLayout.viewportWidth < MESSAGES_METRICS.layout.sidePanelOverlayBelow;
  const setMobileSidebarOpen = useAppStore((state) => state.setMobileSidebarOpen);
  const serverMembersQuery = useQuery({
    enabled: mode === "channel" && Boolean(serverId),
    queryFn: () => fetchWorkspaceServer(serverId!),
    queryKey: serverId ? workspaceQueryKeys.server(serverId) : ["workspace", "server", "idle"],
    staleTime: 30_000,
  });
  /**
   * Bahsedilmeler Ş2 / karar K1. Öneri listesi yalnız **bahsedilebilir** rolleri gösterir.
   * `MENTION_EVERYONE` sahibi kısıtlı bir rolü elle yazabilir; listeye koymak, izni olmayan
   * herkese "buna dokunabilirsin" demek olurdu. Varsayılan rol `@herkes`in kendisidir ve o
   * ayrı bir daldır (K2).
   */
  const mentionableRoles = useMemo(
    () =>
      (serverMembersQuery.data?.roles ?? []).filter((role) => role.mentionable && !role.isDefault),
    [serverMembersQuery.data],
  );
  const pinnedMessagesQuery = useQuery({
    enabled: mode === "channel",
    queryFn: () => fetchChannelPinnedMessages(conversationId),
    queryKey: workspaceQueryKeys.pinnedMessages(conversationId),
    staleTime: 30_000,
  });
  const notificationSettingsQuery = useQuery({
    enabled: mode === "channel",
    queryFn: () => fetchChannelNotificationSettings(conversationId),
    queryKey: ["workspace", "channel", conversationId, "notification-settings"],
    staleTime: 30_000,
  });
  /**
   * Mesajlar karar #7. DM sabitleri konuşmaya ait ve kendi uçları var; kanal
   * tarafı `pinnedMessagesQuery` ile eski yolunda kalıyor. İkisi tek sorguya
   * sıkıştırılsaydı, iki farklı yetki modeli tek bir yanıtın içinde karışırdı.
   */
  const dmPinsQuery = useQuery({
    enabled: mode === "dm",
    queryFn: () => fetchConversationPins(conversationId),
    queryKey: ["messages", "dm", conversationId, "pins"],
    staleTime: 30_000,
  });
  const dmPinsMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      pinned ? unpinDmMessage(conversationId, messageId) : pinDmMessage(conversationId, messageId),
    onSuccess: (pins) => {
      queryClient.setQueryData(["messages", "dm", conversationId, "pins"], pins);
    },
  });
  const forwardMutation = useMutation({
    mutationFn: ({
      messageId,
      targetConversationId,
    }: {
      messageId: string;
      targetConversationId: string;
    }) => forwardDmMessage(messageId, targetConversationId),
    onSuccess: () => setForwardMessageId(null),
  });
  const createPollMutation = useMutation({
    mutationFn: (request: Parameters<typeof createPoll>[0]) => createPoll(request),
    onSuccess: () => {
      // İyimser mesaj eklenmiyor: anket kartı sunucu kimliği ister ve akışa
      // `dm:message:new` ile giriyor. Uydurma bir kimlikle çizilen kart, ilk
      // oyda var olmayan bir ankete oy göndermek olurdu.
      setPollComposerOpen(false);
    },
  });
  const notificationSettingsMutation = useMutation({
    mutationFn: (level: "all" | "mentions" | "muted") =>
      updateChannelNotificationSettings(conversationId, level),
    onSuccess: (settings) => {
      queryClient.setQueryData(
        ["workspace", "channel", conversationId, "notification-settings"],
        settings,
      );
      setShowNotificationMenu(false);
    },
  });
  const { typingUsers } = useTyping(conversationId, mode);
  const { endCall, startCall } = useDMCallActions();
  const callSession = useDMCallStore((state) => state.session);
  const isCallMinimized = useDMCallStore((state) => state.isMinimized);
  const activeCallSession = callSession?.conversationId === conversationId ? callSession : null;
  const showCallView = Boolean(activeCallSession) && !isCallMinimized;
  const startDirectCall = (video: boolean) => {
    if (!directMessageParticipant) {
      return;
    }

    void startCall({
      conversationId,
      peer: {
        avatarUrl: directMessageParticipant.avatarUrl ?? null,
        displayName: directMessageParticipant.displayName ?? null,
        id: directMessageParticipant.userId,
        username: directMessageParticipant.username,
      },
      video,
    });
  };
  const pendingMessagesRef = useRef<Map<string, PendingMessagePayload>>(new Map());
  const pendingOrderRef = useRef<string[]>([]);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const [replyTo, setReplyTo] = useState<{
    id: string;
    authorName: string;
    content: string;
  } | null>(null);
  const [selectedThread, setSelectedThread] = useState<ChatMessage | null>(null);
  /**
   * Ana Sayfa 1a Faz 5 §1 — "Yanıt bekliyor" satırının `Yanıtla` butonu buraya
   * `?compose=1` ile gelir.
   *
   * `useSyncExternalStore` çünkü değer sunucuda **yok**: sunucu anlık görüntüsü
   * `false`, istemci konumu okur, hidrasyon uyuşmazlığı olmaz. `popstate` aboneliği
   * geri/ileri gezinmeyi de kapsıyor; rota değişimi zaten yeni bir render.
   */
  const focusComposerOnOpen = useSyncExternalStore(
    subscribeToLocation,
    readComposerFocusFlag,
    readServerComposerFocusFlag,
  );

  const [isPinnedMessagesRequested, setIsPinnedMessagesRequested] = useState(false);
  const [isSearchManuallyOpen, setIsSearchManuallyOpen] = useState(false);
  const [dismissedSearchRequestId, setDismissedSearchRequestId] = useState(0);
  const [isMembersDrawerRequested, setIsMembersDrawerRequested] = useState(false);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pinnedSheetOpen, setPinnedSheetOpen] = useState(false);
  /** Görüntüleyenin kapattığı sabit; yeni bir sabit gelince şerit geri döner. */
  const [dismissedPinId, setDismissedPinId] = useState<string | null>(null);
  /** İletilecek mesajın kimliği; `null` iken seçici kapalı. */
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [notificationMenuPosition, setNotificationMenuPosition] =
    useState<FloatingPanelPosition | null>(null);
  const visibleNotificationMenuPosition = showNotificationMenu ? notificationMenuPosition : null;
  const channelTitle = channelName?.trim() || conversationId;
  const channelDescription = channelTopic?.trim() || null;
  const showSearch =
    isSearchManuallyOpen ||
    (mode === "dm" && directMessageSearchRequestId > dismissedSearchRequestId);
  const showMembersDrawer = isMembersDrawerRequested && responsiveLayout.shouldMountInfoDrawer;
  const shouldShowInfoDrawer =
    showMembersDrawer &&
    mode === "channel" &&
    responsiveLayout.shouldMountInfoDrawer &&
    Boolean(serverMembersQuery.data);
  useBodyScrollLock(shouldShowInfoDrawer);

  const queryKey = useMemo(() => getMessagesQueryKey(mode, conversationId), [conversationId, mode]);
  // Message rows compare this callback by identity. Recreating it on typing ticks
  // silently bypasses their memo boundary and reruns every Markdown renderer.
  const handleReply = useCallback(
    (id: string, authorName: string, content: string) => {
      setReplyTo({ id, authorName, content });
    },
    [setReplyTo],
  );

  const openSearch = () => {
    setIsSearchManuallyOpen(true);
  };

  const closeSearch = () => {
    setIsSearchManuallyOpen(false);
    if (mode === "dm") {
      setDismissedSearchRequestId((current) => Math.max(current, directMessageSearchRequestId));
    }
  };

  /**
   * SPEC §6.3: thread ve arama **aynı anda açılmaz**. İkisi de 340px'lik aynı
   * sütuna oturuyor; birlikte açık olmaları ya sohbeti 680px daraltır ya da
   * birinin diğerinin altında görünmez kalması demektir.
   */
  const toggleSearchPanel = () => {
    if (showSearch) {
      closeSearch();
      return;
    }

    setSelectedThread(null);
    openSearch();
  };

  const openThreadPanel = (message: ChatMessage) => {
    closeSearch();
    setSelectedThread(message);
  };

  const updateNotificationMenuPosition = useCallback(() => {
    const nextPosition = getFloatingPanelPosition(notificationButtonRef.current);
    setNotificationMenuPosition((currentPosition) =>
      currentPosition?.left === nextPosition?.left &&
      currentPosition?.top === nextPosition?.top &&
      currentPosition?.width === nextPosition?.width
        ? currentPosition
        : nextPosition,
    );
  }, []);

  useEffect(() => {
    if (!showNotificationMenu) {
      return;
    }

    updateNotificationMenuPosition();
    // Capture-phase scroll fires for every descendant scroller. Coalesce those
    // events before reading layout so the chat tree does not rerender per event.
    const throttledScroll = createRafThrottledCallback(updateNotificationMenuPosition);

    window.addEventListener("resize", updateNotificationMenuPosition);
    window.addEventListener("scroll", throttledScroll.run, true);
    return () => {
      throttledScroll.cancel();
      window.removeEventListener("resize", updateNotificationMenuPosition);
      window.removeEventListener("scroll", throttledScroll.run, true);
    };
  }, [showNotificationMenu, updateNotificationMenuPosition]);

  useEffect(() => {
    if (!showNotificationMenu) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowNotificationMenu(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showNotificationMenu]);

  useEffect(() => {
    if (!shouldShowInfoDrawer) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMembersDrawerRequested(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shouldShowInfoDrawer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut =
        (event.ctrlKey || event.metaKey) && (event.key === "k" || event.key === "f");
      if (!isShortcut) {
        return;
      }

      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (event.key === "f" && isTypingTarget) {
        return;
      }

      event.preventDefault();
      setIsSearchManuallyOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handlePinsUpdated = (data: { channelId: string }) => {
      if (data.channelId !== conversationId) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.pinnedMessages(conversationId),
      });
    };

    socket.on("message:pins_updated", handlePinsUpdated);

    return () => {
      socket.off("message:pins_updated", handlePinsUpdated);
    };
  }, [conversationId, queryClient, socket]);

  const removeOptimisticMessage = useCallback(
    (messageId: string) => {
      pendingMessagesRef.current.delete(messageId);
      pendingOrderRef.current = pendingOrderRef.current.filter((id) => id !== messageId);

      queryClient.setQueryData<MessagePages>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((message) => message.id !== messageId),
          })),
        };
      });
    },
    [queryClient, queryKey],
  );

  const markOptimisticMessageFailed = useCallback(
    (messageId: string, errorMessage?: string) => {
      queryClient.setQueryData<MessagePages>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            messages: page.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    deliveryStatus: "failed" as const,
                    errorMessage,
                  }
                : message,
            ),
          })),
        };
      });
    },
    [queryClient, queryKey],
  );

  const markOptimisticMessageSending = useCallback(
    (messageId: string) => {
      queryClient.setQueryData<MessagePages>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            messages: page.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    deliveryStatus: "sending" as const,
                    errorMessage: undefined,
                  }
                : message,
            ),
          })),
        };
      });
    },
    [queryClient, queryKey],
  );

  useEffect(() => {
    const failLatestOptimisticMessage = (errorMessage?: string) => {
      const latestPendingId = [...pendingOrderRef.current]
        .reverse()
        .find((id) => pendingMessagesRef.current.has(id));

      if (!latestPendingId) {
        return;
      }

      markOptimisticMessageFailed(latestPendingId, errorMessage);
    };

    if (mode === "channel") {
      const handleError = (data: { code: string; message: string }) => {
        if (
          data.code === "MESSAGE_SEND_ERROR" ||
          data.code === "MESSAGE_VALIDATION_ERROR" ||
          data.code === "MESSAGE_TOO_LONG" ||
          data.code === "VALIDATION_ERROR" ||
          data.code === "INVALID_ATTACHMENT" ||
          data.code === "RATE_LIMIT" ||
          data.code === "RATE_LIMIT_UNAVAILABLE" ||
          data.code === "CHANNEL_LOCKED" ||
          data.code === "FILE_UPLOADS_DISABLED" ||
          data.code === "GIFS_DISABLED" ||
          data.code === "FORBIDDEN" ||
          data.code === "NOT_A_MEMBER" ||
          data.code === "CHANNEL_NOT_FOUND"
        ) {
          failLatestOptimisticMessage(data.message);
        }
      };

      socket.on("error", handleError);
      return () => {
        socket.off("error", handleError);
      };
    }

    const handleDMError = (data?: { message?: string }) => {
      failLatestOptimisticMessage(data?.message);
    };

    socket.on("dm:error", handleDMError);
    return () => {
      socket.off("dm:error", handleDMError);
    };
  }, [markOptimisticMessageFailed, mode, socket]);

  useEffect(() => {
    const forgetPending = (tempId: string) => {
      pendingMessagesRef.current.delete(tempId);
      pendingOrderRef.current = pendingOrderRef.current.filter((id) => id !== tempId);
    };

    const clearConfirmedPending = (message: {
      attachments?: Array<{ id: string }>;
      author?: { id: string };
      clientNonce?: string | null | undefined;
      content: string;
    }) => {
      if (message.author?.id !== currentUserId) {
        return;
      }

      // The echo names the send it confirms, so the retry payload it retires is
      // exactly that one. Guessing from content instead retired whichever send
      // happened to look alike — which, for the same text twice, was the wrong
      // one.
      if (message.clientNonce) {
        forgetPending(message.clientNonce);
        return;
      }

      for (const [tempId, payload] of pendingMessagesRef.current.entries()) {
        const sameContent = payload.content === message.content;
        const sameAttachments =
          payload.optimisticAttachments.length === (message.attachments?.length ?? 0) &&
          payload.optimisticAttachments.every((attachment) =>
            message.attachments?.some((confirmed) => confirmed.id === attachment.id),
          );

        if (sameContent && sameAttachments) {
          forgetPending(tempId);
          return;
        }
      }
    };

    if (mode === "channel") {
      const handleMessage = (message: ChatMessage) => {
        if (message.channelId === conversationId) {
          clearConfirmedPending(message);
        }
      };

      socket.on("message:new", handleMessage);
      return () => {
        socket.off("message:new", handleMessage);
      };
    }

    const handleDMMessage = (message: DMMessagePayload) => {
      if (message.conversationId === conversationId) {
        clearConfirmedPending(message);
      }
    };

    socket.on("dm:message:new", handleDMMessage);
    return () => {
      socket.off("dm:message:new", handleDMMessage);
    };
  }, [conversationId, currentUserId, mode, socket]);

  const handleSend = async (
    content: string,
    replyToId?: string,
    attachments: UploadedAttachmentInput[] = [],
    optimisticAttachments: MessageAttachment[] = [],
  ) => {
    const tempId = createOptimisticMessageId();
    const payload: PendingMessagePayload = {
      attachments,
      content,
      optimisticAttachments,
      replyTo,
      replyToId,
      tempId,
    };
    pendingMessagesRef.current.set(tempId, payload);
    pendingOrderRef.current = [...pendingOrderRef.current, tempId].slice(-20);

    await queryClient.cancelQueries({ exact: true, queryKey });

    queryClient.setQueryData<MessagePages>(queryKey, (current) =>
      appendMessage(
        current,
        buildOptimisticMessage({
          content,
          conversationId,
          currentUserDisplayName,
          currentUserId,
          currentUserUsername,
          replyTo,
          tempId,
          attachments: optimisticAttachments,
        }),
      ),
    );

    if (mode === "channel") {
      socket.emit("message:send", {
        channelId: conversationId,
        clientNonce: tempId,
        content,
        attachments,
        ...(replyToId ? { replyToId } : {}),
      });
    } else {
      socket.emit("dm:message:send", {
        clientNonce: tempId,
        conversationId,
        content,
        attachments,
        ...(replyToId ? { replyToId } : {}),
      });
    }

    setReplyTo(null);
  };

  const retryOptimisticMessage = useCallback(
    (messageId: string) => {
      const payload = pendingMessagesRef.current.get(messageId);
      if (!payload) {
        removeOptimisticMessage(messageId);
        return;
      }

      markOptimisticMessageSending(messageId);

      // The retry keeps the bubble it is retrying, so it keeps that bubble's id
      // as its nonce — the echo has to come back to the row the reader is
      // watching, not to a new one.
      if (mode === "channel") {
        socket.emit("message:send", {
          channelId: conversationId,
          clientNonce: messageId,
          content: payload.content,
          attachments: payload.attachments,
          ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
        });
        return;
      }

      socket.emit("dm:message:send", {
        clientNonce: messageId,
        conversationId,
        content: payload.content,
        attachments: payload.attachments,
        ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
      });
    },
    [conversationId, markOptimisticMessageSending, mode, removeOptimisticMessage, socket],
  );

  const isChannelReadOnly =
    mode === "channel" && (channelReadOnly || (channelLocked && !canModerate));
  const pinnedMessages = (pinnedMessagesQuery.data ?? []).filter((message) => !message.deletedAt);
  const hasPinnedMessages = mode === "channel" && pinnedMessages.length > 0;
  const showPinnedMessages = isPinnedMessagesRequested && hasPinnedMessages;
  const notificationLevel = notificationSettingsQuery.data?.level ?? "all";
  const NotificationIcon =
    notificationLevel === "muted" ? BellOff : notificationLevel === "mentions" ? AtSign : Bell;

  const jumpToMessage = useCallback((messageId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("message", messageId);
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));

    const target = document.querySelector(`[data-message-id="${messageId}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.dataset.jumpHighlight = "true";
      window.setTimeout(() => {
        delete target.dataset.jumpHighlight;
      }, 1400);
    }
  }, []);

  const closeThreadPanel = () => {
    setSelectedThread(null);

    window.requestAnimationFrame(() => {
      const mainComposerInput = document.querySelector<HTMLTextAreaElement>(
        '[data-composer-variant="default"] [data-testid="message-input"]',
      );
      mainComposerInput?.focus({ preventScroll: true });
    });
  };

  const openInfoDrawer = () => {
    setMobileSidebarOpen(false);
    setIsPinnedMessagesRequested(false);
    closeSearch();
    setShowNotificationMenu(false);
    setIsMembersDrawerRequested(true);
  };

  /**
   * Faz 5 §D3.4 / §11.0.1. One pass over the roster, so every name in the
   * transcript reads the same map. Only a group has one: a channel resolves
   * nothing here and a 1:1 answers "who is speaking" with the side of the
   * screen the bubble is on.
   */
  const groupSenderColors = useMemo(() => {
    if (mode !== "dm" || directMessageConversation?.type !== "GROUP_DM") {
      return undefined;
    }

    const colors: Record<string, string> = {};
    for (const participant of directMessageConversation.participants) {
      if (participant.nameColor) {
        colors[participant.userId] = participant.nameColor;
      }
    }

    return colors;
  }, [directMessageConversation, mode]);

  /**
   * Mesajlar §5.4. Roster'ı bir kez gezip `userId → rol` haritası çıkarır; satır
   * kendi rolünü aramak için katılımcı dizisini gezseydi, sanallaştırılmış her
   * satır için bir tarama daha olurdu.
   */
  const groupParticipantRoles = useMemo(() => {
    if (mode !== "dm" || directMessageConversation?.type !== "GROUP_DM") {
      return undefined;
    }

    const roles: Record<string, DMParticipantRole> = {};
    for (const participant of directMessageConversation.participants) {
      if (participant.role) {
        roles[participant.userId] = participant.role;
      }
    }

    return roles;
  }, [directMessageConversation, mode]);

  /**
   * İletme hedefleri: rayla **aynı** satır türetimi. Ayrı bir liste, aynı
   * sohbetin iki farklı adla görünmesi demek olurdu. Yalnız DM'de kurulur.
   */
  const { rows: forwardTargets } = useConversationRows(mode === "dm" ? currentUserId : "");

  const handleTogglePin = useCallback(
    (messageId: string, pinned: boolean) => {
      dmPinsMutation.mutate({ messageId, pinned });
    },
    [dmPinsMutation],
  );

  /**
   * Anket kartı yalnız anketi olan mesajda çizilir. Kart kendi oy durumunu
   * `usePoll` ile taşıyor; bu yüzden ayrı bir bileşen — kanca satırın içinde
   * çağrılsaydı, anketi olmayan her satır da bir kanca kurardı.
   */
  const renderPollSlot = useCallback(
    (message: ChatMessage) => (message.poll ? <MessagePollSlot poll={message.poll} /> : null),
    [],
  );

  /**
   * Sağ sütun: thread ya da arama, **asla ikisi birden** (SPEC §6.3). Kural
   * `toggleSearchPanel` / `openThreadPanel` içinde uygulanıyor; burada yalnız
   * hangisinin çizileceği seçiliyor.
   */
  const sidePanel = selectedThread ? (
    <ThreadPanel
      allowFileUploads={mode === "channel" ? allowFileUploads : true}
      allowGifs={mode === "channel" ? allowGifs : true}
      canModerate={canModerate}
      conversationId={conversationId}
      currentUserId={currentUserId}
      currentUsername={currentUserUsername}
      disabled={isChannelReadOnly}
      {...(isChannelReadOnly ? { disabledReason: t("chat.channel.readOnlyComposer") } : {})}
      mentionMembers={mode === "channel" ? (serverMembersQuery.data?.members ?? []) : []}
      mentionRoles={mode === "channel" ? mentionableRoles : []}
      messageCharacterLimit={mode === "channel" ? messageCharacterLimit : 2000}
      mode={mode}
      onClose={closeThreadPanel}
      onThreadStateChange={(state) =>
        setSelectedThread((current) =>
          current
            ? {
                ...current,
                threadClosedAt: state.closedAt,
                threadClosedById: state.closedById,
              }
            : current,
        )
      }
      overlay={overlaySidePanel}
      parentMessage={selectedThread}
      uploadthingEnabled={uploadthingEnabled}
    />
  ) : /*
   * Arama paneli yalnız DM'de: karar #6 global DM aramasını tarif ediyor ve
   * kanal tarafı hâlâ kendi popover'ını kullanıyor.
   */
  mode === "dm" && showSearch ? (
    <MessagesSearchPanel
      onClose={closeSearch}
      onSelect={(result) => {
        // Panel **kapanmıyor**: başka bir sohbete gidildiğinde bile aramaya
        // devam edilebilsin diye (SPEC §6.2).
        if (result.conversationId !== conversationId) {
          router.push(`/messages/${result.conversationId}?message=${result.messageId}`);
          return;
        }

        jumpToMessage(result.messageId);
      }}
      overlay={overlaySidePanel}
      personFilter={
        isGroupConversation || !directMessageParticipant
          ? null
          : {
              id: directMessageParticipant.userId,
              name: directMessageParticipant.displayName ?? directMessageParticipant.username,
            }
      }
    />
  ) : null;

  const messageConversationContent = (
    <>
      {/*
        karar #7. Eski şerit `DMConversationDTO.pinnedMessage` okuyordu: tek bir
        sabit, sayı yok, kapatma yok, listeye giriş yok. Yeni şerit sabit
        listesini kendi ucundan çekiyor.
      */}
      {mode === "dm" ? (
        <PinnedStrip
          dismissedId={dismissedPinId}
          onDismiss={setDismissedPinId}
          onSeeAll={() => setPinnedSheetOpen(true)}
          pins={dmPinsQuery.data ?? EMPTY_PINS}
        />
      ) : null}
      <MessageList
        conversationId={conversationId}
        mode={mode}
        currentUserId={currentUserId}
        canModerate={canModerate}
        initialUnreadMessageId={initialUnreadMessageId}
        participants={directMessageConversation?.participants ?? EMPTY_PARTICIPANTS}
        {...(groupSenderColors ? { senderColors: groupSenderColors } : {})}
        {...(mode === "dm" ? { currentUsername: currentUserUsername } : {})}
        {...(groupParticipantRoles ? { participantRoles: groupParticipantRoles } : {})}
        {...(mode === "dm"
          ? { renderPollSlot, onTogglePin: handleTogglePin, onForward: setForwardMessageId }
          : {})}
        /*
         * `onOpenThread` **verilmiyor**: satır kök mesajın kendisini taşıyor ve
         * panel onu istiyor. Kimlikle gelen bir geri çağrı, mesajı listede
         * yeniden aramak demekti; verildiğinde de satır `onThread` yerine onu
         * seçiyor ve thread paneli hiç açılmıyordu.
         */
        onRemoveOptimistic={removeOptimisticMessage}
        onReply={handleReply}
        onRetry={retryOptimisticMessage}
        onThread={openThreadPanel}
      />
      <TypingIndicator typingUsers={typingUsers} />
      {mode === "dm" ? (
        <DmComposer>
          <MessageInput
            autoFocus={focusComposerOnOpen}
            conversationId={conversationId}
            mode={mode}
            disabled={isChannelReadOnly}
            disabledReason={isChannelReadOnly ? t("chat.channel.readOnlyComposer") : undefined}
            replyTo={replyTo}
            onSend={handleSend}
            onCancelReply={() => setReplyTo(null)}
            allowFileUploads
            allowGifs
            maxLength={2000}
            mentionMembers={[]}
            conversationKind={isGroupConversation ? "group" : "dm"}
            conversationName={
              isGroupConversation
                ? groupTitle
                : (directMessageParticipant?.displayName ??
                  directMessageParticipant?.username ??
                  "")
            }
            onOpenPoll={() => setPollComposerOpen(true)}
            pollEnabled
            uploadthingEnabled={uploadthingEnabled}
          />
        </DmComposer>
      ) : (
        <MessageInput
          autoFocus={focusComposerOnOpen}
          conversationId={conversationId}
          mode={mode}
          disabled={isChannelReadOnly}
          disabledReason={isChannelReadOnly ? t("chat.channel.readOnlyComposer") : undefined}
          replyTo={replyTo}
          onSend={handleSend}
          onCancelReply={() => setReplyTo(null)}
          allowFileUploads={allowFileUploads}
          allowGifs={allowGifs}
          maxLength={messageCharacterLimit}
          mentionMembers={serverMembersQuery.data?.members ?? []}
          mentionRoles={mentionableRoles}
          uploadthingEnabled={uploadthingEnabled}
        />
      )}
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-transparent">
      {showNotificationMenu && visibleNotificationMenuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000]"
              onPointerDown={() => setShowNotificationMenu(false)}
              role="presentation"
            >
              <div
                className="app-panel fixed rounded-[1.375rem] border bg-[hsl(var(--surface-card))] p-2 shadow-[0_28px_70px_hsl(var(--shadow-color)/0.2)] backdrop-blur-xl"
                data-testid="channel-notification-settings-menu"
                onPointerDown={(event) => event.stopPropagation()}
                role="menu"
                style={{
                  left: visibleNotificationMenuPosition.left,
                  top: visibleNotificationMenuPosition.top,
                  width: visibleNotificationMenuPosition.width,
                }}
              >
                {(["all", "mentions", "muted"] as const).map((level) => {
                  const Icon = level === "muted" ? BellOff : level === "mentions" ? AtSign : Bell;

                  return (
                    <button
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-app-foreground transition hover:bg-app-surface-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] disabled:cursor-wait disabled:opacity-70"
                      disabled={notificationSettingsMutation.isPending}
                      key={level}
                      onClick={() => {
                        notificationSettingsMutation.mutate(level);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Icon className="h-4 w-4 text-app-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block">{t(`chat.notifications.${level}`)}</span>
                        <span className="block text-[0.6875rem] font-medium text-app-muted">
                          {t(`chat.notifications.${level}Hint`)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
      {mode === "channel" &&
      shouldShowInfoDrawer &&
      serverMembersQuery.data &&
      typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90] xl:hidden" data-testid="mobile-info-drawer-root">
              <div
                className="absolute inset-0 bg-[hsl(var(--backdrop)/0.5)] backdrop-blur-xs"
                data-testid="mobile-info-drawer-backdrop"
                onClick={() => setIsMembersDrawerRequested(false)}
                role="presentation"
              />
              <div
                aria-label={t("shell.channelSidebar.memberView")}
                aria-modal="true"
                className="absolute inset-y-0 right-0 max-w-full overflow-hidden rounded-l-[1.875rem] shadow-[0_26px_70px_hsl(var(--shadow-color)/0.18)] transition-transform duration-200 ease-out motion-reduce:transition-none"
                data-testid="mobile-info-drawer"
                role="dialog"
                style={{ width: RESPONSIVE_SHELL_SIZES.infoDrawerWidth }}
              >
                <ServerMemberPanel
                  detail={serverMembersQuery.data}
                  onClose={() => setIsMembersDrawerRequested(false)}
                  variant="drawer"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
      {mode === "dm" ? (
        <ConversationHeader
          {...(isGroupConversation
            ? {
                ...(directMessageConversation?.avatarColor
                  ? { avatarColor: directMessageConversation.avatarColor }
                  : {}),
                memberCount:
                  directMessageConversation?.memberCount ??
                  directMessageConversation?.participants.length ??
                  0,
                ...(directMessageConversation?.onlineCount === undefined
                  ? {}
                  : { onlineCount: directMessageConversation.onlineCount }),
                name: groupTitle,
                pinned: Boolean(directMessageConversation?.pinnedAt),
                // Yığın roster'ın tamamını istemiyor: dört kayıt yeter, sayaç
                // `memberCount`'tan geliyor.
                previewMembers: (directMessageConversation?.participants ?? []).slice(0, 4),
                variant: "group" as const,
              }
            : {
                avatarUrl: directMessageParticipant?.avatarUrl ?? null,
                customStatus: directMessageParticipant?.customStatus ?? null,
                lastSeenAt: directMessageParticipant?.lastSeenAt ?? null,
                name:
                  directMessageParticipant?.displayName ??
                  directMessageParticipant?.username ??
                  conversationId,
                status: directMessageParticipant?.status ?? "OFFLINE",
                username: directMessageParticipant?.username ?? null,
                variant: "dm" as const,
              })}
          callDisabled={Boolean(callSession)}
          onOpenMore={onOpenDirectMessageDetails}
          onOpenSearch={toggleSearchPanel}
          onOpenPins={() => setPinnedSheetOpen(true)}
          onStartVideoCall={() => startDirectCall(true)}
          onStartVoiceCall={() => startDirectCall(false)}
          openPanel={showSearch ? "search" : selectedThread ? "thread" : null}
        />
      ) : null}

      {mode === "channel" ? (
        <div
          className="sticky top-0 z-30 min-w-0 px-2 py-1 backdrop-blur-xl md:px-4 md:py-2"
          data-testid="chat-channel-header"
        >
          <div className="flex min-h-11 min-w-0 items-center gap-2 p-1 md:min-h-12 md:gap-3 md:p-1.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.875rem] bg-[hsl(var(--primary)/0.1)] text-[var(--primary-readable)] md:h-10 md:w-10 md:rounded-[1rem]">
              <Hash className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-bold text-app-foreground sm:text-base md:text-lg">
                  {channelTitle}
                </h1>
                {channelLocked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden="true" />
                ) : null}
              </div>
              {channelDescription ? (
                <p className="mt-0.5 hidden truncate text-[0.6875rem] font-medium text-app-muted min-[420px]:block sm:text-xs">
                  {channelDescription}
                </p>
              ) : null}
            </div>

            <div className="flex max-w-[calc(100vw-12rem)] shrink-0 items-center gap-0.5 overflow-x-auto rounded-[1rem] bg-[hsl(var(--surface-soft)/0.34)] p-0.5 backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] sm:max-w-none sm:gap-1 sm:p-1 [&::-webkit-scrollbar]:hidden">
              {hasPinnedMessages ? (
                <div className="relative">
                  <button
                    aria-expanded={showPinnedMessages}
                    aria-label={t("chat.pins.title", { count: pinnedMessages.length })}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-2xl px-2 py-1.5 text-xs font-bold text-app-foreground transition hover:bg-[hsl(var(--surface-card)/0.66)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] sm:px-3"
                    data-testid="channel-pins-toggle"
                    onClick={() => setIsPinnedMessagesRequested((current) => !current)}
                    type="button"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">
                      {t("chat.pins.title", { count: pinnedMessages.length })}
                    </span>
                    <ChevronDown className="hidden h-3 w-3 lg:block" />
                  </button>

                  {showPinnedMessages ? (
                    <div
                      className="absolute right-0 top-[calc(100%+0.55rem)] z-[90] max-h-[min(48dvh,26rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-[1.625rem] border border-[hsl(var(--border)/0.82)] bg-[hsl(var(--background))] p-3 shadow-[0_32px_80px_hsl(var(--shadow-color)/0.3)] ring-1 ring-[hsl(var(--background)/0.9)]"
                      data-testid="channel-pins-list"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 px-2 py-1.5">
                        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-app-soft">
                          {t("chat.pins.pinnedMessages")}
                        </p>
                        <button
                          aria-label={t("common.close")}
                          className="rounded-full p-1 text-app-muted transition hover:bg-app-surface-soft hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                          onClick={() => setIsPinnedMessagesRequested(false)}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        {pinnedMessages.map((message) => (
                          <button
                            className="grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-[1.25rem] border border-[hsl(var(--border)/0.56)] bg-[hsl(var(--surface-card))] px-3 py-2.5 text-left shadow-[0_12px_28px_hsl(var(--shadow-color)/0.07)] transition hover:border-[hsl(var(--primary)/0.34)] hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
                            key={message.id}
                            onClick={() => {
                              setIsPinnedMessagesRequested(false);
                              jumpToMessage(message.id);
                            }}
                            type="button"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] text-[var(--primary-readable)] shadow-[0_10px_24px_hsl(var(--primary)/0.1)]">
                              <Pin className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-bold text-app-foreground">
                                  {message.author.displayName}
                                </span>
                                <span className="shrink-0 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[0.625rem] font-black uppercase tracking-[0.13em] text-[hsl(var(--primary))]">
                                  {t("chat.pins.badge")}
                                </span>
                              </span>
                              <span className="mt-1 block line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-app-muted">
                                {message.content || t("chat.pins.attachmentOnly")}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="relative">
                <button
                  aria-expanded={showNotificationMenu}
                  aria-haspopup="menu"
                  aria-label={t("chat.notifications.openSettings")}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-2xl px-2 py-1.5 text-xs font-bold text-app-foreground transition hover:bg-[hsl(var(--surface-card)/0.66)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] sm:px-3"
                  data-testid="channel-notification-settings-open"
                  onClick={() => setShowNotificationMenu((current) => !current)}
                  ref={notificationButtonRef}
                  type="button"
                >
                  <NotificationIcon className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">
                    {t(`chat.notifications.${notificationLevel}`)}
                  </span>
                </button>
              </div>
              <button
                aria-expanded={showMembersDrawer}
                aria-label={t("shell.channelSidebar.memberView")}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-2xl px-2 py-1.5 text-app-foreground transition hover:bg-[hsl(var(--surface-card)/0.66)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] disabled:cursor-wait disabled:opacity-60 sm:px-3 xl:hidden"
                data-testid="members-drawer-open"
                disabled={!serverMembersQuery.data}
                onClick={openInfoDrawer}
                type="button"
              >
                <Users className="h-3.5 w-3.5" />
              </button>
              <button
                aria-expanded={showSearch}
                aria-label={t("chat.search.open")}
                className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-2xl px-2 py-1.5 text-xs font-bold text-app-foreground transition hover:bg-[hsl(var(--surface-card)/0.66)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] sm:px-3"
                data-testid="message-search-open"
                onClick={openSearch}
                ref={searchButtonRef}
                type="button"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{t("chat.search.open")}</span>
              </button>
            </div>
          </div>

          {showSearch ? (
            <MessageSearchPanel
              anchorRef={searchButtonRef}
              conversationId={conversationId}
              mode={mode}
              onClose={closeSearch}
              onJumpToMessage={jumpToMessage}
            />
          ) : null}
        </div>
      ) : null}

      {mode !== "channel" && !directMessageParticipant ? (
        <div className="relative z-20 bg-transparent px-3 py-1 md:px-4" data-testid="chat-toolbar">
          <div className="flex items-center justify-between gap-3">
            <div className="relative min-w-0 flex-1">
              {hasPinnedMessages ? (
                <>
                  <button
                    aria-expanded={showPinnedMessages}
                    className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--surface-card)/0.24)] px-2.5 text-[0.6875rem] font-bold text-[hsl(var(--primary))] shadow-[0_8px_18px_hsl(var(--primary)/0.06)] backdrop-blur-md transition hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--primary)/0.10)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    data-testid="channel-pins-toggle"
                    onClick={() => setIsPinnedMessagesRequested((current) => !current)}
                    type="button"
                  >
                    <Pin className="h-3 w-3" />
                    {t("chat.pins.title", { count: pinnedMessages.length })}
                    <ChevronDown className="h-3 w-3" />
                  </button>

                  {showPinnedMessages ? (
                    <div
                      className="absolute left-0 top-[calc(100%+0.45rem)] z-[90] max-h-[min(48dvh,26rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-[1.625rem] border border-[hsl(var(--border)/0.82)] bg-[hsl(var(--background))] p-3 shadow-[0_32px_80px_hsl(var(--shadow-color)/0.3)] ring-1 ring-[hsl(var(--background)/0.9)]"
                      data-testid="channel-pins-list"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 px-2 py-1.5">
                        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-app-soft">
                          {t("chat.pins.pinnedMessages")}
                        </p>
                        <button
                          aria-label={t("common.close")}
                          className="rounded-full p-1 text-app-muted transition hover:bg-app-surface-soft hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                          onClick={() => setIsPinnedMessagesRequested(false)}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        {pinnedMessages.map((message) => (
                          <button
                            className="grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-[1.25rem] border border-[hsl(var(--border)/0.56)] bg-[hsl(var(--surface-card))] px-3 py-2.5 text-left shadow-[0_12px_28px_hsl(var(--shadow-color)/0.07)] transition hover:border-[hsl(var(--primary)/0.34)] hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
                            key={message.id}
                            onClick={() => {
                              setIsPinnedMessagesRequested(false);
                              jumpToMessage(message.id);
                            }}
                            type="button"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] text-[var(--primary-readable)] shadow-[0_10px_24px_hsl(var(--primary)/0.1)]">
                              <Pin className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-bold text-app-foreground">
                                  {message.author.displayName}
                                </span>
                                <span className="shrink-0 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[0.625rem] font-black uppercase tracking-[0.13em] text-[hsl(var(--primary))]">
                                  {t("chat.pins.badge")}
                                </span>
                              </span>
                              <span className="mt-1 block line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-app-muted">
                                {message.content || t("chat.pins.attachmentOnly")}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="inline-flex w-fit max-w-full shrink-0 items-center gap-1 rounded-[1.25rem] border border-[hsl(var(--border)/0.22)] bg-[hsl(var(--surface-card)/0.20)] p-1 shadow-[0_12px_28px_hsl(var(--shadow-color)/0.04)] backdrop-blur-md">
              <button
                aria-expanded={showSearch}
                aria-label={t("chat.search.open")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-bold text-app-foreground transition hover:bg-[hsl(var(--surface-card)/0.55)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] md:min-h-9"
                data-testid="message-search-open"
                onClick={openSearch}
                ref={searchButtonRef}
                type="button"
              >
                <Search className="h-3.5 w-3.5" />
                {t("chat.search.open")}
                <span className="hidden rounded-full border border-[hsl(var(--border)/0.58)] px-1.5 py-0.5 text-[0.625rem] text-app-soft sm:inline">
                  Ctrl K
                </span>
              </button>
            </div>
          </div>

          {showSearch ? (
            <MessageSearchPanel
              anchorRef={searchButtonRef}
              conversationId={conversationId}
              mode={mode}
              onClose={closeSearch}
              onJumpToMessage={jumpToMessage}
            />
          ) : null}
        </div>
      ) : null}

      {isChannelReadOnly ? (
        <div
          className="border-b border-[hsl(var(--warning)/0.22)] bg-[hsl(var(--warning)/0.08)] px-3 py-3 backdrop-blur-xl md:px-5"
          data-testid="channel-read-only-banner"
        >
          <div className="flex items-start gap-3 rounded-[1.375rem] border border-[hsl(var(--warning)/0.22)] bg-[hsl(var(--surface-card)/0.72)] px-3 py-3 shadow-[0_14px_36px_hsl(var(--shadow-color)/0.08)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--warning)/0.14)] text-[var(--warning-readable)]">
              <Lock className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-app-foreground">
                {t("chat.channel.readOnlyTitle")}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-app-muted">
                {t("chat.channel.readOnlyDescription")}
              </span>
            </span>
          </div>
        </div>
      ) : null}

      {mode === "dm" && showCallView && activeCallSession ? (
        <DmCallView
          onLeave={() => {
            void endCall();
          }}
          session={activeCallSession}
        />
      ) : mode === "dm" ? (
        /*
         * SPEC §6: ana alan ve sağ panel yan yana duran iki sütun. Panel eskiden
         * ana alanın **üstüne** binen bir diyalogdu; yerleşik hâlde sohbet
         * okunmaya devam ediyor ve arama sonucuna tıklayıp sohbet değiştirmek
         * paneli kapatmıyor.
         */
        <div className="relative flex min-h-0 flex-1" data-testid="messages-screen-root">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="messages-main">
            <DmMessageSurface>{messageConversationContent}</DmMessageSurface>
          </div>

          {/*
            Overlay hâlinde perde: panel ana alanın üstüne bindiğinde altındaki
            sohbet hâlâ tıklanabilir kalsaydı, kullanıcı görünmeyen bir satıra
            basıp paneli kapatmadan başka bir sohbete geçebilirdi.
          */}
          {sidePanel && overlaySidePanel ? (
            <div
              className="absolute inset-0 z-40 bg-[hsl(var(--backdrop)/0.52)] backdrop-blur-xs"
              data-testid="messages-panel-backdrop"
              onClick={() => {
                closeSearch();
                setSelectedThread(null);
              }}
              role="presentation"
            />
          ) : null}
          {sidePanel}
        </div>
      ) : (
        /*
         * Kanal tarafı da aynı iki sütunu kullanıyor. Eskiden thread paneli
         * `mode !== "dm"` kapısının arkasındaydı: kanalda bir mesajın thread'ini
         * açmak hiçbir şey çizmiyordu. Panel sohbet türünden bağımsız.
         */
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{messageConversationContent}</div>

          {sidePanel && overlaySidePanel ? (
            <div
              className="absolute inset-0 z-40 bg-[hsl(var(--backdrop)/0.52)] backdrop-blur-xs"
              data-testid="messages-panel-backdrop"
              onClick={() => {
                setSelectedThread(null);
              }}
              role="presentation"
            />
          ) : null}
          {sidePanel}
        </div>
      )}

      {mode === "dm" ? (
        <PinnedListSheet
          onClose={() => setPinnedSheetOpen(false)}
          onJump={(messageId) => {
            setPinnedSheetOpen(false);
            jumpToMessage(messageId);
          }}
          onUnpin={(messageId) => handleTogglePin(messageId, true)}
          open={pinnedSheetOpen}
          pins={dmPinsQuery.data ?? EMPTY_PINS}
        />
      ) : null}

      {mode === "dm" ? (
        <ForwardMessageSheet
          conversations={forwardTargets}
          errorText={
            forwardMutation.isError
              ? forwardMutation.error instanceof MessagesClientError &&
                forwardMutation.error.code === "FORWARD_REQUIRES_TEXT"
                ? t("messages.conversation.menu.forwardNeedsText")
                : t("messages.conversation.menu.forwardFailed")
              : null
          }
          excludeConversationId={conversationId}
          onClose={() => {
            setForwardMessageId(null);
            forwardMutation.reset();
          }}
          onSelect={(targetConversationId) => {
            if (forwardMessageId) {
              forwardMutation.mutate({ messageId: forwardMessageId, targetConversationId });
            }
          }}
          open={forwardMessageId !== null}
        />
      ) : null}

      {mode === "dm" ? (
        <Modal
          className="max-w-xl"
          onClose={() => setPollComposerOpen(false)}
          open={pollComposerOpen}
          title={t("messages.pollModal.title")}
        >
          <PollComposer
            conversationName={
              isGroupConversation
                ? groupTitle
                : (directMessageParticipant?.displayName ??
                  directMessageParticipant?.username ??
                  conversationId)
            }
            // karar #12: 1:1 sohbette iki kişi oy verebilir.
            eligibleVoterCount={
              isGroupConversation
                ? (directMessageConversation?.memberCount ??
                  directMessageConversation?.participants.length ??
                  0)
                : 2
            }
            isSubmitting={createPollMutation.isPending}
            onCancel={() => setPollComposerOpen(false)}
            onSubmit={(request) => createPollMutation.mutate({ ...request, conversationId })}
          />
        </Modal>
      ) : null}
    </div>
  );
}
