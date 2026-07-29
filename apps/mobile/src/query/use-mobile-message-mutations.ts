import { useCallback, useMemo } from "react";
import {
  mutationOptions,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type MutationFunction,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  ChatMessage,
  DMMessageAuthorPayload,
  DMMessagePayload,
  MobileChannelMessagesResponse,
  MobileChannelMarkReadResponse,
  MobileChannelSendMessageResponse,
  MobileChannelThreadMessagesResponse,
  MobileDMMessagesResponse,
  MobileDMMarkReadResponse,
  MobileDMSendMessageResponse,
  MobileMessageDeleteResponse,
  MobileMessageReactionResponse,
  MobileBootstrapPayload,
  MobileManagedWorkspaceServerDetailResponse,
  MessageAttachment,
  MessageReaction,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import type { MobileSessionUser } from "../auth/session-types";
import {
  abandonMobileSendSpan,
  beginMobileSendSpan,
  completeMobileSendAck,
  completeMobileSendEcho,
} from "../performance/mobile-send-timing";
import {
  patchMobileBootstrapDMRead,
  patchMobileDMConversationsRead,
  readMobileDMConversationUnreadCount,
  type MobileDMConversationsCache,
} from "./mobile-dm-read-cache";
import {
  deleteMobileDMMessage,
  markMobileDMConversationRead,
  sendMobileDMMessage,
  setMobileDMMessageReaction,
  updateMobileDMMessage,
  type SendMobileDMMessageInput,
} from "../dm/mobile-dm-client";
import {
  deleteMobileChannelMessage,
  sendMobileChannelMessage,
  setMobileChannelMessagePin,
  setMobileChannelMessageReaction,
  markMobileChannelRead,
  updateMobileChannelMessage,
  type SendMobileChannelMessageInput,
} from "../workspace/mobile-workspace-client";
import {
  applyMobileOptimisticMessageReaction,
  getNextMobileMessageReactions,
  insertOptimisticMobileMessage,
  markMobileMessageFailed,
  replaceMobileMessage,
  replaceMobileMessageReactions,
  removeMobileMessage,
  softDeleteMobileMessage,
  updateMobileMessageContent,
} from "./mobile-message-cache";
import {
  getMobileChannelFailedSendScope,
  getMobileDMFailedSendScope,
  mobileFailedSendRegistry,
} from "./mobile-failed-send-registry";
import {
  toMobileOptimisticChannelAttachments,
  toMobileOptimisticDMAttachments,
} from "./mobile-optimistic-attachments";
import { mobileQueryKeys } from "./mobile-query-keys";

type MobileMessagePage<TMessage extends { readonly id: string }> = {
  readonly messages: readonly TMessage[];
};

type MobileSendableCacheMessage = {
  readonly id: string;
  readonly deliveryStatus?: "sending" | "failed" | undefined;
};

type MobileOptimisticMutationContext<TMessage> = {
  readonly clientId: string;
  readonly optimisticMessage: TMessage;
};

export type MobileMessageReactionMutationVariables = {
  readonly emoji: string;
  readonly messageId: string;
  readonly shouldReact: boolean;
};

type MobileOptimisticReactionMutationContext<TData> = {
  readonly previousData: TData | undefined;
};

export type MobileMessageDeleteMutationVariables = {
  readonly messageId: string;
};

export type MobileMessageEditMutationVariables = MobileMessageDeleteMutationVariables & {
  readonly content: string;
};

type MobileOptimisticMutationOptions<
  TVariables,
  TResponse,
  TMessage extends MobileSendableCacheMessage,
  TPage extends MobileMessagePage<TMessage>,
  TPageParam,
> = {
  readonly createOptimisticMessage: (variables: TVariables, clientId: string) => TMessage;
  readonly getResponseMessage: (response: TResponse) => TMessage;
  /**
   * The send call, given the id the optimistic bubble is already rendered under.
   * It travels to the server as `clientNonce` and comes back on the author's own
   * realtime echo, which is what lets the echo land *in* the bubble instead of
   * beside it.
   */
  readonly mutationFn: (
    variables: TVariables & { readonly clientNonce: string },
  ) => Promise<TResponse>;
  readonly onSendFailed?: (
    clientId: string,
    variables: TVariables,
    failedMessage: TMessage,
  ) => void;
  readonly queryClient: QueryClient;
  readonly queryKey: QueryKey;
};

type MobileReactionMessage = {
  readonly id: string;
  readonly reactions: readonly MessageReaction[];
};

type MobileOptimisticReactionMutationOptions<
  TResponse,
  TMessage extends MobileReactionMessage,
  TPage extends MobileMessagePage<TMessage>,
  TPageParam,
> = {
  readonly getUserId: () => string;
  readonly getResponseReactions: (response: TResponse) => readonly MessageReaction[];
  readonly mutationFn: MutationFunction<TResponse, MobileMessageReactionMutationVariables>;
  readonly queryClient: QueryClient;
  readonly queryKey: QueryKey;
};

type MobileOptimisticDeleteMutationOptions<
  TResponse,
  TPage extends MobileMessagePage<{ readonly id: string }>,
  TPageParam,
> = {
  readonly applyOptimisticDelete?: (
    data: InfiniteData<TPage, TPageParam> | undefined,
    messageId: string,
  ) => InfiniteData<TPage, TPageParam> | undefined;
  readonly mutationFn: MutationFunction<TResponse, MobileMessageDeleteMutationVariables>;
  readonly queryClient: QueryClient;
  readonly queryKey: QueryKey;
  readonly shouldRemoveOnSuccess?: (response: TResponse) => boolean;
};

type MobileOptimisticEditMutationOptions<
  TResponse,
  TMessage extends {
    readonly content: string;
    readonly editedAt?: string | null;
    readonly id: string;
  },
  TPage extends MobileMessagePage<TMessage>,
  TPageParam,
> = {
  readonly getResponseMessage: (response: TResponse) => TMessage;
  readonly mutationFn: MutationFunction<TResponse, MobileMessageEditMutationVariables>;
  readonly queryClient: QueryClient;
  readonly queryKey: QueryKey;
};

let optimisticMessageSequence = 0;

/**
 * The optimistic id each in-flight send was rendered under, keyed by the exact
 * variables object `mutate` was called with — the one value `onMutate` and
 * `mutationFn` are guaranteed to share for a single send.
 */
const optimisticClientIds = new WeakMap<object, string>();

function requireMobileMutationAuthor<T>(author: T | null): T {
  if (!author) {
    throw new Error("A signed-in author is required for mobile message mutation.");
  }
  return author;
}

function createMobileOptimisticMessageId(): string {
  optimisticMessageSequence += 1;
  return `client-${Date.now()}-${optimisticMessageSequence}`;
}

export function createMobileOptimisticMutationOptions<
  TVariables extends object,
  TResponse,
  TMessage extends MobileSendableCacheMessage,
  TPage extends MobileMessagePage<TMessage>,
  TPageParam = string | null,
>(options: MobileOptimisticMutationOptions<TVariables, TResponse, TMessage, TPage, TPageParam>) {
  type TData = InfiniteData<TPage, TPageParam>;
  type TContext = MobileOptimisticMutationContext<TMessage>;

  return mutationOptions<TResponse, Error, TVariables, TContext>({
    // `onMutate` mints the id and parks it against this exact variables object, so
    // two sends fired back to back cannot hand each other's nonce to the server.
    mutationFn: (variables) =>
      options.mutationFn({
        ...variables,
        clientNonce: optimisticClientIds.get(variables) ?? createMobileOptimisticMessageId(),
      }),
    onError: (_error, variables, context) => {
      if (!context) {
        return;
      }

      abandonMobileSendSpan(context.clientId);
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        markMobileMessageFailed(current, context.clientId),
      );
      options.onSendFailed?.(context.clientId, variables, {
        ...context.optimisticMessage,
        deliveryStatus: "failed",
      });
    },
    onMutate: async (variables) => {
      // The span starts before the cache work: the reader's tap is the origin, and
      // the bubble appearing is what closes the echo half.
      const clientId = createMobileOptimisticMessageId();
      beginMobileSendSpan(clientId);
      await options.queryClient.cancelQueries({ queryKey: options.queryKey });
      optimisticClientIds.set(variables, clientId);
      const optimisticMessage = options.createOptimisticMessage(variables, clientId);
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        insertOptimisticMobileMessage(current, optimisticMessage),
      );
      completeMobileSendEcho(clientId);
      return { clientId, optimisticMessage };
    },
    onSuccess: (response, _variables, context) => {
      if (!context) {
        return;
      }

      completeMobileSendAck(context.clientId);
      const message = options.getResponseMessage(response);
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        replaceMobileMessage(current, context.clientId, message),
      );
    },
  });
}

