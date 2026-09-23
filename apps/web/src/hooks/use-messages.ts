"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  replaceEqualDeep,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  ChatMessage,
  DMMessagePayload,
  MessageReaction,
  MessageAttachment,
  MessagesResponse,
  ReplyTo,
} from "@wizards/types";
import { fetchDMMessages } from "@/lib/dm/client";
import type { FriendPresenceUpdateDto } from "@/lib/friends/types";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";
import type { AcknowledgedClientToServerEvents, ServerToClientEvents } from "@/lib/socket/events";
import type { Socket } from "socket.io-client";
import { useSocket } from "./use-socket";

export type MessageMode = "channel" | "dm";

type MessagePageResponse = {
  hasMore?: boolean;
  messages: ChatMessage[];
  nextCursor?: string | null;
};

export type MessagePages = InfiniteData<MessagePageResponse, string | undefined>;

export function getMessagesQueryKey(mode: MessageMode, conversationId: string) {
  return ["messages", mode, conversationId] as const;
}

/** Keep only changes made locally while a snapshot was in flight. Blindly
 * unioning old server rows would resurrect remote deletions. */
export function reconcileMessageSnapshot(
  baseline: MessagePages | undefined,
  current: MessagePages | undefined,
  snapshot: MessagePages,
): MessagePages {
  if (!current || snapshot.pages.length === 0) return snapshot;
  const before = new Map(
    baseline?.pages.flatMap((page) =>
      page.messages.map((message) => [message.id, message] as const),
    ),
  );
  const now = new Map(
    current.pages.flatMap((page) => page.messages.map((message) => [message.id, message] as const)),
  );
  const confirmed = new Set(
    snapshot.pages.flatMap((page) =>
      page.messages.flatMap((message) => (message.clientNonce ? [message.clientNonce] : [])),
    ),
  );
  const seen = new Set<string>();
  const pages = snapshot.pages.map((page) => ({
    ...page,
    messages: page.messages.flatMap((message) => {
      if (
        seen.has(message.id) ||
        (before.has(message.id) && !now.has(message.id)) ||
        confirmed.has(message.id)
      )
        return [];
      seen.add(message.id);
      const initial = before.get(message.id);
      const latest = now.get(message.id);
      if (!initial || !latest || latest === initial) return [message];
      const changes = Object.fromEntries(
        Object.keys(latest)
          .filter((key) => latest[key as keyof ChatMessage] !== initial[key as keyof ChatMessage])
          .map((key) => [key, latest[key as keyof ChatMessage]]),
      );
      return [{ ...message, ...changes }];
    }),
  }));
  const additions = [...now.values()].filter(
    (message) =>
      !seen.has(message.id) &&
      !confirmed.has(message.id) &&
      (isOptimisticMessageId(message.id) || !before.has(message.id)),
  );
  if (additions.length) {
    pages[0] = {
      ...pages[0]!,
      messages: [...pages[0]!.messages, ...additions].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      ),
    };
  }
  return { ...snapshot, pages };
}

export function patchMessageAuthors(
  current: MessagePages | undefined,
  profile: UserProfileUpdatedPayload,
): MessagePages | undefined {
  if (!current) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) => {
    let pageChanged = false;
    const messages = page.messages.map((message) => {
      if (message.author.id !== profile.userId) {
        return message;
      }

      changed = true;
      pageChanged = true;
      return {
        ...message,
        author: {
          ...message.author,
          avatarUrl: profile.avatarUrl,
          customStatus: profile.customStatus,
          displayName: profile.displayName ?? profile.username,
          status: profile.status,
          username: profile.username,
        },
      };
    });

    return pageChanged ? { ...page, messages } : page;
  });

  // Most profile events touch no cached message in most open conversations.
  // Preserve the root identity so unrelated lists do not rerender and autoscroll.
  return changed ? { ...current, pages } : current;
}

function mapDMReplyTo(replyTo: DMMessagePayload | null): ReplyTo | undefined {
  if (!replyTo) {
    return undefined;
  }

  return {
    id: replyTo.id,
    authorName: replyTo.author.displayName ?? replyTo.author.username,
    content: replyTo.content.slice(0, 100),
  };
}

function mapDMAttachments(message: DMMessagePayload): MessageAttachment[] {
  return message.attachments.map((attachment) => ({
    id: attachment.id,
    url: attachment.url,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.size,
    width: attachment.width ?? undefined,
    height: attachment.height ?? undefined,
    duration: attachment.duration ?? undefined,
    thumbnailUrl: attachment.thumbnailUrl ?? undefined,
    scanStatus: attachment.scanStatus,
  }));
}

