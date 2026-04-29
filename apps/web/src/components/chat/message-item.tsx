"use client";

import React, { useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageMode } from "@/hooks/use-messages";
import { Avatar } from "@/components/ui/avatar";
import { UserProfilePopover } from "@/components/shared/user-profile-popover";
import { MessageEditor } from "./message-editor";
import { MessageAttachments } from "./message-attachments";
import { MessageToolbar } from "./message-toolbar";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import type { ChatMessage } from "@wizards/types";
import { cn } from "@/lib/utils";

interface MessageItemProps {
  mode: MessageMode;
  message: ChatMessage;
  isGrouped: boolean;
  showGroupSeparator: boolean;
  currentUserId: string;
  canModerate: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (id: string, author: string, content: string) => void;
}

export const MessageItem = React.memo(
  function MessageItem({
    mode,
    message,
    isGrouped,
    showGroupSeparator,
    currentUserId,
    canModerate,
    onReact,
    onReply,
  }: MessageItemProps) {
    const { locale, t } = useI18n();
    const socket = useSocket();
    const [isEditing, setIsEditing] = useState(false);
    const isOwner = message.author.id === currentUserId;
    const isDeleted = message.deletedAt !== null;
    const isOptimistic = message.id.startsWith("optimistic-");
    const formattedTime = new Date(message.createdAt).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });

    const handleEdit = (newContent: string) => {
      if (newContent.trim()) {
        if (mode === "channel") {
          socket.emit("message:edit", { messageId: message.id, content: newContent.trim() });
        } else {
          socket.emit("dm:message:edit", {
            messageId: message.id,
            content: newContent.trim(),
          });
        }
      }
      setIsEditing(false);
    };

    const handleDelete = () => {
      if (window.confirm(t("chat.message.deleteConfirm"))) {
        if (mode === "channel") {
          socket.emit("message:delete", message.id);
        } else {
          socket.emit("dm:message:delete", { messageId: message.id });
        }
      }
    };

    if (message.type !== "DEFAULT") {
      const Icon = message.type === "SYSTEM_LEAVE" ? UserMinus : UserPlus;
      const systemContent =
        message.type === "SYSTEM_LEAVE"
          ? t("chat.message.systemLeave", { name: message.author.displayName })
          : t("chat.message.systemJoin", { name: message.author.displayName });

      return (
        <div className="px-2 py-3 sm:px-4">
          <div className="app-system-message mx-auto flex max-w-xl items-center justify-center gap-3 rounded-full border px-4 py-2 text-xs font-medium">
            <Icon className="app-system-message-icon h-3.5 w-3.5" />
            <span>{systemContent}</span>
          </div>
        </div>
      );
    }

    if (isDeleted) {
      return (
        <div className="px-4 py-1 text-xs italic text-app-muted">
          {t("chat.message.deleted")}
        </div>
      );
    }

    return (
      <div
        className={cn(
          "group relative px-1 transition sm:px-4",
          isOptimistic && "opacity-60",
        )}
      >
        {showGroupSeparator ? (
          <div className="absolute inset-x-1 top-0 h-px bg-[hsl(var(--border)/0.34)] sm:inset-x-4" />
        ) : null}

        <div
          className={cn(
            "grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 rounded-2xl transition hover:bg-[hsl(var(--surface-soft)/0.28)] sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-3",
            isGrouped ? "min-h-[36px] py-1.5" : "min-h-[56px] py-2",
          )}
        >
          <div className="flex justify-center pt-0.5">
            {isGrouped ? (
              <span className="w-10 text-right text-[11px] text-app-soft opacity-0 transition group-hover:opacity-100">
                {formattedTime}
              </span>
            ) : (
              <UserProfilePopover userId={message.author.id} currentUserId={currentUserId}>
                <Avatar
                  src={message.author.avatarUrl}
                  alt={message.author.displayName}
                  className="h-9 w-9 flex-shrink-0 sm:h-10 sm:w-10"
                  fallback={message.author.displayName[0] || "?"}
                />
              </UserProfilePopover>
            )}
          </div>

          <div className="relative min-w-0 pr-32 sm:pr-24 md:pr-36">
            {!isGrouped && (
              <div className="flex items-center gap-2 pr-2">
                <span className="font-semibold text-app-foreground text-sm">
                  {message.author.displayName}
                </span>
                <span className="shrink-0 text-xs text-app-muted">{formattedTime}</span>
              </div>
            )}

            {message.replyTo && !isEditing && (
              <div className="mb-1.5 flex items-start gap-1.5 rounded border-l-2 border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--surface-soft)/0.4)] px-2 py-1">
                <span className="shrink-0 text-[11px] font-medium text-[hsl(var(--primary))]">
                  {message.replyTo.authorName}
                </span>
                <p className="min-w-0 truncate text-[11px] text-app-muted">
                  {message.replyTo.content}
                </p>
              </div>
            )}

            {isEditing ? (
              <MessageEditor
                initialContent={message.content}
                onSave={handleEdit}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <div className="text-app-foreground break-words text-sm leading-6 [&_a]:text-[hsl(var(--primary))] [&_code]:break-words [&_ol]:my-2 [&_p]:m-0 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_ul]:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {!isEditing ? <MessageAttachments attachments={message.attachments} /> : null}

            {message.editedAt && !isEditing && (
              <span className="text-xs text-app-muted italic">{t("chat.message.edited")}</span>
            )}

            {message.reactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {message.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    className={cn(
                      "rounded-full px-2 py-1 text-xs transition",
                      reaction.userIds.includes(currentUserId)
                        ? "border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.14)] text-app-foreground"
                        : "bg-app-surface-soft hover:bg-app-surface",
                    )}
                    onClick={() => onReact(message.id, reaction.emoji)}
                    type="button"
                  >
                    {reaction.emoji} {reaction.count}
                  </button>
                ))}
              </div>
            )}

            {!isEditing ? (
              <div className="pointer-events-none absolute right-0 top-0 flex w-32 justify-end opacity-100 transition sm:w-24 md:w-32 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                {!isOptimistic ? (
                  <MessageToolbar
                    allowReact
                    className="pointer-events-auto"
                    messageId={message.id}
                    isOwner={isOwner}
                    canModerate={canModerate}
                    onReact={(emoji) => onReact(message.id, emoji)}
                    onReply={() => onReply(message.id, message.author.displayName, message.content)}
                    onEdit={() => setIsEditing(true)}
                    onDelete={handleDelete}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.mode === next.mode &&
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.attachments === next.message.attachments &&
    prev.message.reactions === next.message.reactions &&
    prev.message.editedAt === next.message.editedAt &&
    prev.message.deletedAt === next.message.deletedAt &&
    prev.message.replyTo?.id === next.message.replyTo?.id &&
    prev.isGrouped === next.isGrouped &&
    prev.showGroupSeparator === next.showGroupSeparator &&
    prev.currentUserId === next.currentUserId &&
    prev.canModerate === next.canModerate &&
    prev.onReact === next.onReact &&
    prev.onReply === next.onReply,
);
