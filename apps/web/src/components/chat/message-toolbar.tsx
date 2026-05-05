"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  messageId,
  isOwner,
  canModerate,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: MessageToolbarProps) {
  const { t } = useI18n();
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [reactionMenuStyle, setReactionMenuStyle] = useState<CSSProperties>({});
  const reactionRootRef = useRef<HTMLDivElement>(null);
  const reactionButtonRef = useRef<HTMLButtonElement>(null);
  const reactionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showReactionMenu) {
      return;
    }

    const positionReactionMenu = () => {
      const button = reactionButtonRef.current;
      const menu = reactionMenuRef.current;

      if (!button || !menu || !window.matchMedia("(min-width: 768px)").matches) {
        setReactionMenuStyle({});
        return;
      }

      const buttonRect = button.getBoundingClientRect();
      const menuWidth = menu.offsetWidth || 240;
      const menuHeight = menu.offsetHeight || 44;
      const safeInset = 16;
      const preferredLeft = buttonRect.left + buttonRect.width / 2 - menuWidth / 2;
      const maxLeft = window.innerWidth - menuWidth - safeInset;
      const left = Math.min(Math.max(preferredLeft, safeInset), Math.max(safeInset, maxLeft));
      const top = Math.max(safeInset, buttonRect.top - menuHeight - 10);

      setReactionMenuStyle({
        left,
        top,
      });
    };

    positionReactionMenu();
    const frameId = window.requestAnimationFrame(positionReactionMenu);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        reactionRootRef.current?.contains(target) ||
        reactionMenuRef.current?.contains(target)
      ) {
        return;
      }

      setShowReactionMenu(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowReactionMenu(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", positionReactionMenu);
    window.addEventListener("scroll", positionReactionMenu, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", positionReactionMenu);
      window.removeEventListener("scroll", positionReactionMenu, true);
    };
  }, [showReactionMenu]);

  const reactionMenu =
    showReactionMenu && typeof document !== "undefined"
      ? createPortal(
          <div
            className="app-panel fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[90] flex items-center justify-center gap-1 rounded-[24px] border px-2 py-2 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.18)] md:inset-x-auto md:bottom-auto md:rounded-full md:py-1"
            data-testid="reaction-picker"
            onPointerDown={(event) => event.stopPropagation()}
            ref={reactionMenuRef}
            style={reactionMenuStyle}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                aria-label={t("chat.message.addReaction")}
                className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] md:h-auto md:w-auto md:px-2 md:py-1 md:text-base"
                data-emoji={emoji}
                data-testid="reaction-option"
                onClick={() => {
                  onReact(emoji);
                  setShowReactionMenu(false);
                }}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`bg-app-panel border-app-border flex items-center gap-1 rounded-full border px-1.5 py-1 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.14)] sm:px-2 ${className ?? ""}`}
      data-message-id={messageId}
      data-testid="message-toolbar"
    >
      {allowReact ? (
        <div className="relative" ref={reactionRootRef}>
          <button
            onClick={() => setShowReactionMenu((current) => !current)}
            title={t("chat.message.react")}
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
            aria-expanded={showReactionMenu}
            aria-haspopup="true"
            aria-label={t("chat.message.addReaction")}
            data-testid="message-action-react"
            ref={reactionButtonRef}
            type="button"
          >
            <SmilePlus className="h-4 w-4 text-app-muted hover:text-app-foreground" />
          </button>

          {reactionMenu}
        </div>
      ) : null}

      <button
        onClick={onReply}
        title={t("chat.message.reply")}
        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
        aria-label={t("chat.message.replyAria")}
        data-testid="message-action-reply"
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
          data-testid="message-action-edit"
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
          data-testid="message-action-delete"
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
