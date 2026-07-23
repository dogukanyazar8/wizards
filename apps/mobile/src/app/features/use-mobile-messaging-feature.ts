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
  useMobileDMMessagesQuery,
} from "../../query/mobile-message-queries";
import {
  getMobileChannelFailedSendScope,
  getMobileDMFailedSendScope,
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
  useMobileDMReadMutation,
  useMobileMessageForwardMutation,
  type MobileMessageReactionMutationVariables,
  type MobileMessageEditMutationVariables,
} from "../../query/use-mobile-message-mutations";
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
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import { createMobileGiphyAttachment } from "../../media/mobile-giphy-client";
import { getMobileDMReadTarget } from "../../dm/mobile-dm-client";
import type { MobileForwardSendInput } from "../components/message-forward-sheet";
import { resolveMobileWorkspaceServerSelection } from "../../workspace/mobile-workspace-selection";

const copy = activeMobileCopy;
const EMPTY_PINNED_MESSAGES: readonly never[] = [];

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

export function useMobileDMReadEffect({
  conversationId,
  isSignedIn,
  latestMessageId,
  markRead,
}: {
  readonly conversationId: string | null;
  readonly isSignedIn: boolean;
  readonly latestMessageId: string | null;
  readonly markRead: (input: { readonly conversationId: string }) => void;
}) {
  const readConversationId = getMobileDMReadTarget({
    conversationId,
    isSignedIn,
    latestMessageId,
  });

  useEffect(() => {
    if (!readConversationId) return;
    markRead({ conversationId: readConversationId });
  }, [latestMessageId, markRead, readConversationId]);
}

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
  const bootstrapQuery = useMobileBootstrapQuery(apiClient, isSignedIn);
  const dmConversationsQuery = useMobileDMConversationsQuery(apiClient, isSignedIn);
  const workspaceQuery = useMobileWorkspaceQuery(apiClient, selectedWorkspaceServerId ?? "");
  const channelMessagesQuery = useMobileChannelMessagesQuery(
    apiClient,
    activeWorkspaceTextChannelId ?? "",
  );
  const dmMessagesQuery = useMobileDMMessagesQuery(apiClient, selectedDMConversationId ?? "");
  const messageSearchQuery = useMobileMessageSearchQuery(apiClient, messageSearchInput);
  const queryClient = useMobileQueryClient();
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
  const dmReadMutation = useMobileDMReadMutation({ client: apiClient });
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
  const { mutate: markDMRead } = dmReadMutation;
  const bootstrapState = toMobileBootstrapViewState(
    bootstrapQuery,
    summarizeMobileBootstrap,
    copy.bootstrapLoadFailed,
  );
  const dmConversations = useMemo(
    () => flattenMobileDMConversationPages(dmConversationsQuery.data),
    [dmConversationsQuery.data],
  );
  const directMessageUnreadCount = getMobileDMUnreadCount(dmConversationsQuery.data);
  const workspaceServerState = toMobileWorkspaceViewState(
    workspaceQuery,
    selectedWorkspaceServerId,
    copy.workspaceLoadFailed,
  );
  const channelFailedScope = getMobileChannelFailedSendScope(activeWorkspaceTextChannelId ?? "");
  const dmFailedScope = getMobileDMFailedSendScope(selectedDMConversationId ?? "");
  const channelFailedSends = useSyncExternalStore(mobileFailedSendRegistry.subscribe, () =>
    mobileFailedSendRegistry.getEntries(channelFailedScope),
  );
  const dmFailedSends = useSyncExternalStore(mobileFailedSendRegistry.subscribe, () =>
    mobileFailedSendRegistry.getEntries(dmFailedScope),
  );
  // Failed sends only live in the registry, so re-attach them after a refetch
  // drops the optimistic rows. Channel scopes always hold ChatMessage entries
  // and DM scopes always hold DMMessagePayload entries.
  const channelMessagesState = useMemo(
    () =>
      withMobileFailedSendOverlay(
        toMobileChannelMessagesViewState(
          channelMessagesQuery,
          activeWorkspaceTextChannelId,
          copy.workspaceChannelLoadFailed,
        ),
        channelFailedSends,
      ),
    [activeWorkspaceTextChannelId, channelFailedSends, channelMessagesQuery],
  );
  const dmMessagesState = useMemo(
    () =>
      withMobileFailedSendOverlay(
        toMobileDMMessagesViewState(
          dmMessagesQuery,
          selectedDMConversationId,
          copy.dmMessagesLoadFailed,
        ),
        dmFailedSends,
      ),
    [dmFailedSends, dmMessagesQuery, selectedDMConversationId],
  );
  const messageSearchState = toMobileMessageSearchViewState(
    messageSearchQuery,
    messageSearchInput,
    copy.messageSearchFailed,
  );
  const latestDMMessageId = dmMessagesState.payload?.messages.at(-1)?.id ?? null;
  useMobileDMReadEffect({
    conversationId: selectedDMConversationId,
    isSignedIn,
    latestMessageId: latestDMMessageId,
    markRead: markDMRead,
  });

  useEffect(() => {
    setActiveWorkspaceTextChannelId((channelId) =>
      resolveMobileTabActiveTextChannelId(currentTab, channelId),
    );
    if (currentTab !== "overview") {
      setWorkspaceRouteIntent(null);
    }
  }, [currentTab]);

  useEffect(() => {
    const payload = workspaceQuery.data;
    const serverId = selectedWorkspaceServerId;
    if (!payload || !serverId) {
      return;
    }

    const preferredChannelId =
      workspaceRouteIntent?.serverId === serverId ? workspaceRouteIntent.channelId : null;
    const shouldOpenPreferredChannel =
      workspaceRouteIntent?.serverId === serverId &&
      workspaceRouteIntent.shouldOpenPreferredChannel;
    const selectedChannel = findInitialMobileWorkspaceChannel(payload.detail, preferredChannelId);
    setSelectedWorkspaceChannelId(selectedChannel?.id ?? null);
    setActiveWorkspaceTextChannelId((currentChannelId) =>
      resolveMobileWorkspaceActiveTextChannelId(payload.detail, {
        currentChannelId,
        preferredChannelId,
        shouldOpenPreferredChannel,
      }),
    );
    if (shouldOpenPreferredChannel) {
      setActiveWorkspaceVoiceChannelId(null);
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
        void messageSearchQuery.refetch();
      } else {
        setMessageSearchInput(nextInput);
      }
    },
    [clearMessageSearch, isSignedIn, messageSearchInput, messageSearchQuery],
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

  const refreshBootstrap = useCallback(() => {
    void bootstrapQuery.refetch();
  }, [bootstrapQuery]);

  const refreshDMMessages = useCallback(() => {
    if (selectedDMConversationId) {
      void dmMessagesQuery.refetch();
    }
  }, [dmMessagesQuery, selectedDMConversationId]);

  const refreshChannelMessages = useCallback(() => {
    if (activeWorkspaceTextChannelId) {
      void channelMessagesQuery.refetch();
    }
  }, [activeWorkspaceTextChannelId, channelMessagesQuery]);

  const refreshWorkspaceServer = useCallback(() => {
    if (selectedWorkspaceServerId) {
      void workspaceQuery.refetch();
    }
  }, [selectedWorkspaceServerId, workspaceQuery]);

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

  const handleCloseDMConversation = useCallback(() => {
    if (selectedDMConversationId) {
      stopDMTyping(selectedDMConversationId);
    }
    clearMessageSearch();
    resetDMMessageMutation();
    setSelectedDMConversationId(null);
  }, [clearMessageSearch, resetDMMessageMutation, selectedDMConversationId, stopDMTyping]);

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
    void bootstrapQuery.refetch();
    void dmConversationsQuery.refetch();
    if (selectedDMConversationId) {
      void dmMessagesQuery.refetch();
    }
    if (selectedWorkspaceServerId) {
      void workspaceQuery.refetch();
    }
    if (activeWorkspaceTextChannelId) {
      void channelMessagesQuery.refetch();
    }
  }, [
    activeWorkspaceTextChannelId,
    bootstrapQuery,
    channelMessagesQuery,
    dmMessagesQuery,
    dmConversationsQuery,
    isSignedIn,
    selectedDMConversationId,
    selectedWorkspaceServerId,
    workspaceQuery,
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
      setWorkspaceRouteIntent({
        channelId,
        serverId,
        shouldOpenPreferredChannel: true,
      });
    },
    [resetChannelMessageMutation],
  );

  const getSyncHealth = useCallback(
    (tab: MobileSyncHealthDomain) =>
      getVisibleMobileSyncHealth({
        bootstrapSyncState: toMobileSyncSnapshot(bootstrapQuery, "bootstrap"),
        channelSyncState: toMobileSyncSnapshot(channelMessagesQuery, "channel"),
        currentTab: tab,
        dmSyncState: toMobileSyncSnapshot(dmMessagesQuery, "dm"),
        selectedDMConversationId,
        selectedWorkspaceChannelId,
        selectedWorkspaceServerId,
        workspaceSyncState: toMobileSyncSnapshot(workspaceQuery, "workspace"),
      }),
    [
      bootstrapQuery,
      channelMessagesQuery,
      dmMessagesQuery,
      selectedDMConversationId,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      workspaceQuery,
    ],
  );

  return {
    activeWorkspaceTextChannelId,
    activeWorkspaceVoiceChannelId,
    bootstrapQuery,
    bootstrapState,
    bootstrapSyncState: toMobileSyncSnapshot(bootstrapQuery, "bootstrap"),
    channelFirstUnreadMessageId,
    channelMessagesQuery,
    channelMessagesState,
    channelPinnedMessages: channelPinsQuery.data?.messages ?? EMPTY_PINNED_MESSAGES,
    channelSyncState: toMobileSyncSnapshot(channelMessagesQuery, "channel"),
    clearMessageSearch,
    currentTab,
    directMessageUnreadCount,
    dmConversations,
    dmConversationsQuery,
    dmMessagesQuery,
    loadMoreDMConversations: () => {
      loadMoreMobileInfinitePages(dmConversationsQuery);
    },
    loadMoreDMMessages: () => {
      loadMoreMobileInfinitePages(dmMessagesQuery);
    },
    loadMoreChannelMessages: () => {
      loadMoreMobileInfinitePages(channelMessagesQuery);
    },
    dmMessagesState,
    dmSyncState: toMobileSyncSnapshot(dmMessagesQuery, "dm"),
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
    workspaceSyncState: toMobileSyncSnapshot(workspaceQuery, "workspace"),
  };
}
