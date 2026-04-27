"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatMessage, DMParticipantDTO } from "@wizards/types";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  appendMessage,
  getMessagesQueryKey,
  type MessageMode,
  type MessagePages,
} from "@/hooks/use-messages";
import { useSocket } from "@/hooks/use-socket";
import { useTyping } from "@/hooks/use-typing";

interface ChatAreaProps {
  conversationId: string;
  mode: MessageMode;
  currentUserId: string;
  currentUserDisplayName: string;
  currentUserUsername: string;
  canModerate: boolean;
  directMessageParticipant?: DMParticipantDTO | null;
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
    attachments: [],
    editedAt: null,
    deletedAt: null,
  };
}

export function ChatArea({
  conversationId,
  mode,
  currentUserId,
  currentUserDisplayName,
  currentUserUsername,
  canModerate,
  directMessageParticipant = null,
}: ChatAreaProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const { typingUsers } = useTyping(conversationId, mode);
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
        if (data.code === "MESSAGE_SEND_ERROR" || data.code === "RATE_LIMIT") {
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
    (content: string, replyToId?: string) => {
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
          }),
        ),
      );

      if (mode === "channel") {
        socket.emit("message:send", {
          channelId: conversationId,
          content,
          ...(replyToId ? { replyToId } : {}),
        });
      } else {
        socket.emit("dm:message:send", {
          conversationId,
          content,
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

  return (
    <div className="flex h-full flex-col bg-app-background">
      {mode === "dm" && directMessageParticipant ? (
        <div className="flex items-center justify-between gap-3 border-b border-app-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative">
              <Avatar
                alt={directMessageDisplayName ?? t("dm.sidebar.unknownUser")}
                className="h-11 w-11 text-sm"
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

          <button
            aria-label={t("dm.header.voiceCall")}
            className="app-panel-soft rounded-2xl border p-2 text-app-muted transition disabled:cursor-not-allowed disabled:opacity-60"
            disabled
            title={t("dm.header.voiceComingSoon")}
            type="button"
          >
            <Phone className="h-4 w-4" />
          </button>
        </div>
      ) : null}

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
      />
    </div>
  );
}