export function createMobileOptimisticReactionMutationOptions<
  TResponse,
  TMessage extends MobileReactionMessage,
  TPage extends MobileMessagePage<TMessage>,
  TPageParam = string | null,
>(options: MobileOptimisticReactionMutationOptions<TResponse, TMessage, TPage, TPageParam>) {
  type TData = InfiniteData<TPage, TPageParam>;
  type TContext = MobileOptimisticReactionMutationContext<TData>;

  return mutationOptions<TResponse, Error, MobileMessageReactionMutationVariables, TContext>({
    mutationFn: options.mutationFn,
    onError: (_error, _variables, context) => {
      if (context?.previousData) {
        options.queryClient.setQueryData(options.queryKey, context.previousData);
      }
    },
    onMutate: async (variables) => {
      await options.queryClient.cancelQueries({ queryKey: options.queryKey });
      const previousData = options.queryClient.getQueryData<TData>(options.queryKey);
      const userId = options.getUserId();
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        applyMobileOptimisticMessageReaction(
          current,
          variables.messageId,
          variables.emoji,
          userId,
          variables.shouldReact,
        ),
      );
      return { previousData };
    },
    onSuccess: (response, variables) => {
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        replaceMobileMessageReactions(
          current,
          variables.messageId,
          options.getResponseReactions(response),
        ),
      );
    },
  });
}

