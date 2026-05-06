"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Bell, BellOff, ChevronDown, Lock, MonitorUp, Phone, Pin, Search, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChatMessage,
  DMMessagePayload,
  DMParticipantDTO,
  MessageAttachment,
  UploadedAttachmentInput,
} from "@wizards/types";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { MessageSearchPanel } from "./message-search-panel";
import { ThreadPanel } from "./thread-panel";
import { TypingIndicator } from "./typing-indicator";
import {
  DMScreenSharePanel,
  IncomingDMScreenShareModal,
} from "./dm-screen-share";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  appendMessage,
  getMessagesQueryKey,
  type MessageMode,
  type MessagePages,
} from "@/hooks/use-messages";
import { useSocket } from "@/hooks/use-socket";
import { useDMScreenShare } from "@/hooks/use-dm-screen-share";
import { useTyping } from "@/hooks/use-typing";
import {
  fetchChannelNotificationSettings,
  fetchChannelPinnedMessages,
  fetchWorkspaceServer,
  updateChannelNotificationSettings,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

interface ChatAreaProps {
  conversationId: string;
  mode: MessageMode;
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  channelLocked?: boolean;
  channelName?: string;
  channelTopic?: string | null;
  currentUserId: string;
  currentUserDisplayName: string;
  currentUserUsername: string;
  canModerate: boolean;
  directMessageParticipant?: DMParticipantDTO | null;
  initialUnreadMessageId?: string | null;
  messageCharacterLimit?: number | null;
  serverId?: string;
  uploadthingEnabled: boolean;
}

function getStatusDotClass(status: DMParticipantDTO["status"] | undefined) {
  if (status === "ONLINE") {
    return "bg-[hsl(var(--success))]";
  }

  if (status === "IDLE") {
    return "bg-[hsl(42_96%_56%)]";
  }

  if (status === "DND") {
    return "bg-[hsl(var(--danger))]";
  }

  return "bg-[hsl(var(--text-soft))]";
}

function getStatusKey(status: DMParticipantDTO["status"] | undefined) {
  if (status === "ONLINE") {
    return "friends.status.online";
  }

  if (status === "IDLE") {
    return "friends.status.idle";
  }

  if (status === "DND") {
    return "friends.status.dnd";
  }

  return "friends.status.offline";
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
  };
}

type PendingMessagePayload = {
  attachments: UploadedAttachmentInput[];
  content: string;
  optimisticAttachments: MessageAttachment[];
  replyTo:
    | {
        authorName: string;
        content: string;
        id: string;
      }
    | null;
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
  const left = Math.min(
    Math.max(rect.right - width, margin),
    window.innerWidth - width - margin,
  );
  const top = Math.min(rect.bottom + gap, window.innerHeight - margin);

  return { left, top, width };
}

