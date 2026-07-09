import type {
  MobileBootstrapPayload,
  MobileBootstrapViewState,
  MobileChannelMessagesViewState,
  MobileChannelSendViewState,
  MobileDMMessagesViewState,
  MobileDMSendViewState,
  MobileDeepLinkParseResult,
  MobileLocale,
  MobileMediaRuntimeState,
  MobileMessageSearchViewState,
  MobileNotificationRuntimeState,
  MobilePermissionReadiness,
  MobilePermissionSummary,
  MobilePushToTalkPhase,
  MobileSessionDiagnostics,
  MobileSyncSnapshot,
  MobileTabId,
  MobileVoiceAudioOutputMode,
  MobileVoiceInputMode,
  MobileVoiceInviteOverlayEntry,
  MobileVoiceInviteSendState,
  MobileVoiceRoomState,
  MobileVoiceRuntimeState,
  MobileWorkspaceChannelSummary,
  MobileWorkspaceServerViewState,
} from "./mobile-root-screen-shared";

export interface ActiveScreenProps {
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  bootstrapSyncState: MobileSyncSnapshot;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  channelTypingLabel: string | null;
  channelSyncState: MobileSyncSnapshot;
  currentTab: MobileTabId;
  dmMessagesState: MobileDMMessagesViewState;
  dmSendState: MobileDMSendViewState;
  dmSyncState: MobileSyncSnapshot;
  diagnostics: MobileSessionDiagnostics;
  error: string | null;
  lastDeepLink: MobileDeepLinkParseResult | null;
  locale: MobileLocale;
  mediaState: MobileMediaRuntimeState;
  messageSearchState: MobileMessageSearchViewState;
  notificationState: MobileNotificationRuntimeState;
  voiceState: MobileVoiceRuntimeState;
  voiceInputMode: MobileVoiceInputMode;
  voicePushToTalkPhase: MobilePushToTalkPhase;
  voiceRoomState: MobileVoiceRoomState;
  voiceInvites: readonly MobileVoiceInviteOverlayEntry[];
  voiceInviteSendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
  activeWorkspaceTextChannelId: string | null;
  activeWorkspaceVoiceChannelId: string | null;
  onAcceptVoiceInvite(inviteId: string): void;
  onOpenDMConversation(conversationId: string): void;
  onCloseDMConversation(): void;
  onCloseWorkspaceChannel(): void;
  onCloseWorkspaceVoiceChannel(): void;
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onOpenCookies(): void;
  onOpenPrivacyPolicy(): void;
  onOpenSupport(): void;
  onOpenTerms(): void;
  onOpenWorkspaceChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenWorkspaceServer(serverId: string): void;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onRefreshBootstrap(): void;
  onRefreshChannelMessages(): void;
  onRefreshDMConversation(): void;
  onRefreshWorkspaceServer(): void;
  onRefresh(): void;
  onRefreshVisibleData(): void;
  onRequestNotificationPermission(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
  onRequestVoicePermission(): Promise<void>;
  onLeaveVoiceChannel(): Promise<void>;
  onLeaveWorkspaceVoiceChannel(): Promise<void>;
  onBeginVoicePushToTalk(): Promise<void>;
  onEndVoicePushToTalk(): void;
  onSelectVoiceAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onSelectVoiceInputMode(mode: MobileVoiceInputMode): void;
  onToggleVoiceCamera(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  onToggleVoiceScreenShare(): Promise<void>;
  onDeclineVoiceInvite(inviteId: string): void;
  onChannelDraftChange(content: string): void;
  onSelectTab(tab: MobileTabId): void;
  onSendChannelMessage(content: string): Promise<boolean>;
  onSendDMMessage(content: string): Promise<boolean>;
  onSendVoiceInvite(targetUserId: string): void;
  onSelectLocale(locale: MobileLocale): void;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel" | "dm";
  }): Promise<void>;
  onSignOut(): void;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  selectedDMConversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  selectedDMConversationId: string | null;
  selectedWorkspaceChannelId: string | null;
  selectedWorkspaceServerId: string | null;
  signedInUserLabel: string | null;
  status: string;
  workspaceServerState: MobileWorkspaceServerViewState;
  workspaceSyncState: MobileSyncSnapshot;
}