export function createMobileOptimisticDeleteMutationOptions<
  TResponse,
  TPage extends MobileMessagePage<{ readonly id: string }>,
  TPageParam = string | null,
>(options: MobileOptimisticDeleteMutationOptions<TResponse, TPage, TPageParam>) {
  type TData = InfiniteData<TPage, TPageParam>;
  type TContext = MobileOptimisticReactionMutationContext<TData>;

  return mutationOptions<TResponse, Error, MobileMessageDeleteMutationVariables, TContext>({
    mutationFn: options.mutationFn,
    onError: (_error, _variables, context) => {
      if (context?.previousData) {
        options.queryClient.setQueryData(options.queryKey, context.previousData);
      }
    },
    onMutate: async (variables) => {
      await options.queryClient.cancelQueries({ queryKey: options.queryKey });
      const previousData = options.queryClient.getQueryData<TData>(options.queryKey);
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        options.applyOptimisticDelete
          ? options.applyOptimisticDelete(current, variables.messageId)
          : removeMobileMessage(current, variables.messageId),
      );
      return { previousData };
    },
    onSuccess: (response, variables) => {
      if (options.shouldRemoveOnSuccess?.(response)) {
        options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
          removeMobileMessage(current, variables.messageId),
        );
      }
    },
  });
}

export function createMobileOptimisticEditMutationOptions<
  TResponse,
  TMessage extends {
    readonly content: string;
    readonly editedAt?: string | null;
    readonly id: string;
  },
  TPage extends MobileMessagePage<TMessage>,
  TPageParam = string | null,
