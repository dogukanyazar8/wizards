"use client";

import React, { useCallback, useMemo, useState } from "react";
import { LockKeyhole, LockKeyholeOpen, MessagesSquare } from "lucide-react";
import type { ChatMessage, UploadedAttachmentInput, WorkspaceServerDetail } from "@wizards/types";
import { MessageInput } from "./message-input";
import { MessageItem } from "./message-item";
import { MessagesSidePanel } from "@/components/messages/messages-side-panel";
import { useI18n } from "@/components/providers/locale-provider";
import type { MessageMode } from "@/hooks/use-messages";
import { useThreadMessages } from "@/hooks/use-thread-messages";
import { useSocket } from "@/hooks/use-socket";
import { excerpt } from "@/lib/messages/message-blocks";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";
import { patchChannelThreadStateRequest } from "@/lib/workspace/client";

/**
 * Thread paneli — SPEC-MESAJLAR §6.1.
 *
 * Panel artık ekranın üstüne binen 460px'lik bir diyalog değil, sağ sütunun
 * 340px'lik yerleşik bir parçası. Kabuk ortak (`messages-side-panel.tsx`);
 * yerleşikken `role="complementary"` ve focus tuzağı **yok**, dar ekranda
 * overlay olduğunda diyalog ve tuzak var.
 *
 * **Başlık uydurulmuyor.** Sunucu bir "thread başlığı" tutmuyor; alt satırdaki
 * özet kök mesajın gövdesinden türetiliyor (`excerpt`). Ayrı bir alan icat etmek,
 * hiçbir yerin doldurmadığı bir sözleşme yaratırdı.
 *
 * Veri katmanı olduğu gibi korundu: `useThreadMessages` sonsuz sorgusu, socket
 * yaması ve gönderim yolu değişmedi.
 */

const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;
const THREAD_TITLE_EXCERPT_LENGTH = 42;

const { sidePanel } = MESSAGES_METRICS;

interface ThreadPanelProps {
  allowFileUploads: boolean;
  allowGifs: boolean;
  canModerate: boolean;
  conversationId: string;
  currentUserId: string;
  currentUsername?: string | undefined;
  disabled?: boolean;
  disabledReason?: string | undefined;
  mentionMembers: WorkspaceServerDetail["members"];
  /** Bahsedilmeler Ş2: bestekar rol önerisi thread panelinde de çalışır. */
  mentionRoles?: WorkspaceServerDetail["roles"];
  messageCharacterLimit?: number | null;
  mode: MessageMode;
  onClose: () => void;
  onThreadStateChange?: (state: { closedAt: string | null; closedById: string | null }) => void;
  /** `<1100px`'te panel ana alanın üstüne biner. */
  overlay?: boolean;
  parentMessage: ChatMessage;
  uploadthingEnabled: boolean;
}

