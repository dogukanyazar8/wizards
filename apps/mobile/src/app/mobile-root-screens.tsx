import type { ReactNode } from "react";
import { View } from "react-native";

import { getVisibleMobileSyncHealth } from "./mobile-screen-sync";
import {
  MobileVoiceInviteOverlay,
  styles,
  type ActiveScreenProps,
} from "./mobile-root-screens-legacy";
import { MessagesScreen } from "./screens/dm-screen";
import { OverviewScreen } from "./screens/home-screen";
import { NotificationsScreen } from "./screens/notifications-screen";
import { ProfileSettingsScreen } from "./screens/settings-screen";
import { VoiceScreen } from "./screens/voice-screen";

export { AuthGate } from "./mobile-root-screens-legacy";
export type { ActiveScreenProps } from "./mobile-root-screens-legacy";

export function ActiveScreen({
  authStatusLabel,
  bootstrapState,
  bootstrapSyncState,
  channelMessagesState,
  channelSendState,
  channelTypingLabel,
  channelSyncState,
  currentTab,
  dmMessagesState,
  dmSendState,
  dmSyncState,
  error,
  locale,
  mediaState,
  messageSearchState,
  notificationState,
  voiceState,
  voiceRoomState,
  voiceInvites,
  voiceInviteSendStates,
  activeWorkspaceTextChannelId,
  activeWorkspaceVoiceChannelId,
  onAcceptVoiceInvite,
  onOpenDMConversation,
  onCloseDMConversation,
  onCloseWorkspaceChannel,
  onCloseWorkspaceVoiceChannel,
  onOpenWebRegister,
  onOpenWebSignIn,
  onOpenCookies,
  onOpenPrivacyPolicy,
  onOpenSupport,
  onOpenTerms,
  onOpenWorkspaceChannel,
  onOpenWorkspaceServer,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onRefreshBootstrap,
  onRefreshChannelMessages,
  onRefreshDMConversation,
  onRefreshWorkspaceServer,
  onRequestNotificationPermission,
  onRequestPhotoLibraryPermission,
  onRequestVoicePermission,
  onLeaveVoiceChannel,
  onLeaveWorkspaceVoiceChannel,
  onSelectVoiceAudioOutput,
  onToggleVoiceCamera,
  onToggleVoiceMute,
  onDeclineVoiceInvite,
  onChannelDraftChange,
  onRefresh,
  onRefreshVisibleData,
  onSendChannelMessage,
  onSendDMMessage,
  onSendVoiceInvite,
  onSelectLocale,
  onSearchMessages,
  onSignOut,
  permissionReadiness,
  permissionSummary,
  selectedDMConversation,
  selectedDMConversationId,
  selectedWorkspaceChannelId,
  selectedWorkspaceServerId,
  signedInUserLabel,
  status,
  workspaceServerState,
  workspaceSyncState,
}: ActiveScreenProps) {
  const syncHealth = getVisibleMobileSyncHealth({
    bootstrapSyncState,
    channelSyncState,
    currentTab,
    dmSyncState,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    workspaceSyncState,
  });

  const renderWithVoiceInviteOverlay = (content: ReactNode) => (
    <View style={styles.activeScreenFrame}>
      {content}
      <MobileVoiceInviteOverlay
        invites={voiceInvites}
        onAccept={onAcceptVoiceInvite}
        onDecline={onDeclineVoiceInvite}
      />
    </View>
  );

  switch (currentTab) {
    case "messages":
      return renderWithVoiceInviteOverlay(
        <MessagesScreen
          bootstrapState={bootstrapState}
          dmMessagesState={dmMessagesState}
          dmSendState={dmSendState}
          selectedConversation={selectedDMConversation}
          selectedConversationId={selectedDMConversationId}
          syncHealth={syncHealth}
          mediaState={mediaState}
          messageSearchState={messageSearchState}
          onCloseConversation={onCloseDMConversation}
          onClearMessageSearch={onClearMessageSearch}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onOpenConversation={onOpenDMConversation}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshConversation={onRefreshDMConversation}
          onRefreshVisibleData={onRefreshVisibleData}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onSearchMessages={onSearchMessages}
          onSendMessage={onSendDMMessage}
        />,
      );
    case "voice":
      return renderWithVoiceInviteOverlay(
        <VoiceScreen
          bootstrapState={bootstrapState}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          voiceState={voiceState}
          voiceRoomState={voiceRoomState}
          syncHealth={syncHealth}
          onLeaveVoiceChannel={onLeaveVoiceChannel}
          onRequestVoicePermission={onRequestVoicePermission}
          onToggleVoiceCamera={onToggleVoiceCamera}
          onToggleVoiceMute={onToggleVoiceMute}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshVisibleData={onRefreshVisibleData}
        />,
      );
    case "notifications":
      return renderWithVoiceInviteOverlay(
        <NotificationsScreen
          bootstrapState={bootstrapState}
          notificationState={notificationState}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          syncHealth={syncHealth}
          onRequestNotificationPermission={onRequestNotificationPermission}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshVisibleData={onRefreshVisibleData}
        />,
      );
    case "settings":
      return renderWithVoiceInviteOverlay(
        <ProfileSettingsScreen
          authStatusLabel={authStatusLabel}
          bootstrapState={bootstrapState}
          error={error}
          mediaState={mediaState}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          signedInUserLabel={signedInUserLabel}
          locale={locale}
          status={status}
          syncHealth={syncHealth}
          onOpenWebRegister={onOpenWebRegister}
          onOpenWebSignIn={onOpenWebSignIn}
          onOpenCookies={onOpenCookies}
          onOpenPrivacyPolicy={onOpenPrivacyPolicy}
          onOpenSupport={onOpenSupport}
          onOpenTerms={onOpenTerms}
          onRefresh={onRefresh}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshVisibleData={onRefreshVisibleData}
          onRequestCameraPermission={onRequestCameraPermission}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestNotificationPermission={onRequestNotificationPermission}
          onRequestPhotoLibraryPermission={onRequestPhotoLibraryPermission}
          onSelectLocale={onSelectLocale}
          onSignOut={onSignOut}
        />,
      );
    case "overview":
    default:
      return renderWithVoiceInviteOverlay(
        <OverviewScreen
          bootstrapState={bootstrapState}
          channelMessagesState={channelMessagesState}
          channelSendState={channelSendState}
          channelTypingLabel={channelTypingLabel}
          activeWorkspaceTextChannelId={activeWorkspaceTextChannelId}
          activeWorkspaceVoiceChannelId={activeWorkspaceVoiceChannelId}
          selectedWorkspaceChannelId={selectedWorkspaceChannelId}
          selectedWorkspaceServerId={selectedWorkspaceServerId}
          syncHealth={syncHealth}
          workspaceServerState={workspaceServerState}
          mediaState={mediaState}
          messageSearchState={messageSearchState}
          voiceRoomState={voiceRoomState}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onClearMessageSearch={onClearMessageSearch}
          onCloseWorkspaceChannel={onCloseWorkspaceChannel}
          onCloseWorkspaceVoiceChannel={onCloseWorkspaceVoiceChannel}
          onLeaveWorkspaceVoiceChannel={onLeaveWorkspaceVoiceChannel}
          onOpenWorkspaceChannel={onOpenWorkspaceChannel}
          onOpenWorkspaceServer={onOpenWorkspaceServer}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshChannelMessages={onRefreshChannelMessages}
          onRefreshVisibleData={onRefreshVisibleData}
          onRefreshWorkspaceServer={onRefreshWorkspaceServer}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onSelectVoiceAudioOutput={onSelectVoiceAudioOutput}
          onToggleVoiceMute={onToggleVoiceMute}
          voiceInviteSendStates={voiceInviteSendStates}
          onChannelDraftChange={onChannelDraftChange}
          onSearchMessages={onSearchMessages}
          onSendChannelMessage={onSendChannelMessage}
          onSendVoiceInvite={onSendVoiceInvite}
        />,
      );
  }
}