>(options: MobileOptimisticEditMutationOptions<TResponse, TMessage, TPage, TPageParam>) {
  type TData = InfiniteData<TPage, TPageParam>;
  type TContext = MobileOptimisticReactionMutationContext<TData>;

  return mutationOptions<TResponse, Error, MobileMessageEditMutationVariables, TContext>({
    mutationFn: options.mutationFn,
    onError: (_error, _variables, context) => {
      if (context?.previousData) {
        options.queryClient.setQueryData(options.queryKey, context.previousData);
      }
    },
    onMutate: async (variables) => {
      await options.queryClient.cancelQueries({ queryKey: options.queryKey });
      const previousData = options.queryClient.getQueryData<TData>(options.queryKey);
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        updateMobileMessageContent(
          current,
          variables.messageId,
          variables.content,
          new Date().toISOString(),
        ),
      );
      return { previousData };
    },
    onSuccess: (response, variables) => {
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        replaceMobileMessage(current, variables.messageId, options.getResponseMessage(response)),
      );
    },
  });
}

export type MobileMessagePinMutationVariables = {
  readonly messageId: string;
  readonly shouldPin: boolean;
};

/** 8c pin/unpin with optimistic isPinned flip and pins-list refresh. */
export function useMobileChannelMessagePinMutation(input: {
  readonly channelId: string;
  readonly client: MobileApiClient;
}) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => mobileQueryKeys.channelMessages(input.channelId),
    [input.channelId],
  );
  type TData = InfiniteData<MobileChannelMessagesResponse, string | null>;

  return useMutation<
    Awaited<ReturnType<typeof setMobileChannelMessagePin>>,
    Error,
    MobileMessagePinMutationVariables,
    { readonly previousData: TData | undefined }
  >({
    mutationFn: (variables) =>
      setMobileChannelMessagePin(input.client, {
        channelId: input.channelId,
        messageId: variables.messageId,
        shouldPin: variables.shouldPin,
      }),
    onError: (_error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<TData>(queryKey);
      queryClient.setQueryData<TData>(queryKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                messages: page.messages.map((message) =>
                  message.id === variables.messageId
                    ? {
                        ...message,
                        isPinned: variables.shouldPin,
                        pinnedAt: variables.shouldPin ? new Date().toISOString() : null,
                      }
                    : message,
                ),
              })),
            }
          : current,
      );
      return { previousData };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.channelPins(input.channelId),
      });
    },
    onSuccess: (response, variables) => {
      queryClient.setQueryData<TData>(queryKey, (current) =>
        replaceMobileMessage(current, variables.messageId, response.message),
      );
    },
  });
}

export type MobileMessageForwardMutationVariables = {
  readonly content: string;
  readonly forwardOfMessageId: string;
  readonly target: { readonly id: string; readonly type: "channel" | "dm" };
};

/**
 * 8b forward: a plain send into the chosen target conversation/channel. The
 * origin is only marked via forwardOfMessageId, so no optimistic cache work —
 * the target surface picks the message up through realtime/new-message flow.
 */
export function useMobileMessageForwardMutation(input: { readonly client: MobileApiClient }) {
  return useMutation<
    MobileChannelSendMessageResponse | MobileDMSendMessageResponse,
    Error,
    MobileMessageForwardMutationVariables
  >({
    mutationFn: async (variables) =>
      variables.target.type === "dm"
        ? sendMobileDMMessage(input.client, {
            content: variables.content,
            conversationId: variables.target.id,
            forwardOfMessageId: variables.forwardOfMessageId,
          })
        : sendMobileChannelMessage(input.client, {
            channelId: variables.target.id,
            content: variables.content,
            forwardOfMessageId: variables.forwardOfMessageId,
          }),
  });
}

/**
 * `attachmentPreviews` never reaches the API — it only feeds the optimistic
 * bubble (and the failed bubble the retry registry keeps) with the uploaded
 * attachment metadata the send request itself does not carry.
 */
