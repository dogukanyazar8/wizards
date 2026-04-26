"use client";

import React, { useState } from "react";
import { UserPlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar } from "@/components/ui/avatar";
import { MessageEditor } from "./message-editor";
import { MessageToolbar } from "./message-toolbar";
import { useSocket } from "@/hooks/use-socket";
import type { ChatMessage } from "@wizards/types";

interface MessageItemProps {
  message: ChatMessage;
  isGrouped: boolean;
  currentUserId: string;
  canModerate: boolean;
  onReact: (messageId: string) => void;
  onReply: (id: string, author: string, content: string) => void;
}

export const MessageItem = React.memo(
  function MessageItem({
    message,
    isGrouped,
    currentUserId,
    canModerate,
    onReact,
    onReply,
  }: MessageItemProps) {
    const socket = useSocket();
    const [showToolbar, setShowToolbar] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const isOwner = message.author.id === currentUserId;
    const isDeleted = message.deletedAt !== null;
    const isOptimistic = message.id.startsWith("optimistic-");

    const handleEdit = (newContent: string) => {
      if (newContent.trim()) {
        socket.emit("message:edit", { messageId: message.id, content: newContent.trim() });
      }
      setIsEditing(false);
    };

    const handleDelete = () => {
      if (window.confirm("Delete this message?")) {
        socket.emit("message:delete", message.id);
      }
    };

    if (message.type === "SYSTEM_JOIN") {
      return (
        <div className="px-4 py-3">
          <div className="app-success mx-auto flex max-w-xl items-center justify-center gap-3 rounded-full border px-4 py-2 text-xs font-medium">
            <UserPlus className="text-app-success h-3.5 w-3.5" />
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
        className={`px-4 py-2 hover:bg-app-surface-soft/50 transition relative group${isOptimistic ? " opacity-60" : ""}`}
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

            {isEditing ? (
              <MessageEditor
                initialContent={message.content}
                onSave={handleEdit}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <div className="text-app-foreground text-sm prose prose-sm dark max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {message.editedAt && !isEditing && (
              <span className="text-xs text-app-muted italic">(edited)</span>
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
          </div>

          {showToolbar && !isEditing && !isOptimistic && (
            <MessageToolbar
              messageId={message.id}
              isOwner={isOwner}
              canModerate={canModerate}
              onReact={() => onReact(message.id)}
              onReply={() => onReply(message.id, message.author.displayName, message.content)}
              onEdit={() => setIsEditing(true)}
              onDelete={handleDelete}
            />
          )}
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
    prev.currentUserId === next.currentUserId &&
    prev.canModerate === next.canModerate &&
    prev.onReact === next.onReact &&
    prev.onReply === next.onReply,
);
