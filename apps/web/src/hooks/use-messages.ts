"use client";

import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSocket } from "./use-socket";
import type { ChatMessage, MessagesResponse } from "@wizards/types";

export function useMessages(channelId: string) {
  const socket = useSocket();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ["messages", channelId],
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
  });

  useEffect(() => {
    const handleNewMessage = (message: ChatMessage) => {
      if (message.channelId === channelId) {
        queryClient.setQueryData(["messages", channelId], (old: any) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page: any, i: number) =>
                  i === 0 ? { ...page, messages: [message, ...page.messages] } : page,
                ),
              }
            : old,
        );
      }
    };

    const handleUpdatedMessage = (message: ChatMessage) => {
      if (message.channelId === channelId) {
        queryClient.setQueryData(["messages", channelId], (old: any) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page: any) => ({
                  ...page,
                  messages: page.messages.map((m: ChatMessage) => (m.id === message.id ? message : m)),
                })),
              }
            : old,
        );
      }
    };

    const handleDeletedMessage = (data: { messageId: string; channelId: string }) => {
      if (data.channelId === channelId) {
        queryClient.setQueryData(["messages", channelId], (old: any) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page: any) => ({
                  ...page,
                  messages: page.messages.map((m: ChatMessage) =>
                    m.id === data.messageId
                      ? {
                          ...m,
                          deletedAt: new Date().toISOString(),
                          content: "[deleted]",
                          reactions: [],
                        }
                      : m,
                  ),
                })),
              }
            : old,
        );
      }
    };

    const handleReactionUpdated = (data: { messageId: string; reactions: any[] }) => {
      queryClient.setQueryData(["messages", channelId], (old: any) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page: any) => ({
                ...page,
                messages: page.messages.map((m: ChatMessage) =>
                  m.id === data.messageId ? { ...m, reactions: data.reactions } : m,
                ),
              })),
            }
          : old,
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
  }, [channelId, socket, queryClient]);

  useEffect(() => {
    socket.emit("channel:join", channelId);
    return () => {
      socket.emit("channel:leave", channelId);
    };
  }, [channelId, socket]);

  return query;
}