type MobileOptimisticAttachmentDraft = {
  readonly attachmentPreviews?: readonly MessageAttachment[];
};

type MobileChannelDraft = Omit<SendMobileChannelMessageInput, "channelId"> &
  MobileOptimisticAttachmentDraft;

export function useMobileChannelMessageMutation(input: {
  readonly author: MobileSessionUser | null;
  readonly channelId: string;
  readonly client: MobileApiClient;
}) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => mobileQueryKeys.channelMessages(input.channelId),
    [input.channelId],
  );
  const scope = useMemo(() => getMobileChannelFailedSendScope(input.channelId), [input.channelId]);

  const mutation = useMutation(
    createMobileOptimisticMutationOptions<
      MobileChannelDraft,
      MobileChannelSendMessageResponse,
      ChatMessage,
      MobileChannelMessagesResponse
    >({
      createOptimisticMessage: (draft, clientId) => ({
        attachments: toMobileOptimisticChannelAttachments(draft.attachmentPreviews),
        author: {
          ...requireMobileMutationAuthor(input.author),
          displayName:
            requireMobileMutationAuthor(input.author).displayName ??
            requireMobileMutationAuthor(input.author).username,
        },
        channelId: input.channelId,
        content: draft.content,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        deliveryStatus: "sending",
        editedAt: null,
        id: clientId,
        reactions: [],
        replyTo: null,
        threadParentId: draft.threadParentId ?? null,
        type: "DEFAULT",
      }),
      getResponseMessage: (response) => response.message,
      mutationFn: ({ attachmentPreviews, ...draft }) =>
        sendMobileChannelMessage(input.client, { ...draft, channelId: input.channelId }),
      onSendFailed: (clientId, draft, failedMessage) => {
        mobileFailedSendRegistry.add(scope, { clientId, draft, message: failedMessage });
      },
      queryClient,
      queryKey,
    }),
  );

  const discardFailedMessage = useCallback(
    (messageId: string) => {
      mobileFailedSendRegistry.remove(scope, messageId);
      queryClient.setQueryData<InfiniteData<MobileChannelMessagesResponse, string | null>>(
        queryKey,
        (current) => removeMobileMessage(current, messageId),
      );
    },
    [queryClient, queryKey, scope],
  );

  const retryFailedMessage = useCallback(
    (messageId: string): boolean => {
      const entry = mobileFailedSendRegistry.remove(scope, messageId);
      if (!entry) {
        return false;
      }
      queryClient.setQueryData<InfiniteData<MobileChannelMessagesResponse, string | null>>(
        queryKey,
        (current) => removeMobileMessage(current, messageId),
      );
      mutation.mutate(entry.draft as MobileChannelDraft);
      return true;
    },
    [mutation, queryClient, queryKey, scope],
  );

  return { discardFailedMessage, mutation, retryFailedMessage };
}

export function useMobileChannelReadMutation(input: { readonly client: MobileApiClient }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { channelId: string }) =>
      markMobileChannelRead(input.client, variables),
    onSuccess: (response: MobileChannelMarkReadResponse) => {
      queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
        if (!current) return current;
        const recent = current.home.servers.recent.map((server) =>
          server.id === response.serverId
            ? {
                ...server,
                mentionCount: response.serverMentionCount,
                unreadCount: response.serverUnreadCount,
              }
            : server,
        );
        return {
          ...current,
          home: { ...current.home, servers: { ...current.home.servers, recent } },
        };
      });
      queryClient.setQueryData<MobileManagedWorkspaceServerDetailResponse>(
        mobileQueryKeys.workspace(response.serverId),
        (current) => {
          if (!current) return current;
          const patchChannel = (channel: (typeof current.detail.ungroupedChannels)[number]) =>
            channel.id === response.channelId
              ? {
                  ...channel,
                  mentionCount: response.mentionCount,
                  unreadCount: response.unreadCount,
                }
              : channel;
          return {
            ...current,
            detail: {
              ...current.detail,
              categories: current.detail.categories.map((category) => ({
                ...category,
                channels: category.channels.map(patchChannel),
              })),
              server: {
                ...current.detail.server,
                mentionCount: response.serverMentionCount,
                unreadCount: response.serverUnreadCount,
              },
              ungroupedChannels: current.detail.ungroupedChannels.map(patchChannel),
            },
          };
        },
      );
    },
  });
}