export function ThreadPanel({
  allowFileUploads,
  allowGifs,
  canModerate,
  conversationId,
  currentUserId,
  currentUsername,
  disabled = false,
  disabledReason,
  mentionMembers,
  mentionRoles = [],
  messageCharacterLimit = 2000,
  mode,
  onClose,
  onThreadStateChange,
  overlay = false,
  parentMessage,
  uploadthingEnabled,
}: ThreadPanelProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const [replyTo, setReplyTo] = useState<{
    id: string;
    authorName: string;
    content: string;
  } | null>(null);
  /**
   * `Ana sohbete de gönder` artık **iki tarafta da** var: kanal
   * `Message.alsoSentToChannel`, DM `DMMessage.alsoSentToChannel`. İkisi de
   * yalnız gerçek bir thread yanıtında yazılıyor ve ana liste sorgusu
   * `threadParentId: null OR alsoSentToChannel: true` diyor.
   */
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(false);
  const [threadStateOverride, setThreadStateOverride] = useState<{
    closedAt: string | null;
    closedById: string | null;
  } | null>(null);
  const [threadStateError, setThreadStateError] = useState(false);
  const [threadStatePending, setThreadStatePending] = useState(false);

  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useThreadMessages(mode, conversationId, parentMessage.id);
  const parent = data?.pages[0]?.parent ?? parentMessage;
  const threadState = threadStateOverride ?? {
    closedAt: parent.threadClosedAt ?? null,
    closedById: parent.threadClosedById ?? null,
  };
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
      data?.pages
        .flatMap((page) => page.messages)
        .filter((message) => {
          if (seen.has(message.id)) {
            return false;
          }
          seen.add(message.id);
          return true;
        }) ?? []
    );
  }, [data]);

  const replyCount = parent.threadSummary?.replyCount ?? messages.length;
  const threadClosed = mode === "channel" && Boolean(threadState.closedAt);
  const canChangeThreadState =
    mode === "channel" && (canModerate || parent.author.id === currentUserId);

  const toggleThreadState = useCallback(async () => {
    if (!canChangeThreadState || threadStatePending) {
      return;
    }

    setThreadStatePending(true);
    setThreadStateError(false);
    try {
      const next = await patchChannelThreadStateRequest(conversationId, parent.id, threadClosed);
      const state = { closedAt: next.closedAt, closedById: next.closedById };
      setThreadStateOverride(state);
      onThreadStateChange?.(state);
    } catch {
      setThreadStateError(true);
    } finally {
      setThreadStatePending(false);
    }
  }, [
    canChangeThreadState,
    conversationId,
    onThreadStateChange,
    parent.id,
    threadClosed,
    threadStatePending,
  ]);

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
    async (content: string, replyToId?: string, attachments: UploadedAttachmentInput[] = []) => {
      if (mode === "channel") {
        socket.emit("message:send", {
          ...(alsoSendToChannel ? { alsoSendToChannel: true } : {}),
          attachments,
          channelId: conversationId,
          content,
          threadParentId: parent.id,
          ...(replyToId ? { replyToId } : {}),
        });
      } else {
        socket.emit("dm:message:send", {
          ...(alsoSendToChannel ? { alsoSendToChannel: true } : {}),
          attachments,
          conversationId,
          content,
          threadParentId: parent.id,
          ...(replyToId ? { replyToId } : {}),
        });
      }

      setReplyTo(null);
    },
    [alsoSendToChannel, conversationId, mode, parent.id, socket],
  );

  const handleReply = useCallback((id: string, authorName: string, content: string) => {
    setReplyTo({ id, authorName, content });
  }, []);

  return (
    <MessagesSidePanel
      actions={
        canChangeThreadState ? (
          <button
            aria-label={
              threadClosed
                ? t("messages.panel.thread.reopen")
                : t("messages.panel.thread.closeThread")
            }
            className="grid h-8 w-8 place-items-center rounded-lg text-[hsl(var(--text-secondary))] transition hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
            data-testid="thread-state-toggle"
            disabled={threadStatePending}
            onClick={() => void toggleThreadState()}
            type="button"
          >
            {threadClosed ? (
              <LockKeyholeOpen aria-hidden="true" className="h-4 w-4" />
            ) : (
              <LockKeyhole aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        ) : null
      }
      icon={<MessagesSquare />}
      onClose={onClose}
      overlay={overlay}
      subtitle={t("messages.panel.thread.subtitle", {
        count: replyCount,
        title: excerpt(parent.content, THREAD_TITLE_EXCERPT_LENGTH),
      })}
      testId="thread-panel"
      title={t("messages.panel.thread.title")}
    >
      <div
        className="shrink-0"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/0.5)`,
          padding: `${pxToRem(sidePanel.threadRootPaddingY)} ${pxToRem(sidePanel.threadRootPaddingX)}`,
        }}
      >
        <MessageItem
          canModerate={canModerate}
          currentUserId={currentUserId}
          {...(currentUsername ? { currentUsername } : {})}
          isGrouped={false}
          message={parentForThread}
          mode={mode}
          onReact={handleReact}
          onRemoveOptimistic={() => undefined}
          onReply={handleReply}
          onRetry={() => undefined}
          onThread={() => undefined}
        />
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{
          gap: pxToRem(sidePanel.threadRepliesGap),
          padding: `${pxToRem(sidePanel.threadRepliesPaddingY)} ${pxToRem(sidePanel.threadRepliesPaddingX)}`,
        }}
      >
        {hasNextPage ? (
          <button
            className="self-center text-[hsl(var(--primary))] transition hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-60"
            data-testid="thread-load-older"
            disabled={isFetchingNextPage}
            onClick={() => {
              void fetchNextPage();
            }}
            style={{ fontSize: pxToRem(sidePanel.threadTimeFontSize), fontWeight: 600 }}
            type="button"
          >
            {isFetchingNextPage ? t("chat.thread.loading") : t("chat.thread.loadOlder")}
          </button>
        ) : null}

        {isLoading ? (
          <p
            className="text-[hsl(var(--text-secondary))]"
            style={{ fontSize: pxToRem(sidePanel.threadBodyFontSize) }}
          >
            {t("chat.thread.loading")}
          </p>
        ) : error ? (
          <p
            className="text-[hsl(var(--danger))]"
            style={{ fontSize: pxToRem(sidePanel.threadBodyFontSize) }}
          >
            {t("chat.thread.loadFailed")}
          </p>
        ) : messages.length === 0 ? (
          <div className="text-center" data-testid="thread-empty">
            <p
              className="text-[hsl(var(--foreground))]"
              style={{ fontSize: pxToRem(sidePanel.threadBodyFontSize), fontWeight: 600 }}
            >
              {t("chat.thread.emptyTitle")}
            </p>
            <p
              className="text-[hsl(var(--text-secondary))]"
              style={{
                fontSize: pxToRem(sidePanel.threadTimeFontSize),
                marginTop: pxToRem(sidePanel.headerSubtitleMarginTop),
              }}
            >
              {t("chat.thread.emptyDescription")}
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1];
            const isGrouped =
              Boolean(previous) &&
              previous?.author.id === message.author.id &&
              Math.abs(
                new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime(),
              ) < MESSAGE_GROUP_WINDOW_MS;

            return (
              <MessageItem
                canModerate={canModerate}
                currentUserId={currentUserId}
                {...(currentUsername ? { currentUsername } : {})}
                isGrouped={isGrouped}
                key={message.id}
                message={message}
                mode={mode}
                onReact={handleReact}
                onRemoveOptimistic={() => undefined}
                onReply={handleReply}
                onRetry={() => undefined}
                onThread={() => undefined}
              />
            );
          })
        )}
      </div>

      <div
        className="shrink-0"
        style={{
          borderTop: `${hairline()} solid hsl(var(--border)/0.5)`,
          padding: `${pxToRem(sidePanel.threadComposerPaddingTop)} ${pxToRem(sidePanel.threadComposerPaddingX)} ${pxToRem(sidePanel.threadComposerPaddingBottom)}`,
        }}
      >
        {threadClosed ? (
          <p
            className="mb-2 rounded-lg bg-[hsl(var(--warning)/0.12)] px-3 py-2 text-xs font-medium text-[hsl(var(--warning))]"
            data-testid="thread-closed-notice"
          >
            {t("messages.panel.thread.closed")}
          </p>
        ) : null}
        {threadStateError ? (
          <p className="mb-2 text-xs text-[hsl(var(--danger))]" role="alert">
            {t("messages.panel.thread.stateError")}
          </p>
        ) : null}
        <MessageInput
          autoFocus
          allowFileUploads={allowFileUploads}
          allowGifs={allowGifs}
          conversationId={conversationId}
          disabled={disabled || threadClosed}
          disabledReason={threadClosed ? t("messages.panel.thread.closed") : disabledReason}
          maxLength={messageCharacterLimit}
          mentionMembers={mode === "channel" ? mentionMembers : []}
          mentionRoles={mode === "channel" ? mentionRoles : []}
          mode={mode}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
          replyTo={replyTo}
          uploadthingEnabled={uploadthingEnabled}
          variant="thread"
        />

        <label
          className={cn("flex cursor-pointer items-center text-[hsl(var(--text-secondary))]")}
          data-testid="thread-also-send"
          style={{
            fontSize: pxToRem(sidePanel.threadAlsoSendFontSize),
            gap: pxToRem(sidePanel.threadAlsoSendGap),
            marginTop: pxToRem(sidePanel.threadAlsoSendMarginTop),
          }}
        >
          <input
            checked={alsoSendToChannel}
            className="accent-[hsl(var(--primary))]"
            disabled={threadClosed}
            onChange={(event) => setAlsoSendToChannel(event.target.checked)}
            style={{
              height: pxToRem(sidePanel.threadAlsoSendBoxSize),
              width: pxToRem(sidePanel.threadAlsoSendBoxSize),
            }}
            type="checkbox"
          />
          {t("messages.panel.thread.alsoSend")}
        </label>
      </div>
    </MessagesSidePanel>
  );
}
