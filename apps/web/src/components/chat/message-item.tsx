"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar } from "@/components/ui/avatar";
import { MessageToolbar } from "./message-toolbar";
import type { ChatMessage } from "@wizards/types";

interface MessageItemProps {
  message: ChatMessage;
  isGrouped: boolean;
  currentUserId: string;
  canModerate: boolean;
  onReact: (messageId: string) => void;
  onReply: (id: string, author: string, content: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}

export function MessageItem({
  message,
  isGrouped,
  currentUserId,
  canModerate,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: MessageItemProps) {
  const [showToolbar, setShowToolbar] = useState(false);
  const isOwner = message.author.id === currentUserId;
  const isDeleted = message.deletedAt !== null;

  if (message.type === "SYSTEM_JOIN") {
    return (
      <div className="px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center justify-center gap-3 rounded-full border border-emerald-400/15 bg-emerald-400/[0.08] px-4 py-2 text-xs font-medium text-emerald-100/90">
          <UserPlus className="h-3.5 w-3.5 text-emerald-300" />
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  if (isDeleted) {
    return (
      <div className="px-4 py-1 text-xs italic text-app-muted">This message was deleted.</div>
    );
  }

  return (
    <div
      className="px-4 py-2 hover:bg-app-surface-soft/50 transition relative group"
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      <div className="flex gap-3">
        {!isGrouped && (
          <Avatar
            src={message.author.avatarUrl}
            alt={message.author.displayName}
            className="h-8 w-8 flex-shrink-0"
            fallback={message.author.displayName[0] || "?"}
          />
        )}

        <div className="flex-1 min-w-0">
          {!isGrouped && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-app-foreground text-sm">
                {message.author.displayName}
              </span>
              <span className="text-xs text-app-muted">
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}

          <div className="text-app-foreground text-sm prose prose-sm dark max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>

          {message.editedAt && (
            <span className="text-xs text-app-muted italic">(edited)</span>
          )}

          {message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  className="bg-app-surface-soft rounded-full px-2 py-1 text-xs hover:bg-app-surface transition"
                  title={reaction.userIds.join(", ")}
                  onClick={() => onReact(message.id)}
                >
                  {reaction.emoji} {reaction.count}
                </button>
              ))}
            </div>
          )}
        </div>

        {showToolbar && (
          <MessageToolbar
            messageId={message.id}
            isOwner={isOwner}
            canModerate={canModerate}
            onReact={() => onReact(message.id)}
            onReply={() => onReply(message.id, message.author.displayName, message.content)}
            onEdit={() => onEdit(message.id, message.content)}
            onDelete={() => onDelete(message.id)}
          />
        )}
      </div>
    </div>
  );
}