export function ChatArea({
  conversationId,
  mode,
  allowFileUploads = true,
  allowGifs = true,
  channelLocked = false,
  channelTopic = null,
  currentUserId,
  currentUserDisplayName,
  currentUserUsername,
  canModerate,
  directMessageParticipant = null,
  initialUnreadMessageId = null,
  messageCharacterLimit = 2000,
  serverId,
  uploadthingEnabled,
}: ChatAreaProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const serverMembersQuery = useQuery({
    enabled: mode === "channel" && Boolean(serverId),
    queryFn: () => fetchWorkspaceServer(serverId!),
    queryKey: serverId
      ? workspaceQueryKeys.server(serverId)
      : ["workspace", "server", "idle"],
    staleTime: 30_000,
  });
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
  const dmScreenShare = useDMScreenShare({
    conversationId,
    currentUserDisplayName,
    currentUserId,
    currentUserUsername,
  });
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
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  const [notificationMenuPosition, setNotificationMenuPosition] =
    useState<FloatingPanelPosition | null>(null);

  const queryKey = useMemo(
    () => getMessagesQueryKey(mode, conversationId),
    [conversationId, mode],
  );
  const visibleChannelTopic = useMemo(() => {
    const normalized = channelTopic?.trim() ?? "";
    if (
      normalized === "Start the conversation and share the first update here."
    ) {
      return "";
    }

    return normalized;
  }, [channelTopic]);

  const handleReply = useCallback((id: string, authorName: string, content: string) => {
    setReplyTo({ id, authorName, content });
  }, []);

  useEffect(() => {
    setSelectedThread(null);
    setShowPinnedMessages(false);
    setShowSearch(false);
    setShowNotificationMenu(false);
  }, [conversationId, mode]);

  const updateNotificationMenuPosition = useCallback(() => {
    setNotificationMenuPosition(getFloatingPanelPosition(notificationButtonRef.current));
  }, []);

  useEffect(() => {
    if (!showNotificationMenu) {
      setNotificationMenuPosition(null);
      return;
    }

    updateNotificationMenuPosition();

    window.addEventListener("resize", updateNotificationMenuPosition);
    window.addEventListener("scroll", updateNotificationMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateNotificationMenuPosition);
      window.removeEventListener("scroll", updateNotificationMenuPosition, true);
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
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && (event.key === "k" || event.key === "f");
      if (!isShortcut) {
        return;
      }

      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === "f" && isTypingTarget) {
        return;
      }

      event.preventDefault();
      setShowSearch(true);
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
          data.code === "INVALID_ATTACHMENT" ||
          data.code === "RATE_LIMIT" ||
          data.code === "CHANNEL_LOCKED" ||
          data.code === "FILE_UPLOADS_DISABLED" ||
          data.code === "GIFS_DISABLED"
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
    const clearConfirmedPending = (message: {
      attachments?: Array<{ id: string }>;
      author?: { id: string };
      content: string;
    }) => {
      if (message.author?.id !== currentUserId) {
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
          pendingMessagesRef.current.delete(tempId);
          pendingOrderRef.current = pendingOrderRef.current.filter((id) => id !== tempId);
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

  const handleSend = useCallback(
    async (
      content: string,
      replyToId?: string,
      attachments: UploadedAttachmentInput[] = [],
      optimisticAttachments: MessageAttachment[] = [],
    ) => {
      const tempId = `optimistic-${Date.now()}`;
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
          content,
          attachments,
          ...(replyToId ? { replyToId } : {}),
        });
      } else {
        socket.emit("dm:message:send", {
          conversationId,
          content,
          attachments,
          ...(replyToId ? { replyToId } : {}),
        });
      }

      setReplyTo(null);
    },
    [
      conversationId,
      currentUserDisplayName,
      currentUserId,
      currentUserUsername,
      mode,
      queryClient,
      queryKey,
      replyTo,
      socket,
    ],
  );

  const retryOptimisticMessage = useCallback(
    (messageId: string) => {
      const payload = pendingMessagesRef.current.get(messageId);
      if (!payload) {
        removeOptimisticMessage(messageId);
        return;
      }

      markOptimisticMessageSending(messageId);

      if (mode === "channel") {
        socket.emit("message:send", {
          channelId: conversationId,
          content: payload.content,
          attachments: payload.attachments,
          ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
        });
        return;
      }

      socket.emit("dm:message:send", {
        conversationId,
        content: payload.content,
        attachments: payload.attachments,
        ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
      });
    },
    [
      conversationId,
      markOptimisticMessageSending,
      mode,
      removeOptimisticMessage,
      socket,
    ],
  );

  const directMessageDisplayName =
    directMessageParticipant?.displayName ?? directMessageParticipant?.username ?? null;
  const directMessageStatusLabel = directMessageParticipant
    ? directMessageParticipant.customStatus ?? t(getStatusKey(directMessageParticipant.status))
    : t("dm.header.directMessage");
  const isChannelReadOnly = mode === "channel" && channelLocked && !canModerate;
  const pinnedMessages = pinnedMessagesQuery.data ?? [];
  const hasPinnedMessages = mode === "channel" && pinnedMessages.length > 0;
  const notificationLevel = notificationSettingsQuery.data?.level ?? "all";
  const NotificationIcon =
    notificationLevel === "muted"
      ? BellOff
      : notificationLevel === "mentions"
        ? AtSign
        : Bell;

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

  const closeThreadPanel = useCallback(() => {
    setSelectedThread(null);

    window.requestAnimationFrame(() => {
      const mainComposerInput = document.querySelector<HTMLTextAreaElement>(
        '[data-composer-variant="default"] [data-testid="message-input"]',
      );
      mainComposerInput?.focus({ preventScroll: true });
    });
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-transparent">
      {showNotificationMenu &&
      notificationMenuPosition &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000]"
              onPointerDown={() => setShowNotificationMenu(false)}
              role="presentation"
            >
              <div
                className="app-panel fixed rounded-[22px] border bg-[hsl(var(--surface-card))] p-2 shadow-[0_28px_70px_hsl(var(--shadow-color)/0.2)] backdrop-blur-xl"
                data-testid="channel-notification-settings-menu"
                onPointerDown={(event) => event.stopPropagation()}
                role="menu"
                style={{
                  left: notificationMenuPosition.left,
                  top: notificationMenuPosition.top,
                  width: notificationMenuPosition.width,
                }}
              >
                {(["all", "mentions", "muted"] as const).map((level) => {
                  const Icon =
                    level === "muted" ? BellOff : level === "mentions" ? AtSign : Bell;

                  return (
                    <button
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-app-foreground transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] disabled:cursor-wait disabled:opacity-70"
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
                        <span className="block text-[11px] font-medium text-app-muted">
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
      {mode === "dm" && directMessageParticipant ? (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-app-border bg-[hsl(var(--surface-card)/0.78)] px-3 py-3 backdrop-blur-xl md:px-5 md:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative">
              <Avatar
                alt={directMessageDisplayName ?? t("dm.sidebar.unknownUser")}
                className="h-10 w-10 text-sm md:h-11 md:w-11"
                fallback={directMessageDisplayName ?? t("dm.sidebar.unknownUser")}
                src={directMessageParticipant.avatarUrl}
              />
              <span
                aria-hidden="true"
                className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--surface-card))] ${getStatusDotClass(directMessageParticipant.status)}`}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-foreground">
                {directMessageDisplayName ?? t("dm.sidebar.unknownUser")}
              </p>
              <p className="truncate text-xs text-app-muted">{directMessageStatusLabel}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label={t("dm.screenShare.share")}
              className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-2xl border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60 md:h-auto md:w-auto md:p-2.5"
              disabled={dmScreenShare.isStarting}
              onClick={() => {
                void dmScreenShare.startShare();
              }}
              title={t("dm.screenShare.share")}
              type="button"
            >
              <MonitorUp className="h-4 w-4" />
            </button>
            <button
              aria-label={t("dm.header.voiceCall")}
              className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-2xl border text-app-muted transition disabled:cursor-not-allowed disabled:opacity-60 md:h-auto md:w-auto md:p-2.5"
              disabled
              title={t("dm.header.voiceComingSoon")}
              type="button"
            >
              <Phone className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative border-b border-app-border bg-[hsl(var(--surface-card)/0.42)] px-3 py-2 backdrop-blur-xl md:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-app-soft sm:text-xs sm:normal-case sm:tracking-normal sm:text-app-muted">
            {mode === "channel"
              ? visibleChannelTopic.length > 0
                ? visibleChannelTopic
                : t("chat.search.channelHint")
              : t("chat.search.dmHint")}
          </p>
          <div className="inline-flex w-fit max-w-full shrink-0 items-center gap-1 rounded-[20px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.38)] p-1 shadow-[0_12px_28px_hsl(var(--shadow-color)/0.06)]">
            {mode === "channel" ? (
              <div className="relative">
                <button
                  aria-expanded={showNotificationMenu}
                  aria-haspopup="menu"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-bold text-app-foreground transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
                  data-testid="channel-notification-settings-open"
                  onClick={() => setShowNotificationMenu((current) => !current)}
                  ref={notificationButtonRef}
                  type="button"
                >
                  <NotificationIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {t(`chat.notifications.${notificationLevel}`)}
                  </span>
                </button>
              </div>
            ) : null}
            <button
              aria-expanded={showSearch}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-bold text-app-foreground transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
              data-testid="message-search-open"
              onClick={() => setShowSearch(true)}
              ref={searchButtonRef}
              type="button"
            >
              <Search className="h-3.5 w-3.5" />
              {t("chat.search.open")}
              <span className="hidden rounded-full border border-[hsl(var(--border)/0.58)] px-1.5 py-0.5 text-[10px] text-app-soft sm:inline">
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
            onClose={() => setShowSearch(false)}
            onJumpToMessage={jumpToMessage}
          />
        ) : null}
      </div>

      {hasPinnedMessages ? (
        <div className="relative border-b border-app-border bg-[hsl(var(--surface-card)/0.62)] px-3 py-2 backdrop-blur-xl md:px-5">
          <button
            aria-expanded={showPinnedMessages}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] px-3 py-1.5 text-xs font-bold text-[hsl(var(--primary))] shadow-[0_10px_24px_hsl(var(--primary)/0.08)] transition hover:bg-[hsl(var(--primary)/0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="channel-pins-toggle"
            onClick={() => setShowPinnedMessages((current) => !current)}
            type="button"
          >
            <Pin className="h-3.5 w-3.5" />
            {t("chat.pins.title", { count: pinnedMessages.length })}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {showPinnedMessages ? (
            <div
              className="app-panel absolute left-3 right-3 top-[calc(100%+0.5rem)] z-40 max-h-[42dvh] overflow-y-auto rounded-[26px] border p-2 shadow-[0_26px_60px_hsl(var(--shadow-color)/0.18)] md:left-5 md:right-auto md:w-[26rem]"
              data-testid="channel-pins-list"
            >
              <div className="mb-2 flex items-center justify-between gap-3 px-2 py-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-app-soft">
                  {t("chat.pins.pinnedMessages")}
                </p>
                <button
                  aria-label={t("common.close")}
                  className="rounded-full p-1 text-app-muted transition hover:bg-app-surface-soft hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  onClick={() => setShowPinnedMessages(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1">
                {pinnedMessages.map((message) => (
                  <button
                    className="flex w-full min-w-0 items-start gap-3 rounded-[20px] px-3 py-2 text-left transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
                    key={message.id}
                    onClick={() => {
                      setShowPinnedMessages(false);
                      jumpToMessage(message.id);
                    }}
                    type="button"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.6)] text-[hsl(var(--primary))]">
                      <Pin className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-app-foreground">
                        {message.author.displayName}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-app-muted">
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

      {isChannelReadOnly ? (
        <div className="border-b border-[hsl(var(--warning)/0.22)] bg-[hsl(var(--warning)/0.08)] px-3 py-3 backdrop-blur-xl md:px-5">
          <div className="flex items-start gap-3 rounded-[22px] border border-[hsl(var(--warning)/0.22)] bg-[hsl(var(--surface-card)/0.72)] px-3 py-3 shadow-[0_14px_36px_hsl(var(--shadow-color)/0.08)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))]">
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

      {mode === "dm" ? (
        <IncomingDMScreenShareModal
          incomingShare={dmScreenShare.incomingShare}
          onAccept={() => {
            void dmScreenShare.acceptIncomingShare();
          }}
          onDecline={dmScreenShare.declineIncomingShare}
        />
      ) : null}

      {mode === "dm" && dmScreenShare.error ? (
        <div className="border-b border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.08)] px-5 py-3">
          <p className="text-sm font-medium text-app-foreground">
            {dmScreenShare.error}
          </p>
        </div>
      ) : null}

      {mode === "dm" && dmScreenShare.activeShare ? (
        <DMScreenSharePanel
          activeShare={dmScreenShare.activeShare}
          connectionState={dmScreenShare.connectionState}
          onStopSharing={() => {
            void dmScreenShare.stopSharing();
          }}
          onStopViewing={() => {
            void dmScreenShare.stopViewing();
          }}
        />
      ) : (
        <>
          <MessageList
            conversationId={conversationId}
            mode={mode}
            currentUserId={currentUserId}
            canModerate={canModerate}
            initialUnreadMessageId={initialUnreadMessageId}
            onRemoveOptimistic={removeOptimisticMessage}
            onReply={handleReply}
            onRetry={retryOptimisticMessage}
            onThread={setSelectedThread}
          />
          <TypingIndicator typingUsers={typingUsers} />
          <MessageInput
            conversationId={conversationId}
            mode={mode}
            disabled={isChannelReadOnly}
            disabledReason={isChannelReadOnly ? t("chat.channel.readOnlyComposer") : undefined}
            replyTo={replyTo}
            onSend={handleSend}
            onCancelReply={() => setReplyTo(null)}
            allowFileUploads={mode === "channel" ? allowFileUploads : true}
            allowGifs={mode === "channel" ? allowGifs : true}
            maxLength={mode === "channel" ? messageCharacterLimit : 2000}
            mentionMembers={mode === "channel" ? serverMembersQuery.data?.members ?? [] : []}
            uploadthingEnabled={uploadthingEnabled}
          />
          {selectedThread ? (
            <ThreadPanel
              allowFileUploads={mode === "channel" ? allowFileUploads : true}
              allowGifs={mode === "channel" ? allowGifs : true}
              canModerate={canModerate}
              conversationId={conversationId}
              currentUserId={currentUserId}
              disabled={isChannelReadOnly}
              disabledReason={isChannelReadOnly ? t("chat.channel.readOnlyComposer") : undefined}
              mentionMembers={mode === "channel" ? serverMembersQuery.data?.members ?? [] : []}
              messageCharacterLimit={mode === "channel" ? messageCharacterLimit : 2000}
              mode={mode}
              onClose={closeThreadPanel}
              parentMessage={selectedThread}
              uploadthingEnabled={uploadthingEnabled}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
