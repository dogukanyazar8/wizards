"use client";

import { useEffect } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
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
  }));
}

export function mapDMMessageToChatMessage(message: DMMessagePayload): ChatMessage {
  return {
    id: message.id,
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
  };
}

export function appendMessage(
  old: MessagePages | undefined,
  message: ChatMessage,
): MessagePages {
  if (!old) {
    return {
      pageParams: [undefined],
      pages: [
        {
          hasMore: false,
          messages: [message],
        },
      ],
    };
  }

  return {
    ...old,
    pages: old.pages.map((page, index) => {
      if (index !== 0) return page;

      const withoutOptimistic = page.messages.filter((candidate) => {
        if (!candidate.id.startsWith("optimistic-")) return true;
        const sameAttachments =
          candidate.attachments.length === message.attachments.length &&
          candidate.attachments.every((attachment) =>
            message.attachments.some((confirmed) => confirmed.id === attachment.id),
          );
        return !(
          candidate.author.id === message.author.id &&
          candidate.content === message.content &&
          sameAttachments &&
          Math.abs(
            new Date(message.createdAt).getTime() - new Date(candidate.createdAt).getTime(),
          ) < 30_000
        );
      });

      if (withoutOptimistic.some((candidate) => candidate.id === message.id)) {
        return { ...page, messages: withoutOptimistic };
      }

      return { ...page, messages: [...withoutOptimistic, message] };
    }),
  };
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
  data: { messageId: string },
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
            }
          : message,
      ),
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
        message.id === data.messageId
          ? { ...message, reactions: data.reactions }
          : message,
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

function updateAuthorPresence(
  old: MessagePages | undefined,
  data: FriendPresenceUpdateDto,
): MessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.author.id === data.userId
          ? {
              ...message,
              author: {
                ...message.author,
                customStatus: data.customStatus,
                status: data.status,
              },
            }
          : message,
      ),
    })),
  };
}

async function fetchChannelMessages(channelId: string, cursor?: string) {
  const url = new URL(`/api/v1/channels/${channelId}/messages`, window.location.origin);
  if (cursor) {
    url.searchParams.set("before", cursor);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch messages");
  }

  return (await response.json()) as MessagesResponse;
}

export function useMessages(mode: MessageMode, conversationId: string) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const queryKey = getMessagesQueryKey(mode, conversationId);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      if (mode === "channel") {
        return (await fetchChannelMessages(conversationId, pageParam)) as MessagePageResponse;
      }

      const payload = await fetchDMMessages(conversationId, pageParam);
      return {
        messages: payload.messages.map(mapDMMessageToChatMessage),
        nextCursor: payload.nextCursor,
      } satisfies MessagePageResponse;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: Infinity,
  });

  useEffect(() => {
    const handlePresenceUpdate = (data: FriendPresenceUpdateDto) => {
      queryClient.setQueryData<MessagePages>(queryKey, (old) =>
        updateAuthorPresence(old, data),
      );
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

      const handleDeletedMessage = (data: { messageId: string; channelId: string }) => {
        if (data.channelId === conversationId) {
          queryClient.setQueryData<MessagePages>(queryKey, (old) => markMessageDeleted(old, data));
        }
      };

      const handleHistoryCleared = (data: { channelId: string }) => {
        if (data.channelId === conversationId) {
          queryClient.setQueryData<MessagePages>(queryKey, resetMessagePages());
        }
      };

      const handleReactionUpdated = (data: {
        messageId: string;
        reactions: MessageReaction[];
      }) => {
        queryClient.setQueryData<MessagePages>(queryKey, (old) => updateReactions(old, data));
      };

      socket.on("message:new", handleNewMessage);
      socket.on("message:updated", handleUpdatedMessage);
      socket.on("message:deleted", handleDeletedMessage);
      socket.on("message:history_cleared", handleHistoryCleared);
      socket.on("message:reaction_updated", handleReactionUpdated);

      return () => {
        socket.off("message:new", handleNewMessage);
        socket.off("message:updated", handleUpdatedMessage);
        socket.off("message:deleted", handleDeletedMessage);
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
        queryClient.setQueryData<MessagePages>(queryKey, (old) =>
          appendMessage(old, chatMessage),
        );
      }
    };

    const handleUpdatedMessage = (message: DMMessagePayload) => {
      if (message.conversationId === conversationId) {
        queryClient.setQueryData<MessagePages>(queryKey, (old) =>
          updateMessage(old, mapDMMessageToChatMessage(message)),
        );
      }
    };

    const handleDeletedMessage = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversationId) {
        queryClient.setQueryData<MessagePages>(queryKey, (old) => markMessageDeleted(old, data));
      }
    };

    const handleReactionUpdated = (data: {
      messageId: string;
      reactions: MessageReaction[];
    }) => {
      queryClient.setQueryData<MessagePages>(queryKey, (old) => updateReactions(old, data));
    };

    socket.on("dm:message:new", handleNewMessage);
    socket.on("dm:message:updated", handleUpdatedMessage);
    socket.on("dm:message:deleted", handleDeletedMessage);
    socket.on("dm:message:reaction_updated", handleReactionUpdated);

    return () => {
      socket.off("dm:message:new", handleNewMessage);
      socket.off("dm:message:updated", handleUpdatedMessage);
      socket.off("dm:message:deleted", handleDeletedMessage);
      socket.off("dm:message:reaction_updated", handleReactionUpdated);
    };
  }, [conversationId, mode, queryClient, queryKey, socket]);

  useEffect(() => {
    const joinConversation = () => {
      if (mode === "channel") {
        socket.emit("channel:join", conversationId);
        return;
      }

      socket.emit("dm:join", conversationId);
    };

    joinConversation();
    socket.on("connect", joinConversation);

    return () => {
      socket.off("connect", joinConversation);

      if (mode === "channel") {
        socket.emit("channel:leave", conversationId);
        return;
      }

      socket.emit("dm:leave", conversationId);
    };
  }, [conversationId, mode, socket]);

  return query;
}
