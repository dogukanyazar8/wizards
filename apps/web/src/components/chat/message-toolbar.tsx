"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Trash2, Pencil, SmilePlus } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "👀"] as const;

interface MessageToolbarProps {
  allowReact?: boolean;
  className?: string;
  messageId: string;
  isOwner: boolean;
  canModerate: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageToolbar({
  allowReact = true,
  className,
  isOwner,
  canModerate,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: MessageToolbarProps) {
  const { t } = useI18n();
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const reactionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showReactionMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!reactionMenuRef.current?.contains(event.target as Node)) {
        setShowReactionMenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowReactionMenu(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showReactionMenu]);

  return (
    <div className={`bg-app-panel border-app-border flex items-center gap-1 rounded-full border px-2 py-1 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.14)] ${className ?? ""}`}>
      {allowReact ? (
        <div className="relative" ref={reactionMenuRef}>
          <button
            onClick={() => setShowReactionMenu((current) => !current)}
            title={t("chat.message.react")}
            className="rounded p-1 transition hover:bg-app-surface-soft"
            aria-expanded={showReactionMenu}
            aria-haspopup="true"
            aria-label={t("chat.message.addReaction")}
            type="button"
          >
            <SmilePlus className="h-4 w-4 text-app-muted hover:text-app-foreground" />
          </button>

          {showReactionMenu ? (
            <div className="app-panel absolute -top-14 right-0 flex items-center gap-1 rounded-full border px-2 py-1 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.18)]">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  aria-label={t("chat.message.addReaction")}
                  className="rounded-full px-2 py-1 text-base transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  onClick={() => {
                    onReact(emoji);
                    setShowReactionMenu(false);
                  }}
                  type="button"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
          className="rounded p-1 text-app-danger transition hover:bg-[hsl(var(--danger)/0.14)] hover:text-app-danger"
          aria-label={t("chat.message.deleteAria")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
