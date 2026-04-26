"use client";

import React, { useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar } from "@/components/ui/avatar";
import { MessageEditor } from "./message-editor";
import { MessageToolbar } from "./message-toolbar";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import type { ChatMessage } from "@wizards/types";
import { cn } from "@/lib/utils";

interface MessageItemProps {
  message: ChatMessage;
  isGrouped: boolean;
  showGroupSeparator: boolean;
  currentUserId: string;
  canModerate: boolean;
  onReact: (messageId: string) => void;
  onReply: (id: string, author: string, content: string) => void;
}

export const MessageItem = React.memo(
  function MessageItem({
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
        socket.emit("message:edit", { messageId: message.id, content: newContent.trim() });
      }
      setIsEditing(false);
    };

    const handleDelete = () => {
      if (window.confirm(t("chat.message.deleteConfirm"))) {
        socket.emit("message:delete", message.id);
      }
    };

    if (message.type !== "DEFAULT") {
      const Icon = message.type === "SYSTEM_LEAVE" ? UserMinus : UserPlus;
      const systemContent =
        message.type === "SYSTEM_LEAVE"
          ? t("chat.message.systemLeave", { name: message.author.displayName })
          : t("chat.message.systemJoin", { name: message.author.displayName });

      return (
        <div className="px-4 py-3">
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
          "group relative px-4 transition",
          isOptimistic && "opacity-60",
        )}
      >
        {showGroupSeparator ? (
          <div className="absolute inset-x-4 top-0 h-px bg-[hsl(var(--border)/0.34)]" />
        ) : null}

        <div
          className={cn(
            "grid grid-cols-[3rem_minmax(0,1fr)] gap-3 rounded-2xl transition hover:bg-[hsl(var(--surface-soft)/0.28)]",
            isGrouped ? "min-h-[36px] py-1.5" : "min-h-[56px] py-2",
          )}
        >
          <div className="flex justify-center pt-0.5">
            {isGrouped ? (
              <span className="w-10 text-right text-[11px] text-app-soft opacity-0 transition group-hover:opacity-100">
                {formattedTime}
              </span>
            ) : (
              <Avatar
                src={message.author.avatarUrl}
                alt={message.author.displayName}
                className="h-10 w-10 flex-shrink-0"
                fallback={message.author.displayName[0] || "?"}
              />
            )}
          </div>

          <div className="relative min-w-0 pr-24 md:pr-36">
            {!isGrouped && (
              <div className="flex items-center gap-2 pr-2">
                <span className="font-semibold text-app-foreground text-sm">
                  {message.author.displayName}
                </span>
                <span className="shrink-0 text-xs text-app-muted">{formattedTime}</span>
              </div>
            )}

            {isEditing ? (
              <MessageEditor
                initialContent={message.content}
                onSave={handleEdit}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <div className="text-app-foreground text-sm leading-6 break-words [&_a]:text-[hsl(var(--primary))] [&_ol]:my-2 [&_p]:m-0 [&_pre]:my-2 [&_ul]:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {message.editedAt && !isEditing && (
              <span className="text-xs text-app-muted italic">{t("chat.message.edited")}</span>
            )}

            {message.reactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {message.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    className="bg-app-surface-soft rounded-full px-2 py-1 text-xs hover:bg-app-surface transition"
                    onClick={() => onReact(message.id)}
                  >
                    {reaction.emoji} {reaction.count}
                  </button>
                ))}
              </div>
            )}

            {!isEditing ? (
              <div className="pointer-events-none absolute right-0 top-0 flex w-24 justify-end opacity-0 transition group-hover:opacity-100 md:w-32">
                {!isOptimistic ? (
                  <MessageToolbar
                    className="pointer-events-auto"
                    messageId={message.id}
                    isOwner={isOwner}
                    canModerate={canModerate}
                    onReact={() => onReact(message.id)}
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
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.reactions === next.message.reactions &&
    prev.message.editedAt === next.message.editedAt &&
    prev.message.deletedAt === next.message.deletedAt &&
    prev.isGrouped === next.isGrouped &&
    prev.showGroupSeparator === next.showGroupSeparator &&
    prev.currentUserId === next.currentUserId &&
    prev.canModerate === next.canModerate &&
    prev.onReact === next.onReact &&
    prev.onReply === next.onReply,
);
