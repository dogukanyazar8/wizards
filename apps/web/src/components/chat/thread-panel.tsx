"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import type {
  ChatMessage,
  UploadedAttachmentInput,
  WorkspaceServerDetail,
} from "@wizards/types";
import { MessageInput } from "./message-input";
import { MessageItem } from "./message-item";
import { useI18n } from "@/components/providers/locale-provider";
import type { MessageMode } from "@/hooks/use-messages";
import { useThreadMessages } from "@/hooks/use-thread-messages";
import { useSocket } from "@/hooks/use-socket";

interface ThreadPanelProps {
  allowFileUploads: boolean;
  allowGifs: boolean;
  canModerate: boolean;
  conversationId: string;
  currentUserId: string;
  disabled?: boolean;
  disabledReason?: string | undefined;
  mentionMembers: WorkspaceServerDetail["members"];
  mode: MessageMode;
  onClose: () => void;
  parentMessage: ChatMessage;
  uploadthingEnabled: boolean;
}

export function ThreadPanel({
  allowFileUploads,
  allowGifs,
  canModerate,
  conversationId,
  currentUserId,
  disabled = false,
  disabledReason,
  mentionMembers,
  mode,
  onClose,
  parentMessage,
  uploadthingEnabled,
}: ThreadPanelProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const panelRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [replyTo, setReplyTo] = useState<{
    id: string;
    authorName: string;
    content: string;
  } | null>(null);
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useThreadMessages(mode, conversationId, parentMessage.id);
  const parent = data?.pages[0]?.parent ?? parentMessage;
  const parentForThread = useMemo(
    () => ({
      ...parent,
      threadSummary: undefined,
    }),
    [parent],
  );
  const messages = useMemo(() => {
    const seen = new Set<string>();
    return (
      data?.pages.flatMap((page) => page.messages).filter((message) => {
        if (seen.has(message.id)) {
          return false;
        }
        seen.add(message.id);
        return true;
      }) ?? []
    );
  }, [data]);

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      if (mode === "channel") {
        socket.emit("message:react", { messageId, emoji });
        return;
      }

      socket.emit("dm:message:react", { messageId, emoji });
    },
    [mode, socket],
  );

  const handleSend = useCallback(
    async (
      content: string,
      replyToId?: string,
      attachments: UploadedAttachmentInput[] = [],
    ) => {
      if (mode === "channel") {
        socket.emit("message:send", {
          attachments,
          channelId: conversationId,
          content,
          threadParentId: parent.id,
          ...(replyToId ? { replyToId } : {}),
        });
      } else {
        socket.emit("dm:message:send", {
          attachments,
          conversationId,
          content,
          threadParentId: parent.id,
          ...(replyToId ? { replyToId } : {}),
        });
      }

      setReplyTo(null);
    },
    [conversationId, mode, parent.id, socket],
  );

  const handleReply = useCallback((id: string, authorName: string, content: string) => {
    setReplyTo({ id, authorName, content });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-40"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <aside
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="absolute inset-0 flex flex-col border-l border-app-border bg-[hsl(var(--surface-card)/0.97)] shadow-[-22px_0_56px_hsl(var(--shadow-color)/0.16)] backdrop-blur-2xl md:left-auto md:w-[460px]"
        data-testid="thread-panel"
        onPointerDown={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 border-b border-app-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
                <MessageSquareText className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-app-soft">
                  {t("chat.thread.label")}
                </p>
                <h2 className="truncate text-base font-bold text-app-foreground" id={titleId}>
                  {t("chat.thread.panelTitle")}
                </h2>
                <p className="sr-only" id={descriptionId}>
                  {t("chat.thread.dialogDescription")}
                </p>
              </div>
            </div>
          </div>
          <button
            aria-label={t("common.close")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-app-surface-soft text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

      <div className="flex-1 overflow-y-auto px-2 py-2.5">
        <div className="mb-2 rounded-[22px] border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.38)] px-1 py-2">
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-app-soft">
            {t("chat.thread.parentMessage")}
          </p>
          <MessageItem
            canModerate={canModerate}
            currentUserId={currentUserId}
            isGrouped={false}
            message={parentForThread}
            mode={mode}
            onReact={handleReact}
            onRemoveOptimistic={() => undefined}
            onReply={handleReply}
            onRetry={() => undefined}
            onThread={() => undefined}
            showGroupSeparator={false}
          />
        </div>

        {hasNextPage ? (
          <div className="mb-2 flex justify-center">
            <button
              className="rounded-full border border-app-border bg-app-surface-soft px-3 py-1.5 text-xs font-semibold text-app-muted transition hover:text-app-foreground disabled:opacity-60"
              disabled={isFetchingNextPage}
              onClick={() => {
                void fetchNextPage();
              }}
              type="button"
            >
              {isFetchingNextPage ? t("chat.thread.loading") : t("chat.thread.loadOlder")}
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <p className="px-4 py-5 text-sm text-app-muted">{t("chat.thread.loading")}</p>
        ) : error ? (
          <p className="px-4 py-5 text-sm text-app-danger">{t("chat.thread.loadFailed")}</p>
        ) : messages.length === 0 ? (
          <div className="mx-2 rounded-[22px] border border-dashed border-app-border bg-app-surface-soft px-4 py-6 text-center">
            <p className="text-sm font-semibold text-app-foreground">
              {t("chat.thread.emptyTitle")}
            </p>
            <p className="mt-1 text-xs text-app-muted">{t("chat.thread.emptyDescription")}</p>
          </div>
        ) : (
          <div className="space-y-0">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const isGrouped =
                Boolean(previous) &&
                previous?.author.id === message.author.id &&
                Math.abs(
                  new Date(message.createdAt).getTime() -
                    new Date(previous.createdAt).getTime(),
                ) <
                  20 * 60 * 1000;

              return (
                <MessageItem
                  canModerate={canModerate}
                  currentUserId={currentUserId}
                  isGrouped={isGrouped}
                  key={message.id}
                  message={message}
                  mode={mode}
                  onReact={handleReact}
                  onRemoveOptimistic={() => undefined}
                  onReply={handleReply}
                  onRetry={() => undefined}
                  onThread={() => undefined}
                  showGroupSeparator={!isGrouped && index > 0}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-app-border bg-[hsl(var(--surface-card)/0.9)]">
        <MessageInput
          autoFocus
          allowFileUploads={allowFileUploads}
          allowGifs={allowGifs}
          conversationId={conversationId}
          disabled={disabled}
          disabledReason={disabledReason}
          mentionMembers={mode === "channel" ? mentionMembers : []}
          mode={mode}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
          replyTo={replyTo}
          uploadthingEnabled={uploadthingEnabled}
          variant="thread"
        />
      </div>
    </aside>
    </div>
  );
}
