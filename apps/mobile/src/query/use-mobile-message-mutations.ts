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
  MobileChannelSendMessageResponse,
  MobileDMMessagesResponse,
  MobileDMSendMessageResponse,
  MobileMessageReactionResponse,
  MessageReaction,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import type { MobileSessionUser } from "../auth/session-types";
import {
  sendMobileDMMessage,
  setMobileDMMessageReaction,
  type SendMobileDMMessageInput,
} from "../dm/mobile-dm-client";
import {
  sendMobileChannelMessage,
  setMobileChannelMessageReaction,
  type SendMobileChannelMessageInput,
} from "../workspace/mobile-workspace-client";
import {
  applyMobileOptimisticMessageReaction,
  insertOptimisticMobileMessage,
  replaceMobileMessage,
  replaceMobileMessageReactions,
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
