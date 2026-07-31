import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type {
  MessageAttachment,
  MobileWorkspaceChannelSummary,
  UploadedAttachmentInput,
} from "@wizards/types";
import type { MobileApiClient } from "../../api/mobile-api-client";
import type { MobileSessionUser } from "../../auth/session-types";
import { summarizeMobileBootstrap } from "../../bootstrap/mobile-bootstrap";
import type { MobileTabId } from "../../navigation/mobile-navigation";
import type { MobileVoiceRuntimeState } from "../../voice/mobile-voice-contract";
import {
  clearMobileVoiceRoomRouteContext,
  setMobileVoiceRoomRouteContext,
} from "../../voice/mobile-voice-room-route-context";
import { useMobileBootstrapQuery } from "../../query/mobile-bootstrap-query";
import {
  flattenMobileDMConversationPages,
  getMobileDMUnreadCount,
  useMobileDMConversationsQuery,
} from "../../query/mobile-dm-conversations-query";
import {
  useMobileChannelMessagesQuery,
  useMobileChannelPinsQuery,
} from "../../query/mobile-message-queries";
import {
  getMobileChannelFailedSendScope,
  mobileFailedSendRegistry,
  withMobileFailedSendOverlay,
} from "../../query/mobile-failed-send-registry";
import { useMobileMessageSearchQuery } from "../../query/mobile-message-search-query";
import { loadMoreMobileInfinitePages } from "../../query/mobile-query-pages";
import {
  useMobileChannelMessageMutation,
  useMobileChannelReadMutation,
  useMobileChannelMessageDeleteMutation,
  useMobileChannelMessageEditMutation,
  useMobileChannelMessageReactionMutation,
  useMobileDMMessageDeleteMutation,
  useMobileDMMessageEditMutation,
  useMobileChannelMessagePinMutation,
  useMobileDMMessageMutation,
  useMobileDMMessageReactionMutation,
  useMobileMessageForwardMutation,
  type MobileMessageReactionMutationVariables,
  type MobileMessageEditMutationVariables,
} from "../../query/use-mobile-message-mutations";
import { useMobileNotificationUnreadCount } from "../../notifications/mobile-notification-query";
import { useMobileWorkspaceQuery } from "../../query/mobile-workspace-query";
import { useMobileWorkspacePrefetch } from "../../query/mobile-workspace-prefetch";
import { useMobileQueryClient } from "../providers/mobile-query-provider";
import {
  MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
  MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH,
  type MobileMessageSearchScope,
} from "../../search/mobile-message-search-client";
import { useMobileActiveTargetStore } from "../../state/mobile-active-target-store";
import {
  findInitialMobileWorkspaceChannel,
  getMobileWorkspaceChannels,
  resolveMobileTabActiveTextChannelId,
  resolveMobileWorkspaceActiveTextChannelId,
} from "../mobile-display-model";
import {
  toMobileBootstrapViewState,
  toMobileChannelMessagesViewState,
  toMobileDMMessagesViewState,
  toMobileMessageSearchViewState,
  toMobileSyncSnapshot,
  toMobileWorkspaceViewState,
} from "../mobile-query-view-state";
import { getVisibleMobileSyncHealth, type MobileSyncHealthDomain } from "../mobile-screen-sync";
import {
  createInitialMobileSyncSnapshot,
  type MobileSyncSnapshot,
  type MobileSyncSource,
} from "../../sync/mobile-sync-contract";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import { useMobileAccountLocaleSync } from "../../locale/use-mobile-account-locale-sync";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { createMobileGiphyAttachment } from "../../media/mobile-giphy-client";
import { useMobileMessagePrefetch } from "../../query/mobile-message-prefetch";
import { useMobileRecentDMPrefetch } from "../../query/mobile-recent-dm-prefetch";
import { useMobileMessageStreamPersistence } from "../../query/use-mobile-message-stream-persistence";
import { useMobileRecentDMRestore } from "../../query/mobile-recent-dm-restore";
import type { MobileForwardSendInput } from "../components/message-forward-sheet";
import { resolveMobileWorkspaceServerSelection } from "../../workspace/mobile-workspace-selection";

const copy = activeMobileCopy;
const EMPTY_PINNED_MESSAGES: readonly never[] = [];
const IDLE_DM_MESSAGES_STATE = toMobileDMMessagesViewState(
  { data: undefined, isError: false },
  null,
  copy.dmMessagesLoadFailed,
);
const IDLE_DM_SYNC_STATE = createInitialMobileSyncSnapshot("dm");
const NOOP = () => undefined;

export { useMobileDMReadEffect } from "./use-mobile-dm-read-effect";

/**
 * Sync banners read five fetch counters off a query. Memoizing on those
 * counters keeps the snapshot — and therefore every screen-props object built
 * from it — stable while only the query's tracking proxy changed.
 */
function useMobileSyncSnapshot(
  query: {
    readonly dataUpdatedAt: number;
    readonly errorUpdatedAt: number;
    readonly failureCount: number;
    readonly isError: boolean;
    readonly isFetching: boolean;
  },
  source: MobileSyncSource,
): MobileSyncSnapshot {
  const { dataUpdatedAt, errorUpdatedAt, failureCount, isError, isFetching } = query;
  return useMemo(
    () =>
      toMobileSyncSnapshot(
        { dataUpdatedAt, errorUpdatedAt, failureCount, isError, isFetching },
        source,
      ),
    [dataUpdatedAt, errorUpdatedAt, failureCount, isError, isFetching, source],
  );
}

type MobileMessageSearchInput = {
  readonly conversationId: string;
  readonly limit: number;
  readonly query: string;
  readonly scope: MobileMessageSearchScope;
};

