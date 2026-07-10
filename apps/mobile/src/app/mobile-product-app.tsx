import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { MobileVoiceStateParticipant, MobileWorkspaceChannelSummary } from "@wizards/types";
import { Linking, View } from "react-native";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { summarizeMobileBootstrap } from "../bootstrap/mobile-bootstrap";
import { getMobileRuntimeConfig } from "../config/environment";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import type { MobileTabId } from "../navigation/mobile-navigation";
import { installMobileFontDefaults, useOutfitFonts } from "../design/mobile-fonts";
import { useMobileBootstrapQuery } from "../query/mobile-bootstrap-query";
import {
  useMobileChannelMessagesQuery,
  useMobileDMMessagesQuery,
} from "../query/mobile-message-queries";
import { useMobileMessageSearchQuery } from "../query/mobile-message-search-query";
import {
  useMobileChannelMessageMutation,
  useMobileDMMessageMutation,
} from "../query/use-mobile-message-mutations";
import { useMobileWorkspaceQuery } from "../query/mobile-workspace-query";
import {
  createInitialMobilePermissionReadiness,
  summarizeMobilePermissionReadiness,
} from "../permissions/mobile-permission-contract";
import type { MobileRealtimeEventEnvelope } from "../realtime/mobile-realtime-contract";
import {
  getVisibleMobileChannelTypingUsers,
  formatMobileChannelTypingLabel,
} from "../realtime/mobile-typing-state";
import {
  MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
  MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH,
  type MobileMessageSearchScope,
} from "../search/mobile-message-search-client";
import { useMobileActiveTargetStore } from "../state/mobile-active-target-store";
import {
  getMobileVoiceInviteErrorPayload,
  getMobileVoiceInviteReceivedPayload,
  getMobileVoiceInviteSendResultPayload,
  getMobileVoiceInviteStatusPayload,
  type MobileVoiceInviteReceived,
  type MobileVoiceInviteSendState,
} from "../voice/mobile-voice-room-contract";
import { MobileDeviceIntegrityWarning } from "./components/mobile-device-integrity-warning";
import {
  findInitialMobileWorkspaceChannel,
  resolveMobileTabActiveTextChannelId,
  resolveMobileWorkspaceActiveTextChannelId,
} from "./mobile-display-model";
import { MobileAppShell } from "./mobile-app-shell";
import {
  toMobileBootstrapViewState,
  toMobileChannelMessagesViewState,
  toMobileDMMessagesViewState,
  toMobileMessageSearchViewState,
  toMobileSyncSnapshot,
  toMobileWorkspaceViewState,
} from "./mobile-query-view-state";
import { getVisibleMobileSyncHealth } from "./mobile-screen-sync";
import { MobileVoiceInviteOverlay } from "./overlays/mobile-voice-invite-overlay";
import { useMobileLocaleRuntime } from "./providers/mobile-locale-provider";
import { useMobileMediaRuntime } from "./providers/mobile-media-provider";
import { useMobileNotificationRuntime } from "./providers/mobile-notification-provider";
import { useMobileRealtimeRuntime } from "./providers/mobile-realtime-provider";
import { useMobileVoiceRuntime } from "./providers/mobile-voice-provider";
import {
  MobileMessagesScreenProvider,
  MobileNotificationsScreenProvider,
  MobileOverviewScreenProvider,
  MobileProductNavigationProvider,
  MobileSettingsScreenProvider,
  MobileVoiceScreenProvider,
  type MobileMessagesScreenProps,
  type MobileNotificationsScreenProps,
  type MobileOverviewScreenProps,
  type MobileSettingsScreenProps,
  type MobileVoiceScreenProps,
} from "./providers/mobile-product-screen-provider";
import {
  type MobileChannelSendViewState,
  type MobileDMSendViewState,
} from "./mobile-screen-state";

const copy = activeMobileCopy;
const runtimeConfig = getMobileRuntimeConfig();
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

