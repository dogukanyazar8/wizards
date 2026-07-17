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
  MobileDMMessagesResponse,
  MobileDMMarkReadResponse,
  MobileDMSendMessageResponse,
  MobileMessageDeleteResponse,
  MobileMessageReactionResponse,
  MobileBootstrapPayload,
  MobileManagedWorkspaceServerDetailResponse,
  MessageReaction,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import type { MobileSessionUser } from "../auth/session-types";
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
  setMobileChannelMessageReaction,
  markMobileChannelRead,
  updateMobileChannelMessage,
  type SendMobileChannelMessageInput,
} from "../workspace/mobile-workspace-client";
import {
  applyMobileOptimisticMessageReaction,
  insertOptimisticMobileMessage,
  replaceMobileMessage,
  replaceMobileMessageReactions,
  removeMobileMessage,
  softDeleteMobileMessage,
  updateMobileMessageContent,
} from "./mobile-message-cache";
import { mobileQueryKeys } from "./mobile-query-keys";

type MobileMessagePage<TMessage extends { readonly id: string }> = {
  readonly messages: readonly TMessage[];
};

type MobileOptimisticMutationContext<TData> = {
  readonly clientId: string;
  readonly previousData: TData | undefined;
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
  TMessage extends { readonly id: string },
  TPage extends MobileMessagePage<TMessage>,
  TPageParam,
> = {
  readonly createOptimisticMessage: (variables: TVariables, clientId: string) => TMessage;
  readonly getResponseMessage: (response: TResponse) => TMessage;
  readonly invalidateKeys: readonly QueryKey[];
  readonly mutationFn: MutationFunction<TResponse, TVariables>;
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
  TVariables,
  TResponse,
  TMessage extends { readonly id: string },
  TPage extends MobileMessagePage<TMessage>,
  TPageParam = string | null,
>(options: MobileOptimisticMutationOptions<TVariables, TResponse, TMessage, TPage, TPageParam>) {
  type TData = InfiniteData<TPage, TPageParam>;
  type TContext = MobileOptimisticMutationContext<TData>;

  return mutationOptions<TResponse, Error, TVariables, TContext>({
    mutationFn: options.mutationFn,
    onError: (_error, _variables, context) => {
      if (context?.previousData) {
        options.queryClient.setQueryData(options.queryKey, context.previousData);
      }
    },
    onMutate: async (variables) => {
      await options.queryClient.cancelQueries({ queryKey: options.queryKey });
      const previousData = options.queryClient.getQueryData<TData>(options.queryKey);
      const clientId = createMobileOptimisticMessageId();
      const optimisticMessage = options.createOptimisticMessage(variables, clientId);
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        insertOptimisticMobileMessage(current, optimisticMessage),
      );
      return { clientId, previousData };
    },
    onSettled: async () => {
      await Promise.all([
        options.queryClient.invalidateQueries({ queryKey: options.queryKey }),
        ...options.invalidateKeys.map((queryKey) =>
          options.queryClient.invalidateQueries({ queryKey }),
        ),
      ]);
    },
    onSuccess: (response, _variables, context) => {
      if (!context) {
        return;
      }

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

type MobileChannelDraft = Omit<SendMobileChannelMessageInput, "channelId">;

export function useMobileChannelMessageMutation(input: {
  readonly author: MobileSessionUser | null;
  readonly channelId: string;
  readonly client: MobileApiClient;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.channelMessages(input.channelId);

  return useMutation(
    createMobileOptimisticMutationOptions<
      MobileChannelDraft,
      MobileChannelSendMessageResponse,
      ChatMessage,
      MobileChannelMessagesResponse
    >({
      createOptimisticMessage: (draft, clientId) => ({
        attachments: [],
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
      invalidateKeys: [mobileQueryKeys.bootstrap()],
      mutationFn: (draft) =>
        sendMobileChannelMessage(input.client, { ...draft, channelId: input.channelId }),
      queryClient,
      queryKey,
    }),
  );
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
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.dmConversations(),
      });
      void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
    },
  });
}

type MobileDMDraft = Omit<SendMobileDMMessageInput, "conversationId">;

export function useMobileDMMessageMutation(input: {
  readonly author: DMMessageAuthorPayload | null;
  readonly client: MobileApiClient;
  readonly conversationId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.dmMessages(input.conversationId);

  return useMutation(
    createMobileOptimisticMutationOptions<
      MobileDMDraft,
      MobileDMSendMessageResponse,
      DMMessagePayload,
      MobileDMMessagesResponse
    >({
      createOptimisticMessage: (draft, clientId) => ({
        attachments: [],
        author: requireMobileMutationAuthor(input.author),
        content: draft.content,
        conversationId: input.conversationId,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        deletedById: null,
        editedAt: null,
        id: clientId,
        reactions: [],
        replyTo: null,
        replyToId: draft.replyToId ?? null,
        threadParentId: draft.threadParentId ?? null,
        userId: requireMobileMutationAuthor(input.author).id,
      }),
      getResponseMessage: (response) => response.message,
      invalidateKeys: [mobileQueryKeys.bootstrap(), mobileQueryKeys.dmConversations()],
      mutationFn: (draft) =>
        sendMobileDMMessage(input.client, { ...draft, conversationId: input.conversationId }),
      queryClient,
      queryKey,
    }),
  );
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
