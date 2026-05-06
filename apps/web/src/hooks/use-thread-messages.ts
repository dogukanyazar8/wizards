"use client";

import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect } from "react";
import type {
  ChatMessage,
  DMMessagePayload,
  MessageReaction,
} from "@wizards/types";
import { fetchDMThreadMessages } from "@/lib/dm/client";
import {
  mapDMMessageToChatMessage,
  type MessageMode,
} from "@/hooks/use-messages";
import { useSocket } from "@/hooks/use-socket";

type ThreadPageResponse = {
  hasMore?: boolean;
  messages: ChatMessage[];
  nextCursor?: string | null;
  parent: ChatMessage;
};

export type ThreadMessagePages = InfiniteData<ThreadPageResponse, string | undefined>;

export function getThreadMessagesQueryKey(
  mode: MessageMode,
  conversationId: string,
  parentMessageId: string,
) {
  return ["thread-messages", mode, conversationId, parentMessageId] as const;
}

function appendThreadMessage(
  old: ThreadMessagePages | undefined,
  message: ChatMessage,
): ThreadMessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page, index) => {
      if (index !== 0 || page.messages.some((candidate) => candidate.id === message.id)) {
        return page;
      }

      return {
        ...page,
        messages: [...page.messages, message],
        parent:
          page.parent.id === message.threadParentId
            ? {
                ...page.parent,
                threadSummary: {
                  replyCount: (page.parent.threadSummary?.replyCount ?? 0) + 1,
                  lastReplyAt: message.createdAt,
                  recentRepliers: [
                    {
                      userId: message.author.id,
                      username: message.author.username,
                      displayName: message.author.displayName,
                      avatarUrl: message.author.avatarUrl,
                    },
                    ...(page.parent.threadSummary?.recentRepliers ?? []).filter(
                      (user) => user.userId !== message.author.id,
                    ),
                  ].slice(0, 3),
                },
              }
            : page.parent,
      };
    }),
  };
}

function updateThreadMessage(
  old: ThreadMessagePages | undefined,
  message: ChatMessage,
): ThreadMessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      parent: page.parent.id === message.id ? message : page.parent,
      messages: page.messages.map((candidate) =>
        candidate.id === message.id ? message : candidate,
      ),
    })),
  };
}

function markThreadMessageDeleted(
  old: ThreadMessagePages | undefined,
  messageId: string,
): ThreadMessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      parent:
        page.parent.id === messageId
          ? {
              ...page.parent,
              content: "",
              deletedAt: new Date().toISOString(),
              reactions: [],
            }
          : page.parent,
      messages: page.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: "",
              deletedAt: new Date().toISOString(),
              reactions: [],
            }
          : message,
      ),
    })),
  };
}

function updateThreadReactions(
  old: ThreadMessagePages | undefined,
  data: { messageId: string; reactions: MessageReaction[] },
): ThreadMessagePages | undefined {
  if (!old) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      parent:
        page.parent.id === data.messageId
          ? { ...page.parent, reactions: data.reactions }
          : page.parent,
      messages: page.messages.map((message) =>
        message.id === data.messageId
          ? { ...message, reactions: data.reactions }
          : message,
      ),
    })),
  };
}

async function fetchChannelThreadMessages(
  channelId: string,
  parentMessageId: string,
  cursor?: string,
) {
  const url = new URL(
    `/api/v1/channels/${channelId}/messages/${parentMessageId}/thread`,
    window.location.origin,
  );
  if (cursor) {
    url.searchParams.set("before", cursor);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch thread messages");
  }

  return (await response.json()) as ThreadPageResponse;
}

export function useThreadMessages(
  mode: MessageMode,
  conversationId: string,
  parentMessageId: string,
) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const queryKey = getThreadMessagesQueryKey(mode, conversationId, parentMessageId);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      if (mode === "channel") {
        return fetchChannelThreadMessages(conversationId, parentMessageId, pageParam);
      }

      const payload = await fetchDMThreadMessages(conversationId, parentMessageId, pageParam);
      return {
        messages: payload.messages.map(mapDMMessageToChatMessage),
        nextCursor: payload.nextCursor,
        parent: mapDMMessageToChatMessage(payload.parent),
      } satisfies ThreadPageResponse;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (mode === "channel") {
      const handleNewMessage = (message: ChatMessage) => {
        if (message.channelId === conversationId && message.threadParentId === parentMessageId) {
          queryClient.setQueryData<ThreadMessagePages>(queryKey, (old) =>
            appendThreadMessage(old, message),
          );
        }
      };

      const handleUpdatedMessage = (message: ChatMessage) => {
        if (message.channelId === conversationId) {
          queryClient.setQueryData<ThreadMessagePages>(queryKey, (old) =>
            updateThreadMessage(old, message),
          );
        }
      };

      const handleDeletedMessage = (data: { channelId: string; messageId: string }) => {
        if (data.channelId === conversationId) {
          queryClient.setQueryData<ThreadMessagePages>(queryKey, (old) =>
            markThreadMessageDeleted(old, data.messageId),
          );
        }
      };

      const handleReactionUpdated = (data: {
        messageId: string;
        reactions: MessageReaction[];
      }) => {
        queryClient.setQueryData<ThreadMessagePages>(queryKey, (old) =>
          updateThreadReactions(old, data),
        );
      };

      socket.on("message:new", handleNewMessage);
      socket.on("message:updated", handleUpdatedMessage);
      socket.on("message:deleted", handleDeletedMessage);
      socket.on("message:reaction_updated", handleReactionUpdated);

      return () => {
        socket.off("message:new", handleNewMessage);
        socket.off("message:updated", handleUpdatedMessage);
        socket.off("message:deleted", handleDeletedMessage);
        socket.off("message:reaction_updated", handleReactionUpdated);
      };
    }

    const handleNewMessage = (message: DMMessagePayload) => {
      if (message.conversationId === conversationId && message.threadParentId === parentMessageId) {
        queryClient.setQueryData<ThreadMessagePages>(queryKey, (old) =>
          appendThreadMessage(old, mapDMMessageToChatMessage(message)),
        );
      }
    };

    const handleUpdatedMessage = (message: DMMessagePayload) => {
      if (message.conversationId === conversationId) {
        queryClient.setQueryData<ThreadMessagePages>(queryKey, (old) =>
          updateThreadMessage(old, mapDMMessageToChatMessage(message)),
        );
      }
    };

    const handleDeletedMessage = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversationId) {
        queryClient.setQueryData<ThreadMessagePages>(queryKey, (old) =>
          markThreadMessageDeleted(old, data.messageId),
        );
      }
    };

    const handleReactionUpdated = (data: {
      messageId: string;
      reactions: MessageReaction[];
    }) => {
      queryClient.setQueryData<ThreadMessagePages>(queryKey, (old) =>
        updateThreadReactions(old, data),
      );
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
  }, [conversationId, mode, parentMessageId, queryClient, queryKey, socket]);

  return query;
}
