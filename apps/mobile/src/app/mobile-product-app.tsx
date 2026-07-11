import { type ComponentType, useEffect, useMemo } from "react";
import { View } from "react-native";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../config/environment";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import type { MobileTabId } from "../navigation/mobile-navigation";
import { installMobileFontDefaults, useOutfitFonts } from "../design/mobile-fonts";
import {
  getVisibleMobileChannelTypingUsers,
  formatMobileChannelTypingLabel,
} from "../realtime/mobile-typing-state";
import { MobileAppLockScreen } from "./components/mobile-app-lock-screen";
import { MobileDeviceIntegrityWarning } from "./components/mobile-device-integrity-warning";
import { MobileAppShell } from "./mobile-app-shell";
import { useMobileMessagingFeature } from "./features/use-mobile-messaging-feature";
import { useMobilePermissionSummary } from "./features/use-mobile-permission-summary";
import { useMobileProductLinks } from "./features/use-mobile-product-links";
import { useMobileVoiceInviteFeature } from "./features/use-mobile-voice-invite-feature";
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
  const {
    activeWorkspaceTextChannelId,
    activeWorkspaceVoiceChannelId,
    bootstrapState,
    channelMessagesState,
    channelSendState,
    clearMessageSearch,
    currentTab,
    dmMessagesState,
    dmSendState,
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
    handleToggleChannelMessageReaction,
    handleToggleDMMessageReaction,
    isChannelReactionPending,
    isDMReactionPending,
    messageSearchState,
    refreshBootstrap,
    refreshChannelMessages,
    refreshDMMessages,
    refreshVisibleMobileData,
    refreshWorkspaceServer,
    workspaceServerState,
    selectedDMConversation,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    setCurrentTab,
  } = useMobileMessagingFeature({
    activeVoiceChannelId: voiceRoomState.channelId,
    apiClient,
    currentUser: session?.user ?? null,
    isSignedIn: status === "signed-in",
    joinVoiceChannel,
    leaveVoiceChannel,
    stopChannelTyping,
    updateChannelTyping,
  });
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
  const { permissionReadiness, permissionSummary } = useMobilePermissionSummary({
    cameraStatus: mediaState.cameraStatus,
    microphoneStatus: voiceState.microphoneStatus,
    notificationStatus: notificationState.permissionStatus,
    photoLibraryStatus: mediaState.photoLibraryStatus,
  });

  useEffect(() => {
    if (fontsLoaded) {
      installMobileFontDefaults();
    }
  }, [fontsLoaded]);

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

  const { openCookies, openPrivacyPolicy, openSupport, openTerms } = useMobileProductLinks(
    runtimeConfig.webUrl,
  );

  const messagesScreenProps: MobileMessagesScreenProps = {
    bootstrapState,
    dmMessagesState,
    dmSendState,
    isReactionMutationPending: isDMReactionPending,
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
    onToggleMessageReaction: handleToggleDMMessageReaction,
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
    isReactionMutationPending: isChannelReactionPending,
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
    onToggleMessageReaction: handleToggleChannelMessageReaction,
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
