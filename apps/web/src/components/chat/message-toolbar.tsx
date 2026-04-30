"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Pencil, SmilePlus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";

const QUICK_REACTIONS = [
  "\u{1F44D}",
  "\u2764\uFE0F",
  "\u{1F602}",
  "\u{1F389}",
  "\u{1F62E}",
  "\u{1F440}",
] as const;

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
    <div
      className={`bg-app-panel border-app-border flex items-center gap-1 rounded-full border px-1.5 py-1 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.14)] sm:px-2 ${className ?? ""}`}
    >
      {allowReact ? (
        <div className="relative" ref={reactionMenuRef}>
          <button
            onClick={() => setShowReactionMenu((current) => !current)}
            title={t("chat.message.react")}
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
            aria-expanded={showReactionMenu}
            aria-haspopup="true"
            aria-label={t("chat.message.addReaction")}
            type="button"
          >
            <SmilePlus className="h-4 w-4 text-app-muted hover:text-app-foreground" />
          </button>

          {showReactionMenu ? (
            <div className="app-panel fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[90] flex items-center justify-center gap-1 rounded-[24px] border px-2 py-2 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.18)] md:absolute md:-top-14 md:bottom-auto md:right-0 md:inset-x-auto md:rounded-full md:py-1">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  aria-label={t("chat.message.addReaction")}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] md:h-auto md:w-auto md:px-2 md:py-1 md:text-base"
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
        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
        aria-label={t("chat.message.replyAria")}
        type="button"
      >
        <MessageCircle className="h-4 w-4 text-app-muted hover:text-app-foreground" />
      </button>

      {isOwner ? (
        <button
          onClick={onEdit}
          title={t("chat.message.edit")}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
          aria-label={t("chat.message.editAria")}
          type="button"
        >
          <Pencil className="h-4 w-4 text-app-muted hover:text-app-foreground" />
        </button>
      ) : null}

      {isOwner || canModerate ? (
        <button
          onClick={onDelete}
          title={t("chat.message.delete")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-app-danger transition hover:bg-[hsl(var(--danger)/0.14)] hover:text-app-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
          aria-label={t("chat.message.deleteAria")}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