export function mapDMMessageToChatMessage(message: DMMessagePayload): ChatMessage {
  return {
    id: message.id,
    ...(message.clientNonce ? { clientNonce: message.clientNonce } : {}),
    channelId: message.conversationId,
    author: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName ?? message.author.username,
      avatarUrl: message.author.avatarUrl,
      status: message.author.status,
      customStatus: message.author.customStatus,
    },
    content: message.deletedAt ? "" : message.content,
    type: "DEFAULT",
    threadParentId: message.threadParentId,
    threadSummary: message.threadSummary,
    reactions: message.reactions,
    attachments: mapDMAttachments(message),
    replyTo: mapDMReplyTo(message.replyTo),
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    deletedById: message.deletedById,
    // karar #1: anket mesajın kendisiyle aynı yükte geliyor. Burada
    // taşınmasaydı, sunucu anketi gönderse bile satır onu hiç görmezdi.
    poll: message.poll ?? null,
    systemType: message.systemType,
    systemTargetUserIds: message.systemTargetUserIds,
    systemValue: message.systemValue,
  };
}

export const OPTIMISTIC_MESSAGE_PREFIX = "optimistic-";

/** How far apart a send and its echo may be before the fallback stops guessing. */
const OPTIMISTIC_CONTENT_MATCH_WINDOW_MS = 30_000;

export function isOptimisticMessageId(messageId: string): boolean {
  return messageId.startsWith(OPTIMISTIC_MESSAGE_PREFIX);
}

/**
 * Whether `candidate` is the optimistic bubble that `message` just confirmed.
 *
 * `clientNonce` is the id the sender rendered the bubble under, echoed back by
 * the server on the author's own copy — an exact answer. Without one (a client
 * that predates the field, or a message the server wrote itself) all that is
 * left is a guess from author, content and timing, and that guess misfires on
 * two identical sends inside the window: the first echo clears both bubbles and
 * the second only reappears once its own echo lands.
 */
function isConfirmedOptimisticMessage(candidate: ChatMessage, message: ChatMessage): boolean {
  if (!isOptimisticMessageId(candidate.id)) {
    return false;
  }

  if (message.clientNonce) {
    return candidate.id === message.clientNonce;
  }

  const sameAttachments =
    candidate.attachments.length === message.attachments.length &&
    candidate.attachments.every((attachment) =>
      message.attachments.some((confirmed) => confirmed.id === attachment.id),
    );

  return (
    candidate.author.id === message.author.id &&
    candidate.content === message.content &&
    sameAttachments &&
    Math.abs(new Date(message.createdAt).getTime() - new Date(candidate.createdAt).getTime()) <
      OPTIMISTIC_CONTENT_MATCH_WINDOW_MS
  );
}

/**
 * An echo's nonce has served its purpose after matching the optimistic bubble.
 * History snapshots retain their own author nonce until subscribers can retire
 * pending sends whose echo and acknowledgement were both lost.
 */
function withoutClientNonce(message: ChatMessage): ChatMessage {
  if (message.clientNonce === undefined) {
    return message;
  }

  const { clientNonce: _clientNonce, ...rest } = message;
  return rest;
}

export function appendMessage(old: MessagePages | undefined, message: ChatMessage): MessagePages {
  const confirmed = withoutClientNonce(message);

  if (!old) {
    return {
      pageParams: [undefined],
      pages: [
        {
          hasMore: false,
          messages: [confirmed],
        },
      ],
    };
  }

  let changed = false;
  const pages = old.pages.map((page, index) => {
    if (index !== 0) return page;

    const withoutOptimistic = page.messages.filter(
      (candidate) => !isConfirmedOptimisticMessage(candidate, message),
    );
    const clearedOptimistic = withoutOptimistic.length !== page.messages.length;

    if (withoutOptimistic.some((candidate) => candidate.id === confirmed.id)) {
      // The same message reaches this cache twice for an open DM — once as
      // `dm:message:new`, once inside `dm:conversation:updated`. Handing back the
      // very same page on the second delivery keeps the list from re-rendering.
      if (!clearedOptimistic) {
        return page;
      }

      changed = true;
      return { ...page, messages: withoutOptimistic };
    }

    changed = true;
    return { ...page, messages: [...withoutOptimistic, confirmed] };
  });

  return changed ? { ...old, pages } : old;
}