export function useMobileDMReadMutation(input: { readonly client: MobileApiClient }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { conversationId: string }) =>
      markMobileDMConversationRead(input.client, variables),
    onSuccess: (response: MobileDMMarkReadResponse) => {
      queryClient.setQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(
        mobileQueryKeys.dmMessages(response.conversationId),
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  participantReadStates: response.participantReadStates,
                })),
              }
            : current,
      );
      // Both counters are known locally, so they are patched the way the channel
      // read has always patched them. Invalidating put the inbox *and* the
      // bootstrap payload back on the wire for every conversation the reader
      // opened and every inbound message in an open one — two heavy reads racing
      // the message fetch the reader was actually waiting for.
      const clearedCount = readMobileDMConversationUnreadCount(
        queryClient.getQueryData<MobileDMConversationsCache>(mobileQueryKeys.dmConversations()),
        response.conversationId,
      );
      queryClient.setQueryData<MobileDMConversationsCache>(
        mobileQueryKeys.dmConversations(),
        (current) => patchMobileDMConversationsRead(current, response.conversationId).data,
      );
      queryClient.setQueryData<MobileBootstrapPayload>(
        mobileQueryKeys.bootstrap(),
        (current) =>
          patchMobileBootstrapDMRead(current, {
            clearedCount,
            conversationId: response.conversationId,
          }).data,
      );
    },
  });
}

type MobileDMDraft = Omit<SendMobileDMMessageInput, "conversationId"> &
  MobileOptimisticAttachmentDraft;

export function useMobileDMMessageMutation(input: {
  readonly author: DMMessageAuthorPayload | null;
  readonly client: MobileApiClient;
  readonly conversationId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => mobileQueryKeys.dmMessages(input.conversationId),
    [input.conversationId],
  );
  const scope = useMemo(
    () => getMobileDMFailedSendScope(input.conversationId),
    [input.conversationId],
  );

  const mutation = useMutation(
    createMobileOptimisticMutationOptions<
      MobileDMDraft,
      MobileDMSendMessageResponse,
      DMMessagePayload,
      MobileDMMessagesResponse
    >({
      createOptimisticMessage: (draft, clientId) => ({
        attachments: toMobileOptimisticDMAttachments(draft.attachmentPreviews),
        author: requireMobileMutationAuthor(input.author),
        content: draft.content,
        conversationId: input.conversationId,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        deletedById: null,
        deliveryStatus: "sending",
        editedAt: null,
        id: clientId,
        reactions: [],
        replyTo: null,
        replyToId: draft.replyToId ?? null,
        threadParentId: draft.threadParentId ?? null,
        userId: requireMobileMutationAuthor(input.author).id,
      }),
      getResponseMessage: (response) => response.message,
      mutationFn: ({ attachmentPreviews, ...draft }) =>
        sendMobileDMMessage(input.client, { ...draft, conversationId: input.conversationId }),
      onSendFailed: (clientId, draft, failedMessage) => {
        mobileFailedSendRegistry.add(scope, { clientId, draft, message: failedMessage });
      },
      queryClient,
      queryKey,
    }),
  );

  const discardFailedMessage = useCallback(
    (messageId: string) => {
      mobileFailedSendRegistry.remove(scope, messageId);
      queryClient.setQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(
        queryKey,
        (current) => removeMobileMessage(current, messageId),
      );
    },
    [queryClient, queryKey, scope],
  );

  const retryFailedMessage = useCallback(
    (messageId: string): boolean => {
      const entry = mobileFailedSendRegistry.remove(scope, messageId);
      if (!entry) {
        return false;
      }
      queryClient.setQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(
        queryKey,
        (current) => removeMobileMessage(current, messageId),
      );
      mutation.mutate(entry.draft as MobileDMDraft);
      return true;
    },
    [mutation, queryClient, queryKey, scope],
  );

  return { discardFailedMessage, mutation, retryFailedMessage };
}

