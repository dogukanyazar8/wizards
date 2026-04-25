"use client";

import { X } from "lucide-react";

interface ReplyPreviewProps {
  replyTo: { id: string; authorName: string; content: string } | null;
  onCancel: () => void;
}

export function ReplyPreview({ replyTo, onCancel }: ReplyPreviewProps) {
  if (!replyTo) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-app-surface-soft rounded border-l-2 border-[hsl(var(--primary))]">
      <span className="text-xs text-app-muted flex-shrink-0">↩ Replying to @{replyTo.authorName}</span>
      <p className="text-xs text-app-foreground truncate flex-1">{replyTo.content}</p>
      <button
        onClick={onCancel}
        className="text-app-muted hover:text-app-foreground flex-shrink-0 transition"
        aria-label="Cancel reply"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