export function resetMessagePages(): MessagePages {
  return {
    pageParams: [undefined],
    pages: [
      {
        hasMore: false,
        messages: [],
      },
    ],
  };
}

function updateMessage(
  old: MessagePages | undefined,
  message: ChatMessage,
): MessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: page.messages.map((candidate) =>
        candidate.id === message.id ? message : candidate,
      ),
    })),
  };
}

function markMessageDeleted(
  old: MessagePages | undefined,
  data: { messageId: string; deletedById?: string; placeholderExpiresAt?: string | null },
): MessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === data.messageId
          ? {
              ...message,
              deletedAt: new Date().toISOString(),
              content: "",
              reactions: [],
              deletedById: data.deletedById ?? message.deletedById ?? null,
              placeholderExpiresAt:
                data.placeholderExpiresAt ?? message.placeholderExpiresAt ?? null,
            }
          : message,
      ),
    })),
  };
}

function removeMessage(
  old: MessagePages | undefined,
  data: { messageId: string },
): MessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: page.messages.filter((message) => message.id !== data.messageId),
    })),
  };
}

function updateReactions(
  old: MessagePages | undefined,
  data: { messageId: string; reactions: MessageReaction[] },
): MessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === data.messageId ? { ...message, reactions: data.reactions } : message,
      ),
    })),
  };
}

function updateThreadSummary(
  old: MessagePages | undefined,
  message: ChatMessage,
): MessagePages | undefined {
  if (!old || !message.threadParentId) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: page.messages.map((candidate) => {
        if (candidate.id !== message.threadParentId) {
          return candidate;
        }

        const currentSummary = candidate.threadSummary ?? {
          replyCount: 0,
          lastReplyAt: null,
          recentRepliers: [],
        };
        const withoutAuthor = currentSummary.recentRepliers.filter(
          (user) => user.userId !== message.author.id,
        );

        return {
          ...candidate,
          threadSummary: {
            replyCount: currentSummary.replyCount + 1,
            lastReplyAt: message.createdAt,
            recentRepliers: [
              {
                userId: message.author.id,
                username: message.author.username,
                displayName: message.author.displayName,
                avatarUrl: message.author.avatarUrl,
              },
              ...withoutAuthor,
            ].slice(0, 3),
          },
        };
      }),
    })),
  };
}

export function updateAuthorPresence(
  old: MessagePages | undefined,
  data: FriendPresenceUpdateDto,
): MessagePages | undefined {
  if (!old) {
    return old;
  }

  let changed = false;
  const pages = old.pages.map((page) => {
    let pageChanged = false;
    const messages = page.messages.map((message) => {
      if (message.author.id !== data.userId) {
        return message;
      }

      changed = true;
      pageChanged = true;
      return {
        ...message,
        author: {
          ...message.author,
          customStatus: data.customStatus,
          status: data.status,
        },
      };
    });

    return pageChanged ? { ...page, messages } : page;
  });

  // A presence event commonly targets nobody in this conversation. Returning a
  // new page tree in that case wakes every downstream message derivation.
  return changed ? { ...old, pages } : old;
}

/**
 * The newest first-page request behind each conversation's snapshot. A join only
 * needs a fresh read when that snapshot may predate the connection now delivering
 * live events: channel messages reach a joined viewer directly and other online
 * members as `channel:messages:stale`, and DM messages always reach every
 * participant's user room. A snapshot requested on this connection for this view
 * is therefore already complete.
 */
type SnapshotRequest = { readonly sequence: number; readonly socketId: string | undefined };
const snapshotRequests = new Map<string, SnapshotRequest>();
let snapshotSequence = 0;

function getSnapshotRequestKey(mode: MessageMode, conversationId: string) {
  return `${mode}:${conversationId}`;
}

async function fetchChannelMessages(
  channelId: string,
  cursor: string | undefined,
  signal: AbortSignal,
) {
  const url = new URL(`/api/v1/channels/${channelId}/messages`, window.location.origin);
  if (cursor) {
    url.searchParams.set("before", cursor);
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error("Failed to fetch messages");
  }

  return (await response.json()) as MessagesResponse;
}