export function useMobileChannelMessageReactionMutation(input: {
  readonly author: MobileSessionUser | null;
  readonly channelId: string;
  readonly client: MobileApiClient;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.channelMessages(input.channelId);

  return useMutation(
    createMobileOptimisticReactionMutationOptions<
      MobileMessageReactionResponse,
      ChatMessage,
      MobileChannelMessagesResponse
    >({
      getUserId: () => requireMobileMutationAuthor(input.author).id,
      getResponseReactions: (response) => response.reactions,
      mutationFn: (variables) =>
        setMobileChannelMessageReaction(input.client, {
          ...variables,
          channelId: input.channelId,
        }),
      queryClient,
      queryKey,
    }),
  );
}

function updateMobileChannelThreadMessageReactions(
  data: MobileChannelThreadMessagesResponse | undefined,
  messageId: string,
  update: (reactions: readonly MessageReaction[]) => readonly MessageReaction[],
): MobileChannelThreadMessagesResponse | undefined {
  if (!data) return data;
  const updateMessage = (message: ChatMessage): ChatMessage =>
    message.id === messageId ? { ...message, reactions: [...update(message.reactions)] } : message;
  return {
    ...data,
    parent: updateMessage(data.parent),
    messages: data.messages.map(updateMessage),
  };
}

/** 8e thread reactions must update both the open thread and parent channel caches. */
export function useMobileChannelThreadMessageReactionMutation(input: {
  readonly author: MobileSessionUser | null;
  readonly channelId: string;
  readonly client: MobileApiClient;
  readonly parentMessageId: string;
}) {
  const queryClient = useQueryClient();
  const channelQueryKey = useMemo(
    () => mobileQueryKeys.channelMessages(input.channelId),
    [input.channelId],
  );
  const threadQueryKey = useMemo(
    () => mobileQueryKeys.channelThread(input.channelId, input.parentMessageId),
    [input.channelId, input.parentMessageId],
  );
  type ChannelData = InfiniteData<MobileChannelMessagesResponse, string | null>;
  type Context = {
    readonly previousChannel: ChannelData | undefined;
    readonly previousThread: MobileChannelThreadMessagesResponse | undefined;
  };

  return useMutation<
    MobileMessageReactionResponse,
    Error,
    MobileMessageReactionMutationVariables,
    Context
  >({
    mutationFn: (variables) =>
      setMobileChannelMessageReaction(input.client, {
        ...variables,
        channelId: input.channelId,
      }),
    onError: (_error, _variables, context) => {
      if (!context) return;
      if (context.previousChannel)
        queryClient.setQueryData(channelQueryKey, context.previousChannel);
      if (context.previousThread) queryClient.setQueryData(threadQueryKey, context.previousThread);
    },
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: channelQueryKey }),
        queryClient.cancelQueries({ queryKey: threadQueryKey }),
      ]);
      const previousChannel = queryClient.getQueryData<ChannelData>(channelQueryKey);
      const previousThread =
        queryClient.getQueryData<MobileChannelThreadMessagesResponse>(threadQueryKey);
      const userId = requireMobileMutationAuthor(input.author).id;
      queryClient.setQueryData<ChannelData>(channelQueryKey, (current) =>
        applyMobileOptimisticMessageReaction(
          current,
          variables.messageId,
          variables.emoji,
          userId,
          variables.shouldReact,
        ),
      );
      queryClient.setQueryData<MobileChannelThreadMessagesResponse>(threadQueryKey, (current) =>
        updateMobileChannelThreadMessageReactions(current, variables.messageId, (reactions) =>
          getNextMobileMessageReactions(reactions, variables.emoji, userId, variables.shouldReact),
        ),
      );
      return { previousChannel, previousThread };
    },
    onSuccess: (response, variables) => {
      queryClient.setQueryData<ChannelData>(channelQueryKey, (current) =>
        replaceMobileMessageReactions(current, variables.messageId, response.reactions),
      );
      queryClient.setQueryData<MobileChannelThreadMessagesResponse>(threadQueryKey, (current) =>
        updateMobileChannelThreadMessageReactions(
          current,
          variables.messageId,
          () => response.reactions,
        ),
      );
    },
  });
}

