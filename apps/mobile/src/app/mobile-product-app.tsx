import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import type { MobileWorkspaceChannelSummary } from "@wizards/types";
import { Linking, View } from "react-native";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../config/environment";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import type { MobileTabId } from "../navigation/mobile-navigation";
import { installMobileFontDefaults, useOutfitFonts } from "../design/mobile-fonts";
import {
  createInitialMobilePermissionReadiness,
  summarizeMobilePermissionReadiness,
} from "../permissions/mobile-permission-contract";
import {
  getVisibleMobileChannelTypingUsers,
  formatMobileChannelTypingLabel,
} from "../realtime/mobile-typing-state";
import { useMobileActiveTargetStore } from "../state/mobile-active-target-store";
import { MobileAppLockScreen } from "./components/mobile-app-lock-screen";
import { MobileDeviceIntegrityWarning } from "./components/mobile-device-integrity-warning";
import {
  findInitialMobileWorkspaceChannel,
  resolveMobileTabActiveTextChannelId,
  resolveMobileWorkspaceActiveTextChannelId,
} from "./mobile-display-model";
import { MobileAppShell } from "./mobile-app-shell";
import { useMobileMessagingFeature } from "./features/use-mobile-messaging-feature";
import { useMobileVoiceInviteFeature } from "./features/use-mobile-voice-invite-feature";
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

const copy = activeMobileCopy;
const runtimeConfig = getMobileRuntimeConfig();
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
    appLockAvailability,
    appLockEnabled,
    appLockLocked,
    deviceIntegrityWarningVisible,
    dismissDeviceIntegrityWarning,
    error,
    openWebRegister,
    openWebSignIn,
    refreshSessionFromStorage,
    retryAppLockUnlock,
    session,
    setAppLockEnabled,
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
  const activeVoiceChannelId = voiceRoomState.channelId;
  const {
    bootstrapQuery,
    bootstrapState,
    bootstrapSyncState,
    channelMessagesQuery,
    channelMessagesState,
    channelSendState,
    channelSyncState,
    clearMessageSearch,
    dmMessagesQuery,
    dmMessagesState,
    dmSendState,
    dmSyncState,
    handleSearchMessages,
    handleSendChannelMessage,
    handleSendDMMessage,
    messageSearchState,
    refreshBootstrap,
    refreshChannelMessages,
    refreshDMMessages,
    refreshWorkspaceServer,
    resetChannelMessageMutation,
    resetDMMessageMutation,
    workspaceQuery,
    workspaceServerState,
    workspaceSyncState,
  } = useMobileMessagingFeature({
    activeWorkspaceTextChannelId,
    apiClient,
    currentUser: session?.user ?? null,
    isSignedIn: status === "signed-in",
    selectedDMConversationId,
    selectedWorkspaceServerId,
    stopChannelTyping,
  });
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
  const {
    handleAcceptVoiceInvite,
    handleDeclineVoiceInvite,
    handleSendVoiceInvite,
    voiceInviteEntries,
    voiceInviteSendStates,
  } = useMobileVoiceInviteFeature({
    emitVoiceInviteAccept,
    emitVoiceInviteDecline,
    emitVoiceInviteSend,
    joinVoiceChannel,
    onOpenVoiceInvite: handleOpenVoiceInvite,
    subscribe: subscribeRealtime,
    syncParticipantAudioLevelFromServer,
    syncParticipantsFromServer,
    voiceChannelId: voiceRoomState.channelId,
    voiceServerId: voiceRoomState.serverId,
  });
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
    appLockAvailability,
    appLockEnabled,
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
    onToggleAppLock: (enabled: boolean) => void setAppLockEnabled(enabled),
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
                    {appLockLocked ? (
                      <MobileAppLockScreen
                        onRetry={() => void retryAppLockUnlock()}
                        onSignOut={() => void signOut()}
                        visible
                      />
                    ) : (
                      <>
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
                      </>
                    )}
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
