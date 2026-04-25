"use client";

import { MessageCircle, Trash2, Pencil, SmilePlus } from "lucide-react";

interface MessageToolbarProps {
  messageId: string;
  isOwner: boolean;
  canModerate: boolean;
  onReact: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageToolbar({
  isOwner,
  canModerate,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: MessageToolbarProps) {
  return (
    <div className="flex items-center gap-1 bg-app-panel rounded-full border border-app-border px-2 py-1 shadow-md">
      <button
        onClick={onReact}
        title="React"
        className="p-1 hover:bg-app-surface-soft rounded transition"
        aria-label="Add reaction"
      >
        <SmilePlus className="h-4 w-4 text-app-muted hover:text-app-foreground" />
      </button>

      <button
        onClick={onReply}
        title="Reply"
        className="p-1 hover:bg-app-surface-soft rounded transition"
        aria-label="Reply to message"
      >
        <MessageCircle className="h-4 w-4 text-app-muted hover:text-app-foreground" />
      </button>

      {isOwner && (
        <button
          onClick={onEdit}
          title="Edit"
          className="p-1 hover:bg-app-surface-soft rounded transition"
          aria-label="Edit message"
        >
          <Pencil className="h-4 w-4 text-app-muted hover:text-app-foreground" />
        </button>
      )}

      {(isOwner || canModerate) && (
        <button
          onClick={onDelete}
          title="Delete"
          className="p-1 hover:bg-app-surface-soft rounded transition"
          aria-label="Delete message"
        >
          <Trash2 className="h-4 w-4 text-red-500 hover:text-red-600" />
        </button>
      )}
    </div>
  );
}
