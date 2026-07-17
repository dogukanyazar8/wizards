import { type ComponentType } from "react";
import { View } from "react-native";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../config/environment";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import type { MobileTabId } from "../navigation/mobile-navigation";
import { useMobileSocialMutations } from "../social/mobile-social-query";
import { openMobileVoiceRoom } from "../voice/mobile-voice-room-route-navigation";
import { MobileAppLockScreen } from "./components/mobile-app-lock-screen";
import { MobileDeviceIntegrityWarning } from "./components/mobile-device-integrity-warning";
import { createMobileVoiceScreenProps } from "./features/mobile-active-voice-room";
import { createMobileNotificationsScreenProps } from "./features/mobile-notification-actions";
import { createMobileSettingsScreenProps } from "./features/mobile-settings-screen-props";
import { MobileAppShell } from "./mobile-app-shell";
import { useMobileDirectCallActions } from "./features/use-mobile-direct-call-actions";
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
  type MobileOverviewScreenProps,
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
    diagnostics,
    dismissDeviceIntegrityWarning,
    error,
    getAccessToken,
    openWebRegister,
    openWebSignIn,
    refreshSessionFromStorage,
    retryAppLockUnlock,
    session,
    setAppLockEnabled,
    signOut,
    status,
  } = useMobileAuth();
  const socialMutations = useMobileSocialMutations(apiClient);
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
  const voiceRuntime = useMobileVoiceRuntime();
  const {
    activeWorkspaceTextChannelId,
    activeWorkspaceVoiceChannelId,
    bootstrapState,
    channelMessagesState,
    channelSendState,
    clearMessageSearch,
    currentTab,
    directMessageUnreadCount,
    dmConversations,
    dmConversationsQuery,
    dmMessagesQuery,
    loadMoreDMConversations,
    loadMoreDMMessages,
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
    activeVoiceChannelId: voiceRuntime.roomState.channelId,
    apiClient,
    currentUser: session?.user ?? null,
    isSignedIn: status === "signed-in",
    joinVoiceChannel: voiceRuntime.joinVoiceChannel,
    leaveVoiceChannel: voiceRuntime.leaveVoiceChannel,
    requestMicrophonePermission: voiceRuntime.requestMicrophonePermission,
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
    joinVoiceChannel: voiceRuntime.joinVoiceChannel,
    onOpenVoiceInvite: handleOpenVoiceInvite,
    onVoiceRoomJoined: openMobileVoiceRoom,
    subscribe: subscribeRealtime,
    syncParticipantAudioLevelFromServer: voiceRuntime.syncParticipantAudioLevelFromServer,
    syncParticipantsFromServer: voiceRuntime.syncParticipantsFromServer,
    voiceChannelId: voiceRuntime.roomState.channelId,
    voiceServerId: voiceRuntime.roomState.serverId,
  });
  const { permissionReadiness, permissionSummary } = useMobilePermissionSummary({
    cameraStatus: mediaState.cameraStatus,
    microphoneStatus: voiceRuntime.permissionState.microphoneStatus,
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
  const { channelTypingLabel, channelTypingUsers, dmTypingLabel } = useMobileTypingLabels({
    channelId: selectedWorkspaceChannelId,
    channelTyping: channelTypingState,
    conversationId: selectedDMConversationId,
    dmTyping: dmTypingState,
  });
  const { openCookies, openPrivacyPolicy, openSupport, openTerms } = useMobileProductLinks(
    runtimeConfig.webUrl,
  );
  const { onStartVideoCall, onStartVoiceCall } = useMobileDirectCallActions({
    joinDirectCall: voiceRuntime.joinDirectCall,
    selectedConversation: selectedDMConversation,
  });
  const messagesScreenProps: MobileMessagesScreenProps = {
    bootstrapState,
    dmConversations,
    getAccessToken,
    dmConversationsHasNextPage: dmConversationsQuery.hasNextPage,
    dmConversationsIsLoading: dmConversationsQuery.isLoading,
    onLoadMoreConversations: loadMoreDMConversations,
    onLoadMoreMessages: loadMoreDMMessages,
    dmMessagesState,
    dmSendState,
    dmTypingLabel,
    isReactionMutationPending: isDMReactionPending || isDMMessageActionPending,
    mediaState,
    onClearSelectedMediaAsset: handleClearSelectedMediaAsset,
    onCloseConversation: handleCloseDMConversation,
    onOpenConversation: handleOpenDMConversation,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshConversation: refreshDMMessages,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRequestDocumentPicker: handleRequestDocumentPicker,
    onRequestPhotoLibraryPicker: handleRequestPhotoLibraryPicker,
    onStartVideoCall,
    onStartVoiceCall,
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
    channelTypingUsers,
    locale: mobileLocale,
    mediaState,
    messageSearchState,
    onBeginVoicePushToTalk: voiceRuntime.beginPushToTalk,
    onChannelDraftChange: handleChannelDraftChange,
    onClearMessageSearch: clearMessageSearch,
    onClearSelectedMediaAsset: handleClearSelectedMediaAsset,
    onCloseWorkspaceChannel: handleCloseWorkspaceChannel,
    onCloseWorkspaceVoiceChannel: handleCloseWorkspaceVoiceChannel,
    onEndVoicePushToTalk: voiceRuntime.endPushToTalk,
    onFlipVoiceCamera: voiceRuntime.flipCamera,
    onLeaveWorkspaceVoiceChannel: handleLeaveWorkspaceVoiceChannel,
    onOpenWorkspaceChannel: handleOpenWorkspaceChannel,
    onOpenWorkspaceServer: handleOpenWorkspaceServer,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshChannelMessages: refreshChannelMessages,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRefreshWorkspaceServer: refreshWorkspaceServer,
    onRefreshVoiceDevices: voiceRuntime.refreshVoiceDevices,
    onRequestDocumentPicker: handleRequestDocumentPicker,
    onRequestPhotoLibraryPicker: handleRequestPhotoLibraryPicker,
    onSearchMessages: handleSearchMessages,
    onSelectVoiceAudioOutput: voiceRuntime.selectAudioOutput,
    onSelectVoiceAudioInput: voiceRuntime.selectAudioInput,
    onSelectVoiceAudioOutputDevice: voiceRuntime.selectAudioDeviceOutput,
    onSelectVoiceNoiseSuppression: voiceRuntime.selectNoiseSuppression,
    onSendChannelMessage: handleSendChannelMessage,
    onSendChannelGif: handleSendChannelGif,
    onDeleteMessage: handleDeleteChannelMessage,
    onEditMessage: handleEditChannelMessage,
    onToggleMessageReaction: handleToggleChannelMessageReaction,
    onSendVoiceInvite: handleSendVoiceInvite,
    onToggleVoiceCamera: voiceRuntime.toggleCamera,
    onToggleVoiceMute: voiceRuntime.toggleMute,
    onToggleVoiceScreenShare: voiceRuntime.toggleScreenShare,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    syncHealth: getSyncHealth("overview"),
    voiceInputMode: voiceRuntime.voiceInputMode,
    voiceInviteSendStates,
    voicePushToTalkPhase: voiceRuntime.pushToTalkState.phase,
    voiceRoomState: voiceRuntime.roomState,
    workspaceServerState,
  };
  const notificationsScreenProps = createMobileNotificationsScreenProps({
    bootstrapState,
    joinVoiceChannel: voiceRuntime.joinVoiceChannel,
    notificationState,
    onRefreshBootstrap: refreshBootstrap,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRequestNotificationPermission: handleRequestNotificationPermission,
    permissionReadiness,
    permissionSummary,
    syncHealth: getSyncHealth("notifications"),
  });
  const settingsScreenProps = createMobileSettingsScreenProps({
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
    onRefreshBootstrap: refreshBootstrap,
    onRefreshSession: refreshSessionFromStorage,
    onRefreshVisibleData: refreshVisibleMobileData,
    onRequestCameraPermission: handleRequestCameraPermission,
    onRequestDocumentPicker: handleRequestDocumentPicker,
    onRequestNotificationPermission: handleRequestNotificationPermission,
    onRequestPhotoLibraryPermission: handleRequestPhotoLibraryPermission,
    onSelectLocale: handleSelectMobileLocale,
    onSelectVoiceInputMode: voiceRuntime.selectVoiceInputMode,
    onSetAppLockEnabled: setAppLockEnabled,
    onSignOut: signOut,
    onUpdatePresence: socialMutations.updatePresence.mutateAsync,
    openWebRegister,
    openWebSignIn,
    permissionReadiness,
    permissionSummary,
    sessionDiagnostics: diagnostics,
    signedInUserLabel,
    status,
    syncHealth: getSyncHealth("settings"),
    voiceInputMode: voiceRuntime.voiceInputMode,
  });
  const voiceScreenProps = createMobileVoiceScreenProps({
    bootstrapState,
    onBeginVoicePushToTalk: voiceRuntime.beginPushToTalk,
    onEndVoicePushToTalk: voiceRuntime.endPushToTalk,
    onLeaveVoiceChannel: handleLeaveWorkspaceVoiceChannel,
    onOpenVoiceInvite: handleOpenVoiceInvite,
    onSelectVoiceAudioOutput: voiceRuntime.selectAudioOutput,
    onToggleVoiceMute: voiceRuntime.toggleMute,
    voiceInputMode: voiceRuntime.voiceInputMode,
    voicePushToTalkPhase: voiceRuntime.pushToTalkState.phase,
    voiceRoomState: voiceRuntime.roomState,
  });
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
                          directMessageUnreadCount={directMessageUnreadCount}
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
