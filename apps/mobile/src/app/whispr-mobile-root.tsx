import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { MobileWorkspaceChannelSummary } from "@wizards/types";
import { AppState, type AppStateStatus } from "react-native";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { fetchMobileBootstrap, summarizeMobileBootstrap } from "../bootstrap/mobile-bootstrap";
import { getMobileRuntimeConfig } from "../config/environment";
import { type MobileDeepLinkParseResult } from "../deep-link/mobile-deep-links";
import { useMobileDeepLinks } from "../deep-link/use-mobile-deep-links";
import {
  fetchMobileDMMessages,
  MOBILE_DM_MESSAGES_LIMIT,
  sendMobileDMMessage,
} from "../dm/mobile-dm-client";
import { mobileCopy } from "../locale/mobile-copy";
import {
  createMobileNavigationState,
  getMobileTabForRoutePath,
  mobileNavigationReducer,
  parseMobileChannelsRoutePath,
  resolveMobileRoute,
  type MobileTabId,
} from "../navigation/mobile-navigation";
import {
  createCheckingMobileNotificationRuntimeState,
  createInitialMobileNotificationRuntimeState,
} from "../notifications/mobile-notification-contract";
import { requestMobileNotificationsAfterUserAction } from "../notifications/mobile-notification-runtime";
import {
  clearMobileMediaSelectedAsset,
  createCheckingMobileMediaRuntimeState,
  createInitialMobileMediaRuntimeState,
} from "../media/mobile-media-contract";
import {
  requestMobileCameraPermissionAfterUserAction,
  requestMobileDocumentPickerAfterUserAction,
  requestMobilePhotoLibraryPermissionAfterUserAction,
} from "../media/mobile-media-runtime";
import {
  createInitialMobilePermissionReadiness,
  summarizeMobilePermissionReadiness,
} from "../permissions/mobile-permission-contract";
import {
  type MobileRealtimeEventEnvelope,
  type MobileRealtimeRefreshSource,
  type MobileRealtimeVisibility,
} from "../realtime/mobile-realtime-contract";
import {
  createMobileRealtimeClient,
  type MobileRealtimeClient,
} from "../realtime/mobile-realtime-client";
import {
  createInitialMobileRealtimeSnapshot,
  mobileRealtimeReducer,
  shouldConnectMobileRealtime,
} from "../realtime/mobile-realtime-state";
import {
  isMobileSyncRefreshing,
  markMobileSyncFailed,
  markMobileSyncStarted,
  markMobileSyncSucceeded,
  shouldRefreshOnForeground,
  type MobileSyncSnapshot,
} from "../sync/mobile-sync-contract";
import {
  MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
  MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH,
  searchMobileMessages,
  type MobileMessageSearchScope,
} from "../search/mobile-message-search-client";
import {
  fetchMobileChannelMessages,
  fetchMobileWorkspaceServer,
  MOBILE_CHANNEL_MESSAGES_LIMIT,
  sendMobileChannelMessage,
} from "../workspace/mobile-workspace-client";
import {
  createCheckingMobileVoiceRuntimeState,
  createInitialMobileVoiceRuntimeState,
} from "../voice/mobile-voice-contract";
import { requestMobileVoicePermissionAfterUserAction } from "../voice/mobile-voice-runtime";
import { findInitialMobileWorkspaceChannel } from "./mobile-display-model";
import { MobileAppShell } from "./mobile-app-shell";
import {
  INITIAL_BOOTSTRAP_STATE,
  INITIAL_BOOTSTRAP_SYNC_STATE,
  INITIAL_CHANNEL_MESSAGES_STATE,
  INITIAL_CHANNEL_SEND_STATE,
  INITIAL_CHANNEL_SYNC_STATE,
  INITIAL_DM_MESSAGES_STATE,
  INITIAL_DM_SEND_STATE,
  INITIAL_DM_SYNC_STATE,
  INITIAL_MESSAGE_SEARCH_STATE,
  INITIAL_WORKSPACE_SERVER_STATE,
  INITIAL_WORKSPACE_SYNC_STATE,
  type MobileBootstrapViewState,
  type MobileChannelMessagesViewState,
  type MobileChannelSendViewState,
  type MobileDMMessagesViewState,
  type MobileDMSendViewState,
  type MobileMessageSearchViewState,
  type MobileWorkspaceServerViewState,
} from "./mobile-screen-state";
import { ActiveScreen, AuthGate } from "./mobile-root-screens";

const copy = mobileCopy.tr;
const runtimeConfig = getMobileRuntimeConfig();

