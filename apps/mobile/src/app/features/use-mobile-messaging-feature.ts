import { useCallback, useEffect, useMemo, useState } from "react";
import type { MobileWorkspaceChannelSummary } from "@wizards/types";
import type { MobileApiClient } from "../../api/mobile-api-client";
import type { MobileSessionUser } from "../../auth/session-types";
import { summarizeMobileBootstrap } from "../../bootstrap/mobile-bootstrap";
import type { MobileTabId } from "../../navigation/mobile-navigation";
import { useMobileBootstrapQuery } from "../../query/mobile-bootstrap-query";
import {
  useMobileChannelMessagesQuery,
  useMobileDMMessagesQuery,
} from "../../query/mobile-message-queries";
import { useMobileMessageSearchQuery } from "../../query/mobile-message-search-query";
import {
  useMobileChannelMessageMutation,
  useMobileDMMessageMutation,
} from "../../query/use-mobile-message-mutations";
import { useMobileWorkspaceQuery } from "../../query/mobile-workspace-query";
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
import type { MobileChannelSendViewState, MobileDMSendViewState } from "../mobile-screen-state";
import { getVisibleMobileSyncHealth } from "../mobile-screen-sync";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";

const copy = activeMobileCopy;

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
  stopChannelTyping,
  updateChannelTyping,
}: {
  readonly activeVoiceChannelId: string | null;
  readonly apiClient: MobileApiClient;
  readonly currentUser: MobileSessionUser | null;
  readonly isSignedIn: boolean;
  readonly joinVoiceChannel: (input: {
    channelId: string;
    channelName: string;
    serverId: string;
  }) => Promise<boolean>;
  readonly leaveVoiceChannel: () => Promise<void>;
  readonly stopChannelTyping: (channelId: string) => void;
  readonly updateChannelTyping: (channelId: string, content: string) => void;
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
  const workspaceQuery = useMobileWorkspaceQuery(apiClient, selectedWorkspaceServerId ?? "");
  const channelMessagesQuery = useMobileChannelMessagesQuery(
    apiClient,
    activeWorkspaceTextChannelId ?? "",
  );
  const dmMessagesQuery = useMobileDMMessagesQuery(apiClient, selectedDMConversationId ?? "");
  const messageSearchQuery = useMobileMessageSearchQuery(apiClient, messageSearchInput);
  const channelMessageMutation = useMobileChannelMessageMutation({
    author: currentUser,
    channelId: activeWorkspaceTextChannelId ?? "",
    client: apiClient,
  });
  const dmMessageMutation = useMobileDMMessageMutation({
    author: currentUser
      ? {
          ...currentUser,
          customStatus: null,
          status: "OFFLINE" as const,
        }
      : null,
    client: apiClient,
    conversationId: selectedDMConversationId ?? "",
  });
  const {
    isError: isChannelSendError,
    isPending: isChannelSending,
    mutateAsync: sendChannelMessage,
    reset: resetChannelMessageMutation,
  } = channelMessageMutation;
  const {
    isError: isDMSendError,
    isPending: isDMSending,
    mutateAsync: sendDMMessage,
    reset: resetDMMessageMutation,
  } = dmMessageMutation;
  const bootstrapState = toMobileBootstrapViewState(
    bootstrapQuery,
    summarizeMobileBootstrap,
    copy.bootstrapLoadFailed,
  );
  const workspaceServerState = toMobileWorkspaceViewState(
    workspaceQuery,
    selectedWorkspaceServerId,
    copy.workspaceLoadFailed,
  );
  const channelMessagesState = toMobileChannelMessagesViewState(
    channelMessagesQuery,
    activeWorkspaceTextChannelId,
    copy.workspaceChannelLoadFailed,
  );
  const dmMessagesState = toMobileDMMessagesViewState(
    dmMessagesQuery,
    selectedDMConversationId,
    copy.dmMessagesLoadFailed,
  );
  const messageSearchState = toMobileMessageSearchViewState(
    messageSearchQuery,
    messageSearchInput,
    copy.messageSearchFailed,
  );
  const channelSendState: MobileChannelSendViewState = {
    channelId: activeWorkspaceTextChannelId,
    error: isChannelSendError ? copy.channelSendFailed : null,
    status: isChannelSending ? "sending" : isChannelSendError ? "error" : "idle",
  };
  const dmSendState: MobileDMSendViewState = {
    conversationId: selectedDMConversationId,
    error: isDMSendError ? copy.dmSendFailed : null,
    status: isDMSending ? "sending" : isDMSendError ? "error" : "idle",
  };

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
    async (content: string): Promise<boolean> => {
      const trimmedContent = content.trim();

      if (!isSignedIn || !selectedDMConversationId || trimmedContent.length === 0) {
        return false;
      }

      try {
        await sendDMMessage({ content: trimmedContent });
        return true;
      } catch {
        return false;
      }
    },
    [isSignedIn, selectedDMConversationId, sendDMMessage],
  );

  const handleSendChannelMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmedContent = content.trim();

      if (!isSignedIn || !activeWorkspaceTextChannelId || trimmedContent.length === 0) {
        return false;
      }

      stopChannelTyping(activeWorkspaceTextChannelId);

      try {
        await sendChannelMessage({ content: trimmedContent });
        return true;
      } catch {
        return false;
      }
    },
    [activeWorkspaceTextChannelId, isSignedIn, sendChannelMessage, stopChannelTyping],
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

  const handleOpenDMConversation = useCallback(
    (conversationId: string) => {
      clearMessageSearch();
      resetDMMessageMutation();
      setSelectedDMConversationId(conversationId);
    },
    [clearMessageSearch, resetDMMessageMutation],
  );

  const handleCloseDMConversation = useCallback(() => {
    clearMessageSearch();
    resetDMMessageMutation();
    setSelectedDMConversationId(null);
  }, [clearMessageSearch, resetDMMessageMutation]);

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
    setActiveWorkspaceVoiceChannelId(null);
  }, [clearMessageSearch]);

  const handleLeaveWorkspaceVoiceChannel = useCallback(async () => {
    await leaveVoiceChannel();
    setActiveWorkspaceVoiceChannelId(null);
  }, [leaveVoiceChannel]);

  const handleOpenWorkspaceChannel = useCallback(
    (channel: MobileWorkspaceChannelSummary) => {
      clearMessageSearch();
      if (selectedWorkspaceChannelId && selectedWorkspaceChannelId !== channel.id) {
        stopChannelTyping(selectedWorkspaceChannelId);
      }
      setSelectedWorkspaceChannelId(channel.id);

      if (channel.type === "VOICE") {
        resetChannelMessageMutation();
        setActiveWorkspaceTextChannelId(null);
        setActiveWorkspaceVoiceChannelId(channel.id);
        if (selectedWorkspaceServerId) {
          void joinVoiceChannel({
            channelId: channel.id,
            channelName: channel.name,
            serverId: selectedWorkspaceServerId,
          });
        }
        return;
      }

      if (channel.type !== "TEXT") {
        resetChannelMessageMutation();
        setActiveWorkspaceTextChannelId(null);
        setActiveWorkspaceVoiceChannelId(null);
        return;
      }

      resetChannelMessageMutation();
      setActiveWorkspaceTextChannelId(channel.id);
      setActiveWorkspaceVoiceChannelId(null);
    },
    [
      clearMessageSearch,
      joinVoiceChannel,
      resetChannelMessageMutation,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      stopChannelTyping,
    ],
  );

  const selectedDMConversation = useMemo(() => {
    if (bootstrapState.status !== "ready" || !selectedDMConversationId) {
      return null;
    }

    return (
      bootstrapState.payload.home.directMessages.recent.find(
        (conversation) => conversation.id === selectedDMConversationId,
      ) ?? null
    );
  }, [bootstrapState, selectedDMConversationId]);

  useEffect(() => {
    if (
      !isSignedIn ||
      currentTab !== "overview" ||
      bootstrapState.status !== "ready" ||
      selectedWorkspaceServerId ||
      workspaceServerState.status === "loading"
    ) {
      return;
    }

    const firstServer = bootstrapState.payload.home.servers.recent[0] ?? null;
    if (firstServer) {
      handleOpenWorkspaceServer(firstServer.id);
    }
  }, [
    bootstrapState,
    currentTab,
    handleOpenWorkspaceServer,
    isSignedIn,
    selectedWorkspaceServerId,
    workspaceServerState.status,
  ]);

  const refreshVisibleMobileData = useCallback(() => {
    if (!isSignedIn) {
      return;
    }
    void bootstrapQuery.refetch();
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
    if (currentTab === "voice" && selectedWorkspaceServerId && activeVoiceChannelId) {
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
    if (bootstrapState.status !== "ready" || !selectedDMConversationId) {
      return;
    }

    const hasSelectedConversation = bootstrapState.payload.home.directMessages.recent.some(
      (conversation) => conversation.id === selectedDMConversationId,
    );
    if (!hasSelectedConversation) {
      clearMessageSearch();
      resetDMMessageMutation();
      setSelectedDMConversationId(null);
    }
  }, [bootstrapState, clearMessageSearch, resetDMMessageMutation, selectedDMConversationId]);

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
    (tab: MobileTabId) =>
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
    channelMessagesQuery,
    channelMessagesState,
    channelSendState,
    channelSyncState: toMobileSyncSnapshot(channelMessagesQuery, "channel"),
    clearMessageSearch,
    currentTab,
    dmMessagesQuery,
    dmMessagesState,
    dmSendState,
    dmSyncState: toMobileSyncSnapshot(dmMessagesQuery, "dm"),
    getSyncHealth,
    handleChannelDraftChange,
    handleCloseDMConversation,
    handleCloseWorkspaceChannel,
    handleCloseWorkspaceVoiceChannel,
    handleLeaveWorkspaceVoiceChannel,
    handleOpenDMConversation,
    handleOpenVoiceInvite,
    handleOpenWorkspaceChannel,
    handleOpenWorkspaceRoute,
    handleOpenWorkspaceServer,
    handleSearchMessages,
    handleSendChannelMessage,
    handleSendDMMessage,
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