export function useMessages(mode: MessageMode, conversationId: string) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  // Effects subscribe with this key. A fresh array per render tears down and
  // reattaches every message listener even when the conversation is unchanged.
  const queryKey = useMemo(() => getMessagesQueryKey(mode, conversationId), [mode, conversationId]);
  const snapshotBaselines = useRef(new WeakMap<MessagePageResponse, MessagePages | undefined>());

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      if (pageParam === undefined) {
        snapshotRequests.set(getSnapshotRequestKey(mode, conversationId), {
          sequence: ++snapshotSequence,
          socketId: socket.connected ? socket.id : undefined,
        });
      }
      const baseline = queryClient.getQueryData<MessagePages>(queryKey);
      let page: MessagePageResponse;
      if (mode === "channel") {
        const payload = await fetchChannelMessages(conversationId, pageParam, signal);
        page = { ...payload, nextCursor: payload.nextCursor ?? null };
      } else {
        const payload = await fetchDMMessages(conversationId, pageParam, { signal });
        page = {
          messages: payload.messages.map(mapDMMessageToChatMessage),
          nextCursor: payload.nextCursor ?? null,
        };
      }
      snapshotBaselines.current.set(page, baseline);
      return page;
    },
    structuralSharing: (oldData, newData) => {
      const snapshot = newData as MessagePages;
      const fetched = snapshot.pages.filter((page) => snapshotBaselines.current.has(page));
      if (!fetched.length) return replaceEqualDeep(oldData, newData);
      const baseline = snapshotBaselines.current.get(fetched[0]!);
      fetched.forEach((page) => snapshotBaselines.current.delete(page));
      return replaceEqualDeep(
        oldData,
        reconcileMessageSnapshot(baseline, oldData as MessagePages | undefined, snapshot),
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: Infinity,
  });

  useEffect(() => {
    const handlePresenceUpdate = (data: FriendPresenceUpdateDto) => {
      queryClient.setQueryData<MessagePages>(queryKey, (old) => updateAuthorPresence(old, data));
    };

    socket.on("presence:update", handlePresenceUpdate);

    return () => {
      socket.off("presence:update", handlePresenceUpdate);
    };
  }, [queryClient, queryKey, socket]);

  useEffect(() => {
    if (mode === "channel") {
      const handleNewMessage = (message: ChatMessage) => {
        if (message.channelId === conversationId && message.threadParentId) {
          queryClient.setQueryData<MessagePages>(queryKey, (old) =>
            updateThreadSummary(old, message),
          );
          return;
        }

        if (message.channelId === conversationId) {
          queryClient.setQueryData<MessagePages>(queryKey, (old) => appendMessage(old, message));
        }
      };

      const handleUpdatedMessage = (message: ChatMessage) => {
        if (message.channelId === conversationId) {
          queryClient.setQueryData<MessagePages>(queryKey, (old) => updateMessage(old, message));
        }
      };

      const handleDeletedMessage = (data: {
        messageId: string;
        channelId: string;
        deletedById?: string;
        placeholderExpiresAt?: string | null;
      }) => {
        if (data.channelId === conversationId) {
          queryClient.setQueryData<MessagePages>(queryKey, (old) => markMessageDeleted(old, data));
        }
      };

      const handleRemovedMessage = (data: { messageId: string; channelId: string }) => {
        if (data.channelId === conversationId) {
          queryClient.setQueryData<MessagePages>(queryKey, (old) => removeMessage(old, data));
        }
      };

      const handleHistoryCleared = (data: { channelId: string }) => {
        if (data.channelId === conversationId) {
          queryClient.setQueryData<MessagePages>(queryKey, resetMessagePages());
        }
      };

      const handleReactionUpdated = (data: { messageId: string; reactions: MessageReaction[] }) => {
        queryClient.setQueryData<MessagePages>(queryKey, (old) => updateReactions(old, data));
      };

      socket.on("message:new", handleNewMessage);
      socket.on("message:updated", handleUpdatedMessage);
      socket.on("message:deleted", handleDeletedMessage);
      socket.on("message:removed", handleRemovedMessage);
      socket.on("message:history_cleared", handleHistoryCleared);
      socket.on("message:reaction_updated", handleReactionUpdated);

      return () => {
        socket.off("message:new", handleNewMessage);
        socket.off("message:updated", handleUpdatedMessage);
        socket.off("message:deleted", handleDeletedMessage);
        socket.off("message:removed", handleRemovedMessage);
        socket.off("message:history_cleared", handleHistoryCleared);
        socket.off("message:reaction_updated", handleReactionUpdated);
      };
    }

    const handleNewMessage = (message: DMMessagePayload) => {
      const chatMessage = mapDMMessageToChatMessage(message);

      if (message.conversationId === conversationId && message.threadParentId) {
        queryClient.setQueryData<MessagePages>(queryKey, (old) =>
          updateThreadSummary(old, chatMessage),
        );
        return;
      }

      if (message.conversationId === conversationId) {
        queryClient.setQueryData<MessagePages>(queryKey, (old) => appendMessage(old, chatMessage));
      }
    };

    const handleUpdatedMessage = (message: DMMessagePayload) => {
      if (message.conversationId === conversationId) {
        queryClient.setQueryData<MessagePages>(queryKey, (old) =>
          updateMessage(old, mapDMMessageToChatMessage(message)),
        );
      }
    };

    const handleDeletedMessage = (data: {
      conversationId: string;
      messageId: string;
      deletedById?: string;
    }) => {
      if (data.conversationId === conversationId) {
        queryClient.setQueryData<MessagePages>(queryKey, (old) => markMessageDeleted(old, data));
      }
    };

    const handleRemovedMessage = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversationId) {
        queryClient.setQueryData<MessagePages>(queryKey, (old) => removeMessage(old, data));
      }
    };

    const handleReactionUpdated = (data: { messageId: string; reactions: MessageReaction[] }) => {
      queryClient.setQueryData<MessagePages>(queryKey, (old) => updateReactions(old, data));
    };

    socket.on("dm:message:new", handleNewMessage);
    socket.on("dm:message:updated", handleUpdatedMessage);
    socket.on("dm:message:deleted", handleDeletedMessage);
    socket.on("dm:message:removed", handleRemovedMessage);
    socket.on("dm:message:reaction_updated", handleReactionUpdated);

    return () => {
      socket.off("dm:message:new", handleNewMessage);
      socket.off("dm:message:updated", handleUpdatedMessage);
      socket.off("dm:message:deleted", handleDeletedMessage);
      socket.off("dm:message:removed", handleRemovedMessage);
      socket.off("dm:message:reaction_updated", handleReactionUpdated);
    };
  }, [conversationId, mode, queryClient, queryKey, socket]);

  useEffect(() => {
    let generation = 0;
    let hasJoined = false;
    const requestKey = getSnapshotRequestKey(mode, conversationId);
    // A read already running when this view mounted was started for it; a
    // cached snapshot from an earlier visit was not.
    const viewStartSequence =
      queryClient.getQueryState(queryKey)?.fetchStatus === "fetching"
        ? (snapshotRequests.get(requestKey)?.sequence ?? 0)
        : snapshotSequence + 1;
    const joinConversation = () => {
      if (!socket.connected) return;
      const attempt = ++generation;
      const socketId = socket.id;
      const isCurrent = () => attempt === generation && socket.connected && socket.id === socketId;
      const acknowledgedSocket = socket as Socket<
        ServerToClientEvents,
        AcknowledgedClientToServerEvents
      >;
      const joined = async (error: Error | null, result?: { ok: boolean }) => {
        if (!isCurrent()) return;
        // Older servers do not acknowledge joins. Their timeout still gets a
        // snapshot; an explicit authorization refusal must not trigger a read.
        if (!error && !result?.ok) return;
        const reconnect = hasJoined;
        hasJoined = true;
        const snapshot = snapshotRequests.get(requestKey);
        if (
          !reconnect &&
          snapshot !== undefined &&
          snapshot.sequence >= viewStartSequence &&
          snapshot.socketId === socketId
        ) {
          return;
        }
        if (queryClient.getQueryState(queryKey)?.fetchStatus === "fetching") {
          if (reconnect) {
            // Started on the connection that just dropped.
            await queryClient.cancelQueries({ exact: true, queryKey }, { revert: false });
          } else {
            // Let the reader see the snapshot already on its way, then refresh it.
            await queryClient.refetchQueries({ exact: true, queryKey }, { cancelRefetch: false });
          }
          if (!isCurrent()) return;
        }
        await queryClient.invalidateQueries({ exact: true, queryKey });
      };
      if (mode === "channel") {
        acknowledgedSocket.timeout(10_000).emit("channel:join", conversationId, joined);
        return;
      }

      acknowledgedSocket.timeout(10_000).emit("dm:join", conversationId, joined);
    };

    joinConversation();
    socket.on("connect", joinConversation);

    return () => {
      generation++;
      socket.off("connect", joinConversation);
      if (!socket.connected) return;

      if (mode === "channel") {
        socket.emit("channel:leave", conversationId);
        return;
      }

      socket.emit("dm:leave", conversationId);
    };
  }, [conversationId, mode, queryClient, queryKey, socket]);

  return query;
}
