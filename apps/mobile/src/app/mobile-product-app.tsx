import { type ComponentType } from "react";
import { View } from "react-native";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../config/environment";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import type { MobileTabId } from "../navigation/mobile-navigation";
import { MobileAppLockScreen } from "./components/mobile-app-lock-screen";
import { MobileDeviceIntegrityWarning } from "./components/mobile-device-integrity-warning";
import { MobileAppShell } from "./mobile-app-shell";
import { useMobileMessagingFeature } from "./features/use-mobile-messaging-feature";
import { useMobilePermissionSummary } from "./features/use-mobile-permission-summary";
import { useMobileProductLinks } from "./features/use-mobile-product-links";
import { useMobileVoiceInviteFeature } from "./features/use-mobile-voice-invite-feature";
import { useMobileTypingLabels } from "./features/use-mobile-typing-labels";
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
    dmTyping: dmTypingState,
    stopChannelTyping,
    stopDMTyping,
    subscribe: subscribeRealtime,
    typing: channelTypingState,
    updateChannelTyping,
    updateDMTyping,
  } = useMobileRealtimeRuntime();
  const {
    beginPushToTalk,
    endPushToTalk,
    flipCamera: flipVoiceCamera,
    joinVoiceChannel,
    leaveVoiceChannel,
    permissionState: voiceState,
    pushToTalkState: voicePushToTalkState,
    requestMicrophonePermission: handleRequestVoicePermission,
    roomState: voiceRoomState,
    refreshVoiceDevices,
    selectAudioDeviceOutput: selectVoiceAudioOutputDevice,
    selectAudioInput: selectVoiceAudioInput,
    selectAudioOutput: selectVoiceAudioOutput,
    selectNoiseSuppression: selectVoiceNoiseSuppression,
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
    handleDeleteChannelMessage,
    handleDeleteDMMessage,
    handleDMDraftChange,
    handleEditChannelMessage,
    handleEditDMMessage,
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
    handleSendChannelGif,
    handleSendDMMessage,
    handleSendDMGif,
    handleToggleChannelMessageReaction,
    handleToggleDMMessageReaction,
    isChannelReactionPending,
    isChannelMessageActionPending,
    isDMReactionPending,
    isDMMessageActionPending,
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
    stopDMTyping,
    updateChannelTyping,
    updateDMTyping,
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
  const authStatusLabel =
    status === "checking"
      ? copy.authChecking
      : status === "signed-in"
        ? copy.authSignedIn
        : copy.authSignedOut;
  const signedInUserLabel = session ? (session.user.displayName ?? session.user.username) : null;
  const mobileShellUnreadCount =
    bootstrapState.status === "ready" ? bootstrapState.payload.home.directMessages.unreadCount : 0;
  const { channelTypingLabel, dmTypingLabel } = useMobileTypingLabels({
    channelId: selectedWorkspaceChannelId,
    channelTyping: channelTypingState,
    conversationId: selectedDMConversationId,
    dmTyping: dmTypingState,
  });
  const { openCookies, openPrivacyPolicy, openSupport, openTerms } = useMobileProductLinks(
    runtimeConfig.webUrl,
  );
  const messagesScreenProps: MobileMessagesScreenProps = {
    bootstrapState,
    dmMessagesState,
    dmSendState,
    dmTypingLabel,
    isReactionMutationPending: isDMReactionPending || isDMMessageActionPending,
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
    onSendGif: handleSendDMGif,
    onDeleteMessage: handleDeleteDMMessage,
    onEditMessage: handleEditDMMessage,
    onDraftChange: handleDMDraftChange,
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
    isReactionMutationPending: isChannelReactionPending || isChannelMessageActionPending,
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
    onFlipVoiceCamera: flipVoiceCamera,
    onLeaveWorkspaceVoiceChannel: handleLeaveWorkspaceVoiceChannel,
    onOpenWorkspaceChannel: handleOpenWorkspaceChannel,
    onOpenWorkspaceServer: handleOpenWorkspaceServer,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshChannelMessages: refreshChannelMessages,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRefreshWorkspaceServer: refreshWorkspaceServer,
    onRefreshVoiceDevices: refreshVoiceDevices,
    onRequestDocumentPicker: handleRequestDocumentPicker,
    onRequestPhotoLibraryPicker: handleRequestPhotoLibraryPicker,
    onSearchMessages: handleSearchMessages,
    onSelectVoiceAudioOutput: selectVoiceAudioOutput,
    onSelectVoiceAudioInput: selectVoiceAudioInput,
    onSelectVoiceAudioOutputDevice: selectVoiceAudioOutputDevice,
    onSelectVoiceNoiseSuppression: selectVoiceNoiseSuppression,
    onSendChannelMessage: handleSendChannelMessage,
    onSendChannelGif: handleSendChannelGif,
    onDeleteMessage: handleDeleteChannelMessage,
    onEditMessage: handleEditChannelMessage,
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
    onRequestCameraPermission: async () => {
      await handleRequestCameraPermission();
    },
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
    socialActionsEnabled: status === "signed-in",
    status,
    syncHealth: getSyncHealth("settings"),
    voiceInputMode,
  };
  const voiceScreenProps: MobileVoiceScreenProps = {
    bootstrapState,
    onBeginVoicePushToTalk: beginPushToTalk,
    onEndVoicePushToTalk: endPushToTalk,
    onFlipVoiceCamera: flipVoiceCamera,
    onLeaveVoiceChannel: leaveVoiceChannel,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRefreshVoiceDevices: refreshVoiceDevices,
    onRequestVoicePermission: handleRequestVoicePermission,
    onSelectVoiceAudioInput: selectVoiceAudioInput,
    onSelectVoiceAudioOutputDevice: selectVoiceAudioOutputDevice,
    onSelectVoiceNoiseSuppression: selectVoiceNoiseSuppression,
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
