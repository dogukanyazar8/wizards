import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { MobileVoiceStateParticipant, MobileWorkspaceChannelSummary } from "@wizards/types";
import { AppState, Linking, type AppStateStatus } from "react-native";
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
import { mobileLocalePreferenceRepository } from "../locale/expo-mobile-locale-preferences";
import {
  DEFAULT_MOBILE_LOCALE,
  activeMobileCopy,
  setActiveMobileLocale,
  type MobileLocale,
} from "../locale/mobile-locale-preferences";
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
import { installMobileFontDefaults, useOutfitFonts } from "../design/mobile-fonts";
import {
  requestMobileCameraPermissionAfterUserAction,
  requestMobileDocumentPickerAfterUserAction,
  requestMobilePhotoLibraryPickerAfterUserAction,
  requestMobilePhotoLibraryPermissionAfterUserAction,
} from "../media/mobile-media-runtime";
import {
  createInitialMobilePermissionReadiness,
  summarizeMobilePermissionReadiness,
} from "../permissions/mobile-permission-contract";
import {
  getMobileRealtimeRefreshTimerSource,
  MOBILE_REALTIME_REFRESH_DEBOUNCE_MS,
  type MobileRealtimeEventEnvelope,
  type MobileRealtimeRefreshSource,
  type MobileRealtimeRefreshTimerSource,
  type MobileRealtimeVisibility,
} from "../realtime/mobile-realtime-contract";
import {
  createMobileRealtimeClient,
  type MobileRealtimeClient,
} from "../realtime/mobile-realtime-client";
import {
  createInitialMobileRealtimeSnapshot,
  getMobileRealtimeForegroundBackfillSources,
  getMobileRealtimeVisibilityFromAppState,
  mobileRealtimeReducer,
  shouldConnectMobileRealtime,
} from "../realtime/mobile-realtime-state";
import {
  createInitialMobileChannelTypingState,
  getVisibleMobileChannelTypingUsers,
  replaceMobileChannelTypingUsers,
  formatMobileChannelTypingLabel,
  pruneMobileChannelTypingState,
  type MobileChannelTypingState,
} from "../realtime/mobile-typing-state";
import {
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
import { applyMobileRealtimeChannelMessageEvent } from "../workspace/mobile-channel-message-state";
import { useMobileVoiceRoom } from "../voice/use-mobile-voice-room";
import { mobileVoicePreferenceRepository } from "../voice/expo-mobile-voice-preferences";
import {
  DEFAULT_MOBILE_VOICE_INPUT_MODE,
  sanitizeMobileVoiceInputMode,
  type MobileVoiceInputMode,
} from "../voice/mobile-voice-ptt-contract";
import {
  getMobileVoiceInviteErrorPayload,
  getMobileVoiceInviteReceivedPayload,
  getMobileVoiceInviteSendResultPayload,
  getMobileVoiceInviteStatusPayload,
  type MobileVoiceInviteReceived,
  type MobileVoiceInviteSendState,
} from "../voice/mobile-voice-room-contract";
import {
  findInitialMobileWorkspaceChannel,
  getMobileWorkspaceChannels,
} from "./mobile-display-model";
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

const copy = activeMobileCopy;
const runtimeConfig = getMobileRuntimeConfig();
const MOBILE_CHANNEL_TYPING_STOP_DELAY_MS = 3_000;
const MOBILE_CHANNEL_TYPING_START_THROTTLE_MS = 1_500;
const MOBILE_VOICE_INVITE_LIMIT = 3;

function getMobileVoiceStateUpdatePayload(payload: unknown): {
  channelId: string;
  participants: MobileVoiceStateParticipant[];
  serverId: string;
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.channelId !== "string" ||
    typeof record.serverId !== "string" ||
    !Array.isArray(record.participants)
  ) {
    return null;
  }

  const participants = record.participants
    .filter((participant): participant is Record<string, unknown> => {
      return Boolean(participant) && typeof participant === "object" && !Array.isArray(participant);
    })
    .flatMap((participant) => {
      if (typeof participant.userId !== "string" || typeof participant.username !== "string") {
        return [];
      }

      return [
        {
          avatarUrl: typeof participant.avatarUrl === "string" ? participant.avatarUrl : null,
          displayName: typeof participant.displayName === "string" ? participant.displayName : null,
          isScreenSharing: participant.isScreenSharing === true,
          userId: participant.userId,
          username: participant.username,
        },
      ];
    });

  return {
    channelId: record.channelId,
    participants,
    serverId: record.serverId,
  };
}