export function WhisprMobileRoot() {
  const {
    apiClient,
    completeAuthHandoff,
    diagnostics,
    error,
    getAccessToken,
    openWebRegister,
    openWebSignIn,
    registerWithPassword,
    requestPasswordReset,
    requestVerificationEmail,
    refreshSessionFromStorage,
    session,
    signInWithPassword,
    signOut,
    status,
  } = useMobileAuth();
  const [navigation, dispatchNavigation] = useReducer(mobileNavigationReducer, undefined, () =>
    createMobileNavigationState(),
  );
  const [bootstrapState, setBootstrapState] =
    useState<MobileBootstrapViewState>(INITIAL_BOOTSTRAP_STATE);
  const [bootstrapSyncState, setBootstrapSyncState] = useState<MobileSyncSnapshot>(
    INITIAL_BOOTSTRAP_SYNC_STATE,
  );
  const bootstrapRequestIdRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const realtimeClientRef = useRef<MobileRealtimeClient | null>(null);
  const realtimeTargetsRef = useRef<{
    channelId: string | null;
    conversationId: string | null;
    serverId: string | null;
  }>({
    channelId: null,
    conversationId: null,
    serverId: null,
  });
  const realtimeRefreshTimersRef = useRef<
    Partial<Record<MobileRealtimeRefreshSource, ReturnType<typeof setTimeout>>>
  >({});
  const [realtimeState, dispatchRealtime] = useReducer(
    mobileRealtimeReducer,
    undefined,
    createInitialMobileRealtimeSnapshot,
  );
  const [selectedDMConversationId, setSelectedDMConversationId] = useState<string | null>(null);
  const [dmMessagesState, setDMMessagesState] =
    useState<MobileDMMessagesViewState>(INITIAL_DM_MESSAGES_STATE);
  const [dmSyncState, setDMSyncState] = useState<MobileSyncSnapshot>(INITIAL_DM_SYNC_STATE);
  const [dmSendState, setDMSendState] = useState<MobileDMSendViewState>(INITIAL_DM_SEND_STATE);
  const dmMessagesRequestIdRef = useRef(0);
  const [selectedWorkspaceServerId, setSelectedWorkspaceServerId] = useState<string | null>(null);
  const [selectedWorkspaceChannelId, setSelectedWorkspaceChannelId] = useState<string | null>(null);
  const [workspaceServerState, setWorkspaceServerState] = useState<MobileWorkspaceServerViewState>(
    INITIAL_WORKSPACE_SERVER_STATE,
  );
  const [channelMessagesState, setChannelMessagesState] = useState<MobileChannelMessagesViewState>(
    INITIAL_CHANNEL_MESSAGES_STATE,
  );
  const [channelSendState, setChannelSendState] = useState<MobileChannelSendViewState>(
    INITIAL_CHANNEL_SEND_STATE,
  );
  const [workspaceSyncState, setWorkspaceSyncState] = useState<MobileSyncSnapshot>(
    INITIAL_WORKSPACE_SYNC_STATE,
  );
  const [channelSyncState, setChannelSyncState] = useState<MobileSyncSnapshot>(
    INITIAL_CHANNEL_SYNC_STATE,
  );
  const workspaceServerRequestIdRef = useRef(0);
  const channelMessagesRequestIdRef = useRef(0);
  const [messageSearchState, setMessageSearchState] =
    useState<MobileMessageSearchViewState>(INITIAL_MESSAGE_SEARCH_STATE);
  const messageSearchRequestIdRef = useRef(0);
  const [lastDeepLink, setLastDeepLink] = useState<MobileDeepLinkParseResult | null>(null);
  const route = resolveMobileRoute(navigation.currentTab, status);
  const [notificationState, setNotificationState] = useState(
    createInitialMobileNotificationRuntimeState,
  );
  const [voiceState, setVoiceState] = useState(createInitialMobileVoiceRuntimeState);
  const [mediaState, setMediaState] = useState(createInitialMobileMediaRuntimeState);
  const mediaStateRef = useRef(mediaState);
  const basePermissionReadiness = useMemo(() => createInitialMobilePermissionReadiness(), []);
  const permissionReadiness = useMemo(
    () =>
      basePermissionReadiness.map((item) => {
        if (item.intent.id === "notifications") {
          return { ...item, status: notificationState.permissionStatus };
        }

        if (item.intent.id === "microphone") {
          return { ...item, status: voiceState.microphoneStatus };
        }

        if (item.intent.id === "camera") {
          return { ...item, status: mediaState.cameraStatus };
        }

        if (item.intent.id === "photoLibrary") {
          return { ...item, status: mediaState.photoLibraryStatus };
        }

        return item;
      }),
    [
      basePermissionReadiness,
      mediaState.cameraStatus,
      mediaState.photoLibraryStatus,
      notificationState.permissionStatus,
      voiceState.microphoneStatus,
    ],
  );
  const permissionSummary = useMemo(
    () => summarizeMobilePermissionReadiness(permissionReadiness),
    [permissionReadiness],
  );

  useEffect(() => {
    mediaStateRef.current = mediaState;
  }, [mediaState]);

  const handleRequestNotificationPermission = useCallback(async () => {
    setNotificationState((current) => createCheckingMobileNotificationRuntimeState(current));
    const nextState = await requestMobileNotificationsAfterUserAction(apiClient);
    setNotificationState(nextState);
  }, [apiClient]);

  const handleRequestVoicePermission = useCallback(async () => {
    setVoiceState((current) => createCheckingMobileVoiceRuntimeState(current));
    const nextState = await requestMobileVoicePermissionAfterUserAction();
    setVoiceState(nextState);
  }, []);

  const handleRequestPhotoLibraryPermission = useCallback(async () => {
    setMediaState((current) => createCheckingMobileMediaRuntimeState(current, "photoLibrary"));
    const nextState = await requestMobilePhotoLibraryPermissionAfterUserAction(
      mediaStateRef.current,
    );
    setMediaState(nextState);
  }, []);

  const handleRequestCameraPermission = useCallback(async () => {
    setMediaState((current) => createCheckingMobileMediaRuntimeState(current, "camera"));
    const nextState = await requestMobileCameraPermissionAfterUserAction(mediaStateRef.current);
    setMediaState(nextState);
  }, []);

  const handleRequestDocumentPicker = useCallback(async () => {
    setMediaState((current) => createCheckingMobileMediaRuntimeState(current, "documentPicker"));
    const nextState = await requestMobileDocumentPickerAfterUserAction(mediaStateRef.current);
    setMediaState(nextState);
  }, []);

  const handleClearSelectedMediaAsset = useCallback(() => {
    setMediaState(clearMobileMediaSelectedAsset);
  }, []);

  const loadBootstrap = useCallback(async () => {
    const requestId = bootstrapRequestIdRef.current + 1;
    bootstrapRequestIdRef.current = requestId;

    if (status !== "signed-in") {
      setBootstrapState(INITIAL_BOOTSTRAP_STATE);
      setBootstrapSyncState(INITIAL_BOOTSTRAP_SYNC_STATE);
      return;
    }

    setBootstrapSyncState(markMobileSyncStarted);
    setBootstrapState((current) =>
      current.status === "ready"
        ? current
        : {
            error: null,
            payload: null,
            status: "loading",
            summary: null,
          },
    );

    try {
      const payload = await fetchMobileBootstrap(apiClient);
      if (bootstrapRequestIdRef.current !== requestId) {
        return;
      }

      setBootstrapState({
        error: null,
        payload,
        status: "ready",
        summary: summarizeMobileBootstrap(payload),
      });
      setBootstrapSyncState(markMobileSyncSucceeded);
    } catch {
      if (bootstrapRequestIdRef.current !== requestId) {
        return;
      }

      setBootstrapSyncState(markMobileSyncFailed);
      setBootstrapState({
        error: copy.bootstrapLoadFailed,
        payload: null,
        status: "error",
        summary: null,
      });
    }
  }, [apiClient, status]);

  const loadDMMessages = useCallback(
    async (conversationId: string) => {
      const requestId = dmMessagesRequestIdRef.current + 1;
      dmMessagesRequestIdRef.current = requestId;

      if (status !== "signed-in") {
        setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
        setDMSyncState(INITIAL_DM_SYNC_STATE);
        return;
      }

      setDMSyncState(markMobileSyncStarted);
      setDMMessagesState((current) => ({
        conversationId,
        error: null,
        payload:
          current.conversationId === conversationId && current.status === "ready"
            ? current.payload
            : null,
        status: "loading",
      }));

      try {
        const payload = await fetchMobileDMMessages(apiClient, { conversationId });
        if (dmMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setDMMessagesState({
          conversationId,
          error: null,
          payload,
          status: "ready",
        });
        setDMSyncState(markMobileSyncSucceeded);
      } catch {
        if (dmMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setDMSyncState(markMobileSyncFailed);
        setDMMessagesState({
          conversationId,
          error: copy.dmMessagesLoadFailed,
          payload: null,
          status: "error",
        });
      }
    },
    [apiClient, status],
  );

  const handleSendDMMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const conversationId = selectedDMConversationId;
      const trimmedContent = content.trim();

      if (status !== "signed-in" || !conversationId || trimmedContent.length === 0) {
        return false;
      }

      setDMSendState({
        conversationId,
        error: null,
        status: "sending",
      });

      try {
        const response = await sendMobileDMMessage(apiClient, {
          conversationId,
          content: trimmedContent,
        });

        setDMMessagesState((current) => {
          if (current.conversationId !== conversationId || !current.payload) {
            return current;
          }

          const hasMessage = current.payload.messages.some(
            (message) => message.id === response.message.id,
          );
          const messages = hasMessage
            ? current.payload.messages
            : [...current.payload.messages, response.message].slice(-MOBILE_DM_MESSAGES_LIMIT);

          return {
            conversationId,
            error: null,
            payload: {
              ...current.payload,
              messages,
            },
            status: "ready",
          };
        });

        setDMSendState({
          conversationId,
          error: null,
          status: "idle",
        });
        setDMSyncState(markMobileSyncSucceeded);
        void loadBootstrap();
        return true;
      } catch {
        setDMSendState({
          conversationId,
          error: copy.dmSendFailed,
          status: "error",
        });
        return false;
      }
    },
    [apiClient, loadBootstrap, selectedDMConversationId, status],
  );

  const loadChannelMessages = useCallback(
    async (channelId: string) => {
      const requestId = channelMessagesRequestIdRef.current + 1;
      channelMessagesRequestIdRef.current = requestId;

      if (status !== "signed-in") {
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        return;
      }

      setChannelSyncState(markMobileSyncStarted);
      setChannelMessagesState((current) => ({
        channelId,
        error: null,
        payload:
          current.channelId === channelId && current.status === "ready" ? current.payload : null,
        status: "loading",
      }));

      try {
        const payload = await fetchMobileChannelMessages(apiClient, { channelId });
        if (channelMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setChannelMessagesState({
          channelId,
          error: null,
          payload,
          status: "ready",
        });
        setChannelSyncState(markMobileSyncSucceeded);
      } catch {
        if (channelMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setChannelSyncState(markMobileSyncFailed);
        setChannelMessagesState({
          channelId,
          error: copy.workspaceChannelLoadFailed,
          payload: null,
          status: "error",
        });
      }
    },
    [apiClient, status],
  );

  const clearMessageSearch = useCallback(() => {
    messageSearchRequestIdRef.current += 1;
    setMessageSearchState(INITIAL_MESSAGE_SEARCH_STATE);
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
      const context = { conversationId: normalizedConversationId, scope };
      const requestId = messageSearchRequestIdRef.current + 1;
      messageSearchRequestIdRef.current = requestId;

      if (
        status !== "signed-in" ||
        normalizedConversationId.length === 0 ||
        normalizedQuery.length < MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH
      ) {
        setMessageSearchState(INITIAL_MESSAGE_SEARCH_STATE);
        return;
      }

      setMessageSearchState((current) => ({
        context,
        error: null,
        payload:
          current.context?.conversationId === context.conversationId &&
          current.context.scope === context.scope &&
          current.query === normalizedQuery &&
          (current.status === "ready" || current.status === "loading")
            ? current.payload
            : null,
        query: normalizedQuery,
        status: "loading",
      }));

      try {
        const payload = await searchMobileMessages(apiClient, {
          conversationId: normalizedConversationId,
          limit: MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
          query: normalizedQuery,
          scope,
        });

        if (messageSearchRequestIdRef.current !== requestId) {
          return;
        }

        setMessageSearchState({
          context,
          error: null,
          payload,
          query: normalizedQuery,
          status: "ready",
        });
      } catch {
        if (messageSearchRequestIdRef.current !== requestId) {
          return;
        }

        setMessageSearchState({
          context,
          error: copy.messageSearchFailed,
          payload: null,
          query: normalizedQuery,
          status: "error",
        });
      }
    },
    [apiClient, status],
  );

  const handleSendChannelMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const channelId = selectedWorkspaceChannelId;
      const trimmedContent = content.trim();

      if (status !== "signed-in" || !channelId || trimmedContent.length === 0) {
        return false;
      }

      setChannelSendState({
        channelId,
        error: null,
        status: "sending",
      });

      try {
        const response = await sendMobileChannelMessage(apiClient, {
          channelId,
          content: trimmedContent,
        });

        setChannelMessagesState((current) => {
          if (current.channelId !== channelId || !current.payload) {
            return current;
          }

          const hasMessage = current.payload.messages.some(
            (message) => message.id === response.message.id,
          );
          const messages = hasMessage
            ? current.payload.messages
            : [...current.payload.messages, response.message].slice(-MOBILE_CHANNEL_MESSAGES_LIMIT);

          return {
            channelId,
            error: null,
            payload: {
              ...current.payload,
              messages,
            },
            status: "ready",
          };
        });

        setChannelSendState({
          channelId,
          error: null,
          status: "idle",
        });
        setChannelSyncState(markMobileSyncSucceeded);
        void loadBootstrap();
        return true;
      } catch {
        setChannelSendState({
          channelId,
          error: copy.channelSendFailed,
          status: "error",
        });
        return false;
      }
    },
    [apiClient, loadBootstrap, selectedWorkspaceChannelId, status],
  );

  const loadWorkspaceServer = useCallback(
    async (serverId: string, preferredChannelId?: string | null) => {
      const requestId = workspaceServerRequestIdRef.current + 1;
      workspaceServerRequestIdRef.current = requestId;

      if (status !== "signed-in") {
        setWorkspaceServerState(INITIAL_WORKSPACE_SERVER_STATE);
        setWorkspaceSyncState(INITIAL_WORKSPACE_SYNC_STATE);
        setSelectedWorkspaceServerId(null);
        setSelectedWorkspaceChannelId(null);
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        return;
      }

      setSelectedWorkspaceServerId(serverId);
      setWorkspaceSyncState(markMobileSyncStarted);
      setWorkspaceServerState((current) => ({
        serverId,
        error: null,
        payload:
          current.serverId === serverId && current.status === "ready" ? current.payload : null,
        status: "loading",
      }));

      try {
        const payload = await fetchMobileWorkspaceServer(apiClient, { serverId });
        if (workspaceServerRequestIdRef.current !== requestId) {
          return;
        }

        setWorkspaceServerState({
          serverId,
          error: null,
          payload,
          status: "ready",
        });
        setWorkspaceSyncState(markMobileSyncSucceeded);

        const selectedChannel = findInitialMobileWorkspaceChannel(
          payload.detail,
          preferredChannelId,
        );
        setSelectedWorkspaceChannelId(selectedChannel?.id ?? null);

        if (selectedChannel?.type === "TEXT") {
          void loadChannelMessages(selectedChannel.id);
        } else {
          channelMessagesRequestIdRef.current += 1;
          setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
          setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
          setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        }
      } catch {
        if (workspaceServerRequestIdRef.current !== requestId) {
          return;
        }

        setWorkspaceSyncState(markMobileSyncFailed);
        setWorkspaceServerState({
          serverId,
          error: copy.workspaceLoadFailed,
          payload: null,
          status: "error",
        });
        setSelectedWorkspaceChannelId(null);
        channelMessagesRequestIdRef.current += 1;
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
      }
    },
    [apiClient, loadChannelMessages, status],
  );

  const handleOpenDMConversation = useCallback(
    (conversationId: string) => {
      clearMessageSearch();
      setSelectedDMConversationId(conversationId);
      setDMSendState(INITIAL_DM_SEND_STATE);
      void loadDMMessages(conversationId);
    },
    [clearMessageSearch, loadDMMessages],
  );

  const handleCloseDMConversation = useCallback(() => {
    clearMessageSearch();
    dmMessagesRequestIdRef.current += 1;
    setSelectedDMConversationId(null);
    setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
    setDMSendState(INITIAL_DM_SEND_STATE);
    setDMSyncState(INITIAL_DM_SYNC_STATE);
  }, [clearMessageSearch]);

  const handleOpenWorkspaceServer = useCallback(
    (serverId: string) => {
      clearMessageSearch();
      void loadWorkspaceServer(serverId);
    },
    [clearMessageSearch, loadWorkspaceServer],
  );

  const handleOpenWorkspaceChannel = useCallback(
    (channel: MobileWorkspaceChannelSummary) => {
      clearMessageSearch();
      setSelectedWorkspaceChannelId(channel.id);

      if (channel.type !== "TEXT") {
        channelMessagesRequestIdRef.current += 1;
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        return;
      }

      setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
      void loadChannelMessages(channel.id);
    },
    [clearMessageSearch, loadChannelMessages],
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

  const refreshVisibleMobileData = useCallback(() => {
    if (status !== "signed-in") {
      return;
    }

    void loadBootstrap();

    if (selectedDMConversationId) {
      void loadDMMessages(selectedDMConversationId);
    }

    if (selectedWorkspaceServerId) {
      void loadWorkspaceServer(selectedWorkspaceServerId, selectedWorkspaceChannelId);
      return;
    }

    if (selectedWorkspaceChannelId) {
      void loadChannelMessages(selectedWorkspaceChannelId);
    }
  }, [
    loadBootstrap,
    loadChannelMessages,
    loadDMMessages,
    loadWorkspaceServer,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    status,
  ]);

  useEffect(() => {
    realtimeTargetsRef.current = {
      channelId: selectedWorkspaceChannelId,
      conversationId: selectedDMConversationId,
      serverId: selectedWorkspaceServerId,
    };
  }, [
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
  ]);

  const scheduleRealtimeRefresh = useCallback(
    (source: MobileRealtimeRefreshSource, refresh: () => void) => {
      if (realtimeRefreshTimersRef.current[source]) {
        return;
      }

      realtimeRefreshTimersRef.current[source] = setTimeout(() => {
        delete realtimeRefreshTimersRef.current[source];
        refresh();
      }, 350);
    },
    [],
  );

  const handleRealtimeEvent = useCallback(
    (event: MobileRealtimeEventEnvelope) => {
      dispatchRealtime({ event, type: "event-received" });
      const targets = realtimeTargetsRef.current;

      for (const source of event.refreshSources) {
        if (source === "bootstrap" || source === "presence" || source === "notification") {
          scheduleRealtimeRefresh("bootstrap", () => void loadBootstrap());
          continue;
        }

        if (source === "dm") {
          const shouldRefreshDM =
            targets.conversationId &&
            (!event.conversationId || event.conversationId === targets.conversationId);

          if (shouldRefreshDM) {
            scheduleRealtimeRefresh("dm", () => {
              if (realtimeTargetsRef.current.conversationId) {
                void loadDMMessages(realtimeTargetsRef.current.conversationId);
              }
            });
          }

          scheduleRealtimeRefresh("bootstrap", () => void loadBootstrap());
          continue;
        }

        if (source === "channel") {
          const shouldRefreshChannel =
            targets.channelId &&
            (!event.channelId || event.channelId === targets.channelId);

          if (shouldRefreshChannel) {
            scheduleRealtimeRefresh("channel", () => {
              if (realtimeTargetsRef.current.channelId) {
                void loadChannelMessages(realtimeTargetsRef.current.channelId);
              }
            });
          }

          scheduleRealtimeRefresh("bootstrap", () => void loadBootstrap());
          continue;
        }

        if (source === "workspace") {
          const shouldRefreshWorkspace =
            targets.serverId && (!event.serverId || event.serverId === targets.serverId);

          if (shouldRefreshWorkspace) {
            scheduleRealtimeRefresh("workspace", () => {
              if (realtimeTargetsRef.current.serverId) {
                void loadWorkspaceServer(
                  realtimeTargetsRef.current.serverId,
                  realtimeTargetsRef.current.channelId,
                );
              }
            });
          }

          scheduleRealtimeRefresh("bootstrap", () => void loadBootstrap());
        }
      }
    },
    [
      loadBootstrap,
      loadChannelMessages,
      loadDMMessages,
      loadWorkspaceServer,
      scheduleRealtimeRefresh,
    ],
  );

  useEffect(
    () => () => {
      for (const timer of Object.values(realtimeRefreshTimersRef.current)) {
        if (timer) {
          clearTimeout(timer);
        }
      }

      realtimeRefreshTimersRef.current = {};
    },
    [],
  );

  useEffect(() => {
    const visibility: MobileRealtimeVisibility =
      appStateRef.current === "active" ? "foreground" : "background";

    if (
      !shouldConnectMobileRealtime({
        authStatus: status,
        hasSession: Boolean(session),
        visibility: realtimeState.visibility,
      })
    ) {
      realtimeClientRef.current?.disconnect();
      realtimeClientRef.current = null;

      if (status !== "signed-in") {
        dispatchRealtime({ type: "reset" });
      } else if (visibility === "background") {
        dispatchRealtime({ type: "disconnected" });
      }

      return;
    }

    const client = createMobileRealtimeClient({
      getAccessToken,
      onConnected: () => dispatchRealtime({ type: "connected" }),
      onDisconnected: () => dispatchRealtime({ type: "disconnected" }),
      onError: (code) => dispatchRealtime({ code, type: "connection-error" }),
      onEvent: handleRealtimeEvent,
      onReconnectAttempt: () => dispatchRealtime({ type: "reconnect-attempt" }),
      socketUrl: runtimeConfig.socketUrl,
    });

    realtimeClientRef.current = client;
    dispatchRealtime({ type: "connect-started" });
    void client.connect();

    return () => {
      client.disconnect();
      if (realtimeClientRef.current === client) {
        realtimeClientRef.current = null;
      }
    };
  }, [
    getAccessToken,
    handleRealtimeEvent,
    realtimeState.visibility,
    session?.user.id,
    status,
  ]);

  useEffect(() => {
    const activeTargets = {
      channelId:
        navigation.currentTab === "overview" || navigation.currentTab === "voice"
          ? selectedWorkspaceChannelId
          : null,
      conversationId:
        navigation.currentTab === "messages" ? selectedDMConversationId : null,
    };

    realtimeClientRef.current?.setActiveTargets(activeTargets);
  }, [
    navigation.currentTab,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      dispatchRealtime({
        type: "visibility-changed",
        visibility: nextState === "active" ? "foreground" : "background",
      });

      const returnedToForeground =
        nextState === "active" && (previousState === "background" || previousState === "inactive");

      if (!returnedToForeground || status !== "signed-in") {
        return;
      }

      const shouldRefresh =
        shouldRefreshOnForeground(bootstrapSyncState) ||
        (selectedDMConversationId ? shouldRefreshOnForeground(dmSyncState) : false) ||
        (selectedWorkspaceServerId ? shouldRefreshOnForeground(workspaceSyncState) : false) ||
        (selectedWorkspaceChannelId ? shouldRefreshOnForeground(channelSyncState) : false);

      if (shouldRefresh) {
        refreshVisibleMobileData();
      }
    });

    return () => subscription.remove();
  }, [
    bootstrapSyncState,
    channelSyncState,
    dmSyncState,
    refreshVisibleMobileData,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    status,
    workspaceSyncState,
  ]);

  useEffect(() => {
    if (status !== "signed-in") {
      bootstrapRequestIdRef.current += 1;
      dmMessagesRequestIdRef.current += 1;
      setBootstrapState(INITIAL_BOOTSTRAP_STATE);
      setBootstrapSyncState(INITIAL_BOOTSTRAP_SYNC_STATE);
      setSelectedDMConversationId(null);
      setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
      setDMSyncState(INITIAL_DM_SYNC_STATE);
      setDMSendState(INITIAL_DM_SEND_STATE);
      messageSearchRequestIdRef.current += 1;
      setMessageSearchState(INITIAL_MESSAGE_SEARCH_STATE);
      workspaceServerRequestIdRef.current += 1;
      channelMessagesRequestIdRef.current += 1;
      setSelectedWorkspaceServerId(null);
      setSelectedWorkspaceChannelId(null);
      setWorkspaceServerState(INITIAL_WORKSPACE_SERVER_STATE);
      setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
      setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
      setWorkspaceSyncState(INITIAL_WORKSPACE_SYNC_STATE);
      setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
      return;
    }

    void loadBootstrap();
  }, [loadBootstrap, status]);

  useEffect(() => {
    if (bootstrapState.status !== "ready" || !selectedDMConversationId) {
      return;
    }

    const hasSelectedConversation = bootstrapState.payload.home.directMessages.recent.some(
      (conversation) => conversation.id === selectedDMConversationId,
    );

    if (!hasSelectedConversation) {
      clearMessageSearch();
      dmMessagesRequestIdRef.current += 1;
      setSelectedDMConversationId(null);
      setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
      setDMSendState(INITIAL_DM_SEND_STATE);
    }
  }, [bootstrapState, clearMessageSearch, selectedDMConversationId]);

  const handleDeepLink = useCallback(
    (result: MobileDeepLinkParseResult) => {
      setLastDeepLink(result);

      if (!result.ok) {
        return;
      }

      if (result.intent.type === "auth-handoff") {
        const callbackPath = result.intent.callbackPath;
        void completeAuthHandoff({
          callbackPath,
          handoffToken: result.intent.token,
        }).then((completed) => {
          if (!completed) {
            dispatchNavigation({ tab: "settings", type: "select" });
            return;
          }

          const target = parseMobileChannelsRoutePath(callbackPath);
          dispatchNavigation({
            tab: getMobileTabForRoutePath(callbackPath),
            type: "select",
          });

          if (target?.serverId && target.serverId !== "@me") {
            void loadWorkspaceServer(target.serverId, target.channelId);
          }
        });
        return;
      }

      if (result.intent.type === "invite") {
        dispatchNavigation({ tab: "overview", type: "select" });
        return;
      }

      if (result.intent.path.startsWith("/channels")) {
        const target = parseMobileChannelsRoutePath(result.intent.path);
        if (target?.serverId && target.serverId !== "@me") {
          dispatchNavigation({ tab: "overview", type: "select" });
          void loadWorkspaceServer(target.serverId, target.channelId);
          return;
        }

        dispatchNavigation({ tab: "messages", type: "select" });
        return;
      }

      if (result.intent.type === "route" && result.intent.path.startsWith("/settings")) {
        dispatchNavigation({ tab: "settings", type: "select" });
      }
    },
    [completeAuthHandoff, loadWorkspaceServer],
  );

  useMobileDeepLinks({
    onDeepLink: handleDeepLink,
    runtimeConfig,
  });

  const authStatusLabel =
    status === "checking"
      ? copy.authChecking
      : status === "signed-in"
        ? copy.authSignedIn
        : copy.authSignedOut;

  const signedInUserLabel = useMemo(() => {
    if (!session) {
      return null;
    }

    return session.user.displayName ?? session.user.username;
  }, [session]);

  const mobileShellUnreadCount =
    bootstrapState.status === "ready" ? bootstrapState.payload.home.directMessages.unreadCount : 0;

  const isShellRefreshing =
    status === "checking" ||
    isMobileSyncRefreshing(bootstrapSyncState) ||
    (navigation.currentTab === "messages" && isMobileSyncRefreshing(dmSyncState)) ||
    (navigation.currentTab === "overview" &&
      (isMobileSyncRefreshing(workspaceSyncState) || isMobileSyncRefreshing(channelSyncState))) ||
    (navigation.currentTab === "voice" && isMobileSyncRefreshing(workspaceSyncState));

  const handleShellRefresh = useCallback(() => {
    if (route.isBlocked) {
      void refreshSessionFromStorage();
      return;
    }

    refreshVisibleMobileData();
  }, [refreshSessionFromStorage, refreshVisibleMobileData, route.isBlocked]);

  return (
    <MobileAppShell
      authStatus={status}
      currentTab={navigation.currentTab}
      directMessageUnreadCount={mobileShellUnreadCount}
      isRefreshing={isShellRefreshing}
      onRefresh={handleShellRefresh}
      onSelectTab={(tab) => dispatchNavigation({ tab, type: "select" })}
      signedInUserLabel={signedInUserLabel}
    >
      {route.isBlocked ? (
        <AuthGate
          reason={route.blockedReason}
          onOpenWebRegister={() => void openWebRegister()}
          onOpenWebSignIn={() => void openWebSignIn()}
          onRegisterWithPassword={registerWithPassword}
          onRefresh={() => void refreshSessionFromStorage()}
          onRequestPasswordReset={requestPasswordReset}
          onRequestVerificationEmail={requestVerificationEmail}
          onSignInWithPassword={signInWithPassword}
        />
      ) : (
        <ActiveScreen
          currentTab={route.currentTab}
          bootstrapState={bootstrapState}
          bootstrapSyncState={bootstrapSyncState}
          channelSyncState={channelSyncState}
          dmMessagesState={dmMessagesState}
          dmSendState={dmSendState}
          dmSyncState={dmSyncState}
          diagnostics={diagnostics}
          lastDeepLink={lastDeepLink}
          mediaState={mediaState}
          messageSearchState={messageSearchState}
          notificationState={notificationState}
          voiceState={voiceState}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          error={error}
          authStatusLabel={authStatusLabel}
          channelMessagesState={channelMessagesState}
          channelSendState={channelSendState}
          onOpenWebRegister={() => void openWebRegister()}
          signedInUserLabel={signedInUserLabel}
          onOpenWebSignIn={() => void openWebSignIn()}
          onCloseDMConversation={handleCloseDMConversation}
          onOpenDMConversation={handleOpenDMConversation}
          onOpenWorkspaceChannel={handleOpenWorkspaceChannel}
          onOpenWorkspaceServer={handleOpenWorkspaceServer}
          onClearSelectedMediaAsset={handleClearSelectedMediaAsset}
          onClearMessageSearch={clearMessageSearch}
          onRequestCameraPermission={handleRequestCameraPermission}
          onRequestDocumentPicker={handleRequestDocumentPicker}
          onRequestPhotoLibraryPermission={handleRequestPhotoLibraryPermission}
          onRequestNotificationPermission={handleRequestNotificationPermission}
          onRequestVoicePermission={handleRequestVoicePermission}
          onRefreshBootstrap={() => void loadBootstrap()}
          onRefreshChannelMessages={() => {
            if (selectedWorkspaceChannelId) {
              void loadChannelMessages(selectedWorkspaceChannelId);
            }
          }}
          onRefreshDMConversation={() => {
            if (selectedDMConversationId) {
              void loadDMMessages(selectedDMConversationId);
            }
          }}
          onRefreshWorkspaceServer={() => {
            if (selectedWorkspaceServerId) {
              void loadWorkspaceServer(selectedWorkspaceServerId, selectedWorkspaceChannelId);
            }
          }}
          onRefresh={() => void refreshSessionFromStorage()}
          onRefreshVisibleData={refreshVisibleMobileData}
          onSelectTab={(tab) => dispatchNavigation({ tab, type: "select" })}
          onSendChannelMessage={handleSendChannelMessage}
          onSendDMMessage={handleSendDMMessage}
          onSearchMessages={handleSearchMessages}
          onSignOut={() => void signOut()}
          selectedDMConversation={selectedDMConversation}
          selectedDMConversationId={selectedDMConversationId}
          selectedWorkspaceChannelId={selectedWorkspaceChannelId}
          selectedWorkspaceServerId={selectedWorkspaceServerId}
          status={status}
          workspaceServerState={workspaceServerState}
          workspaceSyncState={workspaceSyncState}
        />
      )}
    </MobileAppShell>
  );
}
