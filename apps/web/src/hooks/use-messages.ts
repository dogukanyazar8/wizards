"use client";

import { useEffect } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useSocket } from "./use-socket";
import type { ChatMessage, MessageReaction, MessagesResponse } from "@wizards/types";

export type MessagePages = InfiniteData<MessagesResponse, string | undefined>;

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

      // Remove any matching optimistic placeholder before appending the real message
      const withoutOptimistic = page.messages.filter((m) => {
        if (!m.id.startsWith("optimistic-")) return true;
        return !(
          m.author.id === message.author.id &&
          m.content === message.content &&
          Math.abs(
            new Date(message.createdAt).getTime() - new Date(m.createdAt).getTime(),
          ) < 30_000
        );
      });

      // Guard against true duplicates (e.g. socket firing twice)
      if (withoutOptimistic.some((m) => m.id === message.id)) {
        return { ...page, messages: withoutOptimistic };
      }

      return { ...page, messages: [...withoutOptimistic, message] };
    }),
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
              content: "[deleted]",
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

export function useMessages(channelId: string) {
  const socket = useSocket();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ["messages", channelId] as const,
    queryFn: async ({ pageParam }) => {
      const url = new URL(`/api/v1/channels/${channelId}/messages`, window.location.origin);
      if (pageParam) {
        url.searchParams.set("before", pageParam);
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return (await res.json()) as MessagesResponse;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: Infinity,
  });

  useEffect(() => {
    const handleNewMessage = (message: ChatMessage) => {
      if (message.channelId === channelId) {
        queryClient.setQueryData<MessagePages>(
          ["messages", channelId],
          (old) => appendMessage(old, message),
        );
      }
    };

    const handleUpdatedMessage = (message: ChatMessage) => {
      if (message.channelId === channelId) {
        queryClient.setQueryData<MessagePages>(
          ["messages", channelId],
          (old) => updateMessage(old, message),
        );
      }
    };

    const handleDeletedMessage = (data: { messageId: string; channelId: string }) => {
      if (data.channelId === channelId) {
        queryClient.setQueryData<MessagePages>(
          ["messages", channelId],
          (old) => markMessageDeleted(old, data),
        );
      }
    };

    const handleReactionUpdated = (data: {
      messageId: string;
      reactions: MessageReaction[];
    }) => {
      queryClient.setQueryData<MessagePages>(
        ["messages", channelId],
        (old) => updateReactions(old, data),
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
  }, [channelId, queryClient, socket]);

  useEffect(() => {
    const joinChannel = () => {
      socket.emit("channel:join", channelId);
    };

    joinChannel();
    socket.on("connect", joinChannel);

    return () => {
      socket.off("connect", joinChannel);
      socket.emit("channel:leave", channelId);
    };
  }, [channelId, socket]);

  return query;
}