type MobileVoiceInviteEntry = MobileVoiceInviteReceived & {
  readonly errorMessage: string | null;
  readonly isAccepting: boolean;
};

function getMobileChannelTypingUpdatePayload(payload: unknown): {
  channelId: string;
  users: string[];
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.channelId !== "string" || !Array.isArray(record.users)) {
    return null;
  }

  const users = record.users.filter((user): user is string => typeof user === "string");
  return {
    channelId: record.channelId,
    users,
  };
}

function getMobileVoiceAudioLevelUpdatePayload(payload: unknown): {
  audioLevel: number;
  channelId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.audioLevel !== "number" ||
    typeof record.channelId !== "string" ||
    typeof record.isMuted !== "boolean" ||
    typeof record.isSpeaking !== "boolean" ||
    typeof record.userId !== "string"
  ) {
    return null;
  }

  return {
    audioLevel: record.audioLevel,
    channelId: record.channelId,
    isMuted: record.isMuted,
    isSpeaking: record.isSpeaking,
    userId: record.userId,
  };
}

export function WhisprMobileRoot() {
  const [fontsLoaded] = useOutfitFonts();
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
  const [mobileLocale, setMobileLocale] = useState<MobileLocale>(DEFAULT_MOBILE_LOCALE);
  const [voiceInputMode, setVoiceInputMode] = useState<MobileVoiceInputMode>(
    DEFAULT_MOBILE_VOICE_INPUT_MODE,
  );
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
    voiceChannelId: string | null;
  }>({
    channelId: null,
    conversationId: null,
    serverId: null,
    voiceChannelId: null,
  });
  const realtimeRefreshTimersRef = useRef<
    Partial<Record<MobileRealtimeRefreshTimerSource, ReturnType<typeof setTimeout>>>
  >({});
  const channelTypingStopTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const channelTypingLastStartAtRef = useRef<Record<string, number>>({});
  const channelTypingPruneTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [realtimeState, dispatchRealtime] = useReducer(
    mobileRealtimeReducer,
    undefined,
    createInitialMobileRealtimeSnapshot,
  );
  const realtimeStateRef = useRef(realtimeState);
  const [channelTypingState, setChannelTypingState] = useState<MobileChannelTypingState>(
    createInitialMobileChannelTypingState,
  );
  const [selectedDMConversationId, setSelectedDMConversationId] = useState<string | null>(null);
  const [dmMessagesState, setDMMessagesState] =
    useState<MobileDMMessagesViewState>(INITIAL_DM_MESSAGES_STATE);
  const [dmSyncState, setDMSyncState] = useState<MobileSyncSnapshot>(INITIAL_DM_SYNC_STATE);
  const [dmSendState, setDMSendState] = useState<MobileDMSendViewState>(INITIAL_DM_SEND_STATE);
  const dmMessagesRequestIdRef = useRef(0);
  const [selectedWorkspaceServerId, setSelectedWorkspaceServerId] = useState<string | null>(null);
  const [selectedWorkspaceChannelId, setSelectedWorkspaceChannelId] = useState<string | null>(null);
  const [activeWorkspaceTextChannelId, setActiveWorkspaceTextChannelId] = useState<string | null>(
    null,
  );
  const [activeWorkspaceVoiceChannelId, setActiveWorkspaceVoiceChannelId] = useState<string | null>(
    null,
  );
  const [workspaceServerState, setWorkspaceServerState] = useState<MobileWorkspaceServerViewState>(
    INITIAL_WORKSPACE_SERVER_STATE,
  );
  const [channelMessagesState, setChannelMessagesState] = useState<MobileChannelMessagesViewState>(
    INITIAL_CHANNEL_MESSAGES_STATE,
  );
  const channelMessagesStateRef = useRef<MobileChannelMessagesViewState>(channelMessagesState);
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
  const [messageSearchState, setMessageSearchState] = useState<MobileMessageSearchViewState>(
    INITIAL_MESSAGE_SEARCH_STATE,
  );
  const messageSearchRequestIdRef = useRef(0);
  const [lastDeepLink, setLastDeepLink] = useState<MobileDeepLinkParseResult | null>(null);
  const route = resolveMobileRoute(navigation.currentTab, status);
  const [notificationState, setNotificationState] = useState(
    createInitialMobileNotificationRuntimeState,
  );
  const {
    beginPushToTalk,
    endPushToTalk,
    joinVoiceChannel,
    leaveVoiceChannel,
    permissionState: voiceState,
    pushToTalkState: voicePushToTalkState,
    requestMicrophonePermission,
    roomState: voiceRoomState,
    selectAudioOutput: selectVoiceAudioOutput,
    syncParticipantAudioLevelFromServer,
    syncParticipantsFromServer,
    toggleCamera: toggleVoiceCamera,
    toggleMute: toggleVoiceMute,
    toggleScreenShare: toggleVoiceScreenShare,
  } = useMobileVoiceRoom({
    apiClient,
    currentUser: session?.user ?? null,
    voiceInputMode,
  });

  useEffect(() => {
    let isMounted = true;

    mobileLocalePreferenceRepository
      .load()
      .then((storedLocale) => {
        if (!isMounted) {
          return;
        }

        setActiveMobileLocale(storedLocale);
        setMobileLocale(storedLocale);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setActiveMobileLocale(DEFAULT_MOBILE_LOCALE);
        setMobileLocale(DEFAULT_MOBILE_LOCALE);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    mobileVoicePreferenceRepository
      .loadInputMode()
      .then((storedInputMode) => {
        if (!isMounted) {
          return;
        }

        setVoiceInputMode(storedInputMode);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setVoiceInputMode(DEFAULT_MOBILE_VOICE_INPUT_MODE);
      });

    return () => {
      isMounted = false;
    };
  }, []);
  const activeVoiceChannelId = voiceRoomState.channelId;
  const [voiceInviteEntries, setVoiceInviteEntries] = useState<MobileVoiceInviteEntry[]>([]);
  const [voiceInviteSendStates, setVoiceInviteSendStates] = useState<
    Record<string, MobileVoiceInviteSendState>
  >({});
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
    if (fontsLoaded) {
      installMobileFontDefaults();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    mediaStateRef.current = mediaState;
  }, [mediaState]);

  useEffect(() => {
    channelMessagesStateRef.current = channelMessagesState;
  }, [channelMessagesState]);

  useEffect(() => {
    realtimeStateRef.current = realtimeState;
  }, [realtimeState]);

  const handleRequestNotificationPermission = useCallback(async () => {
    setNotificationState((current) => createCheckingMobileNotificationRuntimeState(current));
    const nextState = await requestMobileNotificationsAfterUserAction(apiClient);
    setNotificationState(nextState);
  }, [apiClient]);

  const handleRequestVoicePermission = useCallback(async () => {
    await requestMicrophonePermission();
  }, [requestMicrophonePermission]);

  const handleRequestPhotoLibraryPermission = useCallback(async () => {
    setMediaState((current) => createCheckingMobileMediaRuntimeState(current, "photoLibrary"));
    const nextState = await requestMobilePhotoLibraryPermissionAfterUserAction(
      mediaStateRef.current,
    );
    setMediaState(nextState);
  }, []);

  const handleRequestPhotoLibraryPicker = useCallback(async () => {
    setMediaState((current) => createCheckingMobileMediaRuntimeState(current, "photoLibrary"));
    const nextState = await requestMobilePhotoLibraryPickerAfterUserAction(mediaStateRef.current);
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

  const scheduleChannelTypingPrune = useCallback((channelId: string) => {
    if (channelTypingPruneTimersRef.current[channelId]) {
      return;
    }

    channelTypingPruneTimersRef.current[channelId] = setTimeout(() => {
      delete channelTypingPruneTimersRef.current[channelId];
      setChannelTypingState((current) => pruneMobileChannelTypingState(current));
    }, MOBILE_CHANNEL_TYPING_STOP_DELAY_MS + 750);
  }, []);

  const stopChannelTyping = useCallback((channelId: string) => {
    const normalizedChannelId = channelId.trim();
    if (normalizedChannelId.length === 0) {
      return;
    }

    const stopTimer = channelTypingStopTimersRef.current[normalizedChannelId];
    if (stopTimer) {
      clearTimeout(stopTimer);
      delete channelTypingStopTimersRef.current[normalizedChannelId];
    }

    delete channelTypingLastStartAtRef.current[normalizedChannelId];
    realtimeClientRef.current?.emitChannelTypingStop(normalizedChannelId);
  }, []);

  const handleChannelDraftChange = useCallback(
    (content: string) => {
      const channelId = selectedWorkspaceChannelId;
      if (status !== "signed-in" || !channelId) {
        return;
      }

      if (content.trim().length === 0) {
        stopChannelTyping(channelId);
        return;
      }

      const now = Date.now();
      const lastStartedAt = channelTypingLastStartAtRef.current[channelId] ?? 0;
      if (now - lastStartedAt >= MOBILE_CHANNEL_TYPING_START_THROTTLE_MS) {
        realtimeClientRef.current?.emitChannelTypingStart(channelId);
        channelTypingLastStartAtRef.current[channelId] = now;
      }

      const stopTimer = channelTypingStopTimersRef.current[channelId];
      if (stopTimer) {
        clearTimeout(stopTimer);
      }

      channelTypingStopTimersRef.current[channelId] = setTimeout(() => {
        stopChannelTyping(channelId);
      }, MOBILE_CHANNEL_TYPING_STOP_DELAY_MS);
    },
    [selectedWorkspaceChannelId, status, stopChannelTyping],
  );

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
      stopChannelTyping(channelId);

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
    [apiClient, loadBootstrap, selectedWorkspaceChannelId, status, stopChannelTyping],
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
        setActiveWorkspaceTextChannelId(null);
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
        const channels = getMobileWorkspaceChannels(payload.detail);
        setSelectedWorkspaceChannelId(selectedChannel?.id ?? null);
        setActiveWorkspaceTextChannelId((currentChannelId) => {
          if (!currentChannelId) {
            return null;
          }

          const currentChannel = channels.find((channel) => channel.id === currentChannelId);
          return currentChannel?.type === "TEXT" ? currentChannel.id : null;
        });

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
        setActiveWorkspaceTextChannelId(null);
        setActiveWorkspaceVoiceChannelId(null);
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
      if (selectedWorkspaceChannelId) {
        stopChannelTyping(selectedWorkspaceChannelId);
      }
      setActiveWorkspaceTextChannelId(null);
      setActiveWorkspaceVoiceChannelId(null);
      void loadWorkspaceServer(serverId);
    },
    [clearMessageSearch, loadWorkspaceServer, selectedWorkspaceChannelId, stopChannelTyping],
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
        setActiveWorkspaceTextChannelId(null);
        setActiveWorkspaceVoiceChannelId(channel.id);
        channelMessagesRequestIdRef.current += 1;
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
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
        setActiveWorkspaceTextChannelId(null);
        setActiveWorkspaceVoiceChannelId(null);
        channelMessagesRequestIdRef.current += 1;
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        return;
      }

      setActiveWorkspaceTextChannelId(channel.id);
      setActiveWorkspaceVoiceChannelId(null);
      setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
      void loadChannelMessages(channel.id);
    },
    [
      clearMessageSearch,
      joinVoiceChannel,
      loadChannelMessages,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      stopChannelTyping,
    ],
  );

  const handleSendVoiceInvite = useCallback(
    (targetUserId: string) => {
      const channelId = voiceRoomState.channelId;
      const serverId = voiceRoomState.serverId;
      const normalizedTargetUserId = targetUserId.trim();

      if (!channelId || !serverId || !normalizedTargetUserId) {
        setVoiceInviteSendStates((current) => ({
          ...current,
          [normalizedTargetUserId]: {
            errorMessage: copy.voiceInviteRealtimeUnavailable,
            expiresAt: null,
            inviteId: null,
            status: "failed",
          },
        }));
        return;
      }

      setVoiceInviteSendStates((current) => ({
        ...current,
        [normalizedTargetUserId]: {
          errorMessage: null,
          expiresAt: null,
          inviteId: null,
          status: "sending",
        },
      }));

      realtimeClientRef.current?.emitVoiceInviteSend({
        channelId,
        serverId,
        targetUserId: normalizedTargetUserId,
      });
    },
    [voiceRoomState.channelId, voiceRoomState.serverId],
  );

  const handleAcceptVoiceInvite = useCallback(
    (inviteId: string) => {
      const invite = voiceInviteEntries.find((entry) => entry.id === inviteId);

      if (!invite) {
        return;
      }

      setVoiceInviteEntries((current) =>
        current.map((entry) =>
          entry.id === inviteId ? { ...entry, errorMessage: null, isAccepting: true } : entry,
        ),
      );

      realtimeClientRef.current?.emitVoiceInviteAccept({
        channelId: invite.channelId,
        inviteId: invite.id,
        serverId: invite.serverId,
      });
      dispatchNavigation({ tab: "overview", type: "select" });
      setActiveWorkspaceTextChannelId(null);
      setActiveWorkspaceVoiceChannelId(invite.channelId);
      void loadWorkspaceServer(invite.serverId, invite.channelId);
      void joinVoiceChannel({
        channelId: invite.channelId,
        channelName: invite.channelName,
        serverId: invite.serverId,
      }).then((joined) => {
        if (joined) {
          setVoiceInviteEntries((current) => current.filter((entry) => entry.id !== invite.id));
          return;
        }

        setVoiceInviteEntries((current) =>
          current.map((entry) =>
            entry.id === invite.id
              ? { ...entry, errorMessage: copy.voiceRoomError, isAccepting: false }
              : entry,
          ),
        );
      });
    },
    [joinVoiceChannel, loadWorkspaceServer, voiceInviteEntries],
  );

  const handleDeclineVoiceInvite = useCallback(
    (inviteId: string) => {
      const invite = voiceInviteEntries.find((entry) => entry.id === inviteId);

      if (invite) {
        realtimeClientRef.current?.emitVoiceInviteDecline({
          channelId: invite.channelId,
          inviteId: invite.id,
          serverId: invite.serverId,
        });
      }

      setVoiceInviteEntries((current) => current.filter((entry) => entry.id !== inviteId));
    },
    [voiceInviteEntries],
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
      status !== "signed-in" ||
      navigation.currentTab !== "overview" ||
      bootstrapState.status !== "ready" ||
      selectedWorkspaceServerId ||
      workspaceServerState.status === "loading"
    ) {
      return;
    }

    const firstServer = bootstrapState.payload.home.servers.recent[0] ?? null;
    if (!firstServer) {
      return;
    }

    void loadWorkspaceServer(firstServer.id);
  }, [
    bootstrapState,
    loadWorkspaceServer,
    navigation.currentTab,
    selectedWorkspaceServerId,
    status,
    workspaceServerState.status,
  ]);

  const refreshMobileRealtimeSources = useCallback(
    (sources: readonly MobileRealtimeRefreshSource[]) => {
      if (status !== "signed-in") {
        return;
      }

      const sourceSet = new Set(sources);

      if (
        sourceSet.has("bootstrap") ||
        sourceSet.has("presence") ||
        sourceSet.has("notification")
      ) {
        void loadBootstrap();
      }

      if (sourceSet.has("dm") && selectedDMConversationId) {
        void loadDMMessages(selectedDMConversationId);
      }

      if (sourceSet.has("workspace") && selectedWorkspaceServerId) {
        void loadWorkspaceServer(selectedWorkspaceServerId, selectedWorkspaceChannelId);
      }

      if (sourceSet.has("channel") && selectedWorkspaceChannelId) {
        void loadChannelMessages(selectedWorkspaceChannelId);
      }
    },
    [
      loadBootstrap,
      loadChannelMessages,
      loadDMMessages,
      loadWorkspaceServer,
      selectedDMConversationId,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      status,
    ],
  );

  const refreshVisibleMobileData = useCallback(() => {
    refreshMobileRealtimeSources(["bootstrap", "dm", "workspace", "channel"]);
  }, [refreshMobileRealtimeSources]);

  useEffect(() => {
    realtimeTargetsRef.current = {
      channelId: selectedWorkspaceChannelId,
      conversationId: selectedDMConversationId,
      serverId: selectedWorkspaceServerId,
      voiceChannelId: activeVoiceChannelId,
    };
  }, [
    activeVoiceChannelId,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
  ]);

  const scheduleRealtimeRefresh = useCallback(
    (source: MobileRealtimeRefreshSource, refresh: () => void) => {
      const timerSource = getMobileRealtimeRefreshTimerSource(source);

      if (realtimeRefreshTimersRef.current[timerSource]) {
        return;
      }

      realtimeRefreshTimersRef.current[timerSource] = setTimeout(() => {
        delete realtimeRefreshTimersRef.current[timerSource];
        refresh();
      }, MOBILE_REALTIME_REFRESH_DEBOUNCE_MS);
    },
    [],
  );

  const handleRealtimeEvent = useCallback(
    (event: MobileRealtimeEventEnvelope) => {
      dispatchRealtime({ event, type: "event-received" });
      const targets = realtimeTargetsRef.current;
      const voicePayload =
        event.eventName === "voice:state:update"
          ? getMobileVoiceStateUpdatePayload(event.payload)
          : null;
      const voiceAudioPayload =
        event.eventName === "voice:audio-level:update"
          ? getMobileVoiceAudioLevelUpdatePayload(event.payload)
          : null;
      const typingPayload =
        event.eventName === "typing:update"
          ? getMobileChannelTypingUpdatePayload(event.payload)
          : null;
      const voiceInviteReceivedPayload =
        event.eventName === "voice:invite:received"
          ? getMobileVoiceInviteReceivedPayload(event.payload)
          : null;
      const voiceInviteSentPayload =
        event.eventName === "voice:invite:sent"
          ? getMobileVoiceInviteSendResultPayload(event.payload)
          : null;
      const voiceInviteStatusPayload =
        event.eventName === "voice:invite:status" || event.eventName === "voice:invite:accepted"
          ? getMobileVoiceInviteStatusPayload(event.payload)
          : null;
      const voiceInviteErrorPayload =
        event.eventName === "voice:invite:error"
          ? getMobileVoiceInviteErrorPayload(event.payload)
          : null;
      const channelMessageApplyResult = applyMobileRealtimeChannelMessageEvent({
        eventName: event.eventName,
        payload: event.payload,
        state: channelMessagesStateRef.current,
      });

      if (channelMessageApplyResult.handled) {
        channelMessagesStateRef.current = channelMessageApplyResult.state;
        setChannelMessagesState(channelMessageApplyResult.state);
        setChannelSyncState(markMobileSyncSucceeded);
      }

      if (voicePayload) {
        syncParticipantsFromServer(voicePayload);
      }

      if (voiceAudioPayload) {
        syncParticipantAudioLevelFromServer(voiceAudioPayload);
      }

      if (typingPayload) {
        const currentUserNames = [
          session?.user.displayName ?? "",
          session?.user.username ?? "",
        ].filter((name) => name.trim().length > 0);
        setChannelTypingState((current) =>
          replaceMobileChannelTypingUsers(current, {
            channelId: typingPayload.channelId,
            currentUserNames,
            now: event.receivedAt,
            usernames: typingPayload.users,
          }),
        );
        scheduleChannelTypingPrune(typingPayload.channelId);
      }

      if (voiceInviteReceivedPayload) {
        const expiresAtMs = Date.parse(voiceInviteReceivedPayload.expiresAt);
        if (Number.isNaN(expiresAtMs) || expiresAtMs > Date.now()) {
          setVoiceInviteEntries((current) => {
            const nextEntry: MobileVoiceInviteEntry = {
              ...voiceInviteReceivedPayload,
              errorMessage: null,
              isAccepting: false,
            };
            const withoutDuplicate = current.filter(
              (entry) => entry.id !== voiceInviteReceivedPayload.id,
            );
            return [nextEntry, ...withoutDuplicate].slice(0, MOBILE_VOICE_INVITE_LIMIT);
          });
        }
      }

      if (voiceInviteSentPayload) {
        setVoiceInviteSendStates((current) => ({
          ...current,
          [voiceInviteSentPayload.targetUserId]: {
            errorMessage: null,
            expiresAt: voiceInviteSentPayload.expiresAt,
            inviteId: voiceInviteSentPayload.inviteId,
            status: "sent",
          },
        }));
      }

      if (voiceInviteStatusPayload) {
        setVoiceInviteSendStates((current) => ({
          ...current,
          [voiceInviteStatusPayload.targetUserId]: {
            errorMessage: null,
            expiresAt: null,
            inviteId: voiceInviteStatusPayload.inviteId,
            status: voiceInviteStatusPayload.status,
          },
        }));
        setVoiceInviteEntries((current) =>
          current.filter((entry) => entry.id !== voiceInviteStatusPayload.inviteId),
        );
      }

      if (voiceInviteErrorPayload) {
        if (voiceInviteErrorPayload.targetUserId) {
          setVoiceInviteSendStates((current) => ({
            ...current,
            [voiceInviteErrorPayload.targetUserId as string]: {
              errorMessage: voiceInviteErrorPayload.message,
              expiresAt: null,
              inviteId: voiceInviteErrorPayload.inviteId,
              status: "failed",
            },
          }));
        }

        if (voiceInviteErrorPayload.inviteId) {
          setVoiceInviteEntries((current) =>
            current.map((entry) =>
              entry.id === voiceInviteErrorPayload.inviteId
                ? {
                    ...entry,
                    errorMessage: voiceInviteErrorPayload.message,
                    isAccepting: false,
                  }
                : entry,
            ),
          );
        }
      }

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
            targets.channelId && (!event.channelId || event.channelId === targets.channelId);

          if (shouldRefreshChannel && !channelMessageApplyResult.handled) {
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
      scheduleChannelTypingPrune,
      session?.user.displayName,
      session?.user.username,
      syncParticipantAudioLevelFromServer,
      syncParticipantsFromServer,
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

  useEffect(
    () => () => {
      for (const timer of Object.values(channelTypingStopTimersRef.current)) {
        clearTimeout(timer);
      }

      for (const timer of Object.values(channelTypingPruneTimersRef.current)) {
        clearTimeout(timer);
      }

      channelTypingStopTimersRef.current = {};
      channelTypingLastStartAtRef.current = {};
      channelTypingPruneTimersRef.current = {};
    },
    [],
  );

  useEffect(() => {
    const visibility: MobileRealtimeVisibility = getMobileRealtimeVisibilityFromAppState(
      appStateRef.current,
    );

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
  }, [getAccessToken, handleRealtimeEvent, realtimeState.visibility, session?.user.id, status]);

  useEffect(() => {
    const activeTargets = {
      channelId:
        navigation.currentTab === "overview" || navigation.currentTab === "voice"
          ? selectedWorkspaceChannelId
          : null,
      conversationId: navigation.currentTab === "messages" ? selectedDMConversationId : null,
      serverId: selectedWorkspaceServerId,
      voiceChannelId: activeVoiceChannelId,
    };

    realtimeClientRef.current?.setActiveTargets(activeTargets);
  }, [
    activeVoiceChannelId,
    navigation.currentTab,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      const previousVisibility = getMobileRealtimeVisibilityFromAppState(previousState);
      const nextVisibility = getMobileRealtimeVisibilityFromAppState(nextState);
      appStateRef.current = nextState;
      dispatchRealtime({
        type: "visibility-changed",
        visibility: nextVisibility,
      });

      const returnedToForeground =
        nextVisibility === "foreground" && previousVisibility === "background";

      if (!returnedToForeground || status !== "signed-in") {
        return;
      }

      const sources = new Set<MobileRealtimeRefreshSource>(
        getMobileRealtimeForegroundBackfillSources({
          authStatus: status,
          nextVisibility,
          previousVisibility,
          realtime: realtimeStateRef.current,
          targets: realtimeTargetsRef.current,
        }),
      );

      if (shouldRefreshOnForeground(bootstrapSyncState)) {
        sources.add("bootstrap");
      }

      if (selectedDMConversationId && shouldRefreshOnForeground(dmSyncState)) {
        sources.add("dm");
      }

      if (selectedWorkspaceServerId && shouldRefreshOnForeground(workspaceSyncState)) {
        sources.add("workspace");
      }

      if (selectedWorkspaceChannelId && shouldRefreshOnForeground(channelSyncState)) {
        sources.add("channel");
      }

      if (sources.size > 0) {
        refreshMobileRealtimeSources([...sources]);
      }
    });

    return () => subscription.remove();
  }, [
    bootstrapSyncState,
    channelSyncState,
    dmSyncState,
    refreshMobileRealtimeSources,
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
      setActiveWorkspaceTextChannelId(null);
      setActiveWorkspaceVoiceChannelId(null);
      setWorkspaceSyncState(INITIAL_WORKSPACE_SYNC_STATE);
      setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
      void leaveVoiceChannel();
      return;
    }

    void loadBootstrap();
  }, [leaveVoiceChannel, loadBootstrap, status]);

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

  const channelTypingLabel = useMemo(
    () =>
      formatMobileChannelTypingLabel(
        getVisibleMobileChannelTypingUsers(channelTypingState, selectedWorkspaceChannelId),
      ),
    [channelTypingState, selectedWorkspaceChannelId],
  );

  const isShellRefreshing = status === "checking";
  const contentUsesOwnScroll =
    status === "signed-in" &&
    !route.isBlocked &&
    navigation.currentTab === "overview" &&
    (activeWorkspaceTextChannelId !== null || activeWorkspaceVoiceChannelId !== null);

  const handleShellRefresh = useCallback(() => {
    if (route.isBlocked) {
      void refreshSessionFromStorage();
      return;
    }

    refreshVisibleMobileData();
  }, [refreshSessionFromStorage, refreshVisibleMobileData, route.isBlocked]);

  const handleSelectMobileLocale = useCallback((locale: MobileLocale) => {
    const normalizedLocale = setActiveMobileLocale(locale);
    setMobileLocale(normalizedLocale);
    void mobileLocalePreferenceRepository.save(normalizedLocale).catch(() => undefined);
  }, []);

  const handleSelectMobileVoiceInputMode = useCallback((mode: MobileVoiceInputMode) => {
    const normalizedMode = sanitizeMobileVoiceInputMode(mode);
    setVoiceInputMode(normalizedMode);
    void mobileVoicePreferenceRepository.saveInputMode(normalizedMode).catch(() => undefined);
  }, []);

  const openTrustedWebPath = useCallback((path: "/cookies" | "/privacy" | "/terms") => {
    const url = new URL(path, runtimeConfig.webUrl);
    void Linking.openURL(url.toString()).catch(() => undefined);
  }, []);

  const openPrivacyPolicy = useCallback(() => {
    openTrustedWebPath("/privacy");
  }, [openTrustedWebPath]);

  const openTerms = useCallback(() => {
    openTrustedWebPath("/terms");
  }, [openTrustedWebPath]);

  const openCookies = useCallback(() => {
    openTrustedWebPath("/cookies");
  }, [openTrustedWebPath]);

  const openSupport = useCallback(() => {
    void Linking.openURL("mailto:support@whispr.team").catch(() => undefined);
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <MobileAppShell
      authStatus={status}
      contentUsesOwnScroll={contentUsesOwnScroll}
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
          locale={mobileLocale}
          notificationState={notificationState}
          voiceState={voiceState}
          voiceInputMode={voiceInputMode}
          voicePushToTalkPhase={voicePushToTalkState.phase}
          voiceRoomState={voiceRoomState}
          voiceInvites={voiceInviteEntries}
          voiceInviteSendStates={voiceInviteSendStates}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          error={error}
          authStatusLabel={authStatusLabel}
          channelMessagesState={channelMessagesState}
          channelSendState={channelSendState}
          channelTypingLabel={channelTypingLabel}
          onOpenWebRegister={() => void openWebRegister()}
          onOpenCookies={openCookies}
          onOpenPrivacyPolicy={openPrivacyPolicy}
          onOpenSupport={openSupport}
          onOpenTerms={openTerms}
          signedInUserLabel={signedInUserLabel}
          onOpenWebSignIn={() => void openWebSignIn()}
          onCloseDMConversation={handleCloseDMConversation}
          onCloseWorkspaceChannel={handleCloseWorkspaceChannel}
          onCloseWorkspaceVoiceChannel={handleCloseWorkspaceVoiceChannel}
          onOpenDMConversation={handleOpenDMConversation}
          onOpenWorkspaceChannel={handleOpenWorkspaceChannel}
          onOpenWorkspaceServer={handleOpenWorkspaceServer}
          onClearSelectedMediaAsset={handleClearSelectedMediaAsset}
          onClearMessageSearch={clearMessageSearch}
          onRequestCameraPermission={handleRequestCameraPermission}
          onRequestDocumentPicker={handleRequestDocumentPicker}
          onRequestPhotoLibraryPicker={handleRequestPhotoLibraryPicker}
          onRequestPhotoLibraryPermission={handleRequestPhotoLibraryPermission}
          onRequestNotificationPermission={handleRequestNotificationPermission}
          onRequestVoicePermission={handleRequestVoicePermission}
          onLeaveVoiceChannel={leaveVoiceChannel}
          onLeaveWorkspaceVoiceChannel={handleLeaveWorkspaceVoiceChannel}
          onSelectVoiceAudioOutput={selectVoiceAudioOutput}
          onBeginVoicePushToTalk={beginPushToTalk}
          onEndVoicePushToTalk={endPushToTalk}
          onSelectVoiceInputMode={handleSelectMobileVoiceInputMode}
          onToggleVoiceCamera={toggleVoiceCamera}
          onToggleVoiceMute={toggleVoiceMute}
          onToggleVoiceScreenShare={toggleVoiceScreenShare}
          onAcceptVoiceInvite={handleAcceptVoiceInvite}
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
          onChannelDraftChange={handleChannelDraftChange}
          onSelectTab={(tab) => dispatchNavigation({ tab, type: "select" })}
          onSendChannelMessage={handleSendChannelMessage}
          onSendDMMessage={handleSendDMMessage}
          onSearchMessages={handleSearchMessages}
          onDeclineVoiceInvite={handleDeclineVoiceInvite}
          onSendVoiceInvite={handleSendVoiceInvite}
          onSelectLocale={handleSelectMobileLocale}
          onSignOut={() => void signOut()}
          selectedDMConversation={selectedDMConversation}
          selectedDMConversationId={selectedDMConversationId}
          activeWorkspaceTextChannelId={activeWorkspaceTextChannelId}
          activeWorkspaceVoiceChannelId={activeWorkspaceVoiceChannelId}
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
