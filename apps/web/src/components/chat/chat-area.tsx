"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonitorUp, Phone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ChatMessage,
  DMParticipantDTO,
  MessageAttachment,
  UploadedAttachmentInput,
} from "@wizards/types";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";
import { ClearChannelHistoryAction } from "./clear-channel-history-action";
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

interface ChatAreaProps {
  conversationId: string;
  mode: MessageMode;
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  channelName?: string;
  channelTopic?: string | null;
  currentUserId: string;
  currentUserDisplayName: string;
  currentUserUsername: string;
  canModerate: boolean;
  directMessageParticipant?: DMParticipantDTO | null;
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
    type: "DEFAULT",
    reactions: [],
    attachments: input.attachments,
    editedAt: null,
    deletedAt: null,
  };
}

export function ChatArea({
  conversationId,
  mode,
  allowFileUploads = true,
  allowGifs = true,
  channelName,
  channelTopic = null,
  currentUserId,
  currentUserDisplayName,
  currentUserUsername,
  canModerate,
  directMessageParticipant = null,
  serverId,
  uploadthingEnabled,
}: ChatAreaProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const { typingUsers } = useTyping(conversationId, mode);
  const dmScreenShare = useDMScreenShare({
    conversationId,
    currentUserDisplayName,
    currentUserId,
    currentUserUsername,
  });
  const tempIdRef = useRef<string | null>(null);
  const [replyTo, setReplyTo] = useState<{
    id: string;
    authorName: string;
    content: string;
  } | null>(null);

  const queryKey = useMemo(
    () => getMessagesQueryKey(mode, conversationId),
    [conversationId, mode],
  );

  const handleReply = useCallback((id: string, authorName: string, content: string) => {
    setReplyTo({ id, authorName, content });
  }, []);

  useEffect(() => {
    const rollbackOptimisticMessage = () => {
      if (!tempIdRef.current) {
        return;
      }

      const failedId = tempIdRef.current;
      queryClient.setQueryData<MessagePages>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((message) => message.id !== failedId),
          })),
        };
      });
      tempIdRef.current = null;
    };

    if (mode === "channel") {
      const handleError = (data: { code: string; message: string }) => {
        if (
          data.code === "MESSAGE_SEND_ERROR" ||
          data.code === "MESSAGE_VALIDATION_ERROR" ||
          data.code === "INVALID_ATTACHMENT" ||
          data.code === "RATE_LIMIT"
        ) {
          rollbackOptimisticMessage();
        }
      };

      socket.on("error", handleError);
      return () => {
        socket.off("error", handleError);
      };
    }

    const handleDMError = () => {
      rollbackOptimisticMessage();
    };

    socket.on("dm:error", handleDMError);
    return () => {
      socket.off("dm:error", handleDMError);
    };
  }, [mode, queryClient, queryKey, socket]);

  const handleSend = useCallback(
    (
      content: string,
      replyToId?: string,
      attachments: UploadedAttachmentInput[] = [],
      optimisticAttachments: MessageAttachment[] = [],
    ) => {
      const tempId = `optimistic-${Date.now()}`;
      tempIdRef.current = tempId;

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

  const directMessageDisplayName =
    directMessageParticipant?.displayName ?? directMessageParticipant?.username ?? null;
  const directMessageStatusLabel = directMessageParticipant
    ? directMessageParticipant.customStatus ?? t(getStatusKey(directMessageParticipant.status))
    : t("dm.header.directMessage");
  const showChannelAdminBar =
    mode === "channel" &&
    canModerate &&
    Boolean(channelName) &&
    Boolean(serverId);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-transparent">
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

      {showChannelAdminBar ? (
        <div className="border-b border-app-border bg-[hsl(var(--surface-card)/0.56)] px-3 py-3 backdrop-blur-xl md:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.18em]">
                {t("chat.channel.adminTools")}
              </p>
              <p className="mt-1 truncate text-xs text-app-muted">
                {channelTopic && channelTopic.trim().length > 0
                  ? channelTopic
                  : t("chat.channel.clearHistoryHelp")}
              </p>
            </div>
            <ClearChannelHistoryAction
              channelId={conversationId}
              channelName={channelName!}
              serverId={serverId!}
            />
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
            onReply={handleReply}
          />
          <TypingIndicator typingUsers={typingUsers} />
          <MessageInput
            conversationId={conversationId}
            mode={mode}
            replyTo={replyTo}
            onSend={handleSend}
            onCancelReply={() => setReplyTo(null)}
            allowFileUploads={mode === "channel" ? allowFileUploads : true}
            allowGifs={mode === "channel" ? allowGifs : true}
            uploadthingEnabled={uploadthingEnabled}
          />
        </>
      )}
    </div>
  );
}
