"use client";

import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@wizards/ui";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageMode } from "@/hooks/use-messages";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { UserProfilePopover } from "@/components/shared/user-profile-popover";
import { MessageEditor } from "./message-editor";
import { MessageAttachments } from "./message-attachments";
import { MessageToolbar } from "./message-toolbar";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import type { ChatMessage } from "@wizards/types";
import { cn } from "@/lib/utils";

function getPresenceDotClass(status: ChatMessage["author"]["status"] | undefined) {
  if (status === "ONLINE") {
    return "bg-emerald-400 shadow-[0_0_0_3px_hsl(var(--success)/0.12)]";
  }

  if (status === "IDLE") {
    return "bg-amber-400 shadow-[0_0_0_3px_hsl(var(--warning)/0.12)]";
  }

  if (status === "DND") {
    return "bg-rose-500 shadow-[0_0_0_3px_hsl(var(--danger)/0.12)]";
  }

  return "bg-slate-400 shadow-[0_0_0_3px_hsl(var(--muted)/0.18)]";
}

const mentionHrefPrefix = "mention:";

function markdownUrlTransform(url: string) {
  if (url.startsWith(mentionHrefPrefix)) {
    return url;
  }

  return defaultUrlTransform(url);
}

function formatMentionsForMarkdown(content: string) {
  return content.replace(/(^|[^\w`])@([a-zA-Z0-9_]{2,32})\b/g, (match, prefix: string, username: string) => {
    if (match.includes("](")) {
      return match;
    }

    return `${prefix}[@${username}](${mentionHrefPrefix}${username})`;
  });
}

const markdownComponents = {
  a({ children, href, title }) {
    if (href?.startsWith(mentionHrefPrefix)) {
      return (
        <span
          className="inline-flex translate-y-[1px] items-center rounded-full border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[0.92em] font-semibold text-[hsl(var(--primary))] shadow-[0_8px_18px_hsl(var(--primary)/0.08)]"
          data-mention-username={href.slice(mentionHrefPrefix.length)}
          data-testid="message-mention"
          title={`@${href.slice(mentionHrefPrefix.length)}`}
        >
          {children}
        </span>
      );
    }

    return (
      <a
        href={href}
        referrerPolicy="no-referrer"
        rel="noopener noreferrer nofollow"
        target="_blank"
        title={title}
      >
        {children}
      </a>
    );
  },
} satisfies Components;

interface MessageItemProps {
  mode: MessageMode;
  message: ChatMessage;
  isGrouped: boolean;
  showGroupSeparator: boolean;
  currentUserId: string;
  canModerate: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (id: string, author: string, content: string) => void;
}

export const MessageItem = React.memo(
  function MessageItem({
    mode,
    message,
    isGrouped,
    showGroupSeparator,
    currentUserId,
    canModerate,
    onReact,
    onReply,
  }: MessageItemProps) {
    const { locale, t } = useI18n();
    const socket = useSocket();
    const [isEditing, setIsEditing] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const actionsRef = useRef<HTMLDivElement>(null);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    const isOwner = message.author.id === currentUserId;
    const isDeleted = message.deletedAt !== null;
    const isOptimistic = message.id.startsWith("optimistic-");
    const formattedTime = new Date(message.createdAt).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });

    const handleEdit = (newContent: string) => {
      if (newContent.trim()) {
        if (mode === "channel") {
          socket.emit("message:edit", { messageId: message.id, content: newContent.trim() });
        } else {
          socket.emit("dm:message:edit", {
            messageId: message.id,
            content: newContent.trim(),
          });
        }
      }
      setIsEditing(false);
    };

    const handleDelete = () => {
      setDeleteDialogOpen(true);
    };

    const confirmDelete = () => {
      if (mode === "channel") {
        socket.emit("message:delete", message.id);
      } else {
        socket.emit("dm:message:delete", { messageId: message.id });
      }

      setDeleteDialogOpen(false);
    };

    useEffect(() => {
      if (!actionsOpen) {
        return;
      }

      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target as Node;

        if (actionsRef.current?.contains(target)) {
          return;
        }

        if (moreButtonRef.current?.contains(target)) {
          return;
        }

        setActionsOpen(false);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setActionsOpen(false);
        }
      };

      window.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("keydown", handleKeyDown);

      return () => {
        window.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [actionsOpen]);

    if (message.type !== "DEFAULT") {
      const Icon = message.type === "SYSTEM_LEAVE" ? UserMinus : UserPlus;
      const systemContent =
        message.type === "SYSTEM_LEAVE"
          ? t("chat.message.systemLeave", { name: message.author.displayName })
          : t("chat.message.systemJoin", { name: message.author.displayName });

      return (
        <div className="px-2 py-3 sm:px-4">
          <div className="app-system-message mx-auto flex max-w-xl items-center justify-center gap-3 rounded-full border px-4 py-2 text-xs font-medium">
            <Icon className="app-system-message-icon h-3.5 w-3.5" />
            <span>{systemContent}</span>
          </div>
        </div>
      );
    }

    if (isDeleted) {
      return (
        <div className="px-4 py-1 text-xs italic text-app-muted">
          {t("chat.message.deleted")}
        </div>
      );
    }

    return (
      <>
        <div
          className={cn(
            "group relative px-1 transition sm:px-4",
            isOptimistic && "opacity-60",
          )}
          data-message-id={message.id}
          data-testid="message-item"
        >
          {showGroupSeparator ? (
            <div className="absolute inset-x-1 top-0 h-px bg-[hsl(var(--border)/0.34)] sm:inset-x-4" />
          ) : null}

          <div
            className={cn(
              "grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 rounded-2xl transition hover:bg-[hsl(var(--surface-soft)/0.28)] sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-3",
              isGrouped ? "min-h-[36px] py-1.5" : "min-h-[56px] py-2",
            )}
          >
            <div className="flex justify-center pt-0.5">
              {isGrouped ? (
                <span className="w-10 text-right text-[11px] text-app-soft opacity-0 transition group-hover:opacity-100">
                  {formattedTime}
                </span>
              ) : (
                <UserProfilePopover
                  userId={message.author.id}
                  currentUserId={currentUserId}
                  testId={`message-author-profile-${message.author.username}`}
                >
                  <span className="relative inline-flex">
                    <Avatar
                      src={message.author.avatarUrl}
                      alt={message.author.displayName}
                      className="h-9 w-9 flex-shrink-0 sm:h-10 sm:w-10"
                      fallback={message.author.displayName[0] || "?"}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[hsl(var(--surface-card))] sm:h-3.5 sm:w-3.5",
                        getPresenceDotClass(message.author.status),
                      )}
                    />
                  </span>
                </UserProfilePopover>
              )}
            </div>

            <div className="relative min-w-0 pr-9 md:pr-0">
              {!isGrouped && (
                <div className="flex items-center gap-2 pr-2">
                  <span className="font-semibold text-app-foreground text-sm">
                    {message.author.displayName}
                  </span>
                  <span
                    aria-label={message.author.customStatus ?? message.author.status ?? undefined}
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      getPresenceDotClass(message.author.status),
                    )}
                    title={message.author.customStatus ?? message.author.status ?? undefined}
                  />
                  <span className="shrink-0 text-xs text-app-muted">{formattedTime}</span>
                </div>
              )}

              {message.replyTo && !isEditing && (
                <div className="mb-1.5 flex items-start gap-1.5 rounded border-l-2 border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--surface-soft)/0.4)] px-2 py-1">
                  <span className="shrink-0 text-[11px] font-medium text-[hsl(var(--primary))]">
                    {message.replyTo.authorName}
                  </span>
                  <p className="min-w-0 truncate text-[11px] text-app-muted">
                    {message.replyTo.content}
                  </p>
                </div>
              )}

              {isEditing ? (
                <MessageEditor
                  initialContent={message.content}
                  onSave={handleEdit}
                  onCancel={() => setIsEditing(false)}
                />
              ) : (
                <div className="text-app-foreground break-words text-sm leading-6">
                  <div className="inline max-w-full align-middle [&_a]:text-[hsl(var(--primary))] [&_code]:break-words [&_ol]:my-2 [&_p]:m-0 [&_p]:inline [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_ul]:my-2">
                    <ReactMarkdown
                      components={markdownComponents}
                      remarkPlugins={[remarkGfm]}
                      urlTransform={markdownUrlTransform}
                    >
                      {formatMentionsForMarkdown(message.content)}
                    </ReactMarkdown>
                  </div>

                  {!isOptimistic ? (
                    <span className="ml-2 hidden align-middle opacity-0 transition md:inline-flex md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <MessageToolbar
                        allowReact
                        className="inline-flex scale-90"
                        messageId={message.id}
                        isOwner={isOwner}
                        canModerate={canModerate}
                        onReact={(emoji) => onReact(message.id, emoji)}
                        onReply={() => onReply(message.id, message.author.displayName, message.content)}
                        onEdit={() => setIsEditing(true)}
                        onDelete={handleDelete}
                      />
                    </span>
                  ) : null}
                </div>
              )}

              {!isEditing ? <MessageAttachments attachments={message.attachments} /> : null}

              {message.editedAt && !isEditing && (
                <span className="text-xs text-app-muted italic">{t("chat.message.edited")}</span>
              )}

              {message.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {message.reactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      className={cn(
                        "rounded-full px-2 py-1 text-xs transition",
                        reaction.userIds.includes(currentUserId)
                          ? "border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.14)] text-app-foreground"
                          : "bg-app-surface-soft hover:bg-app-surface",
                      )}
                      data-emoji={reaction.emoji}
                      data-testid="message-reaction"
                      onClick={() => onReact(message.id, reaction.emoji)}
                      type="button"
                    >
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                </div>
              )}

              {!isEditing && !isOptimistic ? (
                <button
                  aria-expanded={actionsOpen}
                  aria-label={t("chat.message.moreActions")}
                  className="app-panel-soft absolute right-0 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-full border text-app-muted shadow-[0_10px_24px_hsl(var(--shadow-color)/0.1)] transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] md:hidden"
                  data-testid="message-mobile-actions"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActionsOpen((current) => !current);
                  }}
                  ref={moreButtonRef}
                  type="button"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              ) : null}

              {!isEditing && !isOptimistic && actionsOpen ? (
                <div
                  className="absolute right-0 top-9 z-30 flex justify-end md:hidden"
                  onClick={(event) => event.stopPropagation()}
                  ref={actionsRef}
                >
                  <MessageToolbar
                    allowReact
                    messageId={message.id}
                    isOwner={isOwner}
                    canModerate={canModerate}
                    onReact={(emoji) => onReact(message.id, emoji)}
                    onReply={() => {
                      setActionsOpen(false);
                      onReply(message.id, message.author.displayName, message.content);
                    }}
                    onEdit={() => {
                      setActionsOpen(false);
                      setIsEditing(true);
                    }}
                    onDelete={() => {
                      setActionsOpen(false);
                      handleDelete();
                    }}
                  />
                </div>
              ) : null}

            </div>
          </div>
        </div>

        <Modal
          className="max-w-md"
          description={t("chat.message.deleteDialogDescription")}
          onClose={() => setDeleteDialogOpen(false)}
          open={deleteDialogOpen}
          title={t("chat.message.deleteDialogTitle")}
        >
          <div
            className="rounded-[24px] border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] p-4"
            data-testid="message-delete-dialog"
          >
            <p className="text-sm font-medium text-app-foreground">
              {t("chat.message.deleteDialogBody")}
            </p>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              className="w-full rounded-2xl sm:w-auto"
              data-testid="message-delete-cancel"
              onClick={() => setDeleteDialogOpen(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="w-full rounded-2xl bg-[hsl(var(--danger))] text-white hover:bg-[hsl(var(--danger)/0.9)] sm:w-auto"
              data-testid="message-delete-confirm"
              onClick={confirmDelete}
              type="button"
            >
              {t("chat.message.delete")}
            </Button>
          </div>
        </Modal>
      </>
    );
  },
  (prev, next) =>
    prev.mode === next.mode &&
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.attachments === next.message.attachments &&
    prev.message.reactions === next.message.reactions &&
    prev.message.author.status === next.message.author.status &&
    prev.message.author.customStatus === next.message.author.customStatus &&
    prev.message.editedAt === next.message.editedAt &&
    prev.message.deletedAt === next.message.deletedAt &&
    prev.message.replyTo?.id === next.message.replyTo?.id &&
    prev.isGrouped === next.isGrouped &&
    prev.showGroupSeparator === next.showGroupSeparator &&
    prev.currentUserId === next.currentUserId &&
    prev.canModerate === next.canModerate &&
    prev.onReact === next.onReact &&
    prev.onReply === next.onReply,
);