const INITIAL_MESSAGE_SEARCH_INPUT: MobileMessageSearchInput = {
  conversationId: "",
  limit: MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
  query: "",
  scope: "dm",
};

export function useMobileMessagingFeature({
  activeVoiceChannelId,
  apiClient,
  currentUser,
  isSignedIn,
  joinVoiceChannel,
  leaveVoiceChannel,
  requestMicrophonePermission,
  stopChannelTyping,
  stopDMTyping,
  updateChannelTyping,
  updateDMTyping,
}: {
  readonly activeVoiceChannelId: string | null;
  readonly apiClient: MobileApiClient;
  readonly currentUser: MobileSessionUser | null;
  readonly isSignedIn: boolean;
  readonly joinVoiceChannel: (input: {
    channelId: string;
    channelName: string;
    permission?: MobileVoiceRuntimeState;
    serverId: string;
  }) => Promise<boolean>;
  readonly leaveVoiceChannel: () => Promise<void>;
  readonly requestMicrophonePermission: () => Promise<MobileVoiceRuntimeState>;
  readonly stopChannelTyping: (channelId: string) => void;
  readonly stopDMTyping: (conversationId: string) => void;
  readonly updateChannelTyping: (channelId: string, content: string) => void;
  readonly updateDMTyping: (conversationId: string, content: string) => void;
}) {
  const [currentTab, setCurrentTab] = useState<MobileTabId>("overview");
  const [selectedDMConversationId, setSelectedDMConversationId] = useState<string | null>(null);
  const [selectedWorkspaceServerId, setSelectedWorkspaceServerId] = useState<string | null>(null);
  const [selectedWorkspaceChannelId, setSelectedWorkspaceChannelId] = useState<string | null>(null);
  const [activeWorkspaceTextChannelId, setActiveWorkspaceTextChannelId] = useState<string | null>(
    null,
  );
  const [activeWorkspaceVoiceChannelId, setActiveWorkspaceVoiceChannelId] = useState<string | null>(
    null,
  );
  const [workspaceRouteIntent, setWorkspaceRouteIntent] = useState<{
    readonly channelId: string | null;
    readonly serverId: string;
    readonly shouldOpenPreferredChannel: boolean;
  } | null>(null);
  const [messageSearchInput, setMessageSearchInput] = useState<MobileMessageSearchInput>(
    INITIAL_MESSAGE_SEARCH_INPUT,
  );
  const { locale: runtimeLocale } = useMobileLocaleRuntime();
  const bootstrapQuery = useMobileBootstrapQuery(apiClient, isSignedIn);
  const dmConversationsQuery = useMobileDMConversationsQuery(apiClient, isSignedIn);
  const workspaceQuery = useMobileWorkspaceQuery(apiClient, selectedWorkspaceServerId ?? "");
  const channelMessagesQuery = useMobileChannelMessagesQuery(
    apiClient,
    activeWorkspaceTextChannelId ?? "",
  );
  const messageSearchQuery = useMobileMessageSearchQuery(apiClient, messageSearchInput);
  // Observers bind `refetch`/`fetchNextPage` once, so pulling them out here is
  // what lets the callbacks below keep a stable identity across renders — the
  // screen-props memos in MobileProductApp are only worth anything if their
  // handler dependencies stop changing every render.
  const { refetch: refetchBootstrap } = bootstrapQuery;
  const { refetch: refetchWorkspace } = workspaceQuery;
  const { refetch: refetchChannelMessages } = channelMessagesQuery;
  const { refetch: refetchDMConversations } = dmConversationsQuery;
  const { refetch: refetchMessageSearch } = messageSearchQuery;
  const queryClient = useMobileQueryClient();
  // Message bodies live in their own SQLCipher database rather than the plaintext
  // query cache, so an open stream is seeded from disk on a cold start and its
  // newest page is written back as it moves.
  useMobileMessageStreamPersistence({
    data: channelMessagesQuery.data,
    enabled: isSignedIn,
    error: channelMessagesQuery.error,
    queryClient,
    scope: "channel",
    targetId: activeWorkspaceTextChannelId,
    userId: currentUser?.id ?? null,
  });
  // Tap-time warmers for the two chat surfaces: the row that opens a chat can put
  // its first page on the wire before the navigation and selection work runs.
  const { prefetchChannelMessages, prefetchDMMessages } = useMobileMessagePrefetch(apiClient);
  useMobileWorkspacePrefetch({
    apiClient,
    enabled: isSignedIn,
    queryClient,
    recentServers: bootstrapQuery.data?.home.servers.recent,
    selectedServerId: selectedWorkspaceServerId,
    workspaceDetail: workspaceQuery.data,
  });
  const dmMessageAuthor = currentUser
    ? {
        ...currentUser,
        customStatus: null,
        status: "OFFLINE" as const,
      }
    : null;
  const channelMessageControls = useMobileChannelMessageMutation({
    author: currentUser,
    channelId: activeWorkspaceTextChannelId ?? "",
    client: apiClient,
  });
  const channelReadMutation = useMobileChannelReadMutation({ client: apiClient });
  const dmMessageControls = useMobileDMMessageMutation({
    author: dmMessageAuthor,
    client: apiClient,
    conversationId: selectedDMConversationId ?? "",
  });
  const channelReactionMutation = useMobileChannelMessageReactionMutation({
    author: currentUser,
    channelId: activeWorkspaceTextChannelId ?? "",
    client: apiClient,
  });
  const dmReactionMutation = useMobileDMMessageReactionMutation({
    author: dmMessageAuthor,
    client: apiClient,
    conversationId: selectedDMConversationId ?? "",
  });
  const channelEditMutation = useMobileChannelMessageEditMutation({
    channelId: activeWorkspaceTextChannelId ?? "",
    client: apiClient,
  });
  const dmEditMutation = useMobileDMMessageEditMutation({
    client: apiClient,
    conversationId: selectedDMConversationId ?? "",
  });
  const channelDeleteMutation = useMobileChannelMessageDeleteMutation({
    channelId: activeWorkspaceTextChannelId ?? "",
    client: apiClient,
  });
  const dmDeleteMutation = useMobileDMMessageDeleteMutation({
    client: apiClient,
    conversationId: selectedDMConversationId ?? "",
  });
  const forwardMutation = useMobileMessageForwardMutation({ client: apiClient });
  const { mutateAsync: forwardMessage } = forwardMutation;
  const channelPinsQuery = useMobileChannelPinsQuery(
    apiClient,
    isSignedIn ? (activeWorkspaceTextChannelId ?? "") : "",
  );
  const channelPinMutation = useMobileChannelMessagePinMutation({
    channelId: activeWorkspaceTextChannelId ?? "",
    client: apiClient,
  });
  const { mutateAsync: mutateChannelPin } = channelPinMutation;
  // 8c "YENİ" divider: the read endpoint reports the first unread message id
  // for the channel being opened, captured once per open.
  const [channelFirstUnreadMessageId, setChannelFirstUnreadMessageId] = useState<string | null>(
    null,
  );
  const {
    discardFailedMessage: discardFailedChannelMessage,
    mutation: channelMessageMutation,
    retryFailedMessage: retryFailedChannelMessage,
  } = channelMessageControls;
  const {
    discardFailedMessage: discardFailedDMMessage,
    mutation: dmMessageMutation,
    retryFailedMessage: retryFailedDMMessage,
  } = dmMessageControls;
  const { mutate: sendChannelMessage } = channelMessageMutation;
  const { mutate: sendDMMessage } = dmMessageMutation;
  const resetChannelMessageMutation = channelMessageMutation.reset;
  const resetDMMessageMutation = dmMessageMutation.reset;
  const { isPending: isChannelReactionPending, mutate: mutateChannelReaction } =
    channelReactionMutation;
  const { mutate: markChannelRead } = channelReadMutation;
  const { isPending: isDMReactionPending, mutate: mutateDMReaction } = dmReactionMutation;
  const { isPending: isChannelEditPending, mutateAsync: editChannelMessage } = channelEditMutation;
  const { isPending: isDMEditPending, mutateAsync: editDMMessage } = dmEditMutation;
  const { isPending: isChannelDeletePending, mutateAsync: deleteChannelMessage } =
    channelDeleteMutation;
  const { isPending: isDMDeletePending, mutateAsync: deleteDMMessage } = dmDeleteMutation;
  // `useQuery` returns a new tracking proxy every render, so every view state
  // below memoizes on the query fields it actually reads. Without that, each
  // render minted a new payload/messages array, every screen-props object
  // downstream changed identity, and the open message list re-rendered from
  // scratch on unrelated state changes.
  const bootstrapState = useMemo(
    () =>
      toMobileBootstrapViewState(
        {
          data: bootstrapQuery.data,
          isError: bootstrapQuery.isError,
          isFetching: bootstrapQuery.isFetching,
          isPending: bootstrapQuery.isPending,
        },
        summarizeMobileBootstrap,
        copy.bootstrapLoadFailed,
      ),
    [
      bootstrapQuery.data,
      bootstrapQuery.isError,
      bootstrapQuery.isFetching,
      bootstrapQuery.isPending,
    ],
  );
  const dmConversations = useMemo(
    () => flattenMobileDMConversationPages(dmConversationsQuery.data),
    [dmConversationsQuery.data],
  );
  const directMessageUnreadCount = getMobileDMUnreadCount(dmConversationsQuery.data);
  // The encrypted store only holds the few targets it is bounded to, and only on
  // builds where SQLCipher is actually compiled in. Everything else still starts
  // cold, so the streams the reader is most likely to open next are warmed once
  // the inbox lands instead of on the tap.
  useMobileRecentDMPrefetch({
    apiClient,
    conversations: dmConversations,
    enabled: isSignedIn,
    queryClient,
    selectedConversationId: selectedDMConversationId,
  });
  // Disk first, and before the tap rather than after it: the encrypted page used
  // to be read only once the stream query had already mounted, so it raced the
  // network from behind and a cold open watched a skeleton either way.
  useMobileRecentDMRestore({
    conversations: dmConversations,
    enabled: isSignedIn,
    queryClient,
    userId: currentUser?.id ?? null,
  });
  // Bottom-tab notification badge. Shares the unfiltered feed key with the
  // notifications screen, so the realtime notification invalidation already
  // keeps the count live without a second endpoint.
  const notificationUnreadCount = useMobileNotificationUnreadCount(apiClient, isSignedIn);
  // Mention bodies and pushes are translated server-side from `User.locale`, so
  // the account has to follow the app's language or a Turkish app keeps getting
  // English notifications.
  useMobileAccountLocaleSync({
    accountLocale: bootstrapQuery.data?.user.locale ?? null,
    client: apiClient,
    isSignedIn,
    locale: runtimeLocale,
  });
  const workspaceServerState = useMemo(
    () =>
      toMobileWorkspaceViewState(
        { data: workspaceQuery.data, isError: workspaceQuery.isError },
        selectedWorkspaceServerId,
        copy.workspaceLoadFailed,
      ),
    [selectedWorkspaceServerId, workspaceQuery.data, workspaceQuery.isError],
  );
  const channelFailedScope = getMobileChannelFailedSendScope(activeWorkspaceTextChannelId ?? "");
  const channelFailedSends = useSyncExternalStore(mobileFailedSendRegistry.subscribe, () =>
    mobileFailedSendRegistry.getEntries(channelFailedScope),
  );
  // Failed sends only live in the registry, so re-attach them after a refetch
  // drops the optimistic rows. Channel scopes always hold ChatMessage entries
  // and DM scopes always hold DMMessagePayload entries.
  const channelMessagesState = useMemo(
    () =>
      withMobileFailedSendOverlay(
        toMobileChannelMessagesViewState(
          { data: channelMessagesQuery.data, isError: channelMessagesQuery.isError },
          activeWorkspaceTextChannelId,
          copy.workspaceChannelLoadFailed,
        ),
        channelFailedSends,
      ),
    [
      activeWorkspaceTextChannelId,
      channelFailedSends,
      channelMessagesQuery.data,
      channelMessagesQuery.isError,
    ],
  );
  // The product root owns inbox selection and mutations, but never subscribes
  // to a DM transcript. The pushed DirectMessage route owns that observer so a
  // prefetched page can render on its first route commit.
  const dmMessagesState = IDLE_DM_MESSAGES_STATE;
  const messageSearchState = useMemo(
    () =>
      toMobileMessageSearchViewState(
        { data: messageSearchQuery.data, isError: messageSearchQuery.isError },
        messageSearchInput,
        copy.messageSearchFailed,
      ),
    [messageSearchInput, messageSearchQuery.data, messageSearchQuery.isError],
  );
  const bootstrapSyncState = useMobileSyncSnapshot(bootstrapQuery, "bootstrap");
  const channelSyncState = useMobileSyncSnapshot(channelMessagesQuery, "channel");
  const dmSyncState = IDLE_DM_SYNC_STATE;
  const workspaceSyncState = useMobileSyncSnapshot(workspaceQuery, "workspace");

  useEffect(() => {
    setActiveWorkspaceTextChannelId((channelId) =>
      resolveMobileTabActiveTextChannelId(currentTab, channelId),
    );
    if (currentTab !== "overview") {
      setWorkspaceRouteIntent(null);
    }
  }, [currentTab]);

  // Server detail lands (and re-lands on every refetch), so this effect has to
  // be idempotent: it seeds the selection when there is none and otherwise
  // leaves the user where they are. It used to re-run the *initial* channel
  // pick on every payload — a read receipt or a socket-driven refetch was
  // enough to move the selection off the channel the reader had open, which is
  // what sent typing events to the wrong channel and re-drove navigation.
  useEffect(() => {
    const payload = workspaceQuery.data;
    const serverId = selectedWorkspaceServerId;
    if (!payload || !serverId) {
      return;
    }

    const intent = workspaceRouteIntent?.serverId === serverId ? workspaceRouteIntent : null;
    const preferredChannelId = intent?.channelId ?? null;
    const shouldOpenPreferredChannel = intent?.shouldOpenPreferredChannel === true;
    const channels = getMobileWorkspaceChannels(payload.detail);

    setSelectedWorkspaceChannelId((currentChannelId) => {
      if (
        !shouldOpenPreferredChannel &&
        currentChannelId &&
        channels.some((channel) => channel.id === currentChannelId)
      ) {
        return currentChannelId;
      }

      return findInitialMobileWorkspaceChannel(payload.detail, preferredChannelId)?.id ?? null;
    });
    setActiveWorkspaceTextChannelId((currentChannelId) =>
      resolveMobileWorkspaceActiveTextChannelId(payload.detail, {
        currentChannelId,
        preferredChannelId,
        shouldOpenPreferredChannel,
      }),
    );
    if (shouldOpenPreferredChannel) {
      setActiveWorkspaceVoiceChannelId(null);
      // One-shot: the intent has been honoured, so the next refetch of this
      // server must not drag the reader back to the channel they arrived on.
      setWorkspaceRouteIntent(null);
    }
  }, [selectedWorkspaceServerId, workspaceQuery.data, workspaceRouteIntent]);

  const clearMessageSearch = useCallback(() => {
    setMessageSearchInput(INITIAL_MESSAGE_SEARCH_INPUT);
  }, []);

  const handleSearchMessages = useCallback(
    async ({
      conversationId,
      query,
      scope,
    }: {
      conversationId: string;
      query: string;
      scope: MobileMessageSearchScope;
    }) => {
      const normalizedQuery = query.trim().replace(/\s+/g, " ");
      const normalizedConversationId = conversationId.trim();

      if (
        !isSignedIn ||
        normalizedConversationId.length === 0 ||
        normalizedQuery.length < MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH
      ) {
        clearMessageSearch();
        return;
      }

      const nextInput: MobileMessageSearchInput = {
        conversationId: normalizedConversationId,
        limit: MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
        query: normalizedQuery,
        scope,
      };
      if (
        messageSearchInput.conversationId === nextInput.conversationId &&
        messageSearchInput.query === nextInput.query &&
        messageSearchInput.scope === nextInput.scope
      ) {
        void refetchMessageSearch();
      } else {
        setMessageSearchInput(nextInput);
      }
    },
    [clearMessageSearch, isSignedIn, messageSearchInput, refetchMessageSearch],
  );

  const handleSendDMMessage = useCallback(
    async (
      content: string,
      intent?: {
        readonly attachments?: readonly UploadedAttachmentInput[];
        readonly attachmentPreviews?: readonly MessageAttachment[];
        readonly replyToId?: string;
        readonly threadParentId?: string;
      },
    ): Promise<boolean> => {
      const trimmedContent = content.trim();
      const attachments = intent?.attachments ?? [];
      const attachmentPreviews = intent?.attachmentPreviews ?? [];

      if (
        !isSignedIn ||
        !selectedDMConversationId ||
        (trimmedContent.length === 0 && attachments.length === 0)
      ) {
        return false;
      }

      stopDMTyping(selectedDMConversationId);
      sendDMMessage({
        content: trimmedContent,
        ...(attachments.length > 0 ? { attachments: [...attachments] } : {}),
        ...(attachmentPreviews.length > 0 ? { attachmentPreviews } : {}),
        ...(intent?.replyToId ? { replyToId: intent.replyToId } : {}),
        ...(intent?.threadParentId ? { threadParentId: intent.threadParentId } : {}),
      });
      return true;
    },
    [isSignedIn, selectedDMConversationId, sendDMMessage, stopDMTyping],
  );

  const handleSendChannelMessage = useCallback(
    async (
      content: string,
      intent?: {
        readonly attachments?: readonly UploadedAttachmentInput[];
        readonly attachmentPreviews?: readonly MessageAttachment[];
        readonly replyToId?: string;
        readonly threadParentId?: string;
      },
    ): Promise<boolean> => {
      const trimmedContent = content.trim();
      const attachments = intent?.attachments ?? [];
      const attachmentPreviews = intent?.attachmentPreviews ?? [];

      if (
        !isSignedIn ||
        !activeWorkspaceTextChannelId ||
        (trimmedContent.length === 0 && attachments.length === 0)
      ) {
        return false;
      }

      stopChannelTyping(activeWorkspaceTextChannelId);
      sendChannelMessage({
        content: trimmedContent,
        ...(attachments.length > 0 ? { attachments: [...attachments] } : {}),
        ...(attachmentPreviews.length > 0 ? { attachmentPreviews } : {}),
        ...(intent?.replyToId ? { replyToId: intent.replyToId } : {}),
        ...(intent?.threadParentId ? { threadParentId: intent.threadParentId } : {}),
      });
      return true;
    },
    [activeWorkspaceTextChannelId, isSignedIn, sendChannelMessage, stopChannelTyping],
  );

  const handlePinMessage = useCallback(
    async (messageId: string, shouldPin: boolean): Promise<boolean> => {
      if (!isSignedIn || !activeWorkspaceTextChannelId) return false;
      try {
        await mutateChannelPin({ messageId, shouldPin });
        return true;
      } catch {
        return false;
      }
    },
    [activeWorkspaceTextChannelId, isSignedIn, mutateChannelPin],
  );

  const handleForwardMessage = useCallback(
    async (input: MobileForwardSendInput): Promise<boolean> => {
      const content = input.content.trim();
      if (!isSignedIn || content.length === 0) return false;
      try {
        await forwardMessage({
          content,
          forwardOfMessageId: input.forwardOfMessageId,
          target: input.target,
        });
        return true;
      } catch {
        return false;
      }
    },
    [forwardMessage, isSignedIn],
  );

  const handleSendDMGif = useCallback(
    async (gifId: string): Promise<boolean> => {
      if (!isSignedIn || !selectedDMConversationId) return false;
      let attachment: Awaited<ReturnType<typeof createMobileGiphyAttachment>>;
      try {
        attachment = await createMobileGiphyAttachment(apiClient, gifId);
      } catch {
        return false;
      }
      stopDMTyping(selectedDMConversationId);
      sendDMMessage({
        attachmentPreviews: [attachment.attachment],
        attachments: [attachment.input],
        content: "",
      });
      return true;
    },
    [apiClient, isSignedIn, selectedDMConversationId, sendDMMessage, stopDMTyping],
  );

  const handleSendChannelGif = useCallback(
    async (gifId: string): Promise<boolean> => {
      if (!isSignedIn || !activeWorkspaceTextChannelId) return false;
      let attachment: Awaited<ReturnType<typeof createMobileGiphyAttachment>>;
      try {
        attachment = await createMobileGiphyAttachment(apiClient, gifId);
      } catch {
        return false;
      }
      stopChannelTyping(activeWorkspaceTextChannelId);
      sendChannelMessage({
        attachmentPreviews: [attachment.attachment],
        attachments: [attachment.input],
        content: "",
      });
      return true;
    },
    [activeWorkspaceTextChannelId, apiClient, isSignedIn, sendChannelMessage, stopChannelTyping],
  );

  const handleRetryChannelMessage = useCallback(
    (messageId: string) => {
      if (!isSignedIn) return;
      retryFailedChannelMessage(messageId);
    },
    [isSignedIn, retryFailedChannelMessage],
  );
  const handleDiscardChannelMessage = useCallback(
    (messageId: string) => discardFailedChannelMessage(messageId),
    [discardFailedChannelMessage],
  );
  const handleRetryDMMessage = useCallback(
    (messageId: string) => {
      if (!isSignedIn) return;
      retryFailedDMMessage(messageId);
    },
    [isSignedIn, retryFailedDMMessage],
  );
  const handleDiscardDMMessage = useCallback(
    (messageId: string) => discardFailedDMMessage(messageId),
    [discardFailedDMMessage],
  );

  const handleToggleChannelMessageReaction = useCallback(
    (variables: MobileMessageReactionMutationVariables) => {
      if (
        !isSignedIn ||
        !currentUser ||
        !activeWorkspaceTextChannelId ||
        isChannelReactionPending
      ) {
        return;
      }

      mutateChannelReaction(variables);
    },
    [
      activeWorkspaceTextChannelId,
      currentUser,
      isChannelReactionPending,
      isSignedIn,
      mutateChannelReaction,
    ],
  );

  const handleToggleDMMessageReaction = useCallback(
    (variables: MobileMessageReactionMutationVariables) => {
      if (!isSignedIn || !currentUser || !selectedDMConversationId || isDMReactionPending) {
        return;
      }

      mutateDMReaction(variables);
    },
    [currentUser, isDMReactionPending, isSignedIn, mutateDMReaction, selectedDMConversationId],
  );

  const handleEditChannelMessage = useCallback(
    async (variables: MobileMessageEditMutationVariables): Promise<boolean> => {
      if (!isSignedIn || !currentUser || !activeWorkspaceTextChannelId || isChannelEditPending) {
        return false;
      }
      try {
        await editChannelMessage({ ...variables, content: variables.content.trim() });
        return true;
      } catch {
        return false;
      }
    },
    [
      activeWorkspaceTextChannelId,
      currentUser,
      editChannelMessage,
      isChannelEditPending,
      isSignedIn,
    ],
  );

  const handleEditDMMessage = useCallback(
    async (variables: MobileMessageEditMutationVariables): Promise<boolean> => {
      if (!isSignedIn || !currentUser || !selectedDMConversationId || isDMEditPending) {
        return false;
      }
      try {
        await editDMMessage({ ...variables, content: variables.content.trim() });
        return true;
      } catch {
        return false;
      }
    },
    [currentUser, editDMMessage, isDMEditPending, isSignedIn, selectedDMConversationId],
  );

  const handleDeleteChannelMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!isSignedIn || !currentUser || !activeWorkspaceTextChannelId || isChannelDeletePending) {
        return false;
      }
      try {
        await deleteChannelMessage({ messageId });
        return true;
      } catch {
        return false;
      }
    },
    [
      activeWorkspaceTextChannelId,
      currentUser,
      deleteChannelMessage,
      isChannelDeletePending,
      isSignedIn,
    ],
  );

  const handleDeleteDMMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!isSignedIn || !currentUser || !selectedDMConversationId || isDMDeletePending) {
        return false;
      }
      try {
        await deleteDMMessage({ messageId });
        return true;
      } catch {
        return false;
      }
    },
    [currentUser, deleteDMMessage, isDMDeletePending, isSignedIn, selectedDMConversationId],
  );

  const loadMoreChannelMessages = useCallback(() => {
    loadMoreMobileInfinitePages({
      fetchNextPage: channelMessagesQuery.fetchNextPage,
      hasNextPage: channelMessagesQuery.hasNextPage,
      isFetchingNextPage: channelMessagesQuery.isFetchingNextPage,
    });
  }, [
    channelMessagesQuery.fetchNextPage,
    channelMessagesQuery.hasNextPage,
    channelMessagesQuery.isFetchingNextPage,
  ]);
  const loadMoreDMMessages = NOOP;
  const loadMoreDMConversations = useCallback(() => {
    loadMoreMobileInfinitePages({
      fetchNextPage: dmConversationsQuery.fetchNextPage,
      hasNextPage: dmConversationsQuery.hasNextPage,
      isFetchingNextPage: dmConversationsQuery.isFetchingNextPage,
    });
  }, [
    dmConversationsQuery.fetchNextPage,
    dmConversationsQuery.hasNextPage,
    dmConversationsQuery.isFetchingNextPage,
  ]);

  const refreshBootstrap = useCallback(() => {
    void refetchBootstrap();
  }, [refetchBootstrap]);

  const refreshDMMessages = NOOP;

  const refreshChannelMessages = useCallback(() => {
    if (activeWorkspaceTextChannelId) {
      void refetchChannelMessages();
    }
  }, [activeWorkspaceTextChannelId, refetchChannelMessages]);

  const refreshWorkspaceServer = useCallback(() => {
    if (selectedWorkspaceServerId) {
      void refetchWorkspace();
    }
  }, [refetchWorkspace, selectedWorkspaceServerId]);

  const handleChannelDraftChange = useCallback(
    (content: string) => {
      if (!isSignedIn || !selectedWorkspaceChannelId) {
        return;
      }
      updateChannelTyping(selectedWorkspaceChannelId, content);
    },
    [isSignedIn, selectedWorkspaceChannelId, updateChannelTyping],
  );
  const handleDMDraftChange = useCallback(
    (content: string) => {
      if (isSignedIn && selectedDMConversationId) {
        updateDMTyping(selectedDMConversationId, content);
      }
    },
    [isSignedIn, selectedDMConversationId, updateDMTyping],
  );

  const handleOpenDMConversation = useCallback(
    (conversationId: string) => {
      clearMessageSearch();
      resetDMMessageMutation();
      setSelectedDMConversationId(conversationId);
    },
    [clearMessageSearch, resetDMMessageMutation],
  );

  const handleCloseDMConversation = useCallback(
    (conversationId?: string) => {
      const closingConversationId = conversationId ?? selectedDMConversationId;
      if (!closingConversationId) {
        return;
      }

      stopDMTyping(closingConversationId);
      // A stale blur from route A may run after route B focused. It owns A's
      // typing cleanup, but it must not clear B's selection or mutation state.
      if (selectedDMConversationId !== closingConversationId) {
        return;
      }
      clearMessageSearch();
      resetDMMessageMutation();
      setSelectedDMConversationId(null);
    },
    [clearMessageSearch, resetDMMessageMutation, selectedDMConversationId, stopDMTyping],
  );

  const handleOpenWorkspaceServer = useCallback(
    (serverId: string) => {
      clearMessageSearch();
      if (selectedWorkspaceChannelId) {
        stopChannelTyping(selectedWorkspaceChannelId);
      }
      resetChannelMessageMutation();
      setActiveWorkspaceTextChannelId(null);
      setActiveWorkspaceVoiceChannelId(null);
      setSelectedWorkspaceServerId(serverId);
      setWorkspaceRouteIntent({
        channelId: null,
        serverId,
        shouldOpenPreferredChannel: false,
      });
    },
    [
      clearMessageSearch,
      resetChannelMessageMutation,
      selectedWorkspaceChannelId,
      stopChannelTyping,
    ],
  );

  const handleCloseWorkspaceChannel = useCallback(() => {
    clearMessageSearch();
    if (selectedWorkspaceChannelId) {
      stopChannelTyping(selectedWorkspaceChannelId);
    }
    setActiveWorkspaceTextChannelId(null);
  }, [clearMessageSearch, selectedWorkspaceChannelId, stopChannelTyping]);

  const handleCloseWorkspaceVoiceChannel = useCallback(() => {
    clearMessageSearch();
    clearMobileVoiceRoomRouteContext();
    setActiveWorkspaceVoiceChannelId(null);
  }, [clearMessageSearch]);

  const handleLeaveWorkspaceVoiceChannel = useCallback(async () => {
    await leaveVoiceChannel();
    clearMobileVoiceRoomRouteContext();
    setActiveWorkspaceVoiceChannelId(null);
  }, [leaveVoiceChannel]);

  const handleOpenWorkspaceChannel = useCallback(
    async (channel: MobileWorkspaceChannelSummary): Promise<boolean> => {
      clearMessageSearch();
      if (selectedWorkspaceChannelId && selectedWorkspaceChannelId !== channel.id) {
        stopChannelTyping(selectedWorkspaceChannelId);
      }
      setSelectedWorkspaceChannelId(channel.id);

      if (channel.type === "VOICE") {
        resetChannelMessageMutation();
        setActiveWorkspaceTextChannelId(null);
        if (!selectedWorkspaceServerId) {
          setActiveWorkspaceVoiceChannelId(null);
          return false;
        }

        const permission = await requestMicrophonePermission();
        if (!permission.hasMicrophonePermission) {
          setActiveWorkspaceVoiceChannelId(null);
          return false;
        }

        setMobileVoiceRoomRouteContext({
          channelId: channel.id,
          channelName: channel.name,
          serverId: selectedWorkspaceServerId,
        });
        setActiveWorkspaceVoiceChannelId(null);
        void joinVoiceChannel({
          channelId: channel.id,
          channelName: channel.name,
          permission,
          serverId: selectedWorkspaceServerId,
        });
        return true;
      }

      if (channel.type !== "TEXT") {
        resetChannelMessageMutation();
        setActiveWorkspaceTextChannelId(null);
        setActiveWorkspaceVoiceChannelId(null);
        return false;
      }

      resetChannelMessageMutation();
      setActiveWorkspaceTextChannelId(channel.id);
      setActiveWorkspaceVoiceChannelId(null);
      setChannelFirstUnreadMessageId(null);
      markChannelRead(
        { channelId: channel.id },
        {
          onSuccess: (response) => {
            if (response.channelId === channel.id) {
              setChannelFirstUnreadMessageId(response.firstUnreadMessageId);
            }
          },
        },
      );
      return false;
    },
    [
      clearMessageSearch,
      joinVoiceChannel,
      markChannelRead,
      requestMicrophonePermission,
      resetChannelMessageMutation,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      stopChannelTyping,
    ],
  );

  const selectedDMConversation = useMemo(() => {
    if (!selectedDMConversationId) {
      return null;
    }

    return (
      dmConversations.find((conversation) => conversation.id === selectedDMConversationId) ?? null
    );
  }, [dmConversations, selectedDMConversationId]);

  useEffect(() => {
    if (!isSignedIn || bootstrapState.status !== "ready") {
      return;
    }

    const resolvedServerId = resolveMobileWorkspaceServerSelection(
      selectedWorkspaceServerId,
      bootstrapState.payload.home.servers.recent,
    );
    if (resolvedServerId === selectedWorkspaceServerId) {
      return;
    }

    if (selectedWorkspaceChannelId) {
      stopChannelTyping(selectedWorkspaceChannelId);
    }
    clearMessageSearch();
    resetChannelMessageMutation();
    setSelectedWorkspaceChannelId(null);
    setActiveWorkspaceTextChannelId(null);
    void leaveVoiceChannel().catch(() => undefined);
    clearMobileVoiceRoomRouteContext();
    setActiveWorkspaceVoiceChannelId(null);
    setWorkspaceRouteIntent(null);
    setSelectedWorkspaceServerId(resolvedServerId);
  }, [
    bootstrapState,
    clearMessageSearch,
    isSignedIn,
    leaveVoiceChannel,
    resetChannelMessageMutation,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    stopChannelTyping,
  ]);

  const refreshVisibleMobileData = useCallback(() => {
    if (!isSignedIn) {
      return;
    }
    void refetchBootstrap();
    void refetchDMConversations();
    if (selectedWorkspaceServerId) {
      void refetchWorkspace();
    }
    if (activeWorkspaceTextChannelId) {
      void refetchChannelMessages();
    }
  }, [
    activeWorkspaceTextChannelId,
    isSignedIn,
    refetchBootstrap,
    refetchChannelMessages,
    refetchDMConversations,
    refetchWorkspace,
    selectedWorkspaceServerId,
  ]);

  useEffect(() => {
    const targets = useMobileActiveTargetStore.getState();
    if (currentTab === "messages") {
      targets.setConversation(selectedDMConversationId);
      return;
    }
    if (selectedWorkspaceServerId && activeVoiceChannelId) {
      targets.setVoiceChannel(selectedWorkspaceServerId, activeVoiceChannelId);
      return;
    }
    if (currentTab === "overview" && selectedWorkspaceServerId && activeWorkspaceTextChannelId) {
      targets.setTextChannel(selectedWorkspaceServerId, activeWorkspaceTextChannelId);
      return;
    }
    targets.setServer(selectedWorkspaceServerId);
  }, [
    activeVoiceChannelId,
    activeWorkspaceTextChannelId,
    currentTab,
    selectedDMConversationId,
    selectedWorkspaceServerId,
  ]);

  useEffect(() => {
    if (isSignedIn) {
      return;
    }

    resetChannelMessageMutation();
    resetDMMessageMutation();
    setSelectedDMConversationId(null);
    clearMessageSearch();
    setSelectedWorkspaceServerId(null);
    setSelectedWorkspaceChannelId(null);
    setActiveWorkspaceTextChannelId(null);
    setActiveWorkspaceVoiceChannelId(null);
    clearMobileVoiceRoomRouteContext();
    setWorkspaceRouteIntent(null);
    void leaveVoiceChannel();
  }, [
    clearMessageSearch,
    isSignedIn,
    leaveVoiceChannel,
    resetChannelMessageMutation,
    resetDMMessageMutation,
  ]);

  useEffect(() => {
    if (!selectedDMConversationId || !dmConversationsQuery.data) {
      return;
    }

    const hasSelectedConversation = dmConversations.some(
      (conversation) => conversation.id === selectedDMConversationId,
    );
    if (!hasSelectedConversation) {
      clearMessageSearch();
      resetDMMessageMutation();
      setSelectedDMConversationId(null);
    }
  }, [
    clearMessageSearch,
    dmConversations,
    dmConversationsQuery.data,
    resetDMMessageMutation,
    selectedDMConversationId,
  ]);

  const handleOpenVoiceInvite = useCallback(
    ({ channelId, serverId }: { channelId: string; channelName: string; serverId: string }) => {
      setCurrentTab("overview");
      setActiveWorkspaceTextChannelId(null);
      setActiveWorkspaceVoiceChannelId(channelId);
      setSelectedWorkspaceServerId(serverId);
      setWorkspaceRouteIntent({
        channelId,
        serverId,
        shouldOpenPreferredChannel: false,
      });
    },
    [],
  );

  const handleOpenWorkspaceRoute = useCallback(
    (serverId: string, channelId: string | null) => {
      resetChannelMessageMutation();
      setSelectedWorkspaceServerId(serverId);
      // The route already names the channel, so the message stream is keyed here
      // rather than after the server detail read resolves it. That read is one of
      // the heaviest the backend serves, and the chat used to wait behind it
      // before its own fetch could even start.
      //
      // The detail effect above still reconciles: a channel the reader may not
      // open as a chat (deleted, voice, no permission) is dropped the moment the
      // detail lands.
      if (channelId) {
        setSelectedWorkspaceChannelId(channelId);
        setActiveWorkspaceTextChannelId(channelId);
        setActiveWorkspaceVoiceChannelId(null);
      }
      setWorkspaceRouteIntent({
        channelId,
        serverId,
        shouldOpenPreferredChannel: true,
      });
    },
    [resetChannelMessageMutation],
  );

  // One stable object for the container-level navigation actions: an inline
  // literal at the provider minted a new context value on every root render.
  const productNavigationActions = useMemo(
    () => ({
      openWorkspaceRoute: handleOpenWorkspaceRoute,
      prefetchChannelMessages,
      prefetchDMMessages,
    }),
    [handleOpenWorkspaceRoute, prefetchChannelMessages, prefetchDMMessages],
  );

  const getSyncHealth = useCallback(
    (tab: MobileSyncHealthDomain) =>
      getVisibleMobileSyncHealth({
        bootstrapSyncState,
        channelSyncState,
        currentTab: tab,
        dmSyncState,
        selectedDMConversationId,
        selectedWorkspaceChannelId,
        selectedWorkspaceServerId,
        workspaceSyncState,
      }),
    [
      bootstrapSyncState,
      channelSyncState,
      dmSyncState,
      selectedDMConversationId,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      workspaceSyncState,
    ],
  );

  return {
    activeWorkspaceTextChannelId,
    activeWorkspaceVoiceChannelId,
    bootstrapQuery,
    bootstrapState,
    bootstrapSyncState,
    channelFirstUnreadMessageId,
    channelMessagesQuery,
    channelMessagesState,
    channelPinnedMessages: channelPinsQuery.data?.messages ?? EMPTY_PINNED_MESSAGES,
    channelSyncState,
    clearMessageSearch,
    currentTab,
    directMessageUnreadCount,
    dmConversations,
    dmConversationsQuery,
    loadMoreDMConversations,
    loadMoreDMMessages,
    loadMoreChannelMessages,
    notificationUnreadCount,
    dmMessagesState,
    dmSyncState,
    getSyncHealth,
    handleChannelDraftChange,
    handleDeleteChannelMessage,
    handleDeleteDMMessage,
    handleDiscardChannelMessage,
    handleDiscardDMMessage,
    handleDMDraftChange,
    handleEditChannelMessage,
    handleEditDMMessage,
    handleForwardMessage,
    handlePinMessage,
    handleCloseDMConversation,
    handleCloseWorkspaceChannel,
    handleCloseWorkspaceVoiceChannel,
    handleLeaveWorkspaceVoiceChannel,
    handleOpenDMConversation,
    handleOpenVoiceInvite,
    handleOpenWorkspaceChannel,
    handleOpenWorkspaceRoute,
    handleOpenWorkspaceServer,
    handleRetryChannelMessage,
    handleRetryDMMessage,
    handleSearchMessages,
    handleSendChannelMessage,
    handleSendChannelGif,
    handleSendDMMessage,
    handleSendDMGif,
    handleToggleChannelMessageReaction,
    handleToggleDMMessageReaction,
    isChannelReactionPending,
    isChannelMessageActionPending: isChannelEditPending || isChannelDeletePending,
    isDMReactionPending,
    isDMMessageActionPending: isDMEditPending || isDMDeletePending,
    messageSearchState,
    productNavigationActions,
    refreshBootstrap,
    refreshChannelMessages,
    refreshDMMessages,
    refreshWorkspaceServer,
    refreshVisibleMobileData,
    resetChannelMessageMutation,
    resetDMMessageMutation,
    selectedDMConversation,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    setCurrentTab,
    workspaceQuery,
    workspaceServerState,
    workspaceSyncState,
  };
}
