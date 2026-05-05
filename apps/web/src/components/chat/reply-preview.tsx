"use client";

import { X } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";

interface ReplyPreviewProps {
  replyTo: { id: string; authorName: string; content: string } | null;
  onCancel: () => void;
}

export function ReplyPreview({ replyTo, onCancel }: ReplyPreviewProps) {
  const { t } = useI18n();

  if (!replyTo) return null;

  return (
    <div
      className="bg-app-surface-soft flex items-center gap-2 rounded border-l-2 border-[hsl(var(--primary))] px-3 py-2"
      data-testid="reply-preview"
    >
      <span className="text-app-muted shrink-0 text-xs">
        {t("chat.reply.replyingTo", { author: replyTo.authorName })}
      </span>
      <p className="text-app-foreground flex-1 truncate text-xs">
        {replyTo.content}
      </p>
      <button
        aria-label={t("chat.reply.cancel")}
        className="text-app-muted hover:text-app-foreground shrink-0 transition"
        data-testid="reply-preview-cancel"
        onClick={onCancel}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