export function MobileProductApp({
  Navigator,
}: {
  readonly Navigator: ComponentType<{
    readonly directMessageUnreadCount?: number;
    readonly onTabChange?: (tab: MobileTabId) => void;
  }>;
}) {
  const [fontsLoaded] = useOutfitFonts();
  const {
    apiClient,
    deviceIntegrityWarningVisible,
    dismissDeviceIntegrityWarning,
    error,
    openWebRegister,
    openWebSignIn,
    refreshSessionFromStorage,
    session,
    signOut,
    status,
  } = useMobileAuth();
  const { locale: mobileLocale, selectLocale: handleSelectMobileLocale } = useMobileLocaleRuntime();
  const {
    clearSelectedAsset: handleClearSelectedMediaAsset,
    requestCameraPermission: handleRequestCameraPermission,
    requestDocumentPicker: handleRequestDocumentPicker,
    requestPhotoLibraryPermission: handleRequestPhotoLibraryPermission,
    requestPhotoLibraryPicker: handleRequestPhotoLibraryPicker,
    state: mediaState,
  } = useMobileMediaRuntime();
  const { requestPermission: handleRequestNotificationPermission, state: notificationState } =
    useMobileNotificationRuntime();
  const {
    emitVoiceInviteAccept,
    emitVoiceInviteDecline,
    emitVoiceInviteSend,
    stopChannelTyping,
    subscribe: subscribeRealtime,
    typing: channelTypingState,
    updateChannelTyping,
  } = useMobileRealtimeRuntime();
  const {
    beginPushToTalk,
    endPushToTalk,
    joinVoiceChannel,
    leaveVoiceChannel,
    permissionState: voiceState,
    pushToTalkState: voicePushToTalkState,
    requestMicrophonePermission: handleRequestVoicePermission,
    roomState: voiceRoomState,
    selectAudioOutput: selectVoiceAudioOutput,
    selectVoiceInputMode: handleSelectMobileVoiceInputMode,
    syncParticipantAudioLevelFromServer,
    syncParticipantsFromServer,
    toggleCamera: toggleVoiceCamera,
    toggleMute: toggleVoiceMute,
    toggleScreenShare: toggleVoiceScreenShare,
    voiceInputMode,
  } = useMobileVoiceRuntime();
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
  const [messageSearchInput, setMessageSearchInput] = useState<{
    readonly conversationId: string;
    readonly limit: number;
    readonly query: string;
    readonly scope: MobileMessageSearchScope;
  }>({
    conversationId: "",
    limit: MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
    query: "",
    scope: "dm",
  });
  const activeVoiceChannelId = voiceRoomState.channelId;
  const bootstrapQuery = useMobileBootstrapQuery(apiClient, status === "signed-in");
  const workspaceQuery = useMobileWorkspaceQuery(apiClient, selectedWorkspaceServerId ?? "");
  const channelMessagesQuery = useMobileChannelMessagesQuery(
    apiClient,
    activeWorkspaceTextChannelId ?? "",
  );
  const dmMessagesQuery = useMobileDMMessagesQuery(apiClient, selectedDMConversationId ?? "");
  const messageSearchQuery = useMobileMessageSearchQuery(apiClient, messageSearchInput);
  const channelMessageMutation = useMobileChannelMessageMutation({
    author: session?.user ?? null,
    channelId: activeWorkspaceTextChannelId ?? "",
    client: apiClient,
  });
  const dmMessageMutation = useMobileDMMessageMutation({
    author: session
      ? {
          ...session.user,
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
  const bootstrapSyncState = toMobileSyncSnapshot(bootstrapQuery, "bootstrap");
  const workspaceSyncState = toMobileSyncSnapshot(workspaceQuery, "workspace");
  const channelSyncState = toMobileSyncSnapshot(channelMessagesQuery, "channel");
  const dmSyncState = toMobileSyncSnapshot(dmMessagesQuery, "dm");
  const channelSendState: MobileChannelSendViewState = {
    channelId: activeWorkspaceTextChannelId,
    error: isChannelSendError ? copy.channelSendFailed : null,
    status: isChannelSending
      ? "sending"
      : isChannelSendError
        ? "error"
        : "idle",
  };
  const dmSendState: MobileDMSendViewState = {
    conversationId: selectedDMConversationId,
    error: isDMSendError ? copy.dmSendFailed : null,
    status: isDMSending
      ? "sending"
      : isDMSendError
        ? "error"
        : "idle",
  };
  const [voiceInviteEntries, setVoiceInviteEntries] = useState<MobileVoiceInviteEntry[]>([]);
  const [voiceInviteSendStates, setVoiceInviteSendStates] = useState<
    Record<string, MobileVoiceInviteSendState>
  >({});
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

  const handleChannelDraftChange = useCallback(
    (content: string) => {
      const channelId = selectedWorkspaceChannelId;
      if (status !== "signed-in" || !channelId) {
        return;
      }
      updateChannelTyping(channelId, content);
    },
    [selectedWorkspaceChannelId, status, updateChannelTyping],
  );

  const refreshBootstrap = useCallback(() => {
    void bootstrapQuery.refetch();
  }, [bootstrapQuery]);

  const refreshDMMessages = useCallback(() => {
    if (selectedDMConversationId) {
      void dmMessagesQuery.refetch();
    }
  }, [dmMessagesQuery, selectedDMConversationId]);

  const handleSendDMMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const conversationId = selectedDMConversationId;
      const trimmedContent = content.trim();

      if (status !== "signed-in" || !conversationId || trimmedContent.length === 0) {
        return false;
      }

      try {
        await sendDMMessage({ content: trimmedContent });
        return true;
      } catch {
        return false;
      }
    },
    [selectedDMConversationId, sendDMMessage, status],
  );

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

  const clearMessageSearch = useCallback(() => {
    setMessageSearchInput({
      conversationId: "",
      limit: MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
      query: "",
      scope: "dm",
    });
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
        status !== "signed-in" ||
        normalizedConversationId.length === 0 ||
        normalizedQuery.length < MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH
      ) {
        clearMessageSearch();
        return;
      }

      const nextInput = {
        conversationId: normalizedConversationId,
        limit: MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
        query: normalizedQuery,
        scope,
      } as const;
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
    [clearMessageSearch, messageSearchInput, messageSearchQuery, status],
  );

  const handleSendChannelMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const channelId = activeWorkspaceTextChannelId;
      const trimmedContent = content.trim();

      if (status !== "signed-in" || !channelId || trimmedContent.length === 0) {
        return false;
      }

      stopChannelTyping(channelId);

      try {
        await sendChannelMessage({ content: trimmedContent });
        return true;
      } catch {
        return false;
      }
    },
    [activeWorkspaceTextChannelId, sendChannelMessage, status, stopChannelTyping],
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

      emitVoiceInviteSend({
        channelId,
        serverId,
        targetUserId: normalizedTargetUserId,
      });
    },
    [emitVoiceInviteSend, voiceRoomState.channelId, voiceRoomState.serverId],
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

      emitVoiceInviteAccept({
        channelId: invite.channelId,
        inviteId: invite.id,
        serverId: invite.serverId,
      });
      setCurrentTab("overview");
      setActiveWorkspaceTextChannelId(null);
      setActiveWorkspaceVoiceChannelId(invite.channelId);
      setSelectedWorkspaceServerId(invite.serverId);
      setWorkspaceRouteIntent({
        channelId: invite.channelId,
        serverId: invite.serverId,
        shouldOpenPreferredChannel: false,
      });
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
    [emitVoiceInviteAccept, joinVoiceChannel, voiceInviteEntries],
  );

  const handleDeclineVoiceInvite = useCallback(
    (inviteId: string) => {
      const invite = voiceInviteEntries.find((entry) => entry.id === inviteId);

      if (invite) {
        emitVoiceInviteDecline({
          channelId: invite.channelId,
          inviteId: invite.id,
          serverId: invite.serverId,
        });
      }

      setVoiceInviteEntries((current) => current.filter((entry) => entry.id !== inviteId));
    },
    [emitVoiceInviteDecline, voiceInviteEntries],
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
      currentTab !== "overview" ||
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

    handleOpenWorkspaceServer(firstServer.id);
  }, [
    bootstrapState,
    currentTab,
    handleOpenWorkspaceServer,
    selectedWorkspaceServerId,
    status,
    workspaceServerState.status,
  ]);

  const refreshVisibleMobileData = useCallback(() => {
    if (status !== "signed-in") {
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
    selectedDMConversationId,
    selectedWorkspaceServerId,
    status,
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

  const handleLocalRealtimeEvent = useCallback(
    (event: MobileRealtimeEventEnvelope) => {
      const voicePayload =
        event.eventName === "voice:state:update"
          ? getMobileVoiceStateUpdatePayload(event.payload)
          : null;
      const voiceAudioPayload =
        event.eventName === "voice:audio-level:update"
          ? getMobileVoiceAudioLevelUpdatePayload(event.payload)
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
      if (voicePayload) {
        syncParticipantsFromServer(voicePayload);
      }

      if (voiceAudioPayload) {
        syncParticipantAudioLevelFromServer(voiceAudioPayload);
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

    },
    [
      syncParticipantAudioLevelFromServer,
      syncParticipantsFromServer,
    ],
  );

  useEffect(() => subscribeRealtime(handleLocalRealtimeEvent), [
    handleLocalRealtimeEvent,
    subscribeRealtime,
  ]);

  useEffect(() => {
    if (status !== "signed-in") {
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
    }
  }, [
    clearMessageSearch,
    leaveVoiceChannel,
    resetChannelMessageMutation,
    resetDMMessageMutation,
    status,
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

  const getSyncHealth = (tab: MobileTabId) =>
    getVisibleMobileSyncHealth({
      bootstrapSyncState,
      channelSyncState,
      currentTab: tab,
      dmSyncState,
      selectedDMConversationId,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      workspaceSyncState,
    });

  const messagesScreenProps: MobileMessagesScreenProps = {
    bootstrapState,
    dmMessagesState,
    dmSendState,
    mediaState,
    messageSearchState,
    onClearMessageSearch: clearMessageSearch,
    onClearSelectedMediaAsset: handleClearSelectedMediaAsset,
    onCloseConversation: handleCloseDMConversation,
    onOpenConversation: handleOpenDMConversation,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshConversation: refreshDMMessages,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRequestDocumentPicker: handleRequestDocumentPicker,
    onRequestPhotoLibraryPicker: handleRequestPhotoLibraryPicker,
    onSearchMessages: handleSearchMessages,
    onSendMessage: handleSendDMMessage,
    selectedConversation: selectedDMConversation,
    selectedConversationId: selectedDMConversationId,
    syncHealth: getSyncHealth("messages"),
  };

  const overviewScreenProps: MobileOverviewScreenProps = {
    activeWorkspaceTextChannelId,
    activeWorkspaceVoiceChannelId,
    bootstrapState,
    channelMessagesState,
    channelSendState,
    channelTypingLabel,
    locale: mobileLocale,
    mediaState,
    messageSearchState,
    onBeginVoicePushToTalk: beginPushToTalk,
    onChannelDraftChange: handleChannelDraftChange,
    onClearMessageSearch: clearMessageSearch,
    onClearSelectedMediaAsset: handleClearSelectedMediaAsset,
    onCloseWorkspaceChannel: handleCloseWorkspaceChannel,
    onCloseWorkspaceVoiceChannel: handleCloseWorkspaceVoiceChannel,
    onEndVoicePushToTalk: endPushToTalk,
    onLeaveWorkspaceVoiceChannel: handleLeaveWorkspaceVoiceChannel,
    onOpenWorkspaceChannel: handleOpenWorkspaceChannel,
    onOpenWorkspaceServer: handleOpenWorkspaceServer,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshChannelMessages: refreshChannelMessages,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRefreshWorkspaceServer: refreshWorkspaceServer,
    onRequestDocumentPicker: handleRequestDocumentPicker,
    onRequestPhotoLibraryPicker: handleRequestPhotoLibraryPicker,
    onSearchMessages: handleSearchMessages,
    onSelectVoiceAudioOutput: selectVoiceAudioOutput,
    onSendChannelMessage: handleSendChannelMessage,
    onSendVoiceInvite: handleSendVoiceInvite,
    onToggleVoiceCamera: toggleVoiceCamera,
    onToggleVoiceMute: toggleVoiceMute,
    onToggleVoiceScreenShare: toggleVoiceScreenShare,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    syncHealth: getSyncHealth("overview"),
    voiceInputMode,
    voiceInviteSendStates,
    voicePushToTalkPhase: voicePushToTalkState.phase,
    voiceRoomState,
    workspaceServerState,
  };

  const notificationsScreenProps: MobileNotificationsScreenProps = {
    bootstrapState,
    notificationState,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRequestNotificationPermission: handleRequestNotificationPermission,
    permissionReadiness,
    permissionSummary,
    syncHealth: getSyncHealth("notifications"),
  };

  const settingsScreenProps: MobileSettingsScreenProps = {
    authStatusLabel,
    bootstrapState,
    error,
    locale: mobileLocale,
    mediaState,
    onOpenCookies: openCookies,
    onOpenPrivacyPolicy: openPrivacyPolicy,
    onOpenSupport: openSupport,
    onOpenTerms: openTerms,
    onOpenWebRegister: () => void openWebRegister(),
    onOpenWebSignIn: () => void openWebSignIn(),
    onRefresh: () => void refreshSessionFromStorage(),
    onRefreshBootstrap: refreshBootstrap,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRequestCameraPermission: handleRequestCameraPermission,
    onRequestDocumentPicker: handleRequestDocumentPicker,
    onRequestNotificationPermission: handleRequestNotificationPermission,
    onRequestPhotoLibraryPermission: handleRequestPhotoLibraryPermission,
    onSelectLocale: handleSelectMobileLocale,
    onSelectVoiceInputMode: handleSelectMobileVoiceInputMode,
    onSignOut: () => void signOut(),
    permissionReadiness,
    permissionSummary,
    signedInUserLabel,
    status,
    syncHealth: getSyncHealth("settings"),
    voiceInputMode,
  };

  const voiceScreenProps: MobileVoiceScreenProps = {
    bootstrapState,
    onBeginVoicePushToTalk: beginPushToTalk,
    onEndVoicePushToTalk: endPushToTalk,
    onLeaveVoiceChannel: leaveVoiceChannel,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRequestVoicePermission: handleRequestVoicePermission,
    onToggleVoiceCamera: toggleVoiceCamera,
    onToggleVoiceMute: toggleVoiceMute,
    onToggleVoiceScreenShare: toggleVoiceScreenShare,
    permissionReadiness,
    permissionSummary,
    syncHealth: getSyncHealth("voice"),
    voiceInputMode,
    voicePushToTalkPhase: voicePushToTalkState.phase,
    voiceRoomState,
    voiceState,
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <MobileProductNavigationProvider value={{ openWorkspaceRoute: handleOpenWorkspaceRoute }}>
      <MobileMessagesScreenProvider value={messagesScreenProps}>
        <MobileNotificationsScreenProvider value={notificationsScreenProps}>
          <MobileOverviewScreenProvider value={overviewScreenProps}>
            <MobileSettingsScreenProvider value={settingsScreenProps}>
              <MobileVoiceScreenProvider value={voiceScreenProps}>
                <MobileAppShell authStatus={status}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <MobileDeviceIntegrityWarning
                      onDismiss={dismissDeviceIntegrityWarning}
                      visible={deviceIntegrityWarningVisible}
                    />
                    <Navigator
                      directMessageUnreadCount={mobileShellUnreadCount}
                      onTabChange={setCurrentTab}
                    />
                    <MobileVoiceInviteOverlay
                      invites={voiceInviteEntries}
                      onAccept={handleAcceptVoiceInvite}
                      onDecline={handleDeclineVoiceInvite}
                    />
                  </View>
                </MobileAppShell>
              </MobileVoiceScreenProvider>
            </MobileSettingsScreenProvider>
          </MobileOverviewScreenProvider>
        </MobileNotificationsScreenProvider>
      </MobileMessagesScreenProvider>
    </MobileProductNavigationProvider>
  );
}
