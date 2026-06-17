"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Check,
  ChevronRight,
  CheckCircle2,
  CornerDownRight,
  Clock3,
  Copy,
  MessageCircleMore,
  MoreHorizontal,
  Pin,
  RotateCcw,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { Button } from "@wizards/ui";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQueryClient } from "@tanstack/react-query";
import {
  getMessagesQueryKey,
  type MessageMode,
  type MessagePages,
} from "@/hooks/use-messages";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { UserProfilePopover } from "@/components/shared/user-profile-popover";
import { MessageEditor } from "./message-editor";
import { MessageAttachments } from "./message-attachments";
import { MessageToolbar } from "./message-toolbar";
import { LinkPreviewCard } from "./link-preview-card";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import {
  pinChannelMessageRequest,
  unpinChannelMessageRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import type { ChatMessage } from "@wizards/types";
import { cn } from "@/lib/utils";

const mentionHrefPrefix = "mention:";
const underlineHrefPrefix = "underline:";
const pollVoteEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const defaultPollDurationMinutes = 60;
const minPollDurationMinutes = 5;
const maxPollDurationMinutes = 60 * 24 * 7;

type ParsedPoll = {
  contentWithoutPoll: string;
  durationMinutes: number;
  options: string[];
  question: string;
};

function markdownUrlTransform(url: string) {
  if (url.startsWith(mentionHrefPrefix) || url.startsWith(underlineHrefPrefix)) {
    return url;
  }

  return defaultUrlTransform(url);
}

const codeKeywordPattern =
  /\b(?:async|await|break|catch|class|const|continue|else|export|false|finally|for|from|function|if|import|interface|let|new|null|return|throw|true|try|type|undefined|var|while)\b/g;
const codeTokenPattern =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|\b\d+(?:\.\d+)?\b)/g;

function renderHighlightedCodeLine(line: string, lineIndex: number) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  const pushText = (value: string, keyPrefix: string) => {
    let keywordCursor = 0;
    for (const match of value.matchAll(codeKeywordPattern)) {
      const keyword = match[0];
      const index = match.index ?? 0;
      if (index > keywordCursor) {
        parts.push(value.slice(keywordCursor, index));
      }
      parts.push(
        <span className="text-[hsl(var(--primary))]" key={`${keyPrefix}-kw-${index}`}>
          {keyword}
        </span>,
      );
      keywordCursor = index + keyword.length;
    }

    if (keywordCursor < value.length) {
      parts.push(value.slice(keywordCursor));
    }
  };

  for (const match of line.matchAll(codeTokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      pushText(line.slice(cursor, index), `${lineIndex}-${cursor}`);
    }

    const tokenClass =
      token.startsWith("//") || token.startsWith("#")
        ? "text-app-soft italic"
        : /^\d/.test(token)
          ? "text-[hsl(var(--warning))]"
          : "text-[hsl(var(--success))]";

    parts.push(
      <span className={tokenClass} key={`${lineIndex}-token-${index}`}>
        {token}
      </span>,
    );
    cursor = index + token.length;
  }

  if (cursor < line.length) {
    pushText(line.slice(cursor), `${lineIndex}-${cursor}`);
  }

  return parts.length > 0 ? parts : "\u00A0";
}