export function useMobileDMMessageReactionMutation(input: {
  readonly author: DMMessageAuthorPayload | null;
  readonly client: MobileApiClient;
  readonly conversationId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.dmMessages(input.conversationId);

  return useMutation(
    createMobileOptimisticReactionMutationOptions<
      MobileMessageReactionResponse,
      DMMessagePayload,
      MobileDMMessagesResponse
    >({
      getUserId: () => requireMobileMutationAuthor(input.author).id,
      getResponseReactions: (response) => response.reactions,
      mutationFn: (variables) =>
        setMobileDMMessageReaction(input.client, {
          ...variables,
          conversationId: input.conversationId,
        }),
      queryClient,
      queryKey,
    }),
  );
}

export function useMobileChannelMessageEditMutation(input: {
  readonly channelId: string;
  readonly client: MobileApiClient;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.channelMessages(input.channelId);

  return useMutation(
    createMobileOptimisticEditMutationOptions<
      MobileChannelSendMessageResponse,
      ChatMessage,
      MobileChannelMessagesResponse
    >({
      getResponseMessage: (response) => response.message,
      mutationFn: (variables) =>
        updateMobileChannelMessage(input.client, { ...variables, channelId: input.channelId }),
      queryClient,
      queryKey,
    }),
  );
}

export function useMobileDMMessageEditMutation(input: {
  readonly client: MobileApiClient;
  readonly conversationId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.dmMessages(input.conversationId);

  return useMutation(
    createMobileOptimisticEditMutationOptions<
      MobileDMSendMessageResponse,
      DMMessagePayload,
      MobileDMMessagesResponse
    >({
      getResponseMessage: (response) => response.message,
      mutationFn: (variables) =>
        updateMobileDMMessage(input.client, { ...variables, conversationId: input.conversationId }),
      queryClient,
      queryKey,
    }),
  );
}

export function useMobileChannelMessageDeleteMutation(input: {
  readonly channelId: string;
  readonly client: MobileApiClient;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.channelMessages(input.channelId);

  return useMutation(
    createMobileOptimisticDeleteMutationOptions<
      MobileMessageDeleteResponse,
      MobileChannelMessagesResponse
    >({
      applyOptimisticDelete: (current, messageId) =>
        softDeleteMobileMessage(current, messageId, new Date().toISOString()),
      mutationFn: (variables) =>
        deleteMobileChannelMessage(input.client, { ...variables, channelId: input.channelId }),
      queryClient,
      queryKey,
      shouldRemoveOnSuccess: (response) => response.status === "removed",
    }),
  );
}

export function useMobileDMMessageDeleteMutation(input: {
  readonly client: MobileApiClient;
  readonly conversationId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.dmMessages(input.conversationId);

  return useMutation(
    createMobileOptimisticDeleteMutationOptions<
      MobileMessageDeleteResponse,
      MobileDMMessagesResponse
    >({
      applyOptimisticDelete: (current, messageId) =>
        softDeleteMobileMessage(current, messageId, new Date().toISOString()),
      mutationFn: (variables) =>
        deleteMobileDMMessage(input.client, { ...variables, conversationId: input.conversationId }),
      queryClient,
      queryKey,
      shouldRemoveOnSuccess: (response) => response.status === "removed",
    }),
  );
}
