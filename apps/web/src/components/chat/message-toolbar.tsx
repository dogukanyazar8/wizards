"use client";

import { MessageCircle, Trash2, Pencil, SmilePlus } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";

interface MessageToolbarProps {
  className?: string;
  messageId: string;
  isOwner: boolean;
  canModerate: boolean;
  onReact: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageToolbar({
  className,
  isOwner,
  canModerate,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: MessageToolbarProps) {
  const { t } = useI18n();

  return (
    <div className={`bg-app-panel border-app-border flex items-center gap-1 rounded-full border px-2 py-1 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.14)] ${className ?? ""}`}>
      <button
        onClick={onReact}
        title={t("chat.message.react")}
        className="p-1 hover:bg-app-surface-soft rounded transition"
        aria-label={t("chat.message.addReaction")}
      >
        <SmilePlus className="h-4 w-4 text-app-muted hover:text-app-foreground" />
      </button>

      <button
        onClick={onReply}
        title={t("chat.message.reply")}
        className="p-1 hover:bg-app-surface-soft rounded transition"
        aria-label={t("chat.message.replyAria")}
      >
        <MessageCircle className="h-4 w-4 text-app-muted hover:text-app-foreground" />
      </button>

      {isOwner && (
        <button
          onClick={onEdit}
          title={t("chat.message.edit")}
          className="p-1 hover:bg-app-surface-soft rounded transition"
          aria-label={t("chat.message.editAria")}
        >
          <Pencil className="h-4 w-4 text-app-muted hover:text-app-foreground" />
        </button>
      )}

      {(isOwner || canModerate) && (
        <button
          onClick={onDelete}
          title={t("chat.message.delete")}
          className="p-1 hover:bg-app-surface-soft rounded transition"
          aria-label={t("chat.message.deleteAria")}
        >
          <Trash2 className="h-4 w-4 text-[hsl(var(--danger-foreground))]" />
        </button>
      )}
    </div>
  );
}