function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  const rawCode = String(children).replace(/\n$/, "");
  const language = /language-([\w-]+)/.exec(className ?? "")?.[1] ?? "text";
  const isBlock = Boolean(className) || rawCode.includes("\n");
  const [copied, setCopied] = useState(false);

  if (!isBlock) {
    return (
      <code className="rounded-md border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-soft)/0.6)] px-1.5 py-0.5 text-[0.88em] font-semibold text-app-foreground">
        {children}
      </code>
    );
  }

  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.58)] shadow-[0_10px_24px_hsl(var(--shadow-color)/0.05)]">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border)/0.55)] px-3 py-2">
        <span className="min-w-0 truncate text-xs font-semibold text-app-muted">
          {language}
        </span>
        <button
          aria-label={copied ? "Kopyalandı" : "Kodu kopyala"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border)/0.65)] bg-[hsl(var(--surface-card)/0.72)] text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(rawCode);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            } catch {
              setCopied(false);
            }
          }}
          title={copied ? "Kopyalandı" : "Kodu kopyala"}
          type="button"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3 font-mono text-[13px] leading-relaxed text-app-foreground">
        <code>
          {rawCode.split("\n").map((line, index) => (
            <span className="block min-h-5" key={`${index}-${line}`}>
              {renderHighlightedCodeLine(line, index)}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function clampPollDuration(minutes: number) {
  if (!Number.isFinite(minutes)) {
    return defaultPollDurationMinutes;
  }

  return Math.min(
    maxPollDurationMinutes,
    Math.max(minPollDurationMinutes, Math.round(minutes)),
  );
}

function parsePollDuration(value: string | undefined) {
  if (!value) {
    return defaultPollDurationMinutes;
  }

  const match = value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .match(/^(\d{1,4})\s*(m|min|dk|dakika|h|hr|saat|d|day|gün|gun)?$/);

  if (!match) {
    return defaultPollDurationMinutes;
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "m";

  if (["h", "hr", "saat"].includes(unit)) {
    return clampPollDuration(amount * 60);
  }

  if (["d", "day", "gün", "gun"].includes(unit)) {
    return clampPollDuration(amount * 60 * 24);
  }

  return clampPollDuration(amount);
}

function parsePollBlock(content: string): ParsedPoll | null {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");
  const pollStartIndex = lines.findIndex((line) => line.trim().length > 0);

  if (pollStartIndex === -1) {
    return null;
  }

  const titleMatch = lines[pollStartIndex]
    ?.trim()
    .match(/^\*\*(?:Poll|Anket):\*\*\s*(.+)$/i);

  if (!titleMatch) {
    return null;
  }

  const question = titleMatch[1]?.trim();
  if (!question) {
    return null;
  }

  const options: string[] = [];
  let durationMinutes = defaultPollDurationMinutes;
  let pollEndIndex = pollStartIndex;

  for (let index = pollStartIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      pollEndIndex = index;
      continue;
    }

    const durationMatch = trimmed.match(/^(?:Duration|Süre|Sure):\s*(.+)$/i);
    if (durationMatch) {
      durationMinutes = parsePollDuration(durationMatch[1]);
      pollEndIndex = index;
      continue;
    }

    const optionMatch =
      trimmed.match(/^[-*]\s+(?:\[[ xX]\]\s*)?(.+)$/) ??
      trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (optionMatch) {
      const option = optionMatch[1]?.trim();
      if (option) {
        options.push(option);
      }
      pollEndIndex = index;
      continue;
    }

    break;
  }

  if (options.length < 2) {
    return null;
  }

  const before = lines.slice(0, pollStartIndex).join("\n").trim();
  const after = lines.slice(pollEndIndex + 1).join("\n").trim();
  const contentWithoutPoll = [before, after].filter(Boolean).join("\n\n");

  return {
    contentWithoutPoll,
    durationMinutes,
    options: options.slice(0, pollVoteEmojis.length),
    question,
  };
}

function formatPollRemainingTime(
  remainingMs: number,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (remainingMs <= 0) {
    return t("chat.poll.closed");
  }

  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) {
    return t("chat.poll.endsInMinutes", { count: minutes });
  }

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) {
    return t("chat.poll.endsInHours", { count: hours });
  }

  return t("chat.poll.endsInDays", { count: Math.ceil(hours / 24) });
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function formatMessageContentForMarkdown(content: string) {
  return content
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((segment, index) => {
      if (index % 2 === 1) {
        return segment;
      }

      return segment
        .replace(/\+\+([^+\n]+?)\+\+/g, (_match, value: string) => {
          const label = escapeMarkdownLabel(value);
          return `[${label}](${underlineHrefPrefix})`;
        })
        .replace(
          /(^|[^\w`])@([a-zA-Z0-9_]{2,32})\b/g,
          (match, prefix: string, username: string) => {
            if (prefix === "[" || match.includes("](")) {
              return match;
            }

            return `${prefix}[@${username}](${mentionHrefPrefix}${username})`;
          },
        );
    })
    .join("");
}

function createMarkdownComponents(
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  return {
    a({ children, href, title }) {
      if (href?.startsWith(underlineHrefPrefix)) {
        return (
          <span className="underline decoration-[hsl(var(--primary)/0.5)] decoration-2 underline-offset-4">
            {children}
          </span>
        );
      }

      if (href?.startsWith(mentionHrefPrefix)) {
        const username = href.slice(mentionHrefPrefix.length);

        return (
          <span
            aria-label={t("chat.mentions.inlineAria", { username: `@${username}` })}
            className="inline-flex translate-y-[1px] items-center rounded-full border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[0.92em] font-semibold text-[hsl(var(--primary))] shadow-[0_8px_18px_hsl(var(--primary)/0.08)]"
            data-mention-username={username}
            data-testid="message-mention"
            title={`@${username}`}
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
    blockquote({ children }) {
      return (
        <blockquote className="my-1 rounded-l-none rounded-r-md border-l-2 border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--surface-soft)/0.6)] px-2.5 py-1.5 text-app-muted">
          {children}
        </blockquote>
      );
    },
    code({ children, className }) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    },
    li({ children }) {
      return <li className="pl-1 leading-5">{children}</li>;
    },
    ol({ children }) {
      return (
        <ol className="my-1 ml-5 list-decimal space-y-0 marker:font-bold marker:text-[hsl(var(--primary))]">
          {children}
        </ol>
      );
    },
    p({ children }) {
      return <p className="my-0 first:mt-0 last:mb-0">{children}</p>;
    },
    pre({ children }) {
      return <>{children}</>;
    },
    ul({ children }) {
      return (
        <ul className="my-1 ml-5 list-disc space-y-0 marker:text-[hsl(var(--primary))]">
          {children}
        </ul>
      );
    },
  } satisfies Components;
}

function PollCard({
  currentUserId,
  message,
  mode,
  poll,
}: {
  currentUserId: string;
  message: ChatMessage;
  mode: MessageMode;
  poll: ParsedPoll;
}) {
  const { t } = useI18n();
  const socket = useSocket();
  const [now, setNow] = useState(() => Date.now());
  const endsAt = new Date(message.createdAt).getTime() + poll.durationMinutes * 60_000;
  const remainingMs = Math.max(0, endsAt - now);
  const isClosed = remainingMs <= 0;
  const optionReactions = poll.options.map((_, index) =>
    message.reactions.find((reaction) => reaction.emoji === pollVoteEmojis[index]),
  );
  const selectedIndex = optionReactions.findIndex((reaction) =>
    reaction?.userIds.includes(currentUserId),
  );
  const totalVotes = optionReactions.reduce((total, reaction) => total + (reaction?.count ?? 0), 0);

  useEffect(() => {
    if (isClosed) {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [isClosed]);

  const emitPollReaction = (eventName: "react" | "unreact", emoji: string) => {
    const socketEvent =
      mode === "channel"
        ? eventName === "react"
          ? "message:react"
          : "message:unreact"
        : eventName === "react"
          ? "dm:message:react"
          : "dm:message:unreact";

    socket.emit(socketEvent, { emoji, messageId: message.id });
  };

  const handleVote = (optionIndex: number) => {
    if (isClosed || message.id.startsWith("optimistic-")) {
      return;
    }

    optionReactions.forEach((reaction, reactionIndex) => {
      const emoji = pollVoteEmojis[reactionIndex];
      if (!emoji || reactionIndex === optionIndex || !reaction?.userIds.includes(currentUserId)) {
        return;
      }

      emitPollReaction("unreact", emoji);
    });

    const nextEmoji = pollVoteEmojis[optionIndex];
    if (nextEmoji && selectedIndex !== optionIndex) {
      emitPollReaction("react", nextEmoji);
    }
  };

  return (
    <div
      className="my-1 max-w-2xl rounded-[18px] border border-[hsl(var(--primary)/0.18)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.96),hsl(var(--primary)/0.055))] p-2.5 shadow-[0_12px_30px_hsl(var(--shadow-color)/0.07),inset_0_1px_0_hsl(var(--background)/0.55)]"
      data-testid="message-poll"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
            <BarChart3 className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-app-soft">
              {t("chat.poll.title")}
            </p>
            <h4 className="break-words text-sm font-extrabold leading-[1.25] text-app-foreground">
              {poll.question}
            </h4>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold",
            isClosed
              ? "border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-soft)/0.5)] text-app-muted"
              : "border-[hsl(var(--success)/0.24)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]",
          )}
        >
          <Clock3 className="h-3.5 w-3.5" />
          {formatPollRemainingTime(remainingMs, t)}
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {poll.options.map((option, index) => {
          const reaction = optionReactions[index];
          const count = reaction?.count ?? 0;
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isSelected = selectedIndex === index;

          return (
            <button
              aria-label={t("chat.poll.voteAria", { option })}
              className={cn(
                "group/poll relative flex w-full items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]",
                isSelected
                  ? "border-[hsl(var(--primary)/0.36)] bg-[hsl(var(--primary)/0.11)] text-app-foreground"
                  : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-overlay)/0.44)] text-app-muted hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--primary)/0.07)] hover:text-app-foreground",
                isClosed ? "cursor-default" : "cursor-pointer",
              )}
              disabled={isClosed}
              key={`${message.id}-poll-${option}`}
              onClick={() => handleVote(index)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-1 left-1 rounded-[14px] bg-[hsl(var(--primary)/0.13)] transition-[width]"
                style={{ width: `${Math.max(percent, isSelected ? 9 : 0)}%` }}
              />
              <span
                className={cn(
                  "relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black",
                  isSelected
                    ? "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary))] text-white"
                    : "border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.9)] text-app-soft",
                )}
              >
                {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
              </span>
                  <span className="relative z-10 min-w-0 flex-1 truncate text-[13px] font-semibold">
                {option}
              </span>
              <span className="relative z-10 shrink-0 text-xs font-bold text-app-soft">
                {percent}% · {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-app-soft">
        <span>{totalVotes > 0 ? t("chat.poll.voteCount", { count: totalVotes }) : t("chat.poll.noVotes")}</span>
        {selectedIndex >= 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary)/0.09)] px-2 py-0.5 text-[hsl(var(--primary))]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("chat.poll.yourVote")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatReactionSummary(
  reaction: ChatMessage["reactions"][number],
  currentUserId: string,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const users = reaction.users ?? [];
  const names = users
    .map((user) =>
      user.id === currentUserId
        ? t("chat.message.reactionYou")
        : user.displayName ?? user.username,
    )
    .filter((name) => name.trim().length > 0);

  if (names.length === 0) {
    return t("chat.message.reactionCount", { count: reaction.count });
  }

  const visibleNames = names.slice(0, 6);
  const remainingCount = Math.max(0, reaction.count - visibleNames.length);

  return remainingCount > 0
    ? `${visibleNames.join(", ")} +${remainingCount}`
    : visibleNames.join(", ");
}

interface MessageItemProps {
  mode: MessageMode;
  message: ChatMessage;
  isGrouped: boolean;
  currentUserId: string;
  canModerate: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onRemoveOptimistic: (id: string) => void;
  onReply: (id: string, author: string, content: string) => void;
  onRetry: (id: string) => void;
  onThread: (message: ChatMessage) => void;
}

export const MessageItem = React.memo(
  function MessageItem({
    mode,
    message,
    isGrouped,
    currentUserId,
    canModerate,
    onReact,
    onRemoveOptimistic,
    onReply,
    onRetry,
    onThread,
  }: MessageItemProps) {
    const { locale, t } = useI18n();
    const socket = useSocket();
    const queryClient = useQueryClient();
    const [isEditing, setIsEditing] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const actionsRef = useRef<HTMLDivElement>(null);
    const hoverActionsRef = useRef<HTMLDivElement>(null);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    const isOwner = message.author.id === currentUserId;
    const isDeleted = message.deletedAt !== null;
    const canRemoveDeletedPlaceholder =
      isDeleted &&
      (canModerate || message.deletedById === currentUserId || (!message.deletedById && isOwner));
    const isOptimistic = message.id.startsWith("optimistic-");
    const isFailed = message.deliveryStatus === "failed";
    const threadReplyCount = message.threadSummary?.replyCount ?? 0;
    const recentThreadRepliers = message.threadSummary?.recentRepliers ?? [];
    const lastThreadReplier = recentThreadRepliers[0] ?? null;
    const formattedTime = new Date(message.createdAt).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const threadLastReplyLabel = message.threadSummary?.lastReplyAt
      ? (() => {
          const replyDate = new Date(message.threadSummary.lastReplyAt);
          const today = new Date();
          const time = replyDate.toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
          });

          if (replyDate.toDateString() === today.toDateString()) {
            return t("chat.thread.lastReplyToday", { time });
          }

          return t("chat.thread.lastReplyAt", {
            date: replyDate.toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
            }),
          });
        })()
      : null;
    const markdownComponents = React.useMemo(() => createMarkdownComponents(t), [t]);
    const parsedPoll = React.useMemo(() => parsePollBlock(message.content), [message.content]);
    const markdownContent = parsedPoll?.contentWithoutPoll ?? message.content;
    const hasRenderableMessageBody =
      markdownContent.trim().length > 0 || Boolean(parsedPoll) || Boolean(message.editedAt);
    const pollReactionEmojis = React.useMemo(
      () =>
        new Set(
          parsedPoll?.options.map((_option, index) => pollVoteEmojis[index]).filter(Boolean) ?? [],
        ),
      [parsedPoll],
    );
    const visibleReactions = parsedPoll
      ? message.reactions.filter((reaction) => !pollReactionEmojis.has(reaction.emoji))
      : message.reactions;

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

    const applyMessageUpdate = (updatedMessage: ChatMessage) => {
      queryClient.setQueryData<MessagePages>(
        getMessagesQueryKey("channel", updatedMessage.channelId),
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              messages: page.messages.map((candidate) =>
                candidate.id === updatedMessage.id ? updatedMessage : candidate,
              ),
            })),
          };
        },
      );
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.pinnedMessages(updatedMessage.channelId),
      });
    };

    const handlePinToggle = async () => {
      if (mode !== "channel") {
        return;
      }

      try {
        const updatedMessage = message.isPinned
          ? await unpinChannelMessageRequest(message.channelId, message.id)
          : await pinChannelMessageRequest(message.channelId, message.id);

        applyMessageUpdate(updatedMessage);
        setActionsOpen(false);
      } catch {
        showCopyFeedback("chat.message.pinFailed");
      }
    };

    const showCopyFeedback = (translationKey: string) => {
      setCopyFeedback(t(translationKey));
      window.setTimeout(() => setCopyFeedback(null), 1400);
    };

    const copyMessageLink = async () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("message", message.id);
        await navigator.clipboard.writeText(url.toString());
        showCopyFeedback("chat.message.linkCopied");
        setActionsOpen(false);
      } catch {
        showCopyFeedback("chat.message.copyFailed");
      }
    };

    const copyRawText = async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        showCopyFeedback("chat.message.rawTextCopied");
        setActionsOpen(false);
      } catch {
        showCopyFeedback("chat.message.copyFailed");
      }
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

        if (hoverActionsRef.current?.contains(target)) {
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
        <div className="px-2 py-1.5 sm:px-3" role="status" aria-live="polite">
          <div className="app-system-message mx-auto flex max-w-xl items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
            <Icon className="app-system-message-icon h-3.5 w-3.5" />
            <span className="message-font-scope">{systemContent}</span>
          </div>
        </div>
      );
    }

    if (isDeleted) {
      return (
        <>
          <div
            aria-label={t("chat.message.deleted")}
            className="group flex items-center gap-2 px-4 py-0.5 text-xs italic text-app-muted"
            role="note"
          >
            <span className="message-font-scope">{t("chat.message.deleted")}</span>
            {canRemoveDeletedPlaceholder ? (
              <button
                aria-label={t("chat.message.removeDeletedPlaceholderAria")}
                className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--danger)/0.18)] bg-[hsl(var(--danger)/0.07)] px-2 py-0.5 text-[11px] font-semibold not-italic text-[hsl(var(--danger))] opacity-0 transition hover:bg-[hsl(var(--danger)/0.12)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.28)] group-hover:opacity-100"
                data-testid="message-remove-deleted-placeholder"
                onClick={() => setDeleteDialogOpen(true)}
                type="button"
              >
                <Trash2 className="h-3 w-3" />
                {t("chat.message.removeDeletedPlaceholder")}
              </button>
            ) : null}
          </div>

          <Modal
            className="max-w-md"
            description={t("chat.message.removeDeletedDialogDescription")}
            onClose={() => setDeleteDialogOpen(false)}
            open={deleteDialogOpen}
            title={t("chat.message.removeDeletedDialogTitle")}
          >
            <div
              className="rounded-[24px] border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] p-4"
              data-testid="message-remove-deleted-dialog"
            >
              <p className="text-sm font-medium text-app-foreground">
                {t("chat.message.removeDeletedDialogBody")}
              </p>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                className="w-full rounded-2xl sm:w-auto"
                data-testid="message-remove-deleted-cancel"
                onClick={() => setDeleteDialogOpen(false)}
                type="button"
                variant="outline"
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="w-full rounded-2xl bg-[hsl(var(--danger))] text-white hover:bg-[hsl(var(--danger)/0.9)] sm:w-auto"
                data-testid="message-remove-deleted-confirm"
                onClick={confirmDelete}
                type="button"
              >
                {t("chat.message.removeDeletedPlaceholder")}
              </Button>
            </div>
          </Modal>
        </>
      );
    }

    return (
      <>
        <div
          className={cn(
            "group relative px-0 py-[1px] transition",
            "data-[jump-highlight=true]:rounded-3xl data-[jump-highlight=true]:bg-[hsl(var(--primary)/0.12)] data-[jump-highlight=true]:ring-2 data-[jump-highlight=true]:ring-[hsl(var(--primary)/0.28)]",
            isOptimistic && !isFailed && "opacity-70",
            isFailed && "opacity-95",
          )}
          aria-label={t("chat.message.itemAria", {
            author: message.author.displayName,
            time: formattedTime,
          })}
          data-message-id={message.id}
          data-testid="message-item"
          role="article"
          tabIndex={-1}
        >
          {!isEditing && !isOptimistic ? (
            <div
              className={cn(
                "absolute right-3 -top-3 z-20 hidden opacity-0 transition md:flex md:group-hover:opacity-100 md:focus-within:opacity-100",
                actionsOpen && "md:opacity-100",
              )}
              ref={hoverActionsRef}
            >
              <MessageToolbar
                allowReact
                allowThread={false}
                variant="hover"
                messageId={message.id}
                isOwner={isOwner}
                canModerate={canModerate}
                isPinned={Boolean(message.isPinned)}
                isMoreOpen={actionsOpen}
                onReact={(emoji) => onReact(message.id, emoji)}
                onReply={() => onReply(message.id, message.author.displayName, message.content)}
                onThread={() => onThread(message)}
                onEdit={() => setIsEditing(true)}
                onDelete={handleDelete}
                onMore={() => setActionsOpen((current) => !current)}
              />
            </div>
          ) : null}

          <div
            className={cn(
              "grid grid-cols-[2.35rem_minmax(0,1fr)] items-start gap-3 rounded-[18px] px-2 transition hover:bg-[hsl(var(--surface-card)/0.44)] sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:px-3",
              isGrouped ? "py-0.5" : "py-2",
            )}
          >
            <div className="flex justify-center">
              {isGrouped ? (
                <div aria-hidden="true" className="av-ph relative min-h-0 w-9 shrink-0">
                  <span className="absolute right-0 top-0.5 text-right text-[10px] font-medium text-app-soft opacity-0 transition group-hover:opacity-100">
                    {formattedTime}
                  </span>
                </div>
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
                      className="h-9 w-9 flex-shrink-0 rounded-full shadow-[0_6px_16px_hsl(var(--shadow-color)/0.055)]"
                      fallback={message.author.displayName[0] || "?"}
                    />
                  </span>
                </UserProfilePopover>
              )}
            </div>

            <div className="relative min-w-0 pr-9 md:pr-0">
              {!isGrouped && (
                <div className="flex items-center gap-1.5 pr-2 leading-5">
                  <span className="truncate text-[15px] font-bold text-app-foreground">
                    {message.author.displayName}
                  </span>
                  <span className="shrink-0 text-xs text-app-muted">{formattedTime}</span>
                  {message.isPinned ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--primary))]"
                      data-testid="message-pinned-badge"
                    >
                      <Pin className="h-3 w-3" />
                      {t("chat.message.pinned")}
                    </span>
                  ) : null}
                </div>
              )}

              {message.replyTo && !isEditing && (
                  <button
                    aria-label={t("chat.message.replyPreviewAria", {
                      author: message.replyTo.authorName,
                    })}
                    className="mb-1 flex max-w-full items-center gap-1.5 rounded-l-none rounded-r-md border-l-2 border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--surface-soft)/0.6)] px-2 py-1 text-left transition hover:bg-[hsl(var(--primary)/0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
                    onClick={() => {
                      const target = document.querySelector(`[data-message-id="${message.replyTo?.id}"]`);
                      if (target instanceof HTMLElement) {
                        target.scrollIntoView({ behavior: "smooth", block: "center" });
                        target.dataset.jumpHighlight = "true";
                        window.setTimeout(() => {
                          delete target.dataset.jumpHighlight;
                        }, 1400);
                      }
                    }}
                    type="button"
                  >
                  <span className="max-w-[9rem] shrink-0 truncate text-xs font-semibold text-[hsl(var(--primary))]">
                    {message.replyTo.authorName}
                  </span>
                  <p className="message-font-scope min-w-0 flex-1 truncate text-xs text-app-muted">
                    {message.replyTo.content}
                  </p>
                  </button>
              )}

              {isEditing ? (
                <MessageEditor
                  initialContent={message.content}
                  onSave={handleEdit}
                  onCancel={() => setIsEditing(false)}
                />
              ) : hasRenderableMessageBody ? (
                <div className="message-font-scope max-w-full break-words text-sm leading-relaxed text-app-foreground [overflow-wrap:anywhere]">
                  <div className="relative inline-block max-w-full align-top md:max-w-[calc(100%-10rem)] 2xl:max-w-[76rem] [&_a]:text-[hsl(var(--primary))] [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto">
                    {markdownContent.trim().length > 0 ? (
                      <ReactMarkdown
                        components={markdownComponents}
                        remarkPlugins={[remarkGfm]}
                        urlTransform={markdownUrlTransform}
                      >
                        {formatMessageContentForMarkdown(markdownContent)}
                      </ReactMarkdown>
                    ) : null}
                    {parsedPoll ? (
                      <PollCard
                        currentUserId={currentUserId}
                        message={message}
                        mode={mode}
                        poll={parsedPoll}
                      />
                    ) : null}
                    {message.editedAt ? (
                      <span className="inline-flex align-baseline text-[11px] font-medium italic text-app-soft">
                        {t("chat.message.edited")}
                      </span>
                    ) : null}

                  </div>
                </div>
              ) : null}

              {!isEditing ? <MessageAttachments attachments={message.attachments} /> : null}
              {!isEditing ? <LinkPreviewCard content={markdownContent} /> : null}

              {copyFeedback ? (
                <div className="mt-1 inline-flex rounded-full border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.85)] px-3 py-1 text-[11px] font-semibold text-app-muted shadow-[0_10px_24px_hsl(var(--shadow-color)/0.08)]">
                  {copyFeedback}
                </div>
              ) : null}

              {threadReplyCount > 0 && !isEditing ? (
                <div className="mt-1 flex max-w-full items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[hsl(var(--primary)/0.72)]"
                  >
                    <CornerDownRight className="h-4 w-4" />
                  </span>
                  <button
                    className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-2xl border border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--surface-soft)/0.54)] px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--primary))] shadow-[0_10px_24px_hsl(var(--shadow-color)/0.05)] transition hover:border-[hsl(var(--primary)/0.34)] hover:bg-[hsl(var(--primary)/0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]"
                    data-testid="message-thread-preview"
                    onClick={() => onThread(message)}
                    type="button"
                  >
                    {recentThreadRepliers.length > 0 ? (
                      <span className="flex shrink-0 items-center -space-x-1">
                        {recentThreadRepliers.slice(0, 3).map((user) => (
                          <Avatar
                            alt={user.displayName ?? user.username}
                            className="h-5 w-5 border border-[hsl(var(--surface-card))] bg-[hsl(var(--surface-card))] text-[9px]"
                            fallback={user.displayName ?? user.username}
                            key={user.userId}
                            src={user.avatarUrl}
                          />
                        ))}
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)]">
                        <MessageCircleMore className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="shrink-0">
                      {t("chat.thread.replyCount", { count: threadReplyCount })}
                    </span>
                    {threadLastReplyLabel ? (
                      <span className="min-w-0 truncate text-app-muted">
                        / {threadLastReplyLabel}
                      </span>
                    ) : null}
                    {lastThreadReplier ? (
                      <span className="hidden min-w-0 max-w-[9rem] truncate text-app-muted sm:inline">
                        / {lastThreadReplier.displayName ?? lastThreadReplier.username}
                      </span>
                    ) : null}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-app-soft" />
                  </button>
                </div>
              ) : null}

              {message.deliveryStatus ? (
                <div
                  className={`mt-1 inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                    isFailed
                      ? "border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]"
                      : "border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--primary)/0.08)] text-app-muted"
                  }`}
                  data-testid={`message-delivery-${message.deliveryStatus}`}
                >
                  {isFailed ? <AlertCircle className="h-3.5 w-3.5" /> : null}
                  <span>
                    {isFailed
                      ? message.errorMessage ?? t("chat.message.sendFailed")
                      : t("chat.message.sending")}
                  </span>
                  {isFailed ? (
                    <>
                      <button
                        className="inline-flex items-center gap-1 rounded-full bg-white/65 px-2 py-1 text-[hsl(var(--danger))] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.35)]"
                        data-testid="message-retry"
                        onClick={() => onRetry(message.id)}
                        type="button"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {t("chat.message.retry")}
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-full bg-white/65 px-2 py-1 text-app-muted transition hover:bg-white hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.35)]"
                        data-testid="message-remove-failed"
                        onClick={() => onRemoveOptimistic(message.id)}
                        type="button"
                      >
                        <Trash2 className="h-3 w-3" />
                        {t("chat.message.removeFailed")}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {visibleReactions.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {visibleReactions.map((reaction) => {
                    const reactionSummary = formatReactionSummary(reaction, currentUserId, t);

                    return (
                    <span
                      className="group/reaction relative inline-flex"
                      key={reaction.emoji}
                    >
                      <button
                      aria-label={t("chat.message.reactionAria", {
                        count: reaction.count,
                        emoji: reaction.emoji,
                      })}
                      title={reactionSummary}
                      className={cn(
                        "inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-5 transition",
                        reaction.userIds.includes(currentUserId)
                          ? "border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.1)] text-app-foreground"
                          : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.62)] text-app-muted hover:bg-[hsl(var(--surface-soft)/0.82)] hover:text-app-foreground",
                      )}
                      data-emoji={reaction.emoji}
                      data-testid="message-reaction"
                      onClick={() => onReact(message.id, reaction.emoji)}
                      type="button"
                    >
                      {reaction.emoji} {reaction.count}
                      </button>
                      <span className="pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-1/2 z-30 hidden max-w-[18rem] -translate-x-1/2 truncate whitespace-nowrap rounded-xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card))] px-2.5 py-1.5 text-[11px] font-semibold text-app-foreground shadow-[0_14px_34px_hsl(var(--shadow-color)/0.18)] group-focus-within/reaction:block group-hover/reaction:block">
                        {reactionSummary}
                      </span>
                    </span>
                    );
                  })}
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
                  className="absolute right-0 top-9 z-30 flex justify-end md:right-3 md:top-7"
                  onClick={(event) => event.stopPropagation()}
                  ref={actionsRef}
                >
                  <MessageToolbar
                    allowReact
                    allowThread={!message.threadParentId}
                    messageId={message.id}
                    isOwner={isOwner}
                    canModerate={canModerate}
                    isPinned={Boolean(message.isPinned)}
                    onReact={(emoji) => onReact(message.id, emoji)}
                    onCopyLink={copyMessageLink}
                    onCopyRawText={copyRawText}
                    onThread={() => {
                      setActionsOpen(false);
                      onThread(message);
                    }}
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
                    onPin={mode === "channel" ? handlePinToggle : undefined}
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
    prev.message.isPinned === next.message.isPinned &&
    prev.message.pinnedAt === next.message.pinnedAt &&
    prev.message.deliveryStatus === next.message.deliveryStatus &&
    prev.message.errorMessage === next.message.errorMessage &&
    prev.message.replyTo?.id === next.message.replyTo?.id &&
    prev.message.threadSummary?.replyCount === next.message.threadSummary?.replyCount &&
    prev.message.threadSummary?.lastReplyAt === next.message.threadSummary?.lastReplyAt &&
    prev.message.threadSummary?.recentRepliers === next.message.threadSummary?.recentRepliers &&
    prev.isGrouped === next.isGrouped &&
    prev.currentUserId === next.currentUserId &&
    prev.canModerate === next.canModerate &&
    prev.onReact === next.onReact &&
    prev.onRemoveOptimistic === next.onRemoveOptimistic &&
    prev.onReply === next.onReply &&
    prev.onRetry === next.onRetry &&
    prev.onThread === next.onThread,
);
