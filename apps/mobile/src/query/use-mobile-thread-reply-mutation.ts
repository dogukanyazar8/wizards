import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  ChatMessage,
  MobileChannelMessagesResponse,
  MobileChannelSendMessageResponse,
  MobileChannelThreadMessagesResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import type { MobileSessionUser } from "../auth/session-types";
import { sendMobileChannelMessage } from "../workspace/mobile-workspace-client";
import {
  applyMobileOptimisticThreadReply,
  insertOptimisticMobileMessage,
  markMobileMessageFailed,
  removeMobileMessage,
  replaceMobileMessage,
} from "./mobile-message-cache";
import { mobileQueryKeys } from "./mobile-query-keys";

export type MobileThreadReplyDraft = {
  readonly alsoSendToChannel: boolean;
  readonly content: string;
};

type MobileThreadReplyContext = {
  readonly clientId: string;
};

type MobileChannelInfiniteData = InfiniteData<MobileChannelMessagesResponse, string | null>;

let threadReplySequence = 0;

function createThreadReplyClientId(): string {
  threadReplySequence += 1;
  return `client-thread-${Date.now()}-${threadReplySequence}`;
}

function updateThreadMessages(
  data: MobileChannelThreadMessagesResponse | undefined,
  update: (messages: readonly ChatMessage[]) => readonly ChatMessage[],
): MobileChannelThreadMessagesResponse | undefined {
  return data ? { ...data, messages: [...update(data.messages)] } : data;
}

/**
 * 8d thread composer: the reply lands in the thread cache immediately, bumps
 * the parent's summary card in the channel stream, and only reaches the channel
 * list itself when the author ticked "also send to channel".
 */
export function useMobileChannelThreadReplyMutation(input: {
  readonly author: MobileSessionUser | null;
  readonly channelId: string;
  readonly client: MobileApiClient;
  readonly parentMessageId: string;
}) {
  const queryClient = useQueryClient();
  const threadQueryKey = useMemo(
    () => mobileQueryKeys.channelThread(input.channelId, input.parentMessageId),
    [input.channelId, input.parentMessageId],
  );
  const channelQueryKey = useMemo(
    () => mobileQueryKeys.channelMessages(input.channelId),
    [input.channelId],
  );

  const createOptimisticReply = useCallback(
    (draft: MobileThreadReplyDraft, clientId: string): ChatMessage => {
      const author = input.author;
      if (!author) {
        throw new Error("A signed-in author is required for a thread reply.");
      }

      return {
        alsoSentToChannel: draft.alsoSendToChannel,
        attachments: [],
        author: { ...author, displayName: author.displayName ?? author.username },
        channelId: input.channelId,
        content: draft.content,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        deliveryStatus: "sending",
        editedAt: null,
        id: clientId,
        reactions: [],
        threadParentId: input.parentMessageId,
        type: "DEFAULT",
      };
    },
    [input.author, input.channelId, input.parentMessageId],
  );

  const mutation = useMutation<
    MobileChannelSendMessageResponse,
    Error,
    MobileThreadReplyDraft,
    MobileThreadReplyContext
  >({
    mutationFn: (draft) =>
      sendMobileChannelMessage(input.client, {
        alsoSendToChannel: draft.alsoSendToChannel,
        channelId: input.channelId,
        content: draft.content,
        threadParentId: input.parentMessageId,
      }),
    onError: (_error, _draft, context) => {
      if (!context) return;
      queryClient.setQueryData<MobileChannelThreadMessagesResponse>(threadQueryKey, (current) =>
        updateThreadMessages(current, (messages) =>
          messages.map((message) =>
            message.id === context.clientId
              ? { ...message, deliveryStatus: "failed" as const }
              : message,
          ),
        ),
      );
      queryClient.setQueryData<MobileChannelInfiniteData>(channelQueryKey, (current) =>
        markMobileMessageFailed(current, context.clientId),
      );
    },
    onMutate: async (draft) => {
      await queryClient.cancelQueries({ queryKey: threadQueryKey });
      const clientId = createThreadReplyClientId();
      const optimisticReply = createOptimisticReply(draft, clientId);

      queryClient.setQueryData<MobileChannelThreadMessagesResponse>(threadQueryKey, (current) =>
        updateThreadMessages(current, (messages) => [...messages, optimisticReply]),
      );
      queryClient.setQueryData<MobileChannelInfiniteData>(channelQueryKey, (current) => {
        const withSummary = applyMobileOptimisticThreadReply(
          current,
          input.parentMessageId,
          {
            avatarUrl: optimisticReply.author.avatarUrl,
            displayName: optimisticReply.author.displayName,
            userId: optimisticReply.author.id,
            username: optimisticReply.author.username,
          },
          optimisticReply.createdAt,
        );
        return draft.alsoSendToChannel
          ? insertOptimisticMobileMessage(withSummary, optimisticReply)
          : withSummary;
      });

      return { clientId };
    },
    onSuccess: (response, draft, context) => {
      if (!context) return;
      queryClient.setQueryData<MobileChannelThreadMessagesResponse>(threadQueryKey, (current) =>
        updateThreadMessages(current, (messages) => {
          // The optimistic row and a refetch can both hold the reply, so the
          // confirmed message replaces the first match and drops the rest.
          const matchedIds = new Set([context.clientId, response.message.id]);
          const next: ChatMessage[] = [];
          let inserted = false;

          for (const message of messages) {
            if (!matchedIds.has(message.id)) {
              next.push(message);
              continue;
            }
            if (!inserted) {
              next.push(response.message);
              inserted = true;
            }
          }

          return inserted ? next : [...next, response.message];
        }),
      );
      if (draft.alsoSendToChannel) {
        queryClient.setQueryData<MobileChannelInfiniteData>(channelQueryKey, (current) =>
          replaceMobileMessage(current, context.clientId, response.message),
        );
      }
    },
  });

  const discardFailedReply = useCallback(
    (messageId: string) => {
      queryClient.setQueryData<MobileChannelThreadMessagesResponse>(threadQueryKey, (current) =>
        updateThreadMessages(current, (messages) =>
          messages.filter((message) => message.id !== messageId),
        ),
      );
      queryClient.setQueryData<MobileChannelInfiniteData>(channelQueryKey, (current) =>
        removeMobileMessage(current, messageId),
      );
    },
    [channelQueryKey, queryClient, threadQueryKey],
  );

  const retryFailedReply = useCallback(
    (messageId: string) => {
      const thread = queryClient.getQueryData<MobileChannelThreadMessagesResponse>(threadQueryKey);
      const failedReply = thread?.messages.find((message) => message.id === messageId);
      if (!failedReply) return;

      discardFailedReply(messageId);
      mutation.mutate({
        alsoSendToChannel: failedReply.alsoSentToChannel === true,
        content: failedReply.content,
      });
    },
    [discardFailedReply, mutation, queryClient, threadQueryKey],
  );

  return { discardFailedReply, mutation, retryFailedReply };
}
