import { useMemo, type ComponentType } from "react";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../config/environment";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import type { MobileTabId } from "../navigation/mobile-navigation";
import { useMobileSocialMutations } from "../social/mobile-social-query";
import { openMobileVoiceRoom } from "../voice/mobile-voice-room-route-navigation";
import { MobileOverlayContentScope, MobileOverlayHost } from "./components/kit/overlay-host";
import { MobileAppLockScreen } from "./components/mobile-app-lock-screen";
import { MobileDeviceIntegrityWarning } from "./components/mobile-device-integrity-warning";
import { createMobileNotificationsScreenProps } from "./features/mobile-notification-actions";
import { useMobileSettingsScreenProps } from "./features/use-mobile-settings-screen-props";
import { useMobileVoiceScreenProps } from "./features/use-mobile-voice-screen-props";
import { MobileAppShell } from "./mobile-app-shell";
import { useMobileDirectCallActions } from "./features/use-mobile-direct-call-actions";
import { useMobileMessagingFeature } from "./features/use-mobile-messaging-feature";
import { useMobilePermissionSummary } from "./features/use-mobile-permission-summary";
import { useMobileProductLinks } from "./features/use-mobile-product-links";
import { useMobileDMCallFeature } from "./features/use-mobile-dm-call-feature";
import { useMobileVoiceInviteFeature } from "./features/use-mobile-voice-invite-feature";
import { MobileIncomingRequestSheet } from "./overlays/mobile-incoming-request-sheet";
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
    readonly notificationUnreadCount?: number;
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
    emitDMCallAccept,
    emitDMCallCancel,
    emitDMCallDecline,
    emitDMCallEnd,
    emitDMCallStart,
    emitVoiceInviteAccept,
    emitVoiceInviteDecline,
    emitVoiceInviteSend,
    stopChannelTyping,
    stopDMTyping,
    subscribe: subscribeRealtime,
    updateChannelTyping,
    updateDMTyping,
  } = useMobileRealtimeRuntime();
  const voiceRuntime = useMobileVoiceRuntime();
  const {
    activeWorkspaceTextChannelId,
    activeWorkspaceVoiceChannelId,
    bootstrapState,
    channelFirstUnreadMessageId,
    channelMessagesState,
    channelPinnedMessages,
    clearMessageSearch,
    currentTab,
    directMessageUnreadCount,
    dmConversations,
    dmConversationsQuery,
    dmMessagesQuery,
    loadMoreChannelMessages,
    loadMoreDMConversations,
    loadMoreDMMessages,
    notificationUnreadCount,
    dmMessagesState,
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
    isChannelMessageActionPending,
    isDMReactionPending,
    isDMMessageActionPending,
    messageSearchState,
    productNavigationActions,
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
  const { openCookies, openPrivacyPolicy, openSupport, openTerms } = useMobileProductLinks(
    runtimeConfig.webUrl,
  );
  const {
    acceptCall: handleAcceptDMCall,
    declineCall: handleDeclineDMCall,
    incomingCall: incomingDMCall,
    incomingCallAlertsEnabled,
    startCall: startDMCall,
  } = useMobileDMCallFeature({
    emitDMCallAccept,
    emitDMCallCancel,
    emitDMCallDecline,
    emitDMCallEnd,
    emitDMCallStart,
    joinDirectCall: voiceRuntime.joinDirectCall,
    leaveVoiceChannel: voiceRuntime.leaveVoiceChannel,
    subscribe: subscribeRealtime,
  });
  const { onStartVideoCall, onStartVoiceCall } = useMobileDirectCallActions({
    selectedConversation: selectedDMConversation,
    startCall: startDMCall,
  });
  // getSyncHealth() builds a fresh object per call, so memoize per tab to keep
  // the screen-props objects below stable when nothing else changed.
  const messagesSyncHealth = useMemo(() => getSyncHealth("messages"), [getSyncHealth]);
  const overviewSyncHealth = useMemo(() => getSyncHealth("overview"), [getSyncHealth]);
  const notificationsSyncHealth = useMemo(() => getSyncHealth("notifications"), [getSyncHealth]);
  const settingsSyncHealth = useMemo(() => getSyncHealth("settings"), [getSyncHealth]);
  const dmConversationsHasNextPage = dmConversationsQuery.hasNextPage;
  const dmConversationsIsLoading = dmConversationsQuery.isLoading;
  // Memoized so the messages tab only re-renders when its own inputs change —
  // not on every unrelated product-app render (e.g. voice-level ticks).
  const messagesScreenProps = useMemo<MobileMessagesScreenProps>(
    () => ({
      bootstrapState,
      dmConversations,
      getAccessToken,
      dmConversationsHasNextPage,
      dmConversationsIsLoading,
      onLoadMoreConversations: loadMoreDMConversations,
      onLoadMoreMessages: loadMoreDMMessages,
      dmMessagesState,
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
      onDiscardMessage: handleDiscardDMMessage,
      onEditMessage: handleEditDMMessage,
      onForwardMessage: handleForwardMessage,
      onDraftChange: handleDMDraftChange,
      onRetryMessage: handleRetryDMMessage,
      onToggleMessageReaction: handleToggleDMMessageReaction,
      selectedConversation: selectedDMConversation,
      selectedConversationId: selectedDMConversationId,
      syncHealth: messagesSyncHealth,
    }),
    [
      bootstrapState,
      dmConversations,
      getAccessToken,
      dmConversationsHasNextPage,
      dmConversationsIsLoading,
      loadMoreDMConversations,
      loadMoreDMMessages,
      dmMessagesState,
      isDMReactionPending,
      isDMMessageActionPending,
      mediaState,
      handleClearSelectedMediaAsset,
      handleCloseDMConversation,
      handleOpenDMConversation,
      refreshBootstrap,
      refreshDMMessages,
      refreshVisibleMobileData,
      handleRequestDocumentPicker,
      handleRequestPhotoLibraryPicker,
      onStartVideoCall,
      onStartVoiceCall,
      handleSendDMMessage,
      handleSendDMGif,
      handleDeleteDMMessage,
      handleDiscardDMMessage,
      handleEditDMMessage,
      handleForwardMessage,
      handleDMDraftChange,
      handleRetryDMMessage,
      handleToggleDMMessageReaction,
      selectedDMConversation,
      selectedDMConversationId,
      messagesSyncHealth,
    ],
  );
  const overviewScreenProps = useMemo<MobileOverviewScreenProps>(
    () => ({
      activeWorkspaceTextChannelId,
      activeWorkspaceVoiceChannelId,
      bootstrapState,
      channelFirstUnreadMessageId,
      channelMessagesState,
      channelPinnedMessages,
      isReactionMutationPending: isChannelReactionPending || isChannelMessageActionPending,
      locale: mobileLocale,
      mediaState,
      messageSearchState,
      onChannelDraftChange: handleChannelDraftChange,
      onClearMessageSearch: clearMessageSearch,
      onClearSelectedMediaAsset: handleClearSelectedMediaAsset,
      onCloseWorkspaceChannel: handleCloseWorkspaceChannel,
      onLoadMoreChannelMessages: loadMoreChannelMessages,
      onOpenWorkspaceChannel: handleOpenWorkspaceChannel,
      onOpenWorkspaceServer: handleOpenWorkspaceServer,
      onRefreshBootstrap: refreshBootstrap,
      onRefreshChannelMessages: refreshChannelMessages,
      onRefreshVisibleData: refreshVisibleMobileData,
      onRefreshWorkspaceServer: refreshWorkspaceServer,
      onRequestDocumentPicker: handleRequestDocumentPicker,
      onRequestPhotoLibraryPicker: handleRequestPhotoLibraryPicker,
      onSearchMessages: handleSearchMessages,
      onSendChannelMessage: handleSendChannelMessage,
      onSendChannelGif: handleSendChannelGif,
      onDeleteMessage: handleDeleteChannelMessage,
      onDiscardMessage: handleDiscardChannelMessage,
      onEditMessage: handleEditChannelMessage,
      onForwardMessage: handleForwardMessage,
      onPinMessage: handlePinMessage,
      onRetryMessage: handleRetryChannelMessage,
      onToggleMessageReaction: handleToggleChannelMessageReaction,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      syncHealth: overviewSyncHealth,
      workspaceServerState,
    }),
    [
      activeWorkspaceTextChannelId,
      activeWorkspaceVoiceChannelId,
      bootstrapState,
      channelFirstUnreadMessageId,
      channelMessagesState,
      channelPinnedMessages,
      isChannelReactionPending,
      isChannelMessageActionPending,
      mobileLocale,
      mediaState,
      messageSearchState,
      handleChannelDraftChange,
      clearMessageSearch,
      handleClearSelectedMediaAsset,
      handleCloseWorkspaceChannel,
      loadMoreChannelMessages,
      handleOpenWorkspaceChannel,
      handleOpenWorkspaceServer,
      refreshBootstrap,
      refreshChannelMessages,
      refreshVisibleMobileData,
      refreshWorkspaceServer,
      handleRequestDocumentPicker,
      handleRequestPhotoLibraryPicker,
      handleSearchMessages,
      handleSendChannelMessage,
      handleSendChannelGif,
      handleDeleteChannelMessage,
      handleDiscardChannelMessage,
      handleEditChannelMessage,
      handleForwardMessage,
      handlePinMessage,
      handleRetryChannelMessage,
      handleToggleChannelMessageReaction,
      selectedWorkspaceChannelId,
      selectedWorkspaceServerId,
      overviewSyncHealth,
      workspaceServerState,
    ],
  );
  const joinVoiceChannel = voiceRuntime.joinVoiceChannel;
  const notificationsScreenProps = useMemo(
    () =>
      createMobileNotificationsScreenProps({
        bootstrapState,
        joinVoiceChannel,
        notificationState,
        onRefreshBootstrap: refreshBootstrap,
        onRefreshVisibleData: refreshVisibleMobileData,
        onRequestNotificationPermission: handleRequestNotificationPermission,
        permissionReadiness,
        permissionSummary,
        syncHealth: notificationsSyncHealth,
      }),
    [
      bootstrapState,
      joinVoiceChannel,
      notificationState,
      refreshBootstrap,
      refreshVisibleMobileData,
      handleRequestNotificationPermission,
      permissionReadiness,
      permissionSummary,
      notificationsSyncHealth,
    ],
  );
  const settingsScreenProps = useMobileSettingsScreenProps({
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
    syncHealth: settingsSyncHealth,
    voiceInputMode: voiceRuntime.voiceInputMode,
  });
  const voiceScreenProps = useMobileVoiceScreenProps({
    apiClient,
    bootstrapState,
    currentUserId: session?.user.id ?? null,
    inviteSendStates: voiceInviteSendStates,
    onLeaveVoiceChannel: handleLeaveWorkspaceVoiceChannel,
    onSendInvite: handleSendVoiceInvite,
    voiceRuntime,
  });
  return (
    <MobileProductNavigationProvider value={productNavigationActions}>
      <MobileMessagesScreenProvider value={messagesScreenProps}>
        <MobileNotificationsScreenProvider value={notificationsScreenProps}>
          <MobileOverviewScreenProvider value={overviewScreenProps}>
            <MobileSettingsScreenProvider value={settingsScreenProps}>
              <MobileVoiceScreenProvider value={voiceScreenProps}>
                <MobileAppShell authStatus={status}>
                  <MobileOverlayContentScope style={{ flex: 1, minWidth: 0 }}>
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
                          notificationUnreadCount={notificationUnreadCount}
                          onTabChange={setCurrentTab}
                        />
                        <MobileIncomingRequestSheet
                          call={incomingDMCall}
                          invites={voiceInviteEntries}
                          onAcceptCall={() => void handleAcceptDMCall()}
                          onAcceptInvite={handleAcceptVoiceInvite}
                          onDeclineCall={() => void handleDeclineDMCall()}
                          onDeclineInvite={handleDeclineVoiceInvite}
                          vibrationEnabled={incomingCallAlertsEnabled}
                        />
                      </>
                    )}
                  </MobileOverlayContentScope>
                </MobileAppShell>
                <MobileOverlayHost />
              </MobileVoiceScreenProvider>
            </MobileSettingsScreenProvider>
          </MobileOverviewScreenProvider>
        </MobileNotificationsScreenProvider>
      </MobileMessagesScreenProvider>
    </MobileProductNavigationProvider>
  );
}
