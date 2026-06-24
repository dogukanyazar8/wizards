"use client";

import {
  type CSSProperties,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Copy,
  CornerUpLeft,
  Link2,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import {
  announceOverlayOpen,
  getOverlayOpenDetail,
  WHISPR_OVERLAY_OPEN_EVENT,
} from "@/lib/ui/overlay-coordinator";
import { cn } from "@/lib/utils";

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
  allowThread?: boolean;
  className?: string;
  variant?: "full" | "hover";
  messageId: string;
  isOwner: boolean;
  canModerate: boolean;
  isPinned?: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onThread: () => void;
  onCopyLink?: () => void;
  onCopyRawText?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMore?: () => void;
  onPin?: (() => void | Promise<void>) | undefined;
  isMoreOpen?: boolean;
  moreButtonRef?: Ref<HTMLButtonElement>;
}

export function MessageToolbar({
  allowReact = true,
  allowThread = true,
  className,
  variant = "full",
  messageId,
  isOwner,
  canModerate,
  isPinned = false,
  onReact,
  onReply,
  onThread,
  onCopyLink,
  onCopyRawText,
  onEdit,
  onDelete,
  onMore,
  onPin,
  isMoreOpen = false,
  moreButtonRef,
}: MessageToolbarProps) {
  const { t } = useI18n();
  const reactionOverlayId = useId();
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [reactionMenuStyle, setReactionMenuStyle] = useState<CSSProperties>({});
  const reactionRootRef = useRef<HTMLDivElement>(null);
  const reactionButtonRef = useRef<HTMLButtonElement>(null);
  const reactionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showReactionMenu) {
      return;
    }

    announceOverlayOpen("message-reaction-picker", reactionOverlayId);

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
  }, [reactionOverlayId, showReactionMenu]);

  useEffect(() => {
    const handleOverlayOpen = (event: Event) => {
      const detail = getOverlayOpenDetail(event);

      if (detail?.group === "message-reaction-picker" && detail.id !== reactionOverlayId) {
        setShowReactionMenu(false);
      }
    };

    window.addEventListener(WHISPR_OVERLAY_OPEN_EVENT, handleOverlayOpen);
    return () => window.removeEventListener(WHISPR_OVERLAY_OPEN_EVENT, handleOverlayOpen);
  }, [reactionOverlayId]);

  const reactionMenu =
    showReactionMenu && typeof document !== "undefined"
      ? createPortal(
          <div
            className="app-panel fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[90] mx-auto flex max-w-[min(22rem,calc(100vw-1.5rem))] items-center justify-center gap-1 rounded-[22px] border px-2 py-2 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.18)] md:inset-x-auto md:bottom-auto md:mx-0 md:rounded-full md:py-1"
            aria-label={t("chat.message.reactionMenu")}
            data-testid="reaction-picker"
            onPointerDown={(event) => event.stopPropagation()}
            ref={reactionMenuRef}
            role="menu"
            style={reactionMenuStyle}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                aria-label={t("chat.message.reactWith", { emoji })}
                className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] md:h-auto md:w-auto md:px-2 md:py-1 md:text-base"
                data-emoji={emoji}
                data-testid="reaction-option"
                onClick={() => {
                  onReact(emoji);
                  setShowReactionMenu(false);
                }}
                role="menuitem"
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  if (variant === "hover") {
    const hoverButtonClassName =
      "flex h-7 w-7 items-center justify-center rounded-md text-app-muted transition hover:bg-app-surface-soft hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]";

    return (
      <div
        className={cn(
          "flex items-center gap-0.5 rounded-lg border border-[hsl(var(--border)/0.78)] bg-[hsl(var(--surface-card)/0.96)] p-1 shadow-none backdrop-blur-xl",
          className,
        )}
        data-message-id={messageId}
        data-testid="message-toolbar"
      >
        {allowReact ? (
          <div className="relative" ref={reactionRootRef}>
            <button
              aria-expanded={showReactionMenu}
              aria-haspopup="menu"
              aria-label={t("chat.message.addReaction")}
              className={hoverButtonClassName}
              data-testid="message-action-react"
              onClick={() => setShowReactionMenu((current) => !current)}
              ref={reactionButtonRef}
              title={t("chat.message.react")}
              type="button"
            >
              <SmilePlus className="h-4 w-4" />
            </button>
            {reactionMenu}
          </div>
        ) : null}

        <button
          aria-label={t("chat.message.replyAria")}
          className={hoverButtonClassName}
          data-testid="message-action-reply"
          onClick={onReply}
          title={t("chat.message.reply")}
          type="button"
        >
          <CornerUpLeft className="h-4 w-4" />
        </button>

        {isOwner ? (
          <button
            aria-label={t("chat.message.editAria")}
            className={hoverButtonClassName}
            data-testid="message-action-edit"
            onClick={onEdit}
            title={t("chat.message.edit")}
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}

        {onMore ? (
          <button
            aria-label={t("chat.message.moreActions")}
            aria-expanded={isMoreOpen}
            className={hoverButtonClassName}
            data-testid="message-action-more"
            onClick={onMore}
            ref={moreButtonRef}
            title={t("chat.message.moreActions")}
            type="button"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-app-panel border-app-border flex items-center gap-1 rounded-full border px-1.5 py-1 shadow-[0_14px_32px_hsl(var(--shadow-color)/0.14)] sm:px-2",
        className,
      )}
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
            aria-haspopup="menu"
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

      {allowThread ? (
        <button
          onClick={onThread}
          title={t("chat.thread.open")}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
          aria-label={t("chat.thread.open")}
          data-testid="message-action-thread"
          type="button"
        >
          <MessagesSquare className="h-4 w-4 text-app-muted hover:text-app-foreground" />
        </button>
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

      {onCopyLink ? (
        <button
          onClick={onCopyLink}
          title={t("chat.message.copyLink")}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
          aria-label={t("chat.message.copyLink")}
          data-testid="message-action-copy-link"
          type="button"
        >
          <Link2 className="h-4 w-4 text-app-muted hover:text-app-foreground" />
        </button>
      ) : null}

      {onCopyRawText ? (
        <button
          onClick={onCopyRawText}
          title={t("chat.message.copyRawText")}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
          aria-label={t("chat.message.copyRawText")}
          data-testid="message-action-copy-raw"
          type="button"
        >
          <Copy className="h-4 w-4 text-app-muted hover:text-app-foreground" />
        </button>
      ) : null}

      {canModerate && onPin ? (
        <button
          onClick={onPin}
          title={isPinned ? t("chat.message.unpin") : t("chat.message.pin")}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-app-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:rounded sm:p-1"
          aria-label={isPinned ? t("chat.message.unpin") : t("chat.message.pin")}
          data-testid={isPinned ? "message-action-unpin" : "message-action-pin"}
          type="button"
        >
          {isPinned ? (
            <PinOff className="h-4 w-4 text-app-muted hover:text-app-foreground" />
          ) : (
            <Pin className="h-4 w-4 text-app-muted hover:text-app-foreground" />
          )}
        </button>
      ) : null}

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
