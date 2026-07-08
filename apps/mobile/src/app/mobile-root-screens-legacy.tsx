import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import mobilePackageJson from "../../package.json";
import type {
  ChatMessage,
  MobileBootstrapFeature,
  MobileBootstrapPayload,
  MobileChannelMessagesResponse,
  MobileDMMessagesResponse,
  MessageSearchResult,
  MobileWorkspaceChannelSummary,
} from "@wizards/types";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { MobileSessionDiagnostics } from "../auth/session-types";
import { MOBILE_BOOTSTRAP_ENDPOINT } from "../bootstrap/mobile-bootstrap";
import { getMobileRuntimeConfig } from "../config/environment";
import type { MobileDeepLinkParseResult } from "../deep-link/mobile-deep-links";
import { mobileColors, mobileRadii, mobileSizing, mobileSpacing } from "../design/tokens";
import { MOBILE_DM_MESSAGES_LIMIT } from "../dm/mobile-dm-client";
import {
  MOBILE_LOCALE_OPTIONS,
  activeMobileCopy,
  type MobileLocale,
} from "../locale/mobile-locale-preferences";
import {
  getMobileAttachmentDraftSendGuard,
  summarizeMobileMediaRuntimeState,
  type MobileMediaRuntimeState,
} from "../media/mobile-media-contract";
import { getMobileAttachmentUploadReadiness } from "../media/mobile-attachment-upload-contract";
import {
  getMobileInviteReadiness,
  type MobileInviteReadiness,
} from "../invite/mobile-invite-contract";
import type { MobileTabId } from "../navigation/mobile-navigation";
import {
  summarizeMobileNotificationRuntimeState,
  type MobileNotificationRuntimeState,
} from "../notifications/mobile-notification-contract";
import {
  summarizeMobileVoiceRuntimeState,
  type MobileVoiceRuntimeState,
} from "../voice/mobile-voice-contract";
import { MobileVoiceRoomPanel } from "../voice/mobile-voice-room-panel";
import type {
  MobileVoiceAudioOutputMode,
  MobileVoiceInviteCandidate,
  MobileVoiceInviteSendState,
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../voice/mobile-voice-room-contract";
import { getMobileVoiceInviteCandidates } from "../voice/mobile-voice-room-contract";
import type {
  MobilePermissionIntentId,
  MobilePermissionReadiness,
  MobilePermissionSummary,
} from "../permissions/mobile-permission-contract";
import {
  getMobilePermissionNativeMetadata,
  getPermissionReadinessForFeature,
} from "../permissions/mobile-permission-contract";
import {
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_QA_DEVICE_MATRIX,
  summarizeMobileQualityGate,
} from "../quality/mobile-quality-gate";
import { MOBILE_RELEASE_BUDGETS } from "../release/mobile-release-contract";
import {
  MOBILE_PRODUCTION_READINESS_GATES,
  summarizeMobileProductionReadiness,
} from "../release/mobile-production-readiness";
import { validateMobileStoreReadiness } from "../release/mobile-store-contract";
import {
  formatMobileSyncAge,
  isMobileSyncStale,
  type MobileSyncHealthSummary,
  type MobileSyncSnapshot,
} from "../sync/mobile-sync-contract";
import {
  filterMobileConversations,
  formatMobileDisplayTime,
  getBoundedMobileList,
  getMobileChannelChatHeaderModel,
  getMobileChannelChatSearchVisibility,
  getMobileChannelPriority,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  getMobileHomeQuickActions,
  getMobileMessageBodyPreview,
  getMobileMessageEngagementCounts,
  getMobileMessageListPerformanceConfig,
  getMobileMessageStreamItems,
  getMobileVoiceChannelScreenModel,
  filterMobileWorkspaceChannelSections,
  getMobileWorkspaceChannelSurface,
  getMobileWorkspaceChannelSections,
  getMobileWorkspaceChannels,
  getVisibleMobileWorkspaceChannelSections,
  MOBILE_RENDER_LIMITS,
  type MobileConversationFilter,
  type MobileHomeQuickAction,
  type MobileMessageStreamItem,
  type MobileVisibleWorkspaceChannelSection,
} from "./mobile-display-model";
import whisprIcon from "../../assets/whispr-icon.png";
import {
  getMobileFeatureEvidence,
  getMobilePermissionEvidence,
  getMobileReleaseEvidence,
  getMobileSessionEvidence,
  getMobileStoreEvidence,
  summarizeMobileFeatureReadiness,
  type MobileSettingsEvidenceItem,
} from "./mobile-settings-model";
import type {
  MobileBootstrapViewState,
  MobileChannelMessagesViewState,
  MobileChannelSendViewState,
  MobileDMMessagesViewState,
  MobileDMSendViewState,
  MobileMessageSearchViewState,
  MobileWorkspaceServerViewState,
} from "./mobile-screen-state";
import { INITIAL_CHANNEL_SEND_STATE, INITIAL_DM_SEND_STATE } from "./mobile-screen-state";
import type { MobileVoiceInviteOverlayEntry } from "./overlays/mobile-voice-invite-overlay";

const copy = activeMobileCopy;
const runtimeConfig = getMobileRuntimeConfig();
const mobileQualitySummary = summarizeMobileQualityGate();
const mobileProductionReadinessSummary = summarizeMobileProductionReadiness();
const mobileStoreReadiness = validateMobileStoreReadiness();
type MobileIoniconName = ComponentProps<typeof Ionicons>["name"];

function getMobilePermissionLabel(intentId: MobilePermissionIntentId): string {
  switch (intentId) {
    case "camera":
      return copy.permissionCamera;
    case "microphone":
      return copy.permissionMicrophone;
    case "notifications":
      return copy.permissionNotifications;
    case "photoLibrary":
      return copy.permissionPhotoLibrary;
  }
}

function getSettingsEvidenceLabels() {
  return {
    available: copy.settingsFeatureAvailable,
    automation: copy.settingsAutomationLabel,
    blocked: copy.settingsBlockedLabel,
    disabled: copy.settingsFeatureDisabled,
    manualQa: copy.settingsManualQaLabel,
    missing: copy.settingsMissingLabel,
    pending: copy.settingsPendingLabel,
    performance: copy.settingsPerformanceLabel,
    ready: copy.settingsReadyLabel,
    refreshToken: copy.settingsRefreshTokenLabel,
    scopeCount: copy.settingsScopeCountLabel,
    session: copy.settingsSessionLabel,
    storeBlockers: copy.settingsStoreBlockersLabel,
    storeWarnings: copy.settingsStoreWarningsLabel,
  };
}

const MOBILE_SEARCH_RESULT_RENDER_LIMIT = 6;

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
  onSelectVoiceAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onToggleVoiceCamera(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
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

export function MessagesScreen({
  bootstrapState,
  dmMessagesState,
  dmSendState,
  mediaState,
  messageSearchState,
  selectedConversation,
  selectedConversationId,
  syncHealth,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onOpenConversation,
  onCloseConversation,
  onRefreshBootstrap,
  onRefreshConversation,
  onRefreshVisibleData,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSearchMessages,
  onSendMessage,
}: {
  bootstrapState: MobileBootstrapViewState;
  dmMessagesState: MobileDMMessagesViewState;
  dmSendState: MobileDMSendViewState;
  mediaState: MobileMediaRuntimeState;
  messageSearchState: MobileMessageSearchViewState;
  selectedConversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  selectedConversationId: string | null;
  syncHealth: MobileSyncHealthSummary;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onCloseConversation(): void;
  onOpenConversation(conversationId: string): void;
  onRefreshBootstrap(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: { conversationId: string; query: string; scope: "dm" }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
}) {
  const hasConversations =
    bootstrapState.status === "ready" &&
    bootstrapState.payload.home.directMessages.recent.length > 0;
  const shouldShowEmpty =
    bootstrapState.status === "idle" ||
    (bootstrapState.status === "ready" &&
      bootstrapState.payload.home.directMessages.recent.length === 0);
  const attachmentsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.attachments : null;
  const messageSearchFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.messageSearch : null;

  if (selectedConversation) {
    return (
      <DMConversationScreen
        attachmentsFeature={attachmentsFeature}
        conversation={selectedConversation}
        currentUserId={bootstrapState.status === "ready" ? bootstrapState.payload.user.id : ""}
        sendState={dmSendState}
        state={dmMessagesState}
        syncHealth={syncHealth}
        mediaState={mediaState}
        messageSearchFeature={messageSearchFeature}
        onBack={onCloseConversation}
        messageSearchState={messageSearchState}
        onClearMessageSearch={onClearMessageSearch}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onRefreshConversation={onRefreshConversation}
        onRefreshVisibleData={onRefreshVisibleData}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSearchMessages={onSearchMessages}
        onSendMessage={onSendMessage}
      />
    );
  }

  return (
    <View style={[styles.chatScreen, styles.dmInboxScreen]} testID="mobile-dm-inbox-screen">
      <DMInboxHeader />
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      {bootstrapState.status === "ready" ? (
        <DirectMessageSummaryCard
          totalCount={bootstrapState.payload.home.directMessages.totalCount}
          unreadCount={bootstrapState.payload.home.directMessages.unreadCount}
        />
      ) : null}
      {hasConversations ? (
        <DirectMessageListCard
          conversations={bootstrapState.payload.home.directMessages.recent}
          selectedConversationId={selectedConversationId}
          onOpenConversation={onOpenConversation}
        />
      ) : shouldShowEmpty ? (
        <EmptyState tone="accent" label={copy.messagesEmpty} />
      ) : null}
    </View>
  );
}

function DMInboxHeader() {
  return (
    <View style={styles.dmInboxHeader}>
      <View style={styles.dmInboxHeaderText}>
        <Text style={styles.dmInboxTitle}>{copy.dmInboxTitle}</Text>
        <Text style={styles.dmInboxDescription}>{copy.dmInboxDescription}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.directMessageComposeUnavailable}
        accessibilityState={{ disabled: true }}
        disabled
        testID="mobile-dm-compose-button"
        style={styles.dmComposeButton}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={mobileColors.accentStrong} />
      </Pressable>
    </View>
  );
}

function DirectMessageSummaryCard({
  totalCount,
  unreadCount,
}: {
  totalCount: number;
  unreadCount: number;
}) {
  return (
    <View style={styles.dmSummaryCard} testID="mobile-dm-summary-card">
      <View style={styles.dmSummaryIcon}>
        <Ionicons name="paper-plane" size={18} color={mobileColors.accentStrong} />
      </View>
      <View style={styles.dmSummaryContent}>
        <Text style={styles.dmSummaryTitle}>{copy.homeRecentDmsTitle}</Text>
        <Text style={styles.dmSummaryDescription}>{copy.messagesDescription}</Text>
      </View>
      <View style={styles.dmSummaryMetricGrid}>
        <MetricMiniPill label={copy.homeDmLabel} value={totalCount} />
        <MetricMiniPill label={copy.homeUnreadLabel} value={unreadCount} />
      </View>
    </View>
  );
}

export function DMConversationScreen({
  attachmentsFeature,
  conversation,
  currentUserId,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  onBack,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onRefreshConversation,
  onRefreshVisibleData,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSearchMessages,
  onSendMessage,
  sendState,
  state,
  syncHealth,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
  syncHealth: MobileSyncHealthSummary;
  onBack(): void;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: { conversationId: string; query: string; scope: "dm" }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
}) {
  const title = getMobileConversationTitle(conversation, copy.directMessageFallback);
  const activeCount = getMobileConversationActiveCount(conversation);
  const participantCount =
    state.payload?.conversation.participants.length ?? conversation.participantCount;

  return (
    <View style={styles.chatScreen}>
      <View style={styles.dmConversationHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.dmBackAction}
          onPress={onBack}
          style={({ pressed }) => [styles.dmBackButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.dmBackButtonText}>{"<"}</Text>
        </Pressable>
        <AvatarMark
          label={title}
          imageUrl={getMobileConversationAvatarUrl(conversation)}
          status={activeCount > 0 ? "active" : "idle"}
        />
        <View style={styles.dmConversationHeaderText}>
          <Text style={styles.dmPreviewTitle} numberOfLines={1}>
            {state.payload?.conversation.name ?? title}
          </Text>
          <View style={styles.dmMetaRow}>
            <StatusChip
              label={`${activeCount}/${participantCount} ${copy.activePeopleSuffix}`}
              tone={activeCount > 0 ? "success" : "muted"}
            />
            {conversation.unreadCount > 0 ? (
              <StatusChip
                label={`${conversation.unreadCount} ${copy.unreadSuffix}`}
                tone="accent"
              />
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRefreshConversation}
          style={({ pressed }) => [styles.dmRefreshButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
        </Pressable>
      </View>
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      {messageSearchFeature?.status === "available" ? (
        <MessageSearchPanel
          conversationId={conversation.id}
          scope="dm"
          state={messageSearchState}
          onClear={onClearMessageSearch}
          onSearch={onSearchMessages}
        />
      ) : null}
      <DMConversationPreviewCard
        attachmentsFeature={attachmentsFeature}
        conversation={conversation}
        currentUserId={currentUserId}
        sendState={sendState}
        state={state}
        mediaState={mediaState}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onRetry={onRefreshConversation}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSendMessage={onSendMessage}
      />
    </View>
  );
}

export function VoiceScreen({
  bootstrapState,
  permissionReadiness,
  permissionSummary,
  voiceRoomState,
  voiceState,
  syncHealth,
  onLeaveVoiceChannel,
  onRequestVoicePermission,
  onToggleVoiceCamera,
  onToggleVoiceMute,
  onRefreshBootstrap,
  onRefreshVisibleData,
}: {
  bootstrapState: MobileBootstrapViewState;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  voiceRoomState: MobileVoiceRoomState;
  voiceState: MobileVoiceRuntimeState;
  syncHealth: MobileSyncHealthSummary;
  onLeaveVoiceChannel(): Promise<void>;
  onRequestVoicePermission(): Promise<void>;
  onToggleVoiceCamera(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  onRefreshBootstrap(): void;
  onRefreshVisibleData(): void;
}) {
  return (
    <ScreenShell
      eyebrow={copy.tabVoice}
      title={copy.voiceTitle}
      description={copy.voiceDescription}
    >
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      {bootstrapState.status === "ready" ? (
        <FeatureStatusCard
          label={bootstrapState.payload.features.voice.label}
          reason={bootstrapState.payload.features.voice.reason ?? copy.voiceDescription}
          status={bootstrapState.payload.features.voice.status}
        />
      ) : (
        <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      )}
      <PermissionReadinessCard
        compactFeature="voice"
        readiness={permissionReadiness}
        summary={permissionSummary}
      />
      <MobileVoiceRoomPanel
        room={voiceRoomState}
        onLeave={() => void onLeaveVoiceChannel()}
        onRequestPermission={() => void onRequestVoicePermission()}
        onToggleCamera={() => void onToggleVoiceCamera()}
        onToggleMute={() => void onToggleVoiceMute()}
      />
      <VoiceRuntimeCard state={voiceState} onRequestPermission={onRequestVoicePermission} />
    </ScreenShell>
  );
}

function VoiceRuntimeCard({
  onRequestPermission,
  state,
}: {
  state: MobileVoiceRuntimeState;
  onRequestPermission(): Promise<void>;
}) {
  const summary = summarizeMobileVoiceRuntimeState(state);
  const text = getMobileVoiceRuntimeText(state);
  const canRequest =
    summary.actionEnabled &&
    state.status !== "native-module-pending" &&
    state.status !== "blocked";

  return (
    <View
      style={[
        styles.notificationRuntimeCard,
        summary.requiresNativeModule && styles.notificationRuntimeCardReady,
        summary.isTerminalFailure && styles.notificationRuntimeCardWarning,
      ]}
    >
      <View style={styles.notificationRuntimeHeader}>
        <View style={styles.notificationRuntimeIcon}>
          <Text style={styles.notificationRuntimeIconText}>V</Text>
        </View>
        <View style={styles.notificationRuntimeText}>
          <Text style={styles.environmentLabel}>{copy.voiceSetupEyebrow}</Text>
          <Text style={styles.notificationRuntimeTitle}>{text.title}</Text>
          <Text style={styles.notificationRuntimeDescription}>{text.description}</Text>
        </View>
      </View>
      {state.errorMessage ? (
        <Text style={styles.notificationRuntimeError} numberOfLines={2}>
          {state.errorMessage}
        </Text>
      ) : null}
      <ActionButton
        disabled={!canRequest}
        label={state.status === "checking" ? copy.voiceSetupCheckingAction : copy.voiceSetupAction}
        onPress={() => {
          void onRequestPermission();
        }}
        variant={summary.isTerminalFailure ? "secondary" : "primary"}
      />
      <Text style={styles.notificationRuntimeFootnote}>{copy.voiceSetupFootnote}</Text>
    </View>
  );
}

function getMobileVoiceRuntimeText(state: MobileVoiceRuntimeState) {
  switch (state.status) {
    case "checking":
      return {
        description: copy.voiceSetupCheckingDescription,
        title: copy.voiceSetupCheckingTitle,
      };
    case "native-module-pending":
    case "ready":
      return {
        description: copy.voiceSetupNativePendingDescription,
        title: copy.voiceSetupNativePendingTitle,
      };
    case "denied":
      return {
        description: copy.voiceSetupDeniedDescription,
        title: copy.voiceSetupDeniedTitle,
      };
    case "blocked":
      return {
        description: copy.voiceSetupBlockedDescription,
        title: copy.voiceSetupBlockedTitle,
      };
    case "error":
    case "unavailable":
      return {
        description: copy.voiceSetupUnavailableDescription,
        title: copy.voiceSetupUnavailableTitle,
      };
    case "not-requested":
    default:
      return {
        description: copy.voiceSetupDescription,
        title: copy.voiceSetupTitle,
      };
  }
}

export function NotificationsScreen({
  bootstrapState,
  notificationState,
  permissionReadiness,
  permissionSummary,
  syncHealth,
  onRequestNotificationPermission,
  onRefreshBootstrap,
  onRefreshVisibleData,
}: {
  bootstrapState: MobileBootstrapViewState;
  notificationState: MobileNotificationRuntimeState;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  syncHealth: MobileSyncHealthSummary;
  onRequestNotificationPermission(): Promise<void>;
  onRefreshBootstrap(): void;
  onRefreshVisibleData(): void;
}) {
  return (
    <ScreenShell
      eyebrow={copy.tabNotifications}
      title={copy.notificationsTitle}
      description={copy.notificationsDescription}
    >
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      {bootstrapState.status === "ready" ? (
        <FeatureStatusCard
          label={bootstrapState.payload.features.pushNotifications.label}
          reason={
            bootstrapState.payload.features.pushNotifications.reason ??
            copy.notificationsDescription
          }
          status={bootstrapState.payload.features.pushNotifications.status}
        />
      ) : (
        <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      )}
      <PermissionReadinessCard
        compactFeature="messages"
        readiness={permissionReadiness}
        summary={permissionSummary}
      />
      <NotificationRuntimeCard
        state={notificationState}
        onRequestPermission={onRequestNotificationPermission}
      />
      <EmptyState tone="accent" label={copy.notificationsEmpty} />
    </ScreenShell>
  );
}

function NotificationRuntimeCard({
  onRequestPermission,
  state,
}: {
  state: MobileNotificationRuntimeState;
  onRequestPermission(): Promise<void>;
}) {
  const summary = summarizeMobileNotificationRuntimeState(state);
  const text = getMobileNotificationRuntimeText(state);
  const canRequest =
    summary.actionEnabled &&
    state.status !== "registered" &&
    state.status !== "server-contract-pending" &&
    state.status !== "blocked";

  return (
    <View
      style={[
        styles.notificationRuntimeCard,
        summary.isRegistered && styles.notificationRuntimeCardReady,
        summary.isTerminalFailure && styles.notificationRuntimeCardWarning,
      ]}
    >
      <View style={styles.notificationRuntimeHeader}>
        <View style={styles.notificationRuntimeIcon}>
          <Text style={styles.notificationRuntimeIconText}>N</Text>
        </View>
        <View style={styles.notificationRuntimeText}>
          <Text style={styles.environmentLabel}>{copy.notificationSetupEyebrow}</Text>
          <Text style={styles.notificationRuntimeTitle}>{text.title}</Text>
          <Text style={styles.notificationRuntimeDescription}>{text.description}</Text>
        </View>
      </View>
      {state.errorMessage ? (
        <Text style={styles.notificationRuntimeError} numberOfLines={2}>
          {state.errorMessage}
        </Text>
      ) : null}
      {state.tokenFingerprint ? (
        <Text style={styles.notificationRuntimeFootnote} numberOfLines={1}>
          {copy.notificationSetupDeviceLabel}: {state.tokenFingerprint.slice(0, 12)}
        </Text>
      ) : null}
      <ActionButton
        disabled={!canRequest}
        label={
          state.status === "checking"
            ? copy.notificationSetupCheckingAction
            : copy.notificationSetupAction
        }
        onPress={() => {
          void onRequestPermission();
        }}
        variant={summary.isTerminalFailure ? "secondary" : "primary"}
      />
      <Text style={styles.notificationRuntimeFootnote}>{copy.notificationSetupFootnote}</Text>
    </View>
  );
}

function getMobileNotificationRuntimeText(state: MobileNotificationRuntimeState) {
  switch (state.status) {
    case "checking":
      return {
        description: copy.notificationSetupCheckingDescription,
        title: copy.notificationSetupCheckingTitle,
      };
    case "server-contract-pending":
      return {
        description: copy.notificationSetupServerPendingDescription,
        title: copy.notificationSetupServerPendingTitle,
      };
    case "registered":
      return {
        description: copy.notificationSetupRegisteredDescription,
        title: copy.notificationSetupRegisteredTitle,
      };
    case "registration-failed":
      return {
        description: copy.notificationSetupRegistrationFailedDescription,
        title: copy.notificationSetupRegistrationFailedTitle,
      };
    case "denied":
      return {
        description: copy.notificationSetupDeniedDescription,
        title: copy.notificationSetupDeniedTitle,
      };
    case "blocked":
      return {
        description: copy.notificationSetupBlockedDescription,
        title: copy.notificationSetupBlockedTitle,
      };
    case "error":
    case "unavailable":
      return {
        description: copy.notificationSetupUnavailableDescription,
        title: copy.notificationSetupUnavailableTitle,
      };
    case "ready-local":
      return {
        description: copy.notificationSetupReadyLocalDescription,
        title: copy.notificationSetupReadyLocalTitle,
      };
    case "not-requested":
    default:
      return {
        description: copy.notificationSetupDescription,
        title: copy.notificationSetupTitle,
      };
  }
}

function MediaRuntimeCard({
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPermission,
  state,
}: {
  state: MobileMediaRuntimeState;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
}) {
  const summary = summarizeMobileMediaRuntimeState(state);
  const text = getMobileMediaRuntimeText(state);
  const canRequestCamera =
    summary.actionEnabled && state.cameraStatus !== "granted" && state.cameraStatus !== "blocked";
  const canRequestPhotoLibrary =
    summary.actionEnabled &&
    state.photoLibraryStatus !== "granted" &&
    state.photoLibraryStatus !== "blocked";
  const canRequestDocumentPicker = summary.actionEnabled;

  return (
    <View
      style={[
        styles.notificationRuntimeCard,
        (summary.localCameraReady || summary.localPhotoLibraryReady) &&
          styles.notificationRuntimeCardReady,
        summary.isTerminalFailure && styles.notificationRuntimeCardWarning,
      ]}
    >
      <View style={styles.notificationRuntimeHeader}>
        <View style={styles.notificationRuntimeIcon}>
          <Text style={styles.notificationRuntimeIconText}>M</Text>
        </View>
        <View style={styles.notificationRuntimeText}>
          <Text style={styles.environmentLabel}>{copy.mediaSetupEyebrow}</Text>
          <Text style={styles.notificationRuntimeTitle}>{text.title}</Text>
          <Text style={styles.notificationRuntimeDescription}>{text.description}</Text>
        </View>
      </View>
      <View style={styles.mediaRuntimeStatusRow}>
        <MediaRuntimeStatusPill label={copy.mediaSetupCameraLabel} status={state.cameraStatus} />
        <MediaRuntimeStatusPill
          label={copy.mediaSetupPhotoLibraryLabel}
          status={state.photoLibraryStatus}
        />
        <MediaRuntimeStatusPill
          label={copy.mediaSetupDocumentPickerLabel}
          status={state.hasDocumentPickerAccess ? "granted" : "unknown"}
        />
      </View>
      {state.selectedAsset ? (
        <View style={styles.mediaSelectedAssetCard}>
          <Text style={styles.mediaSelectedAssetLabel}>{copy.mediaSetupSelectedFileLabel}</Text>
          <Text style={styles.mediaSelectedAssetName} numberOfLines={1}>
            {state.selectedAsset.name}
          </Text>
          <Text style={styles.mediaSelectedAssetMeta} numberOfLines={1}>
            {formatMobileMediaAssetMeta(state.selectedAsset)}
          </Text>
        </View>
      ) : null}
      {state.errorMessage ? (
        <Text style={styles.notificationRuntimeError} numberOfLines={2}>
          {state.errorMessage}
        </Text>
      ) : null}
      <View style={styles.actionRow}>
        <ActionButton
          disabled={!canRequestPhotoLibrary}
          label={
            state.status === "checking-photo-library"
              ? copy.mediaSetupCheckingAction
              : copy.mediaSetupPhotoLibraryAction
          }
          onPress={() => {
            void onRequestPhotoLibraryPermission();
          }}
          variant={summary.isTerminalFailure ? "secondary" : "primary"}
        />
        <ActionButton
          disabled={!canRequestCamera}
          label={
            state.status === "checking-camera"
              ? copy.mediaSetupCheckingAction
              : copy.mediaSetupCameraAction
          }
          onPress={() => {
            void onRequestCameraPermission();
          }}
          variant="secondary"
        />
        <ActionButton
          disabled={!canRequestDocumentPicker}
          label={
            state.status === "checking-document-picker"
              ? copy.mediaSetupCheckingAction
              : copy.mediaSetupDocumentPickerAction
          }
          onPress={() => {
            void onRequestDocumentPicker();
          }}
          variant="secondary"
        />
      </View>
      <Text style={styles.notificationRuntimeFootnote}>{copy.mediaSetupFootnote}</Text>
    </View>
  );
}

function MediaRuntimeStatusPill({
  label,
  status,
}: {
  label: string;
  status: MobilePermissionReadiness["status"];
}) {
  const tone = getPermissionStatusTone(status);

  return (
    <View style={styles.mediaRuntimeStatusPill}>
      <View
        style={[
          styles.nativeSettingsDot,
          tone === "success" && styles.nativeSettingsDotSuccess,
          tone === "warning" && styles.nativeSettingsDotWarning,
          tone === "danger" && styles.nativeSettingsDotDanger,
        ]}
      />
      <View style={styles.mediaRuntimeStatusText}>
        <Text style={styles.mediaRuntimeStatusLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.mediaRuntimeStatusValue} numberOfLines={1}>
          {getPermissionStatusLabel(status)}
        </Text>
      </View>
    </View>
  );
}

function getMobileMediaRuntimeText(state: MobileMediaRuntimeState) {
  switch (state.status) {
    case "checking-camera":
    case "checking-document-picker":
    case "checking-photo-library":
      return {
        description: copy.mediaSetupCheckingDescription,
        title: copy.mediaSetupCheckingTitle,
      };
    case "ready-local":
      return {
        description: copy.mediaSetupReadyDescription,
        title: copy.mediaSetupReadyTitle,
      };
    case "denied":
      return {
        description: copy.mediaSetupDeniedDescription,
        title: copy.mediaSetupDeniedTitle,
      };
    case "blocked":
      return {
        description: copy.mediaSetupBlockedDescription,
        title: copy.mediaSetupBlockedTitle,
      };
    case "error":
    case "unavailable":
      return {
        description: copy.mediaSetupUnavailableDescription,
        title: copy.mediaSetupUnavailableTitle,
      };
    case "not-requested":
    default:
      return {
        description: copy.mediaSetupDescription,
        title: copy.mediaSetupTitle,
      };
  }
}

function formatMobileMediaAssetMeta(asset: MobileMediaRuntimeState["selectedAsset"]) {
  if (!asset) {
    return "";
  }

  const size =
    asset.sizeBytes === null ? copy.mediaSetupUnknownFileSize : formatBytes(asset.sizeBytes);
  const type = asset.mimeType ?? copy.mediaSetupUnknownFileType;

  return `${type} - ${size}`;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  const kilobytes = value / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

export function ProfileSettingsScreen({
  authStatusLabel,
  bootstrapState,
  error,
  locale,
  mediaState,
  permissionReadiness,
  permissionSummary,
  signedInUserLabel,
  status,
  syncHealth,
  onOpenWebRegister,
  onOpenWebSignIn,
  onOpenCookies,
  onOpenPrivacyPolicy,
  onOpenSupport,
  onOpenTerms,
  onRefresh,
  onRefreshBootstrap,
  onRefreshVisibleData,
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestNotificationPermission,
  onRequestPhotoLibraryPermission,
  onSelectLocale,
  onSignOut,
}: {
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  error: string | null;
  locale: MobileLocale;
  mediaState: MobileMediaRuntimeState;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  signedInUserLabel: string | null;
  status: string;
  syncHealth: MobileSyncHealthSummary;
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onOpenCookies(): void;
  onOpenPrivacyPolicy(): void;
  onOpenSupport(): void;
  onOpenTerms(): void;
  onRefresh(): void;
  onRefreshBootstrap(): void;
  onRefreshVisibleData(): void;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestNotificationPermission(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
  onSelectLocale(locale: MobileLocale): void;
  onSignOut(): void;
}) {
  const isSignedIn = status === "signed-in";
  const appVersion =
    bootstrapState.status === "ready"
      ? bootstrapState.payload.app.version
      : mobilePackageJson.version;
  const releaseChannel =
    bootstrapState.status === "ready"
      ? bootstrapState.payload.app.releaseChannel
      : runtimeConfig.environment;
  const appearanceRows: NativeSettingsRowItem[] = [
    {
      description: copy.settingsLanguageDescription,
      id: "language",
      label: copy.settingsLanguageTitle,
      tone: "success",
      value:
        locale === "tr" ? copy.settingsLanguageTurkishValue : copy.settingsLanguageEnglishValue,
    },
    {
      description: copy.settingsThemeDescription,
      id: "theme",
      label: copy.settingsThemeTitle,
      tone: "success",
      value: copy.settingsThemeLightValue,
    },
  ];
  const notificationRows: NativeSettingsRowItem[] = [
    {
      description: copy.settingsNotificationPushDescription,
      id: "push-notifications",
      label: copy.settingsNotificationPushTitle,
      tone: getPermissionStatusTone(
        getPermissionReadinessById(permissionReadiness, "notifications")?.status ?? "unknown",
      ),
      value: getPermissionStatusLabel(
        getPermissionReadinessById(permissionReadiness, "notifications")?.status ?? "unknown",
      ),
    },
  ];
  const privacyRows: NativeSettingsRowItem[] = [
    {
      description: isSignedIn
        ? copy.settingsPrivacySessionHealthyDescription
        : copy.settingsPrivacySessionSignedOutDescription,
      id: "session-security",
      label: copy.settingsPrivacySessionTitle,
      tone: isSignedIn ? "success" : "warning",
      value: isSignedIn ? copy.settingsReadyLabel : copy.settingsMissingLabel,
    },
    {
      description: copy.settingsPrivacyPermissionsDescription,
      id: "permission-scope",
      label: copy.settingsPrivacyPermissionsTitle,
      tone: permissionSummary.blocked + permissionSummary.denied > 0 ? "warning" : "success",
      value: `${permissionSummary.granted}/${permissionReadiness.length}`,
    },
  ];
  const aboutRows: NativeSettingsRowItem[] = [
    {
      description: copy.settingsAboutVersionDescription,
      id: "app-version",
      label: copy.settingsAboutVersionTitle,
      tone: "neutral",
      value: appVersion,
    },
    {
      description: copy.settingsAboutReleaseChannelDescription,
      id: "release-channel",
      label: copy.settingsAboutReleaseChannelTitle,
      tone: "neutral",
      value: releaseChannel,
    },
  ];

  return (
    <ScreenShell
      testID="mobile-settings-screen"
      eyebrow={copy.tabProfile}
      title={copy.settingsTitle}
      description={copy.settingsDescription}
    >
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      <SettingsAccountCard
        authStatusLabel={authStatusLabel}
        bootstrapState={bootstrapState}
        signedInUserLabel={signedInUserLabel}
        status={status}
      />
      <SettingsSessionActionCard
        isSignedIn={isSignedIn}
        onOpenWebRegister={onOpenWebRegister}
        onOpenWebSignIn={onOpenWebSignIn}
        onRefresh={onRefresh}
        onSignOut={onSignOut}
      />
      <SettingsSupportLegalCard
        onOpenCookies={onOpenCookies}
        onOpenPrivacyPolicy={onOpenPrivacyPolicy}
        onOpenSupport={onOpenSupport}
        onOpenTerms={onOpenTerms}
      />
      <SettingsPreferenceSection
        description={copy.settingsAppearanceDescription}
        rows={appearanceRows}
        title={copy.settingsAppearanceTitle}
      >
        <SettingsLocaleSelector locale={locale} onSelectLocale={onSelectLocale} />
      </SettingsPreferenceSection>
      <SettingsPreferenceSection
        description={copy.settingsNotificationsDescription}
        rows={notificationRows}
        title={copy.settingsNotificationsTitle}
      />
      <SettingsPreferenceSection
        description={copy.settingsPrivacyDescription}
        rows={privacyRows}
        title={copy.settingsPrivacyTitle}
      />
      <SettingsNativePermissionCard
        mediaState={mediaState}
        onRequestCameraPermission={onRequestCameraPermission}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestNotificationPermission={onRequestNotificationPermission}
        onRequestPhotoLibraryPermission={onRequestPhotoLibraryPermission}
        readiness={permissionReadiness}
        summary={permissionSummary}
      />
      <SettingsPreferenceSection
        description={copy.settingsAboutDescription}
        rows={aboutRows}
        title={copy.settingsAboutTitle}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScreenShell>
  );
}

export function OverviewScreen({
  bootstrapState,
  channelMessagesState,
  channelSendState,
  channelTypingLabel,
  mediaState,
  messageSearchState,
  voiceRoomState,
  activeWorkspaceTextChannelId,
  activeWorkspaceVoiceChannelId,
  selectedWorkspaceChannelId,
  selectedWorkspaceServerId,
  syncHealth,
  workspaceServerState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onCloseWorkspaceChannel,
  onCloseWorkspaceVoiceChannel,
  onLeaveWorkspaceVoiceChannel,
  onOpenWorkspaceChannel,
  onOpenWorkspaceServer,
  onRefreshBootstrap,
  onRefreshChannelMessages,
  onRefreshVisibleData,
  onRefreshWorkspaceServer,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSelectVoiceAudioOutput,
  onToggleVoiceMute,
  voiceInviteSendStates,
  onChannelDraftChange,
  onSearchMessages,
  onSendChannelMessage,
  onSendVoiceInvite,
}: {
  bootstrapState: MobileBootstrapViewState;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  channelTypingLabel: string | null;
  mediaState: MobileMediaRuntimeState;
  messageSearchState: MobileMessageSearchViewState;
  voiceRoomState: MobileVoiceRoomState;
  activeWorkspaceTextChannelId: string | null;
  activeWorkspaceVoiceChannelId: string | null;
  selectedWorkspaceChannelId: string | null;
  selectedWorkspaceServerId: string | null;
  syncHealth: MobileSyncHealthSummary;
  workspaceServerState: MobileWorkspaceServerViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onCloseWorkspaceChannel(): void;
  onCloseWorkspaceVoiceChannel(): void;
  onLeaveWorkspaceVoiceChannel(): Promise<void>;
  onOpenWorkspaceChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenWorkspaceServer(serverId: string): void;
  onRefreshBootstrap(): void;
  onRefreshChannelMessages(): void;
  onRefreshVisibleData(): void;
  onRefreshWorkspaceServer(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSelectVoiceAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  voiceInviteSendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
  onChannelDraftChange(content: string): void;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendChannelMessage(content: string): Promise<boolean>;
  onSendVoiceInvite(targetUserId: string): void;
}) {
  const attachmentsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.attachments : null;
  const messageSearchFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.messageSearch : null;

  return (
    <View style={styles.homeScreen}>
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      {bootstrapState.status === "ready" ? (
        <MobileWorkspaceBrowser
          attachmentsFeature={attachmentsFeature}
          bootstrapState={bootstrapState}
          channelMessagesState={channelMessagesState}
          channelSendState={channelSendState}
          channelTypingLabel={channelTypingLabel}
          mediaState={mediaState}
          messageSearchFeature={messageSearchFeature}
          messageSearchState={messageSearchState}
          voiceRoomState={voiceRoomState}
          activeWorkspaceTextChannelId={activeWorkspaceTextChannelId}
          activeWorkspaceVoiceChannelId={activeWorkspaceVoiceChannelId}
          selectedChannelId={selectedWorkspaceChannelId}
          selectedServerId={selectedWorkspaceServerId}
          serverState={workspaceServerState}
          onClearMessageSearch={onClearMessageSearch}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onCloseWorkspaceChannel={onCloseWorkspaceChannel}
          onCloseWorkspaceVoiceChannel={onCloseWorkspaceVoiceChannel}
          onLeaveWorkspaceVoiceChannel={onLeaveWorkspaceVoiceChannel}
          onOpenChannel={onOpenWorkspaceChannel}
          onOpenServer={onOpenWorkspaceServer}
          onRefreshChannel={onRefreshChannelMessages}
          onRefreshServer={onRefreshWorkspaceServer}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onSelectVoiceAudioOutput={onSelectVoiceAudioOutput}
          onToggleVoiceMute={onToggleVoiceMute}
          voiceInviteSendStates={voiceInviteSendStates}
          onChannelDraftChange={onChannelDraftChange}
          onSearchMessages={onSearchMessages}
          onSendChannelMessage={onSendChannelMessage}
          onSendVoiceInvite={onSendVoiceInvite}
        />
      ) : null}
    </View>
  );
}

export function MobileWorkspaceBrowser({
  attachmentsFeature,
  bootstrapState,
  channelMessagesState,
  channelSendState,
  channelTypingLabel,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  voiceRoomState,
  activeWorkspaceTextChannelId,
  activeWorkspaceVoiceChannelId,
  selectedChannelId,
  selectedServerId,
  serverState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onCloseWorkspaceChannel,
  onCloseWorkspaceVoiceChannel,
  onLeaveWorkspaceVoiceChannel,
  onOpenChannel,
  onOpenServer,
  onRefreshChannel,
  onRefreshServer,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSelectVoiceAudioOutput,
  onToggleVoiceMute,
  voiceInviteSendStates,
  onChannelDraftChange,
  onSearchMessages,
  onSendChannelMessage,
  onSendVoiceInvite,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  bootstrapState: MobileBootstrapViewState & {
    payload: MobileBootstrapPayload;
    status: "ready";
  };
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  channelTypingLabel: string | null;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  voiceRoomState: MobileVoiceRoomState;
  activeWorkspaceTextChannelId: string | null;
  activeWorkspaceVoiceChannelId: string | null;
  selectedChannelId: string | null;
  selectedServerId: string | null;
  serverState: MobileWorkspaceServerViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onCloseWorkspaceChannel(): void;
  onCloseWorkspaceVoiceChannel(): void;
  onLeaveWorkspaceVoiceChannel(): Promise<void>;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenServer(serverId: string): void;
  onRefreshChannel(): void;
  onRefreshServer(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSelectVoiceAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  voiceInviteSendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
  onChannelDraftChange(content: string): void;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendChannelMessage(content: string): Promise<boolean>;
  onSendVoiceInvite(targetUserId: string): void;
}) {
  const [channelQuery, setChannelQuery] = useState("");
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Record<string, boolean>>({});
  const servers = useMemo(
    () =>
      getBoundedMobileList(
        bootstrapState.payload.home.servers.recent,
        MOBILE_RENDER_LIMITS.servers,
      ),
    [bootstrapState.payload.home.servers.recent],
  );
  const activeServerId = selectedServerId ?? servers[0]?.id ?? null;
  const activeServerSummary =
    servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;
  const workspacePayload =
    serverState.serverId === activeServerId ? serverState.payload : null;
  const activeServer = workspacePayload?.detail.server ?? null;
  const activeServerName =
    activeServer?.name ?? activeServerSummary?.name ?? copy.overviewTitle;
  const activeServerShortName =
    activeServer?.shortName ?? activeServerSummary?.shortName ?? activeServerName;
  const activeServerIconUrl = activeServer?.iconUrl ?? activeServerSummary?.iconUrl ?? null;
  const activeMemberCount = activeServer?.memberCount ?? activeServerSummary?.memberCount ?? 0;
  const activeChannelCount =
    activeServer?.visibleChannelCount ?? activeServerSummary?.channelCount ?? 0;
  const activeTextChannel =
    workspacePayload && activeWorkspaceTextChannelId
      ? (getMobileWorkspaceChannels(workspacePayload.detail).find(
          (channel) => channel.id === activeWorkspaceTextChannelId && channel.type === "TEXT",
        ) ?? null)
      : null;
  const activeVoiceChannel =
    workspacePayload && activeWorkspaceVoiceChannelId
      ? (getMobileWorkspaceChannels(workspacePayload.detail).find(
          (channel) => channel.id === activeWorkspaceVoiceChannelId && channel.type === "VOICE",
        ) ?? null)
      : null;
  const activeChannelSurface = getMobileWorkspaceChannelSurface(activeTextChannel, {
    isExplicitlyOpened: activeTextChannel?.id === activeWorkspaceTextChannelId,
  });
  const activeVoiceChannelSurface = getMobileWorkspaceChannelSurface(activeVoiceChannel, {
    isExplicitlyOpened: activeVoiceChannel?.id === activeWorkspaceVoiceChannelId,
  });
  const voiceInviteCandidates = useMemo(() => {
    if (!workspacePayload) {
      return [];
    }

    return getMobileVoiceInviteCandidates({
      currentUserId: bootstrapState.payload.user.id,
      members: workspacePayload.detail.members,
      participants: voiceRoomState.participants,
    });
  }, [bootstrapState.payload.user.id, voiceRoomState.participants, workspacePayload]);
  const channelSections = useMemo(() => {
    if (!workspacePayload) {
      return [];
    }

    return filterMobileWorkspaceChannelSections(
      getMobileWorkspaceChannelSections(workspacePayload.detail, {
        ungrouped: copy.workspaceOtherChannelsLabel,
      }),
      channelQuery,
    );
  }, [channelQuery, workspacePayload]);
  const isSearchingChannels = channelQuery.trim().length > 0;
  const visibleChannelSections = useMemo(() => {
    const collapsedMap = Object.fromEntries(
      channelSections.map((section) => [
        section.id,
        isSearchingChannels
          ? false
          : collapsedSectionIds[`${activeServerId}:${section.id}`] === true,
      ]),
    );

    return getVisibleMobileWorkspaceChannelSections(channelSections, collapsedMap);
  }, [activeServerId, channelSections, collapsedSectionIds, isSearchingChannels]);
  const isActiveServerLoading =
    activeServerId !== null && serverState.serverId === activeServerId && serverState.status === "loading";
  const isActiveServerError =
    activeServerId !== null && serverState.serverId === activeServerId && serverState.status === "error";

  const handleServerPress = useCallback(
    (serverId: string) => {
      setChannelQuery("");
      onOpenServer(serverId);
    },
    [onOpenServer],
  );
  const handleToggleSection = useCallback(
    (sectionId: string) => {
      if (!activeServerId || isSearchingChannels) {
        return;
      }

      const sectionKey = `${activeServerId}:${sectionId}`;
      setCollapsedSectionIds((current) => ({
        ...current,
        [sectionKey]: current[sectionKey] !== true,
      }));
    },
    [activeServerId, isSearchingChannels],
  );

  if (activeChannelSurface === "channel-chat" && activeTextChannel) {
    return (
      <MobileChannelChatScreen
        attachmentsFeature={attachmentsFeature}
        channel={activeTextChannel}
        currentUserId={bootstrapState.payload.user.id}
        mediaState={mediaState}
        memberCount={activeMemberCount}
        messageSearchFeature={messageSearchFeature}
        messageSearchState={messageSearchState}
        sendState={channelSendState}
        serverName={activeServerName}
        state={channelMessagesState}
        typingLabel={channelTypingLabel}
        onBack={onCloseWorkspaceChannel}
        onClearMessageSearch={onClearMessageSearch}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onDraftChange={onChannelDraftChange}
        onRefresh={onRefreshChannel}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSearchMessages={onSearchMessages}
        onSendMessage={onSendChannelMessage}
      />
    );
  }

  if (activeVoiceChannelSurface === "voice-room" && activeVoiceChannel) {
    return (
      <MobileVoiceChannelScreen
        channel={activeVoiceChannel}
        memberCount={activeMemberCount}
        room={voiceRoomState}
        serverIconUrl={activeServerIconUrl}
        serverName={activeServerName}
        serverShortName={activeServerShortName}
        inviteCandidates={voiceInviteCandidates}
        inviteSendStates={voiceInviteSendStates}
        onBack={onCloseWorkspaceVoiceChannel}
        onLeave={onLeaveWorkspaceVoiceChannel}
        onSelectAudioOutput={onSelectVoiceAudioOutput}
        onSendInvite={onSendVoiceInvite}
        onToggleMute={onToggleVoiceMute}
      />
    );
  }

  return (
    <View style={styles.workspaceBrowserShell}>
      <View style={styles.mobileServerRail}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={copy.appTitle}
          source={whisprIcon}
          style={styles.mobileServerRailLogo}
        />
        <View style={styles.mobileServerRailDivider} />
        <View style={styles.mobileServerRailList}>
          {servers.map((server) => {
            const isActive = server.id === activeServerId;
            const unreadCount =
              isActive && activeServer ? activeServer.unreadCount : 0;

            return (
              <Pressable
                key={server.id}
                accessibilityRole="button"
                accessibilityLabel={`${copy.openWorkspaceServerAction}: ${server.name}`}
                accessibilityState={{ selected: isActive }}
                onPress={() => handleServerPress(server.id)}
                style={({ pressed }) => [
                  styles.mobileServerRailItem,
                  isActive && styles.mobileServerRailItemActive,
                  pressed && styles.compactListRowPressed,
                ]}
              >
                <AvatarMark
                  imageUrl={server.iconUrl}
                  label={server.shortName ?? server.name}
                  size="regular"
                />
                {unreadCount > 0 ? (
                  <Text style={styles.mobileServerRailBadge}>
                    {Math.min(unreadCount, 99)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.workspaceAddServerAction}
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.mobileServerRailAddButton}
        >
          <Ionicons name="add" size={22} color={mobileColors.accentStrong} />
        </Pressable>
      </View>

      <View style={styles.mobileWorkspacePanel}>
        {servers.length === 0 ? (
          <View style={styles.mobileWorkspaceEmpty}>
            <Text style={styles.screenEyebrow}>{copy.overviewTitle}</Text>
            <Text style={styles.screenTitle}>{copy.homeNoServers}</Text>
            <Text style={styles.screenDescription}>{copy.homePrimaryServerEmpty}</Text>
          </View>
        ) : (
          <>
            <View style={styles.mobileWorkspaceHeader}>
              <AvatarMark
                imageUrl={activeServerIconUrl}
                label={activeServerShortName}
                size="large"
              />
              <View style={styles.mobileWorkspaceHeaderText}>
                <Text style={styles.mobileWorkspaceTitle} numberOfLines={1}>
                  {activeServerName}
                </Text>
                <Text style={styles.mobileWorkspaceMeta} numberOfLines={1}>
                  {activeMemberCount} {copy.membersSuffix} - {activeChannelCount}{" "}
                  {copy.channelsSuffix}
                </Text>
              </View>
              {isActiveServerLoading ? (
                <ActivityIndicator color={mobileColors.accentStrong} size="small" />
              ) : (
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={mobileColors.muted}
                />
              )}
            </View>

            <View style={styles.mobileWorkspaceSearchRow}>
              <View style={styles.mobileWorkspaceSearchBox}>
                <Ionicons name="search-outline" size={16} color={mobileColors.mutedSoft} />
                <TextInput
                  accessibilityLabel={copy.workspaceSearchPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  onChangeText={setChannelQuery}
                  placeholder={copy.workspaceSearchPlaceholder}
                  placeholderTextColor={mobileColors.mutedSoft}
                  returnKeyType="search"
                  style={styles.mobileWorkspaceSearchInput}
                  value={channelQuery}
                />
              </View>
            </View>

            {isActiveServerError ? (
              <View style={styles.dmErrorRow}>
                <Text style={styles.errorText}>{serverState.error}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.retryAction}
                  onPress={onRefreshServer}
                  style={({ pressed }) => [
                    styles.retryButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
                </Pressable>
              </View>
            ) : null}

            {!workspacePayload && isActiveServerLoading ? (
              <Text style={styles.contractDescription}>{copy.workspaceLoading}</Text>
            ) : null}

            {workspacePayload ? (
              <>
                <WorkspaceChannelSectionList
                  sections={visibleChannelSections}
                  selectedChannelId={selectedChannelId}
                  isCollapseDisabled={isSearchingChannels}
                  onOpenChannel={onOpenChannel}
                  onToggleSection={handleToggleSection}
                />
                {channelQuery.trim().length > 0 && channelSections.length === 0 ? (
                  <Text style={styles.contractDescription}>
                    {copy.workspaceNoChannelSearchResults}
                  </Text>
                ) : null}
                {workspacePayload.detail.hasMoreChannels ? (
                  <Text style={styles.workspaceHint}>{copy.workspaceMoreChannelsHidden}</Text>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function WorkspaceChannelSectionList({
  isCollapseDisabled,
  onOpenChannel,
  onToggleSection,
  sections,
  selectedChannelId,
}: {
  isCollapseDisabled: boolean;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onToggleSection(sectionId: string): void;
  sections: MobileVisibleWorkspaceChannelSection[];
  selectedChannelId: string | null;
}) {
  if (sections.length === 0) {
    return <Text style={styles.contractDescription}>{copy.workspaceNoChannels}</Text>;
  }

  return (
    <View style={styles.mobileWorkspaceSectionList}>
      {sections.map((section) => (
        <View key={section.id} style={styles.mobileWorkspaceSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${section.name} ${section.isCollapsed ? "ac" : "kapat"}`}
            accessibilityState={{ disabled: isCollapseDisabled, expanded: !section.isCollapsed }}
            disabled={isCollapseDisabled}
            onPress={() => onToggleSection(section.id)}
            style={({ pressed }) => [
              styles.mobileWorkspaceSectionHeader,
              pressed && styles.compactListRowPressed,
            ]}
          >
            <Text style={styles.mobileWorkspaceSectionTitle}>{section.name}</Text>
            <View style={styles.mobileWorkspaceSectionMeta}>
              <Text style={styles.mobileWorkspaceSectionCount}>{section.totalChannelCount}</Text>
              <Ionicons
                name={section.isCollapsed ? "chevron-forward" : "chevron-down"}
                size={14}
                color={mobileColors.mutedSoft}
              />
            </View>
          </Pressable>
          {!section.isCollapsed ? (
            <View style={styles.mobileWorkspaceChannelList}>
              {section.channels.map((channel) => (
                <WorkspaceChannelCompactRow
                  key={channel.id}
                  channel={channel}
                  isSelected={channel.id === selectedChannelId}
                  onOpenChannel={onOpenChannel}
                />
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function WorkspaceChannelCompactRow({
  channel,
  isSelected,
  onOpenChannel,
}: {
  channel: MobileWorkspaceChannelSummary;
  isSelected: boolean;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
}) {
  const priority = getMobileChannelPriority(channel);
  const iconName = channel.type === "TEXT" ? "chatbubble-ellipses-outline" : "volume-medium-outline";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.openWorkspaceChannelAction}: ${channel.name}`}
      accessibilityState={{ selected: isSelected }}
      onPress={() => onOpenChannel(channel)}
      style={({ pressed }) => [
        styles.mobileWorkspaceChannelRow,
        isSelected && styles.mobileWorkspaceChannelRowActive,
        pressed && styles.compactListRowPressed,
      ]}
    >
      <View
        style={[
          styles.mobileWorkspaceChannelIcon,
          channel.type === "VOICE" && styles.mobileWorkspaceChannelIconVoice,
        ]}
      >
        <Ionicons
          name={iconName}
          size={15}
          color={channel.type === "VOICE" ? "#047857" : mobileColors.accentStrong}
        />
      </View>
      <View style={styles.mobileWorkspaceChannelText}>
        <View style={styles.compactListTitleRow}>
          <Text style={styles.mobileWorkspaceChannelName} numberOfLines={1}>
            {channel.name}
          </Text>
          {priority.hasMentions ? (
            <Text style={styles.channelMentionBadge}>{channel.mentionCount}</Text>
          ) : priority.hasUnread ? (
            <Text style={styles.mobileWorkspaceUnreadDot}>{channel.unreadCount}</Text>
          ) : null}
        </View>
        {channel.topic ? (
          <Text style={styles.mobileWorkspaceChannelMeta} numberOfLines={1}>
            {channel.topic}
          </Text>
        ) : null}
      </View>
      {priority.isLocked || priority.isReadOnly ? (
        <Ionicons
          name={priority.isLocked ? "lock-closed-outline" : "eye-off-outline"}
          size={14}
          color={mobileColors.mutedSoft}
        />
      ) : null}
    </Pressable>
  );
}

function ScreenShell({
  children,
  description,
  eyebrow,
  testID,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  testID?: string;
  title: string;
}) {
  return (
    <View style={styles.screenCard} testID={testID}>
      <Text style={styles.screenEyebrow}>{eyebrow}</Text>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenDescription}>{description}</Text>
      <View style={styles.screenBody}>{children}</View>
    </View>
  );
}

function SettingsAccountCard({
  authStatusLabel,
  bootstrapState,
  signedInUserLabel,
  status,
}: {
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  signedInUserLabel: string | null;
  status: string;
}) {
  const user = bootstrapState.status === "ready" ? bootstrapState.payload.user : null;
  const displayName =
    user?.displayName ?? signedInUserLabel ?? user?.username ?? copy.settingsAccountSignedOut;
  const releaseLabel =
    bootstrapState.status === "ready"
      ? `${bootstrapState.payload.app.version} / ${bootstrapState.payload.app.releaseChannel}`
      : runtimeConfig.environment;

  return (
    <View style={styles.settingsHeroCard}>
      <AvatarMark
        imageUrl={user?.avatarUrl ?? null}
        label={displayName}
        size="large"
        status={status === "signed-in" ? "active" : "idle"}
      />
      <View style={styles.settingsHeroText}>
        <Text style={styles.environmentLabel}>{copy.settingsAccountTitle}</Text>
        <Text style={styles.settingsHeroTitle} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.settingsHeroMeta} numberOfLines={2}>
          {authStatusLabel}
        </Text>
      </View>
      <View style={styles.settingsHeroBadge}>
        <Text style={styles.settingsHeroBadgeText}>{releaseLabel}</Text>
      </View>
    </View>
  );
}

function SettingsSessionActionCard({
  isSignedIn,
  onOpenWebRegister,
  onOpenWebSignIn,
  onRefresh,
  onSignOut,
}: {
  isSignedIn: boolean;
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onRefresh(): void;
  onSignOut(): void;
}) {
  return (
    <SettingsSection
      description={
        isSignedIn
          ? copy.settingsSessionActionsSignedInDescription
          : copy.settingsSessionActionsSignedOutDescription
      }
      title={copy.settingsSessionActionsTitle}
    >
      <View testID="mobile-settings-session-actions" style={styles.settingsSessionActionGrid}>
        <ActionButton
          label={copy.secondaryAction}
          onPress={onRefresh}
          testID="mobile-settings-refresh-session-action"
          variant="secondary"
        />
        {isSignedIn ? (
          <ActionButton
            label={copy.signOutAction}
            onPress={onSignOut}
            testID="mobile-settings-sign-out-action"
            variant="danger"
          />
        ) : (
          <>
            <ActionButton
              label={copy.authOpenSignInAction}
              onPress={onOpenWebSignIn}
              testID="mobile-settings-web-sign-in-action"
              variant="primary"
            />
            <ActionButton
              label={copy.authOpenRegisterAction}
              onPress={onOpenWebRegister}
              testID="mobile-settings-web-register-action"
              variant="secondary"
            />
          </>
        )}
      </View>
    </SettingsSection>
  );
}

function SettingsMobileOverviewCard({
  bootstrapState,
  diagnostics,
  lastDeepLink,
  permissionSummary,
}: {
  bootstrapState: MobileBootstrapViewState;
  diagnostics: MobileSessionDiagnostics;
  lastDeepLink: MobileDeepLinkParseResult | null;
  permissionSummary: MobilePermissionSummary;
}) {
  const hasHealthySession = diagnostics.hasSession && !diagnostics.isExpired;
  const messagesFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.messages : null;
  const messageSearchFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.messageSearch : null;
  const notificationsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.pushNotifications : null;
  const voiceFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.voice : null;
  const invitesFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.invites : null;
  const deepLinkStatus = getDeepLinkStatusLabel(lastDeepLink);
  const inviteReadiness = getMobileInviteReadiness({
    invitesFeature,
    lastDeepLink,
  });
  const rows: NativeSettingsRowItem[] = [
    {
      description: hasHealthySession
        ? copy.settingsMobileSessionHealthy
        : copy.settingsMobileSessionActionRequired,
      id: "session",
      label: copy.settingsMobileSessionTitle,
      tone: hasHealthySession ? "success" : "warning",
      value: hasHealthySession ? copy.settingsReadyLabel : copy.settingsMissingLabel,
    },
    {
      description: messagesFeature?.reason ?? copy.settingsMobileMessagingDescription,
      id: "messages",
      label: copy.settingsMobileMessagingTitle,
      tone: getFeatureStatusTone(messagesFeature?.status),
      value: getFeatureStatusLabel(messagesFeature?.status),
    },
    {
      description:
        messageSearchFeature?.reason ?? copy.settingsMobileSearchDescription,
      id: "message-search",
      label: copy.settingsMobileSearchTitle,
      tone: getFeatureStatusTone(messageSearchFeature?.status),
      value: getFeatureStatusLabel(messageSearchFeature?.status),
    },
    {
      description:
        notificationsFeature?.reason ??
        `${permissionSummary.needsUserAction} ${copy.settingsMobilePermissionNeedsActionSuffix}`,
      id: "notifications",
      label: copy.settingsMobileNotificationsTitle,
      tone: getFeatureStatusTone(notificationsFeature?.status),
      value: getFeatureStatusLabel(notificationsFeature?.status),
    },
    {
      description: voiceFeature?.reason ?? copy.settingsMobileVoiceDescription,
      id: "voice",
      label: copy.settingsMobileVoiceTitle,
      tone: getFeatureStatusTone(voiceFeature?.status),
      value: getFeatureStatusLabel(voiceFeature?.status),
    },
    {
      description: getInviteReadinessDescription(inviteReadiness),
      id: "invites",
      label: copy.settingsMobileInvitesTitle,
      tone: getInviteReadinessTone(inviteReadiness),
      value: getInviteReadinessValue(inviteReadiness),
    },
    {
      description: deepLinkStatus.description,
      id: "deep-link",
      label: copy.settingsMobileDeepLinkTitle,
      tone: lastDeepLink?.ok === false ? "warning" : "success",
      value: lastDeepLink?.ok === false ? copy.settingsPendingLabel : copy.settingsReadyLabel,
    },
  ];

  return (
    <SettingsSection
      description={copy.settingsMobileOverviewDescription}
      title={copy.settingsMobileOverviewTitle}
    >
      <NativeSettingsList rows={rows} />
    </SettingsSection>
  );
}

function SettingsSupportLegalCard({
  onOpenCookies,
  onOpenPrivacyPolicy,
  onOpenSupport,
  onOpenTerms,
}: {
  onOpenCookies(): void;
  onOpenPrivacyPolicy(): void;
  onOpenSupport(): void;
  onOpenTerms(): void;
}) {
  return (
    <SettingsSection
      description={copy.settingsSupportLegalDescription}
      title={copy.settingsSupportLegalTitle}
    >
      <View testID="mobile-settings-support-legal" style={styles.settingsSessionActionGrid}>
        <ActionButton
          label={copy.settingsSupportAction}
          onPress={onOpenSupport}
          testID="mobile-settings-support-action"
          variant="primary"
        />
        <ActionButton
          label={copy.settingsPrivacyPolicyAction}
          onPress={onOpenPrivacyPolicy}
          testID="mobile-settings-privacy-action"
          variant="secondary"
        />
        <ActionButton
          label={copy.settingsTermsAction}
          onPress={onOpenTerms}
          testID="mobile-settings-terms-action"
          variant="secondary"
        />
        <ActionButton
          label={copy.settingsCookiesAction}
          onPress={onOpenCookies}
          testID="mobile-settings-cookies-action"
          variant="secondary"
        />
      </View>
    </SettingsSection>
  );
}

function SettingsNativePermissionCard({
  mediaState,
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestNotificationPermission,
  onRequestPhotoLibraryPermission,
  readiness,
  summary,
}: {
  mediaState: MobileMediaRuntimeState;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestNotificationPermission(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
  readiness: readonly MobilePermissionReadiness[];
  summary: MobilePermissionSummary;
}) {
  const rows: NativeSettingsRowItem[] = readiness.map((item) => {
    const metadata = getMobilePermissionNativeMetadata(item.intent.id);

    return {
      description: metadata.usageDescription,
      id: item.intent.id,
      label: getMobilePermissionLabel(item.intent.id),
      tone: getPermissionStatusTone(item.status),
      value: getPermissionStatusLabel(item.status),
    };
  });

  return (
    <SettingsSection
      description={copy.settingsMobilePermissionsDescription}
      title={copy.settingsMobilePermissionsTitle}
    >
      <View style={styles.settingsSummaryRow}>
        <MetricMiniPill label={copy.settingsReadyLabel} value={summary.granted} />
        <MetricMiniPill label={copy.settingsPendingLabel} value={summary.needsUserAction} />
        <MetricMiniPill
          label={copy.settingsBlockedLabel}
          value={summary.blocked + summary.denied}
        />
      </View>
      <NativeSettingsList rows={rows} />
      <SettingsPermissionActionList
        mediaState={mediaState}
        onRequestCameraPermission={onRequestCameraPermission}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestNotificationPermission={onRequestNotificationPermission}
        onRequestPhotoLibraryPermission={onRequestPhotoLibraryPermission}
        readiness={readiness}
      />
    </SettingsSection>
  );
}

type SettingsPermissionActionItem = {
  actionLabel: string;
  description: string;
  disabled: boolean;
  icon: MobileIoniconName;
  id: "camera" | "document-picker" | "notifications" | "photo-library";
  label: string;
  onPress(): Promise<void>;
  status: MobilePermissionReadiness["status"];
  testID: string;
};

function SettingsPermissionActionList({
  mediaState,
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestNotificationPermission,
  onRequestPhotoLibraryPermission,
  readiness,
}: {
  mediaState: MobileMediaRuntimeState;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestNotificationPermission(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
  readiness: readonly MobilePermissionReadiness[];
}) {
  const mediaSummary = summarizeMobileMediaRuntimeState(mediaState);
  const notificationsStatus =
    getPermissionReadinessById(readiness, "notifications")?.status ?? "unknown";
  const notificationActionDisabled = isSettingsPermissionActionDisabled(notificationsStatus);
  const cameraActionDisabled =
    !mediaSummary.actionEnabled || isSettingsPermissionActionDisabled(mediaState.cameraStatus);
  const photoLibraryActionDisabled =
    !mediaSummary.actionEnabled ||
    isSettingsPermissionActionDisabled(mediaState.photoLibraryStatus);
  const documentPickerStatus: MobilePermissionReadiness["status"] =
    mediaState.hasDocumentPickerAccess ? "granted" : "unknown";
  const documentPickerActionDisabled = !mediaSummary.actionEnabled;
  const actions: SettingsPermissionActionItem[] = [
    {
      actionLabel:
        mediaState.status === "checking-photo-library"
          ? copy.mediaSetupCheckingAction
          : copy.mediaSetupPhotoLibraryAction,
      description: copy.mediaSetupDescription,
      disabled: photoLibraryActionDisabled,
      icon: "images-outline",
      id: "photo-library",
      label: copy.mediaSetupPhotoLibraryLabel,
      onPress: onRequestPhotoLibraryPermission,
      status: mediaState.photoLibraryStatus,
      testID: "mobile-settings-permission-action-photo-library",
    },
    {
      actionLabel:
        mediaState.status === "checking-camera"
          ? copy.mediaSetupCheckingAction
          : copy.mediaSetupCameraAction,
      description: copy.settingsPermissionCameraDescription,
      disabled: cameraActionDisabled,
      icon: "camera-outline",
      id: "camera",
      label: copy.mediaSetupCameraLabel,
      onPress: onRequestCameraPermission,
      status: mediaState.cameraStatus,
      testID: "mobile-settings-permission-action-camera",
    },
    {
      actionLabel:
        mediaState.status === "checking-document-picker"
          ? copy.mediaSetupCheckingAction
          : copy.mediaSetupDocumentPickerAction,
      description: copy.settingsPermissionDocumentPickerDescription,
      disabled: documentPickerActionDisabled,
      icon: "document-attach-outline",
      id: "document-picker",
      label: copy.mediaSetupDocumentPickerLabel,
      onPress: onRequestDocumentPicker,
      status: documentPickerStatus,
      testID: "mobile-settings-permission-action-document-picker",
    },
    {
      actionLabel: copy.settingsNotificationPermissionAction,
      description: copy.settingsNotificationPushDescription,
      disabled: notificationActionDisabled,
      icon: "notifications-outline",
      id: "notifications",
      label: copy.settingsNotificationPushTitle,
      onPress: onRequestNotificationPermission,
      status: notificationsStatus,
      testID: "mobile-settings-permission-action-notifications",
    },
  ];

  return (
    <View style={styles.settingsPermissionActionList}>
      {actions.map((item) => (
        <SettingsPermissionActionRow key={item.id} item={item} />
      ))}
      {mediaState.selectedAsset ? (
        <View style={styles.settingsPermissionAssetCard}>
          <Ionicons name="document-text-outline" size={18} color={mobileColors.accentStrong} />
          <View style={styles.settingsPermissionAssetText}>
            <Text style={styles.mediaSelectedAssetLabel}>{copy.mediaSetupSelectedFileLabel}</Text>
            <Text style={styles.mediaSelectedAssetName} numberOfLines={1}>
              {mediaState.selectedAsset.name}
            </Text>
            <Text style={styles.mediaSelectedAssetMeta} numberOfLines={1}>
              {formatMobileMediaAssetMeta(mediaState.selectedAsset)}
            </Text>
          </View>
        </View>
      ) : null}
      {mediaState.errorMessage ? (
        <Text style={styles.notificationRuntimeError} numberOfLines={2}>
          {mediaState.errorMessage}
        </Text>
      ) : null}
      <Text style={styles.notificationRuntimeFootnote}>{copy.mediaSetupFootnote}</Text>
    </View>
  );
}

function SettingsPermissionActionRow({ item }: { item: SettingsPermissionActionItem }) {
  const tone = getPermissionStatusTone(item.status);

  return (
    <View style={styles.settingsPermissionActionRow}>
      <View
        style={[
          styles.settingsPermissionActionIcon,
          tone === "success" && styles.settingsPermissionActionIconSuccess,
          tone === "danger" && styles.settingsPermissionActionIconDanger,
          tone === "warning" && styles.settingsPermissionActionIconWarning,
        ]}
      >
        <Ionicons
          name={item.icon}
          size={18}
          color={tone === "danger" ? "#B91C1C" : mobileColors.accentStrong}
        />
      </View>
      <View style={styles.settingsPermissionActionText}>
        <Text style={styles.nativeSettingsRowTitle} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={styles.nativeSettingsRowDescription} numberOfLines={2}>
          {item.description}
        </Text>
      </View>
      <View style={styles.settingsPermissionActionControls}>
        <Text
          style={[
            styles.nativeSettingsRowValue,
            tone === "success" && styles.nativeSettingsRowValueSuccess,
            tone === "warning" && styles.nativeSettingsRowValueWarning,
            tone === "danger" && styles.nativeSettingsRowValueDanger,
          ]}
          numberOfLines={1}
        >
          {getPermissionStatusLabel(item.status)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.actionLabel}
          accessibilityState={{ disabled: item.disabled }}
          disabled={item.disabled}
          onPress={() => {
            void item.onPress();
          }}
          style={({ pressed }) => [
            styles.settingsPermissionActionButton,
            item.disabled && styles.settingsPermissionActionButtonDisabled,
            pressed && !item.disabled && styles.actionButtonPressed,
          ]}
          testID={item.testID}
        >
          <Text
            style={[
              styles.settingsPermissionActionButtonText,
              item.disabled && styles.actionButtonTextDisabled,
            ]}
            numberOfLines={1}
          >
            {item.actionLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

type NativeSettingsRowTone = "danger" | "neutral" | "success" | "warning";

type NativeSettingsRowItem = {
  description: string;
  id: string;
  label: string;
  tone: NativeSettingsRowTone;
  value: string;
};

function NativeSettingsList({ rows }: { rows: readonly NativeSettingsRowItem[] }) {
  return (
    <View style={styles.nativeSettingsList}>
      {rows.map((row) => (
        <View key={row.id} style={styles.nativeSettingsRow}>
          <View
            style={[
              styles.nativeSettingsDot,
              row.tone === "success" && styles.nativeSettingsDotSuccess,
              row.tone === "warning" && styles.nativeSettingsDotWarning,
              row.tone === "danger" && styles.nativeSettingsDotDanger,
            ]}
          />
          <View style={styles.nativeSettingsRowText}>
            <Text style={styles.nativeSettingsRowTitle} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={styles.nativeSettingsRowDescription} numberOfLines={2}>
              {row.description}
            </Text>
          </View>
          <Text
            style={[
              styles.nativeSettingsRowValue,
              row.tone === "success" && styles.nativeSettingsRowValueSuccess,
              row.tone === "warning" && styles.nativeSettingsRowValueWarning,
              row.tone === "danger" && styles.nativeSettingsRowValueDanger,
            ]}
            numberOfLines={1}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function getFeatureStatusLabel(
  status: MobileBootstrapPayload["features"]["messages"]["status"] | undefined,
) {
  switch (status) {
    case "available":
      return copy.settingsFeatureAvailable;
    case "disabled":
      return copy.settingsFeatureDisabled;
    case "requires-native-permission":
    case "requires-server-contract":
      return copy.settingsPendingLabel;
    default:
      return copy.settingsPendingLabel;
  }
}

function getFeatureStatusTone(
  status: MobileBootstrapPayload["features"]["messages"]["status"] | undefined,
): NativeSettingsRowTone {
  switch (status) {
    case "available":
      return "success";
    case "disabled":
      return "neutral";
    case "requires-native-permission":
    case "requires-server-contract":
    default:
      return "warning";
  }
}

function getPermissionStatusLabel(status: MobilePermissionReadiness["status"]) {
  switch (status) {
    case "granted":
      return copy.settingsReadyLabel;
    case "blocked":
      return copy.settingsBlockedLabel;
    case "denied":
      return copy.settingsFeatureDisabled;
    case "not-requested":
    case "unknown":
    default:
      return copy.settingsPendingLabel;
  }
}

function getPermissionReadinessById(
  readiness: readonly MobilePermissionReadiness[],
  id: MobilePermissionIntentId,
): MobilePermissionReadiness | undefined {
  return readiness.find((item) => item.intent.id === id);
}

function getPermissionStatusTone(
  status: MobilePermissionReadiness["status"],
): NativeSettingsRowTone {
  switch (status) {
    case "granted":
      return "success";
    case "blocked":
    case "denied":
      return "danger";
    case "not-requested":
    case "unknown":
    default:
      return "warning";
  }
}

function isSettingsPermissionActionDisabled(status: MobilePermissionReadiness["status"]) {
  return status === "granted" || status === "blocked" || status === "denied";
}

function SettingsSecurityCard({
  diagnostics,
  lastDeepLink,
}: {
  diagnostics: MobileSessionDiagnostics;
  lastDeepLink: MobileDeepLinkParseResult | null;
}) {
  const evidence = getMobileSessionEvidence(diagnostics, getSettingsEvidenceLabels());

  return (
    <SettingsSection
      description={copy.settingsSecurityDescription}
      title={copy.settingsSecurityTitle}
    >
      <SettingsEvidenceGrid items={evidence} />
      <DeepLinkStatusCard result={lastDeepLink} />
      <Text style={styles.settingsFootnote}>{copy.settingsNoSensitiveData}</Text>
    </SettingsSection>
  );
}

function SettingsFeatureReadinessCard({
  features,
}: {
  features: MobileBootstrapPayload["features"];
}) {
  const summary = summarizeMobileFeatureReadiness(features);
  const evidence = getMobileFeatureEvidence(features, getSettingsEvidenceLabels());

  return (
    <SettingsSection
      description={copy.settingsFeatureDescription}
      title={copy.settingsFeatureTitle}
    >
      <View style={styles.settingsSummaryRow}>
        <MetricMiniPill label={copy.settingsFeatureAvailable} value={summary.available} />
        <MetricMiniPill label={copy.settingsPendingLabel} value={summary.pending} />
        <MetricMiniPill label={copy.settingsFeatureDisabled} value={summary.disabled} />
      </View>
      <SettingsEvidenceList items={evidence} />
    </SettingsSection>
  );
}

function SettingsPermissionEvidenceCard({ summary }: { summary: MobilePermissionSummary }) {
  const evidence = getMobilePermissionEvidence(summary, getSettingsEvidenceLabels());

  return (
    <SettingsSection
      description={copy.settingsPermissionEvidenceDescription}
      title={copy.settingsPermissionEvidenceTitle}
    >
      <SettingsEvidenceGrid items={evidence} />
    </SettingsSection>
  );
}

function DeveloperDiagnosticsCard({
  bootstrapSyncState,
}: {
  bootstrapSyncState: MobileSyncSnapshot;
}) {
  return (
    <View style={styles.developerSection}>
      <View style={styles.developerSectionHeader}>
        <Text style={styles.environmentLabel}>{copy.settingsDeveloperTitle}</Text>
        <Text style={styles.contractDescription}>{copy.settingsDeveloperDescription}</Text>
      </View>
      <MobileSyncStatusCard
        items={[{ label: copy.syncBootstrapLabel, snapshot: bootstrapSyncState }]}
      />
      <EnvironmentCard />
      <BootstrapContractCard />
      <ReleaseReadinessCard />
      <StoreReadinessCard />
      <ProductionReadinessCard />
      <MobileQualityGateCard />
    </View>
  );
}

function SettingsReleaseQualityCard() {
  const settingsEvidenceLabels = getSettingsEvidenceLabels();
  const storeEvidence = getMobileStoreEvidence(mobileStoreReadiness, settingsEvidenceLabels);
  const releaseEvidence = getMobileReleaseEvidence({
    budgetCount: MOBILE_RELEASE_BUDGETS.length,
    labels: settingsEvidenceLabels,
    qualitySummary: mobileQualitySummary,
    releaseBudgets: MOBILE_RELEASE_BUDGETS,
  });

  return (
    <SettingsSection
      description={copy.settingsReleaseQualityDescription}
      title={copy.settingsReleaseQualityTitle}
    >
      <View style={styles.settingsSummaryRow}>
        <MetricMiniPill
          label={copy.qualityAutomatedLabel}
          value={mobileQualitySummary.automatedGateCount}
        />
        <MetricMiniPill
          label={copy.qualityManualLabel}
          value={mobileQualitySummary.manualCheckCount}
        />
        <MetricMiniPill label={copy.qualityDeviceLabel} value={mobileQualitySummary.targetCount} />
      </View>
      <SettingsEvidenceList items={[...releaseEvidence, ...storeEvidence]} />
    </SettingsSection>
  );
}

function EnvironmentCard() {
  return (
    <View style={styles.environmentCard}>
      <Text style={styles.environmentLabel}>Environment</Text>
      <Text style={styles.environmentValue}>{runtimeConfig.environment}</Text>
      <Text style={styles.environmentUrl} numberOfLines={1}>
        {runtimeConfig.apiUrl}
      </Text>
    </View>
  );
}

function BootstrapContractCard() {
  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.bootstrapTitle}</Text>
      <Text style={styles.contractTitle}>{copy.bootstrapReady}</Text>
      <Text style={styles.contractDescription}>{copy.bootstrapDescription}</Text>
      <Text style={styles.contractEndpoint} numberOfLines={1}>
        {MOBILE_BOOTSTRAP_ENDPOINT}
      </Text>
    </View>
  );
}

function BootstrapStateNotice({
  onRetry,
  state,
}: {
  onRetry(): void;
  state: MobileBootstrapViewState;
}) {
  if (state.status === "ready" || state.status === "idle") {
    return null;
  }

  const isError = state.status === "error";

  return (
    <View style={[styles.bootstrapNotice, isError && styles.bootstrapNoticeError]}>
      <View style={styles.bootstrapNoticeText}>
        <Text style={styles.environmentLabel}>
          {isError ? copy.bootstrapLoadErrorTitle : copy.bootstrapLoadingTitle}
        </Text>
        <Text style={styles.contractDescription}>
          {isError ? state.error : copy.bootstrapLoadingDescription}
        </Text>
      </View>
      {isError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SettingsLocaleSelector({
  locale,
  onSelectLocale,
}: {
  locale: MobileLocale;
  onSelectLocale(locale: MobileLocale): void;
}) {
  return (
    <View
      accessibilityLabel={copy.settingsLanguageTitle}
      accessibilityRole="radiogroup"
      testID="mobile-settings-language-control"
      style={styles.settingsLocaleControl}
    >
      <Text style={styles.settingsLocaleDescription}>
        {copy.settingsLanguageControlDescription}
      </Text>
      <View style={styles.settingsLocaleOptions}>
        {MOBILE_LOCALE_OPTIONS.map((option) => {
          const isSelected = option.id === locale;

          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              key={option.id}
              onPress={() => onSelectLocale(option.id)}
              style={({ pressed }) => [
                styles.settingsLocaleOption,
                isSelected && styles.settingsLocaleOptionSelected,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.settingsLocaleShortLabel,
                  isSelected && styles.settingsLocaleShortLabelSelected,
                ]}
              >
                {option.shortLabel}
              </Text>
              <Text
                style={[
                  styles.settingsLocaleOptionLabel,
                  isSelected && styles.settingsLocaleOptionLabelSelected,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SettingsPreferenceSection({
  children,
  description,
  rows,
  title,
}: {
  children?: ReactNode;
  description: string;
  rows: readonly NativeSettingsRowItem[];
  title: string;
}) {
  return (
    <SettingsSection description={description} title={title}>
      <NativeSettingsList rows={rows} />
      {children ? <View style={styles.settingsSectionActions}>{children}</View> : null}
    </SettingsSection>
  );
}

function MobileSyncHealthBanner({
  health,
  onRetry,
}: {
  health: MobileSyncHealthSummary;
  onRetry(): void;
}) {
  if (health.status === "healthy") {
    return null;
  }

  const isError = health.status === "error";

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.syncHealthBanner, isError && styles.syncHealthBannerError]}
    >
      <View
        style={[
          styles.syncHealthIcon,
          isError ? styles.syncHealthIconError : styles.syncHealthIconRefreshing,
        ]}
      >
        {isError ? (
          <Text style={styles.syncHealthIconText}>!</Text>
        ) : (
          <ActivityIndicator color={mobileColors.accentStrong} size="small" />
        )}
      </View>
      <View style={styles.syncHealthText}>
        <Text style={styles.syncHealthTitle}>
          {isError ? copy.syncHealthErrorTitle : copy.syncHealthRefreshingTitle}
        </Text>
        <Text style={styles.syncHealthDescription} numberOfLines={2}>
          {isError ? copy.syncHealthErrorDescription : copy.syncHealthRefreshingDescription}
        </Text>
      </View>
      {isError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRetry}
          style={({ pressed }) => [
            styles.syncHealthRetryButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.syncHealthRetryText}>{copy.retryAction}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type MobileSyncStatusItem = {
  label: string;
  snapshot: MobileSyncSnapshot;
  visible?: boolean;
};

function MobileSyncStatusCard({ items }: { items: MobileSyncStatusItem[] }) {
  const visibleItems = items.filter((item) => item.visible !== false);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.syncCard}>
      <View style={styles.syncHeader}>
        <Text style={styles.environmentLabel}>{copy.syncStatusTitle}</Text>
        <Text style={styles.syncDescription}>{copy.syncStatusDescription}</Text>
      </View>
      <View style={styles.syncChipRow}>
        {visibleItems.map((item) => {
          const tone = getMobileSyncTone(item.snapshot);
          const statusLabel = getMobileSyncStatusLabel(item.snapshot);

          return (
            <View
              key={`${item.snapshot.source}-${item.label}`}
              style={[
                styles.syncChip,
                tone === "fresh" && styles.syncChipFresh,
                tone === "stale" && styles.syncChipStale,
                tone === "error" && styles.syncChipError,
              ]}
            >
              <View
                style={[
                  styles.syncDot,
                  tone === "fresh" && styles.syncDotFresh,
                  tone === "stale" && styles.syncDotStale,
                  tone === "error" && styles.syncDotError,
                ]}
              />
              <View style={styles.syncChipText}>
                <Text style={styles.syncChipLabel}>{item.label}</Text>
                <Text style={styles.syncChipValue}>{statusLabel}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function getMobileSyncTone(snapshot: MobileSyncSnapshot) {
  if (snapshot.status === "error") {
    return "error";
  }

  if (isMobileSyncStale(snapshot)) {
    return "stale";
  }

  return "fresh";
}

function getMobileSyncStatusLabel(snapshot: MobileSyncSnapshot) {
  if (snapshot.status === "syncing") {
    return copy.syncRefreshing;
  }

  if (snapshot.status === "error") {
    return `${copy.syncFailed} (${snapshot.failureCount})`;
  }

  const age = formatMobileSyncAge(snapshot.lastCompletedAt);

  switch (age.kind) {
    case "never":
      return copy.syncNever;
    case "now":
      return copy.syncFreshNow;
    case "seconds":
      return `${copy.syncFresh} - ${age.value} ${copy.syncSecondsAgo}`;
    case "minutes":
      return `${copy.syncFresh} - ${age.value} ${copy.syncMinutesAgo}`;
    default:
      return copy.syncFresh;
  }
}

function HomeGreetingHeader({
  onOpenNotifications,
  signedInUserLabel,
  state,
}: {
  onOpenNotifications(): void;
  signedInUserLabel: string | null;
  state: MobileBootstrapViewState;
}) {
  const user = state.status === "ready" ? state.payload.user : null;
  const label = user?.displayName ?? signedInUserLabel ?? user?.username ?? copy.appTitle;

  return (
    <View style={styles.homeGreetingHeader}>
      <AvatarMark
        imageUrl={user?.avatarUrl ?? null}
        label={label}
        status={user?.status === "ONLINE" ? "active" : "idle"}
      />
      <View style={styles.homeGreetingText}>
        <Text style={styles.homeGreetingTitle} numberOfLines={1}>
          {copy.homeGreetingTitle.replace("{name}", label)}
        </Text>
        <Text style={styles.homeGreetingSubtitle} numberOfLines={1}>
          {copy.homeGreetingSubtitle}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.tabNotifications}
        onPress={onOpenNotifications}
        style={({ pressed }) => [
          styles.homeNotificationButton,
          pressed && styles.actionButtonPressed,
        ]}
      >
        <Text style={styles.homeNotificationButtonText}>!</Text>
      </Pressable>
    </View>
  );
}

function HomeSummaryCard({ state }: { state: MobileBootstrapViewState }) {
  if (state.status !== "ready") {
    return null;
  }

  const primaryServer = state.payload.home.servers.recent[0] ?? null;
  const title = primaryServer?.name ?? copy.overviewTitle;
  const subtitle = primaryServer
    ? `${primaryServer.memberCount} ${copy.membersSuffix} - ${primaryServer.channelCount} ${copy.channelsSuffix}`
    : copy.homePrimaryServerEmpty;

  return (
    <View style={styles.homeSummaryCard}>
      <View style={styles.homePrimaryServerRow}>
        <AvatarMark
          imageUrl={primaryServer?.iconUrl ?? null}
          label={primaryServer?.shortName ?? title}
        />
        <View style={styles.homePrimaryServerText}>
          <Text style={styles.homePrimaryServerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.homePrimaryServerMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View style={styles.homeMetricGrid}>
        <HomeMetricTile label={copy.homeServersLabel} value={state.summary.workspaceCount} />
        <HomeMetricTile label={copy.homeDmLabel} value={state.summary.directMessageCount} />
        <HomeMetricTile
          label={copy.homeUnreadLabel}
          value={state.summary.unreadDirectMessageCount}
        />
      </View>
    </View>
  );
}

function HomeMetricTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.homeMetricTile}>
      <Text style={styles.homeMetricValue}>{value}</Text>
      <Text style={styles.homeMetricLabel}>{label}</Text>
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function HomeQuickActionsCard({
  onOpenConversation,
  onOpenServer,
  onOpenTab,
  state,
}: {
  onOpenConversation(conversationId: string): void;
  onOpenServer(serverId: string): void;
  onOpenTab(tab: MobileTabId): void;
  state: MobileBootstrapViewState;
}) {
  if (state.status !== "ready") {
    return null;
  }

  const actions = getMobileHomeQuickActions(state.payload, {
    channelsSuffix: copy.channelsSuffix,
    directMessageFallback: copy.directMessageFallback,
    latestDirectMessage: copy.homeContinueLatestDirectMessage,
    latestServer: copy.homeContinueLatestServer,
    membersSuffix: copy.membersSuffix,
    unreadSuffix: copy.unreadSuffix,
  });

  const handlePress = (action: MobileHomeQuickAction) => {
    if (!action.isEnabled) {
      return;
    }

    if (action.kind === "direct-message" && action.targetId) {
      onOpenConversation(action.targetId);
      onOpenTab("messages");
      return;
    }

    if (action.kind === "server" && action.targetId) {
      onOpenServer(action.targetId);
      return;
    }

    if (action.kind === "voice") {
      onOpenTab("voice");
    }
  };

  return (
    <View style={styles.continueCard}>
      <View style={styles.cardHeaderText}>
        <Text style={styles.environmentLabel}>{copy.homeContinueTitle}</Text>
        <Text style={styles.contractDescription}>{copy.homeContinueDescription}</Text>
      </View>
      {actions.length > 0 ? (
        <View style={styles.continueActionList}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={`${action.title}: ${action.subtitle}`}
              accessibilityState={{ disabled: !action.isEnabled }}
              disabled={!action.isEnabled}
              onPress={() => handlePress(action)}
              style={({ pressed }) => [
                styles.continueActionRow,
                !action.isEnabled && styles.continueActionRowDisabled,
                pressed && styles.compactListRowPressed,
              ]}
            >
              <View
                style={[
                  styles.continueActionIcon,
                  action.kind === "server" && styles.continueActionIconServer,
                  action.kind === "voice" && styles.continueActionIconVoice,
                ]}
              >
                <Text style={styles.continueActionIconText}>
                  {action.kind === "direct-message" ? "DM" : action.kind === "server" ? "#" : "VO"}
                </Text>
              </View>
              <View style={styles.continueActionText}>
                <Text style={styles.compactListTitle} numberOfLines={1}>
                  {action.title}
                </Text>
                <Text style={styles.compactListMeta} numberOfLines={1}>
                  {action.subtitle}
                </Text>
              </View>
              {action.badge !== null ? (
                <Text style={styles.continueActionBadge}>{action.badge}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.contractDescription}>{copy.homeContinueEmpty}</Text>
      )}
    </View>
  );
}

function RecentServersCard({
  onOpenServer,
  selectedServerId,
  servers,
}: {
  onOpenServer?(serverId: string): void;
  selectedServerId?: string | null;
  servers: MobileBootstrapPayload["home"]["servers"]["recent"];
}) {
  const visibleServers = useMemo(
    () => getBoundedMobileList(servers, MOBILE_RENDER_LIMITS.servers),
    [servers],
  );

  return (
    <View style={styles.homeSectionCard}>
      <Text style={styles.environmentLabel}>{copy.homeRecentServersTitle}</Text>
      {servers.length > 0 ? (
        <View style={styles.compactList}>
          {visibleServers.map((server) => (
            <Pressable
              key={server.id}
              accessibilityRole={onOpenServer ? "button" : undefined}
              accessibilityLabel={
                onOpenServer ? `${copy.openWorkspaceServerAction}: ${server.name}` : server.name
              }
              accessibilityState={{ selected: server.id === selectedServerId }}
              disabled={!onOpenServer}
              onPress={() => onOpenServer?.(server.id)}
              style={({ pressed }) => [
                styles.compactListRow,
                onOpenServer && styles.compactListRowButton,
                server.id === selectedServerId && styles.compactListRowSelected,
                pressed && styles.compactListRowPressed,
              ]}
            >
              <AvatarMark label={server.shortName ?? server.name} imageUrl={server.iconUrl} />
              <View style={styles.compactListText}>
                <Text style={styles.compactListTitle} numberOfLines={1}>
                  {server.name}
                </Text>
                <Text style={styles.compactListMeta} numberOfLines={1}>
                  {server.memberCount} {copy.membersSuffix} - {server.channelCount}{" "}
                  {copy.channelsSuffix}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.contractDescription}>{copy.homeNoServers}</Text>
      )}
    </View>
  );
}

function WorkspacePreviewCard({
  attachmentsFeature,
  bootstrapState,
  channelMessagesState,
  channelSendState,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onOpenChannel,
  onOpenServer,
  onRefreshChannel,
  onRefreshServer,
  onRequestDocumentPicker,
  onSearchMessages,
  onSendChannelMessage,
  selectedChannelId,
  selectedServerId,
  serverState,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  bootstrapState: MobileBootstrapViewState;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenServer(serverId: string): void;
  onRefreshChannel(): void;
  onRefreshServer(): void;
  onRequestDocumentPicker(): Promise<void>;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendChannelMessage(content: string): Promise<boolean>;
  selectedChannelId: string | null;
  selectedServerId: string | null;
  serverState: MobileWorkspaceServerViewState;
}) {
  if (bootstrapState.status !== "ready") {
    return null;
  }

  const selectedChannel =
    serverState.status === "ready" && selectedChannelId
      ? (getMobileWorkspaceChannels(serverState.payload.detail).find(
          (channel) => channel.id === selectedChannelId,
        ) ?? null)
      : null;

  return (
    <View style={styles.workspaceCard}>
      <View style={styles.workspaceHeader}>
        <View style={styles.workspaceHeaderText}>
          <Text style={styles.environmentLabel}>{copy.workspaceTitle}</Text>
          <Text style={styles.contractDescription}>{copy.workspaceDescription}</Text>
        </View>
        {serverState.status === "ready" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRefreshServer}
            style={({ pressed }) => [styles.dmRefreshButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
          </Pressable>
        ) : null}
      </View>

      <RecentServersCard
        servers={bootstrapState.payload.home.servers.recent}
        selectedServerId={selectedServerId}
        onOpenServer={onOpenServer}
      />

      {serverState.status === "loading" && !serverState.payload ? (
        <Text style={styles.contractDescription}>{copy.workspaceLoading}</Text>
      ) : null}

      {serverState.status === "error" ? (
        <View style={styles.dmErrorRow}>
          <Text style={styles.errorText}>{serverState.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRefreshServer}
            style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : null}

      {serverState.status === "idle" ? (
        <Text style={styles.contractDescription}>{copy.workspaceSelectServer}</Text>
      ) : null}

      {serverState.status === "ready" ? (
        <>
          <View style={styles.workspaceSelectedServer}>
            <AvatarMark
              label={
                serverState.payload.detail.server.shortName ??
                serverState.payload.detail.server.name
              }
              imageUrl={serverState.payload.detail.server.iconUrl}
              size="large"
            />
            <View style={styles.compactListText}>
              <Text style={styles.compactListTitle} numberOfLines={1}>
                {serverState.payload.detail.server.name}
              </Text>
              <View style={styles.dmMetaRow}>
                <StatusChip
                  label={`${serverState.payload.detail.server.memberCount} ${copy.membersSuffix}`}
                  tone="muted"
                />
                <StatusChip
                  label={`${serverState.payload.detail.server.visibleChannelCount} ${copy.channelsSuffix}`}
                  tone="muted"
                />
                {serverState.payload.detail.server.unreadCount > 0 ? (
                  <StatusChip
                    label={`${serverState.payload.detail.server.unreadCount} ${copy.unreadSuffix}`}
                    tone="accent"
                  />
                ) : null}
              </View>
            </View>
          </View>
          <WorkspaceChannelList
            channels={getMobileWorkspaceChannels(serverState.payload.detail)}
            selectedChannelId={selectedChannelId}
            onOpenChannel={onOpenChannel}
          />
          {serverState.payload.detail.hasMoreChannels ? (
            <Text style={styles.workspaceHint}>{copy.workspaceMoreChannelsHidden}</Text>
          ) : null}
          {selectedChannel?.type === "VOICE" ? (
            <EmptyState tone="success" label={copy.workspaceVoiceUnavailable} />
          ) : selectedChannel?.type === "TEXT" ? (
            <ChannelMessagesPreviewCard
              attachmentsFeature={attachmentsFeature}
              channel={selectedChannel}
              currentUserId={bootstrapState.payload.user.id}
              mediaState={mediaState}
              messageSearchFeature={messageSearchFeature}
              messageSearchState={messageSearchState}
              sendState={channelSendState}
              state={channelMessagesState}
              onClearMessageSearch={onClearMessageSearch}
              onClearSelectedMediaAsset={onClearSelectedMediaAsset}
              onRetry={onRefreshChannel}
              onRequestDocumentPicker={onRequestDocumentPicker}
              onSearchMessages={onSearchMessages}
              onSendMessage={onSendChannelMessage}
            />
          ) : (
            <Text style={styles.contractDescription}>{copy.workspaceSelectChannel}</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

function WorkspaceChannelList({
  channels,
  onOpenChannel,
  selectedChannelId,
}: {
  channels: MobileWorkspaceChannelSummary[];
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  selectedChannelId: string | null;
}) {
  if (channels.length === 0) {
    return <Text style={styles.contractDescription}>{copy.workspaceNoChannels}</Text>;
  }

  const visibleChannels = getBoundedMobileList(channels, MOBILE_RENDER_LIMITS.channels);

  return (
    <View style={styles.workspaceChannelList}>
      {visibleChannels.map((channel) => {
        const isSelected = channel.id === selectedChannelId;
        const typeLabel =
          channel.type === "TEXT" ? copy.workspaceTextChannel : copy.workspaceVoiceChannel;
        const priority = getMobileChannelPriority(channel);

        return (
          <Pressable
            key={channel.id}
            accessibilityRole="button"
            accessibilityLabel={`${copy.openWorkspaceChannelAction}: ${channel.name}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onOpenChannel(channel)}
            style={({ pressed }) => [
              styles.workspaceChannelRow,
              isSelected && styles.compactListRowSelected,
              pressed && styles.compactListRowPressed,
            ]}
          >
            <Text style={styles.workspaceChannelIcon}>{channel.type === "TEXT" ? "#" : "V"}</Text>
            <View style={styles.compactListText}>
              <View style={styles.compactListTitleRow}>
                <Text style={styles.compactListTitle} numberOfLines={1}>
                  {channel.name}
                </Text>
                {priority.hasMentions ? (
                  <Text style={styles.channelMentionBadge}>{channel.mentionCount}</Text>
                ) : null}
              </View>
              <View style={styles.dmMetaRow}>
                <StatusChip
                  label={typeLabel}
                  tone={channel.type === "VOICE" ? "success" : "muted"}
                />
                {channel.categoryName ? (
                  <StatusChip label={channel.categoryName} tone="muted" />
                ) : null}
                {priority.hasUnread ? (
                  <StatusChip label={`${channel.unreadCount} ${copy.unreadSuffix}`} tone="accent" />
                ) : null}
                {priority.isLocked ? (
                  <StatusChip label={copy.workspaceLockedLabel} tone="muted" />
                ) : null}
                {priority.isReadOnly ? (
                  <StatusChip label={copy.workspaceReadOnlyLabel} tone="muted" />
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function getVoiceRoomScreenStatus(room: MobileVoiceRoomState): string {
  switch (room.status) {
    case "checking-permission":
      return copy.voiceRoomCheckingPermission;
    case "connected":
      return copy.voiceRoomConnected;
    case "connecting":
      return copy.voiceRoomConnecting;
    case "error":
      return copy.voiceRoomError;
    case "leaving":
      return copy.voiceRoomLeaving;
    case "permission-denied":
      return copy.voiceRoomPermissionDenied;
    case "idle":
    default:
      return copy.voiceRoomIdle;
  }
}

function getVoiceParticipantName(participant: MobileVoiceRoomParticipant): string {
  return participant.displayName ?? participant.username;
}

function VoiceLevelBars({ participant }: { participant: MobileVoiceRoomParticipant }) {
  const level = participant.isMuted ? 0 : Math.max(0, Math.min(1, participant.audioLevel));
  const barHeights = [0.42, 0.7, 1, 0.62].map((multiplier) =>
    Math.max(6, Math.round(8 + level * 18 * multiplier)),
  );

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={styles.mobileVoiceLevelBars}
    >
      {barHeights.map((height, index) => (
        <View
          key={`${participant.userId}:${index}`}
          style={[
            styles.mobileVoiceLevelBar,
            {
              height,
              opacity: participant.isSpeaking && !participant.isMuted ? 1 : 0.34,
            },
          ]}
        />
      ))}
    </View>
  );
}

function MobileVoiceParticipantRow({
  participant,
}: {
  participant: MobileVoiceRoomParticipant;
}) {
  const title = getVoiceParticipantName(participant);
  const subtitle = participant.isMuted
    ? copy.voiceRoomMuted
    : participant.isSpeaking
      ? copy.voiceRoomSpeaking
      : copy.voiceRoomListening;

  return (
    <View
      style={[
        styles.mobileVoiceParticipantRow,
        participant.isSpeaking && !participant.isMuted && styles.mobileVoiceParticipantRowSpeaking,
      ]}
    >
      <AvatarMark
        imageUrl={participant.avatarUrl}
        label={title}
        size="regular"
        status={participant.isSpeaking && !participant.isMuted ? "active" : "idle"}
      />
      <View style={styles.mobileVoiceParticipantText}>
        <View style={styles.mobileVoiceParticipantTitleRow}>
          <Text style={styles.mobileVoiceParticipantTitle} numberOfLines={1}>
            {title}
          </Text>
          {participant.isSelf ? (
            <Text style={styles.mobileVoiceSelfBadge}>{copy.voiceRoomSelfLabel}</Text>
          ) : null}
        </View>
        <Text style={styles.mobileVoiceParticipantSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {participant.isMuted ? (
        <Ionicons name="mic-off-outline" size={18} color={mobileColors.mutedSoft} />
      ) : (
        <VoiceLevelBars participant={participant} />
      )}
    </View>
  );
}

function MobileVoiceParticipantGroup({
  emptyLabel,
  participants,
  title,
}: {
  emptyLabel: string;
  participants: readonly MobileVoiceRoomParticipant[];
  title: string;
}) {
  return (
    <View style={styles.mobileVoiceSectionCard}>
      <View style={styles.mobileVoiceSectionHeader}>
        <Text style={styles.mobileVoiceSectionTitle}>{title}</Text>
        <Text style={styles.mobileVoiceSectionCount}>{participants.length}</Text>
      </View>
      {participants.length > 0 ? (
        <View style={styles.mobileVoiceParticipantList}>
          {participants.map((participant) => (
            <MobileVoiceParticipantRow
              key={`${title}:${participant.userId}`}
              participant={participant}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.mobileVoiceEmptyText}>{emptyLabel}</Text>
      )}
    </View>
  );
}

function getMobileVoiceInviteSendLabel(state: MobileVoiceInviteSendState | undefined) {
  if (!state) {
    return copy.voiceInviteAction;
  }

  if (state.status === "sending") {
    return copy.voiceInviteSending;
  }

  if (state.status === "sent") {
    return copy.voiceInviteSent;
  }

  if (state.status === "accepted") {
    return copy.voiceInviteAccepted;
  }

  if (state.status === "declined") {
    return copy.voiceInviteDeclined;
  }

  return copy.voiceInviteRetry;
}

function isMobileVoiceInviteSendDisabled(state: MobileVoiceInviteSendState | undefined) {
  return (
    state?.status === "sending" ||
    state?.status === "sent" ||
    state?.status === "accepted"
  );
}

function MobileVoiceInviteCandidateList({
  candidates,
  onSendInvite,
  sendStates,
}: {
  candidates: readonly MobileVoiceInviteCandidate[];
  onSendInvite(targetUserId: string): void;
  sendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
}) {
  return (
    <View style={styles.mobileVoiceSectionCard}>
      <View style={styles.mobileVoiceSectionHeader}>
        <Text style={styles.mobileVoiceSectionTitle}>{copy.voiceInviteTitle}</Text>
        <Text style={styles.mobileVoiceSectionCount}>{candidates.length}</Text>
      </View>
      {candidates.length > 0 ? (
        <View style={styles.mobileVoiceInviteCandidateList}>
          {candidates.map((candidate) => {
            const sendState = sendStates[candidate.userId];
            const disabled = isMobileVoiceInviteSendDisabled(sendState);

            return (
              <View key={candidate.userId} style={styles.mobileVoiceInviteCandidateRow}>
                <AvatarMark
                  imageUrl={candidate.avatarUrl}
                  label={candidate.label}
                  size="small"
                  status={candidate.status === "ONLINE" ? "active" : "idle"}
                />
                <View style={styles.mobileVoiceInviteCandidateText}>
                  <Text style={styles.mobileVoiceInviteCandidateTitle} numberOfLines={1}>
                    {candidate.label}
                  </Text>
                  <Text style={styles.mobileVoiceInviteCandidateSubtitle} numberOfLines={1}>
                    @{candidate.username}
                  </Text>
                  {sendState?.errorMessage ? (
                    <Text style={styles.mobileVoiceInviteCandidateError} numberOfLines={1}>
                      {sendState.errorMessage}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${copy.voiceInviteAction}: ${candidate.label}`}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => onSendInvite(candidate.userId)}
                  style={({ pressed }) => [
                    styles.mobileVoiceInviteButton,
                    disabled && styles.mobileVoiceInviteButtonDisabled,
                    pressed && !disabled && styles.actionButtonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.mobileVoiceInviteButtonText,
                      disabled && styles.mobileVoiceInviteButtonTextDisabled,
                    ]}
                    numberOfLines={1}
                  >
                    {getMobileVoiceInviteSendLabel(sendState)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.mobileVoiceInviteEmpty}>{copy.voiceInviteEmpty}</Text>
      )}
    </View>
  );
}

function MobileVoiceInfoRow({
  icon,
  label,
  value,
}: {
  icon: MobileIoniconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.mobileVoiceInfoRow}>
      <Ionicons name={icon} size={18} color={mobileColors.muted} />
      <Text style={styles.mobileVoiceInfoLabel}>{label}</Text>
      <Text style={styles.mobileVoiceInfoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MobileVoiceControlButton({
  disabled = false,
  icon,
  isActive = false,
  label,
  onPress,
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: MobileIoniconName;
  isActive?: boolean;
  label: string;
  onPress(): void;
  tone?: "danger" | "neutral" | "primary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: isActive }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mobileVoiceControlButton,
        tone === "primary" && styles.mobileVoiceControlButtonPrimary,
        tone === "danger" && styles.mobileVoiceControlButtonDanger,
        isActive && styles.mobileVoiceControlButtonActive,
        disabled && styles.mobileVoiceControlButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={21}
        color={
          tone === "primary"
            ? "#FFFFFF"
            : tone === "danger"
              ? "#DC2626"
              : mobileColors.text
        }
      />
      <Text
        style={[
          styles.mobileVoiceControlLabel,
          tone === "primary" && styles.mobileVoiceControlLabelPrimary,
          tone === "danger" && styles.mobileVoiceControlLabelDanger,
          disabled && styles.mobileVoiceControlLabelDisabled,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MobileVoiceChannelScreen({
  channel,
  inviteCandidates,
  inviteSendStates,
  memberCount,
  onBack,
  onLeave,
  onSelectAudioOutput,
  onSendInvite,
  onToggleMute,
  room,
  serverIconUrl,
  serverName,
  serverShortName,
}: {
  channel: MobileWorkspaceChannelSummary;
  inviteCandidates: readonly MobileVoiceInviteCandidate[];
  inviteSendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
  memberCount: number;
  onBack(): void;
  onLeave(): Promise<void>;
  onSelectAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onSendInvite(targetUserId: string): void;
  onToggleMute(): Promise<void>;
  room: MobileVoiceRoomState;
  serverIconUrl: string | null;
  serverName: string;
  serverShortName: string;
}) {
  const model = useMemo(
    () =>
      getMobileVoiceChannelScreenModel(room, {
        channelName: channel.name,
        memberCount,
        serverName,
        serverShortName,
      }),
    [channel.name, memberCount, room, serverName, serverShortName],
  );
  const statusText = getVoiceRoomScreenStatus(room);
  const createdValue = copy.voiceRoomUnknownInfo;

  return (
    <View style={styles.mobileVoiceChannelScreen}>
      <View style={styles.mobileVoiceChannelHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.openWorkspaceServerAction}
          onPress={onBack}
          style={({ pressed }) => [
            styles.mobileChannelChatIconButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={mobileColors.text} />
        </Pressable>
        <AvatarMark
          imageUrl={serverIconUrl}
          label={model.serverShortName}
          size="large"
          status={model.isConnected ? "active" : "idle"}
        />
        <View style={styles.mobileVoiceChannelHeaderText}>
          <Text style={styles.mobileVoiceChannelTitle} numberOfLines={1}>
            {model.title}
          </Text>
          <View style={styles.mobileChannelChatMetaRow}>
            <Text style={styles.mobileChannelChatServerName} numberOfLines={1}>
              {model.serverName}
            </Text>
            <Text style={styles.mobileChannelChatDot}>-</Text>
            <Text style={styles.mobileChannelChatMemberCount}>
              {model.memberCountLabel} {copy.membersSuffix}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.voiceSettingsAction}
          accessibilityState={{ disabled: true }}
          disabled
          style={[styles.mobileChannelChatIconButton, styles.mobileVoiceHeaderDisabledButton]}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={mobileColors.mutedSoft} />
        </Pressable>
      </View>

      <View style={styles.mobileVoiceStatusRow}>
        <StatusChip label={model.krispLabel} tone="success" />
        <StatusChip label={model.qualityLabel} tone="accent" />
        <StatusChip label={model.signalLabel} tone={model.isConnected ? "success" : "muted"} />
      </View>

      {room.errorMessage ? <Text style={styles.mobileVoiceError}>{room.errorMessage}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.mobileVoiceChannelContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.mobileVoiceStatusText}>{statusText}</Text>
        <MobileVoiceParticipantGroup
          emptyLabel={copy.voiceRoomNoParticipants}
          participants={model.allParticipants}
          title={copy.voiceRoomParticipantsTitle}
        />
        <MobileVoiceInviteCandidateList
          candidates={inviteCandidates}
          sendStates={inviteSendStates}
          onSendInvite={onSendInvite}
        />
        <View style={styles.mobileVoiceSectionCard}>
          <Text style={styles.mobileVoiceSectionTitle}>{copy.voiceRoomInfoTitle}</Text>
          <MobileVoiceInfoRow
            icon="radio-outline"
            label={copy.voiceRoomChannelInfoLabel}
            value={model.channelName}
          />
          <MobileVoiceInfoRow
            icon="pulse-outline"
            label={copy.voiceRoomQualityInfoLabel}
            value={model.qualityLabel}
          />
          <MobileVoiceInfoRow
            icon="people-outline"
            label={copy.voiceRoomParticipantLimitLabel}
            value={copy.voiceRoomUnknownInfo}
          />
          <MobileVoiceInfoRow
            icon="time-outline"
            label={copy.voiceRoomCreatedInfoLabel}
            value={createdValue}
          />
        </View>
      </ScrollView>

      <View style={styles.mobileVoiceControlBar}>
        <MobileVoiceControlButton
          icon={room.selfMuted ? "mic-off-outline" : "mic-outline"}
          label={room.selfMuted ? copy.voiceUnmuteAction : copy.voiceMuteAction}
          disabled={!model.canToggleMicrophone}
          onPress={() => void onToggleMute()}
          tone={room.selfMuted ? "neutral" : "primary"}
        />
        <MobileVoiceControlButton
          icon="headset-outline"
          label={copy.voiceHeadphonesAction}
          disabled={!model.canSelectDefaultAudio}
          isActive={room.selfAudioOutput === "default"}
          onPress={() => void onSelectAudioOutput("default")}
        />
        <MobileVoiceControlButton
          icon="volume-high-outline"
          label={copy.voiceSpeakerAction}
          disabled={!model.canSelectSpeaker}
          isActive={room.selfAudioOutput === "speaker"}
          onPress={() => void onSelectAudioOutput("speaker")}
        />
        <MobileVoiceControlButton
          icon="desktop-outline"
          label={copy.voiceScreenShareAction}
          disabled={!model.canShareScreen}
          onPress={() => undefined}
        />
        <MobileVoiceControlButton
          icon="settings-outline"
          label={copy.voiceSettingsAction}
          disabled={!model.canOpenSettings}
          onPress={() => undefined}
        />
        <MobileVoiceControlButton
          icon="exit-outline"
          label={copy.voiceLeaveAction}
          disabled={!model.canLeave}
          onPress={() => void onLeave()}
          tone="danger"
        />
      </View>
    </View>
  );
}

export function MobileChannelChatScreen({
  attachmentsFeature,
  channel,
  currentUserId,
  mediaState,
  memberCount,
  messageSearchFeature,
  messageSearchState,
  onBack,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onDraftChange,
  onRefresh,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSearchMessages,
  onSendMessage,
  sendState,
  serverName,
  state,
  typingLabel,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  channel: MobileWorkspaceChannelSummary;
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  memberCount: number;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  onBack(): void;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onDraftChange(content: string): void;
  onRefresh(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
  sendState: MobileChannelSendViewState;
  serverName: string;
  state: MobileChannelMessagesViewState;
  typingLabel: string | null;
}) {
  const channelSendState =
    sendState.channelId === channel.id ? sendState : INITIAL_CHANNEL_SEND_STATE;
  const [isSearchPanelOpen, setSearchPanelOpen] = useState(false);
  const isChannelSearchContextActive = isMessageSearchStateForContext(
    messageSearchState,
    "channel",
    channel.id,
  );
  const headerModel = useMemo(
    () =>
      getMobileChannelChatHeaderModel(
        state.payload?.channel
          ? {
              ...channel,
              name: state.payload.channel.name,
            }
          : channel,
        {
          fallbackChannelName: copy.workspaceTextChannel,
          memberCount,
          membersSuffix: copy.membersSuffix,
          serverName,
        },
      ),
    [channel, memberCount, serverName, state.payload?.channel],
  );
  const searchVisibility = getMobileChannelChatSearchVisibility({
    closeLabel: copy.channelSearchCloseAction,
    featureStatus: messageSearchFeature?.status,
    hasActiveSearchContext: isChannelSearchContextActive,
    isSearchPanelOpen,
    openLabel: copy.channelSearchAction,
  });

  useEffect(() => {
    setSearchPanelOpen(false);
  }, [channel.id]);

  const handleToggleSearch = useCallback(() => {
    if (!searchVisibility.isSearchAvailable) {
      return;
    }

    if (searchVisibility.shouldRenderSearchPanel) {
      setSearchPanelOpen(false);
      if (isChannelSearchContextActive) {
        onClearMessageSearch();
      }
      return;
    }

    setSearchPanelOpen(true);
  }, [
    isChannelSearchContextActive,
    onClearMessageSearch,
    searchVisibility.isSearchAvailable,
    searchVisibility.shouldRenderSearchPanel,
  ]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      style={styles.mobileChannelChatKeyboard}
    >
      <View
        accessibilityLabel={headerModel.accessibilityLabel}
        style={styles.mobileChannelChatScreen}
        testID="mobile-channel-chat-screen"
      >
        <View style={styles.mobileChannelChatHeader} testID="mobile-channel-chat-header">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.channelBackAction}
            onPress={onBack}
            style={({ pressed }) => [
              styles.mobileChannelChatBackButton,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-channel-back-button"
          >
            <Ionicons name="chevron-back" size={20} color={mobileColors.text} />
          </Pressable>
          <View accessible accessibilityLabel={headerModel.channelName} style={styles.mobileChannelChatHash}>
            <Text style={styles.mobileChannelChatHashText}>#</Text>
          </View>
          <View style={styles.mobileChannelChatHeaderText}>
            <Text style={styles.mobileChannelChatTitle} numberOfLines={1}>
              # {headerModel.channelName}
            </Text>
            <Text style={styles.mobileChannelChatTopic} numberOfLines={1}>
              {headerModel.topic ?? copy.channelStartDescription}
            </Text>
          </View>
          {searchVisibility.isSearchAvailable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={searchVisibility.toggleAccessibilityLabel}
              accessibilityState={{ expanded: searchVisibility.shouldRenderSearchPanel }}
              onPress={handleToggleSearch}
              style={({ pressed }) => [
                styles.mobileChannelChatIconButton,
                searchVisibility.shouldRenderSearchPanel &&
                  styles.mobileChannelChatIconButtonActive,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Ionicons
                name={searchVisibility.shouldRenderSearchPanel ? "close" : "search"}
                size={18}
                color={
                  searchVisibility.shouldRenderSearchPanel
                    ? mobileColors.accentStrong
                    : mobileColors.muted
                }
              />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.membersSuffix}
            accessibilityState={{ disabled: true }}
            disabled
            style={({ pressed }) => [
              styles.mobileChannelChatIconButton,
              styles.mobileChannelChatIconButtonDisabled,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-channel-members-button"
          >
            <Ionicons name="people-outline" size={18} color={mobileColors.muted} />
          </Pressable>
        </View>

        {searchVisibility.shouldRenderSearchPanel ? (
          <MessageSearchPanel
            conversationId={channel.id}
            scope="channel"
            state={messageSearchState}
            onClear={onClearMessageSearch}
            onSearch={onSearchMessages}
          />
        ) : null}

        <ChannelMessageList
          currentUserId={currentUserId}
          onRefresh={onRefresh}
          state={state}
        />

        {state.status === "ready" ? (
          <>
            <ChannelTypingIndicator label={typingLabel} />
            <DMComposer
              attachmentsFeature={attachmentsFeature}
              placeholder={copy.channelComposerPlaceholder}
              sendActionLabel={copy.channelSendAction}
              sendState={channelSendState}
              sendingActionLabel={copy.channelSendingAction}
              mediaState={mediaState}
              onClearSelectedMediaAsset={onClearSelectedMediaAsset}
              onDraftChange={onDraftChange}
              onRequestDocumentPicker={onRequestDocumentPicker}
              onSend={onSendMessage}
              variant="channel"
            />
          </>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function ChannelMessageList({
  currentUserId,
  onRefresh,
  state,
}: {
  currentUserId: string;
  onRefresh(): void;
  state: MobileChannelMessagesViewState;
}) {
  const messages = state.payload?.messages ?? [];
  const streamItems = useMemo(() => getMobileMessageStreamItems(messages), [messages]);
  const latestMessageId = messages[messages.length - 1]?.id ?? null;
  const listRef = useRef<FlatList<MobileMessageStreamItem<MobileRenderableMessage>> | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const performanceConfig = useMemo(
    () => getMobileMessageListPerformanceConfig(messages.length),
    [messages.length],
  );
  const scrollToLatestMessage = useCallback(
    (animated = true) => {
      if (streamItems.length === 0) {
        return;
      }

      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    },
    [streamItems.length],
  );
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    setShowScrollToBottom(distanceFromBottom > 120);
  }, []);

  useEffect(() => {
    scrollToLatestMessage(true);
  }, [latestMessageId, scrollToLatestMessage]);

  const renderItem = useCallback(
    ({ item }: { item: MobileMessageStreamItem<MobileRenderableMessage> }) => (
      <View style={styles.messageStreamItem}>
        {item.showDateSeparator ? (
          <MessageDateSeparator createdAt={item.message.createdAt} />
        ) : null}
        <MemoizedMessagePreviewRow
          message={item.message}
          mode="channel"
          own={item.message.author.id === currentUserId}
        />
      </View>
    ),
    [currentUserId],
  );

  const emptyComponent = useMemo(() => {
    if (state.status === "loading" && !state.payload) {
      return <Text style={styles.contractDescription}>{copy.workspaceMessagesLoading}</Text>;
    }

    if (state.status === "error") {
      return (
        <View style={styles.dmErrorRow}>
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRefresh}
            style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      );
    }

    if (state.status === "ready" && messages.length === 0) {
      return <Text style={styles.contractDescription}>{copy.workspaceNoMessages}</Text>;
    }

    return null;
  }, [messages.length, onRefresh, state.error, state.payload, state.status]);

  return (
    <View style={styles.mobileChannelChatBodyShell}>
      <FlatList
        contentContainerStyle={[
          styles.mobileChannelChatBodyContent,
          streamItems.length === 0 && styles.mobileChannelChatBodyEmptyContent,
        ]}
        data={streamItems}
        ref={listRef}
        initialNumToRender={performanceConfig.initialNumToRender}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={emptyComponent}
        maxToRenderPerBatch={performanceConfig.maxToRenderPerBatch}
        onContentSizeChange={() => scrollToLatestMessage(false)}
        onLayout={() => scrollToLatestMessage(false)}
        onScroll={handleScroll}
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            colors={[mobileColors.accentStrong]}
            progressBackgroundColor={mobileColors.card}
            refreshing={state.status === "loading"}
            tintColor={mobileColors.accentStrong}
            onRefresh={onRefresh}
          />
        }
        scrollEventThrottle={80}
        showsVerticalScrollIndicator={false}
        style={styles.mobileChannelChatBody}
        testID="mobile-channel-message-list"
        windowSize={performanceConfig.windowSize}
      />
      <ChannelScrollToBottomButton
        onPress={() => scrollToLatestMessage(true)}
        visible={showScrollToBottom && streamItems.length > 0}
      />
    </View>
  );
}

function ChannelScrollToBottomButton({
  onPress,
  visible,
}: {
  onPress(): void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.scrollToLatestMessageAction}
      onPress={onPress}
      style={({ pressed }) => [
        styles.channelScrollToBottomButton,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <Ionicons name="arrow-down" size={18} color={mobileColors.text} />
    </Pressable>
  );
}

function ChannelTypingIndicator({ label }: { label: string | null }) {
  if (!label) {
    return null;
  }

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={styles.mobileChannelTypingIndicator}
    >
      <Text style={styles.mobileChannelTypingText} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.mobileChannelTypingDots} accessibilityElementsHidden>
        <View style={styles.mobileChannelTypingDot} />
        <View style={styles.mobileChannelTypingDot} />
        <View style={styles.mobileChannelTypingDot} />
      </View>
    </View>
  );
}

function ChannelMessagesPreviewCard({
  attachmentsFeature,
  channel,
  currentUserId,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onRetry,
  onRequestDocumentPicker,
  onSearchMessages,
  onSendMessage,
  sendState,
  state,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  channel: MobileWorkspaceChannelSummary;
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onRetry(): void;
  onRequestDocumentPicker(): Promise<void>;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
  sendState: MobileChannelSendViewState;
  state: MobileChannelMessagesViewState;
}) {
  const channelSendState =
    sendState.channelId === channel.id ? sendState : INITIAL_CHANNEL_SEND_STATE;

  return (
    <View style={styles.dmPreviewCard}>
      <View style={styles.dmPreviewHeader}>
        <Text style={styles.workspaceChannelIconLarge}>#</Text>
        <View style={styles.dmPreviewTitleBlock}>
          <Text style={styles.dmPreviewTitle} numberOfLines={1}>
            {state.payload?.channel.name ?? channel.name}
          </Text>
          <View style={styles.dmMetaRow}>
            <StatusChip label={copy.workspaceTextChannel} tone="muted" />
            {channel.unreadCount > 0 ? (
              <StatusChip label={`${channel.unreadCount} ${copy.unreadSuffix}`} tone="accent" />
            ) : null}
          </View>
          {channel.topic ? (
            <Text style={styles.dmPreviewMeta} numberOfLines={2}>
              {channel.topic}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRetry}
          style={({ pressed }) => [styles.dmRefreshButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
        </Pressable>
      </View>

      {messageSearchFeature?.status === "available" ? (
        <MessageSearchPanel
          conversationId={channel.id}
          scope="channel"
          state={messageSearchState}
          onClear={onClearMessageSearch}
          onSearch={onSearchMessages}
        />
      ) : null}

      {state.status === "loading" && !state.payload ? (
        <Text style={styles.contractDescription}>{copy.workspaceMessagesLoading}</Text>
      ) : null}
      {state.status === "error" ? (
        <View style={styles.dmErrorRow}>
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : null}
      {state.payload && state.payload.messages.length > 0 ? (
        <MessageStream currentUserId={currentUserId} messages={state.payload.messages} />
      ) : null}
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.workspaceNoMessages}</Text>
      ) : null}
      {state.status === "ready" ? (
        <DMComposer
          attachmentsFeature={attachmentsFeature}
          placeholder={copy.channelComposerPlaceholder}
          sendActionLabel={copy.channelSendAction}
          sendState={channelSendState}
          sendingActionLabel={copy.channelSendingAction}
          mediaState={mediaState}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onSend={onSendMessage}
        />
      ) : null}
    </View>
  );
}

function isMessageSearchStateForContext(
  state: MobileMessageSearchViewState,
  scope: "channel" | "dm",
  conversationId: string,
) {
  return state.context?.scope === scope && state.context.conversationId === conversationId;
}

function MessageSearchPanel({
  conversationId,
  onClear,
  onSearch,
  scope,
  state,
}: {
  conversationId: string;
  onClear(): void;
  onSearch(input: {
    conversationId: string;
    query: string;
    scope: "channel" | "dm";
  }): Promise<void>;
  scope: "channel" | "dm";
  state: MobileMessageSearchViewState;
}) {
  const [draft, setDraft] = useState("");
  const normalizedDraft = draft.trim().replace(/\s+/g, " ");
  const isActiveContext = isMessageSearchStateForContext(state, scope, conversationId);
  const canSearch = normalizedDraft.length >= 2;

  const handleSearch = useCallback(() => {
    if (!canSearch) {
      return;
    }

    void onSearch({
      conversationId,
      query: normalizedDraft,
      scope,
    });
  }, [canSearch, conversationId, normalizedDraft, onSearch, scope]);

  const handleClear = useCallback(() => {
    setDraft("");
    onClear();
  }, [onClear]);

  return (
    <View style={styles.messageSearchCard}>
      <View style={styles.messageSearchInputShell}>
        <Text style={styles.messageSearchIcon}>{copy.directMessageSearchLabel}</Text>
        <TextInput
          accessibilityLabel={copy.messageSearchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setDraft}
          onSubmitEditing={handleSearch}
          placeholder={copy.messageSearchPlaceholder}
          placeholderTextColor={mobileColors.mutedSoft}
          returnKeyType="search"
          style={styles.messageSearchInput}
          value={draft}
        />
        {draft.length > 0 || isActiveContext ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.messageSearchClearAction}
            onPress={handleClear}
            style={({ pressed }) => [
              styles.messageSearchClearButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.messageSearchClearText}>x</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.messageSearchAction}
          accessibilityState={{ disabled: !canSearch }}
          disabled={!canSearch}
          onPress={handleSearch}
          style={({ pressed }) => [
            styles.messageSearchButton,
            !canSearch && styles.messageSearchButtonDisabled,
            pressed && canSearch && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.messageSearchButtonText}>{copy.messageSearchAction}</Text>
        </Pressable>
      </View>
      {!canSearch && draft.trim().length > 0 ? (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchHelper}</Text>
      ) : null}
      {isActiveContext ? <MessageSearchResults state={state} /> : null}
    </View>
  );
}

function MessageSearchResults({ state }: { state: MobileMessageSearchViewState }) {
  if (state.status === "loading" && !state.payload) {
    return (
      <View style={styles.messageSearchStatusRow}>
        <ActivityIndicator color={mobileColors.accentStrong} size="small" />
        <Text style={styles.messageSearchStatusText}>{copy.messageSearchLoading}</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return <Text style={styles.messageSearchErrorText}>{state.error}</Text>;
  }

  if ((state.status !== "ready" && state.status !== "loading") || !state.payload) {
    return null;
  }

  const visibleResults = state.payload.results.slice(0, MOBILE_SEARCH_RESULT_RENDER_LIMIT);

  return (
    <View style={styles.messageSearchResults}>
      <View style={styles.messageSearchResultsHeader}>
        <Text style={styles.messageSearchResultsTitle}>{copy.messageSearchResultsTitle}</Text>
        <Text style={styles.messageSearchResultCount}>{state.payload.results.length}</Text>
      </View>
      {visibleResults.length > 0 ? (
        <View style={styles.messageSearchResultList}>
          {visibleResults.map((result) => (
            <MessageSearchResultRow key={result.id} result={result} />
          ))}
        </View>
      ) : (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchEmpty}</Text>
      )}
      {state.payload.nextCursor ? (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchMoreResults}</Text>
      ) : null}
    </View>
  );
}

function MessageSearchResultRow({ result }: { result: MessageSearchResult }) {
  const authorLabel = result.author.displayName ?? result.author.username;
  const body = result.content.trim() || copy.dmAttachmentOnlyMessage;

  return (
    <View style={styles.messageSearchResultRow}>
      <AvatarMark
        label={authorLabel}
        imageUrl={result.author.avatarUrl}
        size="small"
        status={result.author.status === "ONLINE" ? "active" : "idle"}
      />
      <View style={styles.messageSearchResultText}>
        <View style={styles.dmMessageHeader}>
          <Text style={styles.dmMessageAuthor} numberOfLines={1}>
            {authorLabel}
          </Text>
          <Text style={styles.dmMessageTime}>{formatMobileDisplayTime(result.createdAt)}</Text>
        </View>
        <Text style={styles.messageSearchResultBody} numberOfLines={3}>
          {body}
        </Text>
        {result.channelName ? (
          <Text style={styles.messageSearchResultMeta} numberOfLines={1}>
            # {result.channelName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

type MobileRenderableMessage = ChatMessage | MobileDMMessagesResponse["messages"][number];

type MobileRenderableAttachment = MobileRenderableMessage["attachments"][number];

function formatMobileDateSeparator(value: string, locale = "tr-TR"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatMobileAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function getMobileAttachmentPreviewUri(attachment: MobileRenderableAttachment): string | null {
  const contentType = attachment.contentType.toLowerCase();
  const previewUrl = attachment.thumbnailUrl || attachment.url;

  return contentType.startsWith("image/") && previewUrl ? previewUrl : null;
}

function MessageDateSeparator({ createdAt }: { createdAt: string }) {
  const label = formatMobileDateSeparator(createdAt);
  if (!label) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="text"
      style={styles.messageDateSeparator}
    >
      <View style={styles.messageDateLine} />
      <Text style={styles.messageDateText}>{label}</Text>
      <View style={styles.messageDateLine} />
    </View>
  );
}

function MessageAttachmentList({
  attachments,
}: {
  attachments: readonly MobileRenderableAttachment[];
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <View style={styles.messageAttachmentList}>
      {attachments.map((attachment) => {
        const previewUri = getMobileAttachmentPreviewUri(attachment);
        const sizeLabel = formatMobileAttachmentSize(attachment.size);

        return (
          <View
            key={attachment.id}
            accessible
            accessibilityLabel={[attachment.filename, attachment.contentType, sizeLabel]
              .filter(Boolean)
              .join(", ")}
            style={styles.messageAttachmentCard}
          >
            {previewUri ? (
              <Image
                accessibilityIgnoresInvertColors
                importantForAccessibility="no"
                source={{ uri: previewUri }}
                style={styles.messageAttachmentImage}
              />
            ) : (
              <View style={styles.messageAttachmentIcon}>
                <Text style={styles.messageAttachmentIconText}>FILE</Text>
              </View>
            )}
            <View style={styles.messageAttachmentMeta}>
              <Text style={styles.messageAttachmentName} numberOfLines={2}>
                {attachment.filename}
              </Text>
              <Text style={styles.messageAttachmentInfo} numberOfLines={1}>
                {[attachment.contentType, sizeLabel].filter(Boolean).join(" - ")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MessageReactionList({ reactions }: { reactions: MobileRenderableMessage["reactions"] }) {
  if (reactions.length === 0) {
    return null;
  }

  return (
    <View style={styles.messageReactionRow}>
      {reactions.map((reaction) => (
        <View key={reaction.emoji} style={styles.messageReactionChip}>
          <Text style={styles.messageReactionText}>
            {reaction.emoji} {reaction.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MessageStream({
  currentUserId,
  messages,
}: {
  currentUserId: string;
  messages: readonly MobileRenderableMessage[];
}) {
  const streamItems = useMemo(() => getMobileMessageStreamItems(messages), [messages]);

  return (
    <View style={styles.dmMessageList}>
      {streamItems.map(({ id, message, showDateSeparator }) => {
        return (
          <View key={id} style={styles.messageStreamItem}>
            {showDateSeparator ? <MessageDateSeparator createdAt={message.createdAt} /> : null}
            <MemoizedMessagePreviewRow
              message={message}
              own={message.author.id === currentUserId}
            />
          </View>
        );
      })}
    </View>
  );
}

function MessagePreviewRow({
  mode = "conversation",
  message,
  own = false,
}: {
  mode?: "channel" | "conversation";
  message: MobileRenderableMessage;
  own?: boolean;
}) {
  const isChannelMode = mode === "channel";
  const authorLabel = message.author.displayName ?? message.author.username;
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });

  return (
    <View
      style={[
        styles.messagePreviewRow,
        isChannelMode && styles.messagePreviewRowChannel,
        !isChannelMode && own && styles.messagePreviewRowOwn,
      ]}
    >
      {isChannelMode || !own ? (
        <AvatarMark
          label={authorLabel}
          imageUrl={message.author.avatarUrl}
          size={isChannelMode ? "large" : "small"}
          status={message.author.status === "ONLINE" ? "active" : "idle"}
        />
      ) : null}
      <View
        style={[
          styles.messagePreviewBubble,
          isChannelMode && styles.messagePreviewBubbleChannel,
          !isChannelMode && own && styles.messagePreviewBubbleOwn,
        ]}
      >
        <View style={[styles.dmMessageHeader, isChannelMode && styles.messagePreviewHeaderChannel]}>
          <Text
            style={[styles.dmMessageAuthor, isChannelMode && styles.messagePreviewAuthorChannel]}
            numberOfLines={1}
          >
            {isChannelMode ? authorLabel : own ? copy.messageYouLabel : authorLabel}
          </Text>
          <Text style={styles.dmMessageTime}>{formatMobileDisplayTime(message.createdAt)}</Text>
        </View>
        <Text
          style={[styles.dmMessageBody, isChannelMode && styles.messagePreviewBodyChannel]}
          numberOfLines={isChannelMode ? undefined : 4}
        >
          {body}
        </Text>
        <MessageAttachmentList attachments={message.attachments} />
        <MessageReactionList reactions={message.reactions} />
      </View>
    </View>
  );
}

const MemoizedMessagePreviewRow = memo(MessagePreviewRow);

function DirectMessageListCard({
  conversations,
  onOpenConversation,
  selectedConversationId,
}: {
  conversations: MobileBootstrapPayload["home"]["directMessages"]["recent"];
  onOpenConversation(conversationId: string): void;
  selectedConversationId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MobileConversationFilter>("all");
  const filteredConversations = useMemo(
    () =>
      filterMobileConversations(conversations, {
        fallback: copy.directMessageFallback,
        filter,
        query,
      }),
    [conversations, filter, query],
  );
  const visibleConversations = useMemo(
    () => getBoundedMobileList(filteredConversations, MOBILE_RENDER_LIMITS.conversations),
    [filteredConversations],
  );
  const filters: Array<{
    disabled?: boolean;
    id: MobileConversationFilter | "favorites";
    label: string;
  }> = [
    { id: "all", label: copy.directMessageFilterAll },
    { id: "unread", label: copy.directMessageFilterUnread },
    {
      disabled: true,
      id: "favorites",
      label: copy.directMessageFilterFavorites,
    },
    { id: "groups", label: copy.directMessageFilterGroups },
  ];

  return (
    <View style={styles.dmListCard}>
      <View style={styles.dmSearchRow}>
        <View style={styles.dmSearchShell}>
          <Ionicons name="search" size={19} color={mobileColors.mutedSoft} />
          <TextInput
            accessibilityLabel={copy.directMessageSearchPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder={copy.directMessageSearchPlaceholder}
            placeholderTextColor={mobileColors.mutedSoft}
            returnKeyType="search"
            style={styles.inboxSearchInput}
            testID="mobile-dm-search-input"
            value={query}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.directMessageFilterAction}
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.dmSearchFilterButton}
        >
          <Ionicons name="options-outline" size={20} color={mobileColors.accentStrong} />
        </Pressable>
      </View>
      <View style={styles.inboxFilterRow} testID="mobile-dm-filter-tabs">
        {filters.map((item) => {
          const isActive = !item.disabled && item.id === filter;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{
                disabled: item.disabled,
                selected: isActive,
              }}
              disabled={item.disabled}
              onPress={() => {
                if (!item.disabled) {
                  setFilter(item.id as MobileConversationFilter);
                }
              }}
              style={({ pressed }) => [
                styles.inboxFilterButton,
                isActive && styles.inboxFilterButtonActive,
                item.disabled && styles.inboxFilterButtonDisabled,
                pressed && !item.disabled && styles.actionButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.inboxFilterButtonText,
                  isActive && styles.inboxFilterButtonTextActive,
                  item.disabled && styles.inboxFilterButtonTextDisabled,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.dmSectionHeaderRow}>
        <Text style={styles.dmSectionTitle}>{copy.directMessageSectionAll}</Text>
        <Text style={styles.inboxResultText}>
          {filteredConversations.length} {copy.directMessageResultCount}
        </Text>
      </View>
      <View style={styles.dmConversationList}>
        {visibleConversations.map((conversation) => (
          <DirectMessageConversationCard
            key={conversation.id}
            conversation={conversation}
            selected={conversation.id === selectedConversationId}
            onOpenConversation={onOpenConversation}
          />
        ))}
      </View>
      {filteredConversations.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.directMessageFilteredEmpty}</Text>
      ) : null}
    </View>
  );
}

function DirectMessageConversationCard({
  conversation,
  onOpenConversation,
  selected,
}: {
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
  onOpenConversation(conversationId: string): void;
  selected: boolean;
}) {
  const title = getMobileConversationTitle(conversation, copy.directMessageFallback);
  const activeCount = getMobileConversationActiveCount(conversation);
  const lastActivity = formatMobileDisplayTime(conversation.lastMessageAt);
  const shouldShowActivePill = conversation.type === "GROUP_DM" && conversation.participantCount > 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.openConversationAction}: ${title || copy.directMessageFallback}`}
      accessibilityState={{ selected }}
      onPress={() => onOpenConversation(conversation.id)}
      style={({ pressed }) => [
        styles.dmConversationCard,
        selected && styles.dmConversationCardSelected,
        pressed && styles.dmConversationCardPressed,
      ]}
    >
      <AvatarMark
        label={getMobileConversationInitialsLabel(conversation, copy.directMessageFallback)}
        imageUrl={getMobileConversationAvatarUrl(conversation)}
        status={activeCount > 0 ? "active" : "idle"}
        size="large"
      />
      <View style={styles.dmConversationContent}>
        <View style={styles.dmConversationTitleRow}>
          <Text style={styles.dmConversationName} numberOfLines={1}>
            {title || copy.directMessageFallback}
          </Text>
          <View style={styles.dmConversationRightMeta}>
            {conversation.unreadCount > 0 ? (
              <Text style={styles.dmUnreadBadge}>{conversation.unreadCount}</Text>
            ) : null}
            {lastActivity ? <Text style={styles.dmConversationTime}>{lastActivity}</Text> : null}
          </View>
        </View>
        <Text style={styles.dmConversationPreview} numberOfLines={1}>
          {copy.homeContinueLatestDirectMessage}
        </Text>
        <View style={styles.dmConversationFooterRow}>
          {shouldShowActivePill ? (
            <View style={styles.dmActivePresencePill}>
              <View style={styles.dmActivePresenceDot} />
              <Text style={styles.dmActivePresenceText}>
                {activeCount}/{conversation.participantCount} {copy.activePeopleSuffix}
              </Text>
            </View>
          ) : null}
          {conversation.muted ? <StatusChip label={copy.mutedSuffix} tone="muted" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={mobileColors.mutedSoft} />
    </Pressable>
  );
}

function DMConversationPreviewCard({
  attachmentsFeature,
  conversation,
  currentUserId,
  mediaState,
  onClearSelectedMediaAsset,
  onRetry,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSendMessage,
  sendState,
  state,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  onClearSelectedMediaAsset(): void;
  onRetry(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
}) {
  if (!conversation) {
    return <EmptyState tone="accent" label={copy.dmSelectConversation} />;
  }

  const title = getMobileConversationTitle(conversation, copy.directMessageFallback);
  const responseConversation = state.payload?.conversation;
  const participantCount =
    responseConversation?.participants.length ?? conversation.participantCount;
  const activeCount = getMobileConversationActiveCount(conversation);
  const conversationSendState =
    sendState.conversationId === conversation.id ? sendState : INITIAL_DM_SEND_STATE;

  return (
    <View style={styles.dmPreviewCard}>
      <View style={styles.dmPreviewHeader}>
        <AvatarMark
          label={title}
          imageUrl={getMobileConversationAvatarUrl(conversation)}
          size="large"
          status={activeCount > 0 ? "active" : "idle"}
        />
        <View style={styles.dmPreviewTitleBlock}>
          <Text style={styles.dmPreviewTitle} numberOfLines={1}>
            {responseConversation?.name ?? title}
          </Text>
          <View style={styles.dmMetaRow}>
            <StatusChip
              label={`${activeCount}/${participantCount} ${copy.activePeopleSuffix}`}
              tone={activeCount > 0 ? "success" : "muted"}
            />
            {conversation.unreadCount > 0 ? (
              <StatusChip
                label={`${conversation.unreadCount} ${copy.unreadSuffix}`}
                tone="accent"
              />
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRetry}
          style={({ pressed }) => [styles.dmRefreshButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
        </Pressable>
      </View>

      {state.status === "loading" && !state.payload ? (
        <Text style={styles.contractDescription}>{copy.dmMessagesLoading}</Text>
      ) : null}
      {state.status === "error" ? (
        <View style={styles.dmErrorRow}>
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : null}
      {state.payload && state.payload.messages.length > 0 ? (
        <MessageStream currentUserId={currentUserId} messages={state.payload.messages} />
      ) : null}
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.dmNoMessages}</Text>
      ) : null}
      {state.status === "ready" ? (
        <DMComposer
          attachmentsFeature={attachmentsFeature}
          sendState={conversationSendState}
          mediaState={mediaState}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onSend={onSendMessage}
        />
      ) : null}
    </View>
  );
}

export function DMComposer({
  attachmentsFeature,
  mediaState,
  onClearSelectedMediaAsset,
  onDraftChange,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSend,
  placeholder = copy.dmComposerPlaceholder,
  sendActionLabel = copy.dmSendAction,
  sendState,
  sendingActionLabel = copy.dmSendingAction,
  variant = "default",
}: {
  attachmentsFeature?: MobileBootstrapFeature | null;
  mediaState?: MobileMediaRuntimeState;
  onClearSelectedMediaAsset?: () => void;
  onDraftChange?: (content: string) => void;
  onRequestDocumentPicker?: () => Promise<void>;
  onRequestPhotoLibraryPicker?: () => Promise<void>;
  onSend(content: string): Promise<boolean>;
  placeholder?: string;
  sendActionLabel?: string;
  sendState: MobileChannelSendViewState | MobileDMSendViewState;
  sendingActionLabel?: string;
  variant?: "channel" | "default";
}) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();
  const selectedAsset = mediaState?.selectedAsset ?? null;
  const isPickingDocument = mediaState?.status === "checking-document-picker";
  const isPickingPhoto = mediaState?.status === "checking-photo-library";
  const attachmentUploadReadiness = getMobileAttachmentUploadReadiness({
    attachmentsFeature: attachmentsFeature ?? null,
    selectedAsset,
  });
  const sendGuard = getMobileAttachmentDraftSendGuard({
    content: trimmedDraft,
    selectedAsset,
  });
  const isSending = sendState.status === "sending";
  const isDisabled = isSending || !sendGuard.canSend;
  const sendBlockText = getAttachmentDraftBlockText(sendGuard.reason, sendGuard.canSend, {
    reason: attachmentUploadReadiness.reason,
  });

  const handleSend = useCallback(async () => {
    if (isDisabled) {
      return;
    }

    const didSend = await onSend(trimmedDraft);
    if (didSend) {
      setDraft("");
      onDraftChange?.("");
    }
  }, [isDisabled, onDraftChange, onSend, trimmedDraft]);

  const handleDraftChange = useCallback(
    (content: string) => {
      setDraft(content);
      onDraftChange?.(content);
    },
    [onDraftChange],
  );

  if (variant === "channel") {
    return (
      <View style={[styles.dmComposer, styles.channelComposer]} testID="mobile-channel-composer">
        {selectedAsset ? (
          <View style={styles.dmComposerAttachmentCard}>
            <View style={styles.dmComposerAttachmentText}>
              <Text style={styles.dmComposerAttachmentTitle} numberOfLines={1}>
                {selectedAsset.name}
              </Text>
              <Text style={styles.dmComposerAttachmentMeta} numberOfLines={1}>
                {formatMobileMediaAssetMeta(selectedAsset)}
              </Text>
            </View>
            {onClearSelectedMediaAsset ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.composerAttachmentClearAction}
                onPress={onClearSelectedMediaAsset}
                style={({ pressed }) => [
                  styles.dmComposerAttachmentClear,
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Ionicons name="close" size={16} color={mobileColors.accentStrong} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <TextInput
          accessibilityLabel={placeholder}
          maxLength={2000}
          multiline
          onChangeText={handleDraftChange}
          placeholder={placeholder}
          placeholderTextColor={mobileColors.mutedSoft}
          style={[styles.dmComposerInput, styles.channelComposerInput]}
          value={draft}
        />

        <View style={styles.channelComposerControlRow}>
          <View style={styles.mobileChannelComposerActions}>
            {onRequestDocumentPicker ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.composerAttachAction}
                accessibilityState={{ disabled: isPickingDocument }}
                disabled={isPickingDocument}
                hitSlop={6}
                onPress={() => void onRequestDocumentPicker()}
                style={({ pressed }) => [
                  styles.channelComposerIconButton,
                  isPickingDocument && styles.channelComposerIconButtonDisabled,
                  pressed && !isPickingDocument && styles.actionButtonPressed,
                ]}
                testID="mobile-channel-attach-button"
              >
                <Ionicons
                  name={isPickingDocument ? "hourglass-outline" : "add"}
                  size={22}
                  color={mobileColors.accentStrong}
                />
              </Pressable>
            ) : null}
            {onRequestPhotoLibraryPicker ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.composerPhotoLibraryAction}
                accessibilityState={{ disabled: isPickingPhoto }}
                disabled={isPickingPhoto}
                hitSlop={6}
                onPress={() => void onRequestPhotoLibraryPicker()}
                style={({ pressed }) => [
                  styles.channelComposerIconButton,
                  isPickingPhoto && styles.channelComposerIconButtonDisabled,
                  pressed && !isPickingPhoto && styles.actionButtonPressed,
                ]}
                testID="mobile-channel-photo-library-button"
              >
                <Ionicons
                  name={isPickingPhoto ? "hourglass-outline" : "image-outline"}
                  size={20}
                  color={mobileColors.accentStrong}
                />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerEmojiUnavailableAction}
              accessibilityState={{ disabled: true }}
              disabled
              hitSlop={6}
              style={[styles.channelComposerIconButton, styles.channelComposerIconButtonUnavailable]}
              testID="mobile-channel-emoji-button"
            >
              <Ionicons name="happy-outline" size={20} color={mobileColors.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerGifUnavailableAction}
              accessibilityState={{ disabled: true }}
              disabled
              hitSlop={6}
              style={[styles.channelComposerGifButton, styles.channelComposerIconButtonUnavailable]}
              testID="mobile-channel-gif-button"
            >
              <Text style={styles.channelComposerGifButtonText}>GIF</Text>
            </Pressable>
          </View>

          <View style={styles.channelComposerSubmitActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerVoiceRecordUnavailableAction}
              accessibilityState={{ disabled: true }}
              disabled
              hitSlop={6}
              style={[styles.channelComposerVoiceButton, styles.channelComposerIconButtonUnavailable]}
              testID="mobile-channel-voice-record-button"
            >
              <Ionicons name="mic-outline" size={22} color={mobileColors.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSending ? sendingActionLabel : sendActionLabel}
              accessibilityState={{ disabled: isDisabled }}
              disabled={isDisabled}
              hitSlop={4}
              onPress={() => void handleSend()}
              style={({ pressed }) => [
                styles.channelComposerSendButton,
                isDisabled && styles.channelComposerSendButtonDisabled,
                pressed && !isDisabled && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-send-button"
            >
              <Ionicons
                name={isSending ? "hourglass-outline" : "paper-plane"}
                size={20}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        </View>

        {sendBlockText ? (
          <Text style={styles.dmComposerAttachmentNotice}>{sendBlockText}</Text>
        ) : null}
        {sendState.status === "error" && sendState.error ? (
          <Text style={styles.dmSendErrorText}>{sendState.error}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.dmComposer}>
      <View style={styles.dmComposerToolbar}>
        {onRequestDocumentPicker ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.composerAttachAction}
            accessibilityState={{ disabled: isPickingDocument }}
            disabled={isPickingDocument}
            onPress={() => void onRequestDocumentPicker()}
            style={({ pressed }) => [
              styles.dmAttachButton,
              isPickingDocument && styles.dmAttachButtonDisabled,
              pressed && !isPickingDocument && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.dmAttachButtonText}>
              {isPickingDocument ? copy.composerAttachmentChecking : "+"}
            </Text>
          </Pressable>
        ) : null}
        {onRequestPhotoLibraryPicker ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.composerPhotoLibraryAction}
            accessibilityState={{ disabled: isPickingPhoto }}
            disabled={isPickingPhoto}
            onPress={() => void onRequestPhotoLibraryPicker()}
            style={({ pressed }) => [
              styles.dmAttachButton,
              isPickingPhoto && styles.dmAttachButtonDisabled,
              pressed && !isPickingPhoto && styles.actionButtonPressed,
            ]}
          >
            <Ionicons
              name={isPickingPhoto ? "hourglass-outline" : "image-outline"}
              size={18}
              color={mobileColors.accentStrong}
            />
          </Pressable>
        ) : null}
        <Text style={styles.dmComposerToolbarText} numberOfLines={1}>
          {selectedAsset ? copy.composerAttachmentDraftLabel : placeholder}
        </Text>
      </View>
      {selectedAsset ? (
        <View style={styles.dmComposerAttachmentCard}>
          <View style={styles.dmComposerAttachmentText}>
            <Text style={styles.dmComposerAttachmentTitle} numberOfLines={1}>
              {selectedAsset.name}
            </Text>
            <Text style={styles.dmComposerAttachmentMeta} numberOfLines={1}>
              {formatMobileMediaAssetMeta(selectedAsset)}
            </Text>
          </View>
          {onClearSelectedMediaAsset ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerAttachmentClearAction}
              onPress={onClearSelectedMediaAsset}
              style={({ pressed }) => [
                styles.dmComposerAttachmentClear,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text style={styles.dmComposerAttachmentClearText}>x</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <TextInput
        accessibilityLabel={placeholder}
        maxLength={2000}
        multiline
        onChangeText={handleDraftChange}
        placeholder={placeholder}
        placeholderTextColor={mobileColors.mutedSoft}
        style={styles.dmComposerInput}
        value={draft}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isSending ? sendingActionLabel : sendActionLabel}
        accessibilityState={{ disabled: isDisabled }}
        disabled={isDisabled}
        onPress={() => void handleSend()}
        style={({ pressed }) => [
          styles.dmSendButton,
          isDisabled && styles.dmSendButtonDisabled,
          pressed && !isDisabled && styles.actionButtonPressed,
        ]}
      >
        <Text style={styles.dmSendButtonText}>
          {isSending ? sendingActionLabel : sendActionLabel}
        </Text>
      </Pressable>
      {sendBlockText ? <Text style={styles.dmComposerAttachmentNotice}>{sendBlockText}</Text> : null}
      {sendState.status === "error" && sendState.error ? (
        <Text style={styles.dmSendErrorText}>{sendState.error}</Text>
      ) : null}
    </View>
  );
}

function getAttachmentDraftBlockText(
  guardReason: ReturnType<typeof getMobileAttachmentDraftSendGuard>["reason"],
  canSend: boolean,
  uploadReadiness: Pick<ReturnType<typeof getMobileAttachmentUploadReadiness>, "reason">,
) {
  if (canSend || guardReason === null || guardReason === "empty-message") {
    return null;
  }

  switch (uploadReadiness.reason) {
    case "disabled":
      return copy.composerAttachmentDisabled;
    case "file-size-unavailable":
    case "missing-mime-type":
      return copy.composerAttachmentMetadataMissing;
    case "file-too-large":
      return copy.composerAttachmentTooLarge;
    case "missing-feature":
      return copy.composerAttachmentUnknown;
    case "native-permission-required":
      return copy.composerAttachmentNativePermissionPending;
    case "server-contract-required":
      return copy.composerAttachmentServerPending;
    case "unsupported-content-type":
      return copy.composerAttachmentUnsupported;
    case "no-selected-asset":
    case "ready":
      return copy.composerAttachmentUploadPending;
    default:
      return copy.composerAttachmentUploadPending;
  }
}

function MetricMiniPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricMiniPill}>
      <Text style={styles.metricMiniValue}>{value}</Text>
      <Text style={styles.metricMiniLabel}>{label}</Text>
    </View>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "accent" | "muted" | "success" }) {
  return (
    <View
      style={[
        styles.statusChip,
        tone === "accent" && styles.statusChipAccent,
        tone === "success" && styles.statusChipSuccess,
      ]}
    >
      <View
        style={[
          styles.statusChipDot,
          tone === "accent" && styles.statusChipDotAccent,
          tone === "success" && styles.statusChipDotSuccess,
        ]}
      />
      <Text style={styles.statusChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <View style={styles.settingsSection}>
      <View style={styles.settingsSectionHeader}>
        <Text style={styles.environmentLabel}>{title}</Text>
        <Text style={styles.contractDescription}>{description}</Text>
      </View>
      {children}
    </View>
  );
}

function SettingsEvidenceGrid({ items }: { items: readonly MobileSettingsEvidenceItem[] }) {
  return (
    <View style={styles.settingsEvidenceGrid}>
      {items.map((item) => (
        <View
          key={item.id}
          style={[
            styles.settingsEvidenceTile,
            item.tone === "success" && styles.settingsEvidenceTileSuccess,
            item.tone === "warning" && styles.settingsEvidenceTileWarning,
            item.tone === "danger" && styles.settingsEvidenceTileDanger,
          ]}
        >
          <Text style={styles.settingsEvidenceLabel}>{item.label}</Text>
          <Text style={styles.settingsEvidenceValue} numberOfLines={1}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SettingsEvidenceList({ items }: { items: readonly MobileSettingsEvidenceItem[] }) {
  return (
    <View style={styles.settingsEvidenceList}>
      {items.map((item) => (
        <View key={item.id} style={styles.settingsEvidenceRow}>
          <View
            style={[
              styles.settingsEvidenceDot,
              item.tone === "success" && styles.settingsEvidenceDotSuccess,
              item.tone === "warning" && styles.settingsEvidenceDotWarning,
              item.tone === "danger" && styles.settingsEvidenceDotDanger,
            ]}
          />
          <View style={styles.settingsEvidenceRowText}>
            <Text style={styles.settingsEvidenceRowTitle} numberOfLines={1}>
              {item.label}
            </Text>
            {item.description ? (
              <Text style={styles.settingsEvidenceDescription} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
          <Text
            style={[
              styles.settingsEvidenceRowValue,
              item.tone === "success" && styles.settingsEvidenceRowValueSuccess,
              item.tone === "warning" && styles.settingsEvidenceRowValueWarning,
              item.tone === "danger" && styles.settingsEvidenceRowValueDanger,
            ]}
            numberOfLines={1}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FeatureStatusCard({
  label,
  reason,
  status,
}: {
  label: string;
  reason: string;
  status: MobileBootstrapPayload["features"]["voice"]["status"];
}) {
  const isAvailable = status === "available";

  return (
    <View style={[styles.statusCard, isAvailable && styles.statusCardSuccess]}>
      <View style={[styles.statusIcon, isAvailable && styles.statusIconSuccess]}>
        <Text style={styles.statusIconText}>{isAvailable ? "OK" : "!"}</Text>
      </View>
      <View style={styles.statusCardText}>
        <Text style={styles.environmentLabel}>{label}</Text>
        <Text style={styles.statusCardTitle}>{status}</Text>
        <Text style={styles.statusCardDescription}>{reason}</Text>
      </View>
    </View>
  );
}

function AvatarMark({
  imageUrl,
  label,
  size = "regular",
  status,
}: {
  imageUrl: string | null;
  label: string;
  size?: "large" | "regular" | "small";
  status?: "active" | "idle";
}) {
  const fallback = label.trim().slice(0, 2).toUpperCase() || "W";
  const avatarStyles = [
    styles.avatarMark,
    size === "large" && styles.avatarMarkLarge,
    size === "small" && styles.avatarMarkSmall,
  ];
  const avatarShellStyles = [
    styles.avatarShell,
    size === "large" && styles.avatarShellLarge,
    size === "small" && styles.avatarShellSmall,
  ];

  if (imageUrl) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        accessibilityRole="image"
        style={avatarShellStyles}
      >
        <Image
          source={{ uri: imageUrl }}
          style={avatarStyles}
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
        />
        {status ? (
          <View style={[styles.avatarStatus, status === "active" && styles.avatarStatusActive]} />
        ) : null}
      </View>
    );
  }

  return (
    <View accessible accessibilityLabel={label} accessibilityRole="image" style={avatarShellStyles}>
      <View style={avatarStyles}>
        <Text style={[styles.avatarMarkText, size === "small" && styles.avatarMarkTextSmall]}>
          {fallback}
        </Text>
      </View>
      {status ? (
        <View style={[styles.avatarStatus, status === "active" && styles.avatarStatusActive]} />
      ) : null}
    </View>
  );
}

function ReleaseReadinessCard() {
  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.releaseTitle}</Text>
      <Text style={styles.contractTitle}>{copy.releaseReady}</Text>
      <View style={styles.releaseBudgetList}>
        {MOBILE_RELEASE_BUDGETS.map((budget) => (
          <View key={budget.metric} style={styles.releaseBudgetRow}>
            <Text style={styles.releaseBudgetMetric}>{budget.metric}</Text>
            <Text style={styles.releaseBudgetTarget}>{budget.target}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StoreReadinessCard() {
  const isReady = mobileStoreReadiness.blockers.length === 0;

  return (
    <View style={[styles.contractCard, isReady && styles.storeReadyCard]}>
      <Text style={styles.environmentLabel}>{copy.storeTitle}</Text>
      <Text style={styles.contractTitle}>{isReady ? copy.storeReady : copy.storeNeedsReview}</Text>
      <Text style={styles.contractDescription}>{copy.storeDescription}</Text>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.storePermissionsLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>{mobileStoreReadiness.permissionCount}</Text>
      </View>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.storePrivacyLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>
          {mobileStoreReadiness.privacyRequirementCount}
        </Text>
      </View>
    </View>
  );
}

function ProductionReadinessCard() {
  const firstGates = MOBILE_PRODUCTION_READINESS_GATES.slice(0, 4)
    .map((gate) => gate.id)
    .join(" - ");

  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.productionReadinessTitle}</Text>
      <Text style={styles.contractTitle}>{copy.productionReadinessReady}</Text>
      <Text style={styles.contractDescription}>{copy.productionReadinessDescription}</Text>
      <View style={styles.qualityGrid}>
        <MetricTile
          label={copy.productionReadinessStagesLabel}
          value={mobileProductionReadinessSummary.stageCount}
        />
        <MetricTile
          label={copy.productionReadinessGatesLabel}
          value={mobileProductionReadinessSummary.totalGateCount}
        />
        <MetricTile
          label={copy.productionReadinessCriticalLabel}
          value={mobileProductionReadinessSummary.criticalGateCount}
        />
      </View>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.productionReadinessAutomationLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>
          {mobileProductionReadinessSummary.automatedGateCount}
        </Text>
      </View>
      <Text style={styles.contractDescription} numberOfLines={2}>
        {firstGates}
      </Text>
    </View>
  );
}

function MobileQualityGateCard() {
  const firstTargets = MOBILE_QA_DEVICE_MATRIX.slice(0, 3)
    .map((target) => target.label)
    .join(" - ");
  const criticalChecks = MOBILE_MANUAL_QA_CHECKS.filter((check) => check.risk === "critical");

  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.qualityTitle}</Text>
      <Text style={styles.contractTitle}>{copy.qualityReady}</Text>
      <Text style={styles.contractDescription}>{copy.qualityDescription}</Text>
      <View style={styles.qualityGrid}>
        <MetricTile
          label={copy.qualityAutomatedLabel}
          value={mobileQualitySummary.automatedGateCount}
        />
        <MetricTile label={copy.qualityManualLabel} value={mobileQualitySummary.manualCheckCount} />
        <MetricTile label={copy.qualityDeviceLabel} value={mobileQualitySummary.targetCount} />
      </View>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.qualityCriticalLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>
          {criticalChecks.length} / {mobileQualitySummary.manualCheckCount}
        </Text>
      </View>
      <Text style={styles.contractDescription} numberOfLines={2}>
        {firstTargets}
      </Text>
    </View>
  );
}

function SessionDiagnostics({ diagnostics }: { diagnostics: MobileSessionDiagnostics }) {
  return (
    <View style={styles.diagnosticsRow}>
      <DiagnosticPill label="Session" value={diagnostics.hasSession ? "var" : "yok"} />
      <DiagnosticPill label="Scopes" value={String(diagnostics.scopeCount)} />
      <DiagnosticPill label="Refresh" value={diagnostics.hasRefreshToken ? "hazır" : "yok"} />
    </View>
  );
}

function DeepLinkStatusCard({ result }: { result: MobileDeepLinkParseResult | null }) {
  const statusLabel = getDeepLinkStatusLabel(result);
  const isRejected = result?.ok === false;

  return (
    <View style={[styles.statusCard, isRejected && styles.statusCardWarning]}>
      <View style={[styles.statusIcon, isRejected && styles.statusIconWarning]}>
        <Text style={styles.statusIconText}>{isRejected ? "!" : "OK"}</Text>
      </View>
      <View style={styles.statusCardText}>
        <Text style={styles.environmentLabel}>{copy.deepLinkTitle}</Text>
        <Text style={styles.statusCardTitle}>{statusLabel.title}</Text>
        <Text style={styles.statusCardDescription}>{statusLabel.description}</Text>
      </View>
    </View>
  );
}

function PermissionReadinessCard({
  compactFeature,
  readiness,
  summary,
}: {
  compactFeature?: "attachments" | "camera" | "messages" | "voice";
  readiness: readonly MobilePermissionReadiness[];
  summary: MobilePermissionSummary;
}) {
  const visibleReadiness = compactFeature
    ? getPermissionReadinessForFeature(readiness, compactFeature)
    : readiness;

  return (
    <View style={styles.permissionCard}>
      <View style={styles.permissionHeader}>
        <View style={styles.permissionHeaderText}>
          <Text style={styles.environmentLabel}>{copy.permissionTitle}</Text>
          <Text style={styles.permissionTitle}>{copy.permissionReady}</Text>
        </View>
        <View style={styles.permissionCountBadge}>
          <Text style={styles.permissionCountText}>
            {summary.granted}/{summary.total}
          </Text>
        </View>
      </View>
      <View style={styles.permissionChipRow}>
        {visibleReadiness.map((item) => (
          <View key={item.intent.id} style={styles.permissionChip}>
            <View
              style={[
                styles.permissionChipDot,
                item.status === "granted" && styles.permissionChipDotGranted,
                (item.status === "blocked" || item.status === "denied") &&
                  styles.permissionChipDotDenied,
              ]}
            />
            <Text style={styles.permissionChipText}>{getMobilePermissionLabel(item.intent.id)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EmptyState({ label, tone }: { label: string; tone: "accent" | "success" }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, tone === "success" && styles.emptyIconSuccess]}>
        <Text style={styles.emptyIconText}>{tone === "success" ? "OK" : "D"}</Text>
      </View>
      <Text style={styles.emptyStateText}>{label}</Text>
    </View>
  );
}

function getInviteReadinessDescription(readiness: MobileInviteReadiness): string {
  switch (readiness.reason) {
    case "ready":
      return copy.inviteReadinessReady;
    case "disabled":
      return copy.inviteReadinessDisabled;
    case "missing-feature":
      return copy.inviteReadinessMissingFeature;
    case "server-contract-required":
      return copy.inviteReadinessServerPending;
    case "unsafe-link":
      return copy.inviteReadinessUnsafe;
    case "not-an-invite":
    default:
      return copy.inviteReadinessIdle;
  }
}

function getInviteReadinessTone(readiness: MobileInviteReadiness): NativeSettingsRowItem["tone"] {
  if (readiness.reason === "ready") {
    return "success";
  }

  if (readiness.reason === "unsafe-link") {
    return "danger";
  }

  if (
    readiness.reason === "server-contract-required" ||
    readiness.reason === "missing-feature"
  ) {
    return "warning";
  }

  return "neutral";
}

function getInviteReadinessValue(readiness: MobileInviteReadiness): string {
  if (readiness.reason === "ready") {
    return copy.settingsReadyLabel;
  }

  if (readiness.reason === "not-an-invite") {
    return copy.settingsMissingLabel;
  }

  if (readiness.reason === "disabled") {
    return copy.settingsFeatureDisabled;
  }

  return copy.settingsPendingLabel;
}

function getDeepLinkStatusLabel(result: MobileDeepLinkParseResult | null) {
  if (!result) {
    return {
      description: copy.deepLinkReady,
      title: copy.deepLinkReady,
    };
  }

  if (!result.ok) {
    return {
      description: `${copy.deepLinkRejected}: ${result.reason}`,
      title: copy.deepLinkRejected,
    };
  }

  switch (result.intent.type) {
    case "auth-handoff":
      return {
        description: copy.deepLinkAuthPending,
        title: copy.deepLinkAccepted,
      };
    case "invite":
      return {
        description: copy.deepLinkInvitePending,
        title: copy.deepLinkAccepted,
      };
    case "route":
      return {
        description: copy.deepLinkRoutePending,
        title: copy.deepLinkAccepted,
      };
    default:
      return {
        description: copy.deepLinkReady,
        title: copy.deepLinkReady,
      };
  }
}

function DiagnosticPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagnosticPill}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={styles.diagnosticValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  disabled = false,
  label,
  onPress,
  testID,
  variant,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
  testID?: string;
  variant: "danger" | "primary" | "secondary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "primary" && styles.actionButtonPrimary,
        variant === "danger" && styles.actionButtonDanger,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === "primary" && styles.actionButtonTextPrimary,
          variant === "danger" && styles.actionButtonTextDanger,
          disabled && styles.actionButtonTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  homeScreen: {
    flexGrow: 1,
    gap: 12,
    minWidth: 0,
  },
  chatScreen: {
    flexGrow: 1,
    gap: 12,
    minWidth: 0,
  },
  homeGreetingHeader: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  homeGreetingText: {
    flex: 1,
    minWidth: 0,
  },
  homeGreetingTitle: {
    color: mobileColors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  homeGreetingSubtitle: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  homeNotificationButton: {
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  homeNotificationButtonText: {
    color: mobileColors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  screenCard: {
    flexGrow: 1,
    gap: 8,
    minWidth: 0,
    borderRadius: mobileRadii.card,
    backgroundColor: "transparent",
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  screenEyebrow: {
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  screenTitle: {
    color: mobileColors.text,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "900",
  },
  screenDescription: {
    color: mobileColors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  screenBody: {
    gap: mobileSpacing.row,
    marginTop: 6,
    minWidth: 0,
  },
  settingsHeroCard: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F8FAFF",
    padding: 12,
  },
  settingsHeroText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  settingsHeroTitle: {
    color: mobileColors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  settingsHeroMeta: {
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  settingsHeroBadge: {
    maxWidth: 128,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  settingsHeroBadgeText: {
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
  },
  settingsSection: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    padding: 12,
  },
  settingsSectionHeader: {
    gap: 4,
    minWidth: 0,
  },
  settingsSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  settingsSessionActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    minWidth: 0,
  },
  settingsSectionActions: {
    minWidth: 0,
  },
  settingsPermissionActionList: {
    gap: 8,
    minWidth: 0,
  },
  settingsPermissionActionRow: {
    minHeight: 64,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E9E5FF",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  settingsPermissionActionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F2EFFF",
  },
  settingsPermissionActionIconSuccess: {
    backgroundColor: "#DCFCE7",
  },
  settingsPermissionActionIconDanger: {
    backgroundColor: "#FEE2E2",
  },
  settingsPermissionActionIconWarning: {
    backgroundColor: "#FEF3C7",
  },
  settingsPermissionActionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  settingsPermissionActionControls: {
    width: 104,
    alignItems: "flex-end",
    gap: 6,
  },
  settingsPermissionActionButton: {
    minHeight: 30,
    maxWidth: 104,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  settingsPermissionActionButtonDisabled: {
    opacity: 0.52,
    backgroundColor: "#F8FAFF",
  },
  settingsPermissionActionButtonText: {
    color: mobileColors.accentStrong,
    fontSize: 10,
    fontWeight: "900",
  },
  settingsPermissionAssetCard: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#E9E5FF",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F8FAFF",
    padding: 10,
  },
  settingsPermissionAssetText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  settingsLocaleControl: {
    gap: 8,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#E9E5FF",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    padding: 8,
  },
  settingsLocaleDescription: {
    color: mobileColors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  settingsLocaleOptions: {
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
  },
  settingsLocaleOption: {
    flex: 1,
    minHeight: mobileSizing.minTouchTarget,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  settingsLocaleOptionSelected: {
    borderColor: "#C4B5FD",
    backgroundColor: "#EEE9FF",
  },
  settingsLocaleShortLabel: {
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  settingsLocaleShortLabelSelected: {
    color: mobileColors.accentStrong,
  },
  settingsLocaleOptionLabel: {
    minWidth: 0,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  settingsLocaleOptionLabelSelected: {
    color: mobileColors.text,
    fontWeight: "900",
  },
  nativeSettingsList: {
    gap: 7,
    minWidth: 0,
  },
  nativeSettingsRow: {
    minHeight: 56,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  nativeSettingsDot: {
    width: 10,
    height: 10,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.mutedSoft,
  },
  nativeSettingsDotSuccess: {
    backgroundColor: mobileColors.success,
  },
  nativeSettingsDotWarning: {
    backgroundColor: mobileColors.warning,
  },
  nativeSettingsDotDanger: {
    backgroundColor: "#EF4444",
  },
  nativeSettingsRowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nativeSettingsRowTitle: {
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  nativeSettingsRowDescription: {
    color: mobileColors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  nativeSettingsRowValue: {
    maxWidth: 92,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "right",
  },
  nativeSettingsRowValueSuccess: {
    color: "#047857",
  },
  nativeSettingsRowValueWarning: {
    color: "#B45309",
  },
  nativeSettingsRowValueDanger: {
    color: "#B91C1C",
  },
  settingsEvidenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  settingsEvidenceTile: {
    flexGrow: 1,
    flexBasis: 92,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  settingsEvidenceTileSuccess: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  settingsEvidenceTileWarning: {
    borderColor: "#FED7AA",
    backgroundColor: "#FFF7ED",
  },
  settingsEvidenceTileDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  settingsEvidenceLabel: {
    color: mobileColors.mutedSoft,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  settingsEvidenceValue: {
    marginTop: 4,
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  settingsEvidenceList: {
    gap: 7,
    minWidth: 0,
  },
  settingsEvidenceRow: {
    minHeight: 46,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  settingsEvidenceDot: {
    width: 9,
    height: 9,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.mutedSoft,
  },
  settingsEvidenceDotSuccess: {
    backgroundColor: mobileColors.success,
  },
  settingsEvidenceDotWarning: {
    backgroundColor: mobileColors.warning,
  },
  settingsEvidenceDotDanger: {
    backgroundColor: "#EF4444",
  },
  settingsEvidenceRowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  settingsEvidenceRowTitle: {
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  settingsEvidenceDescription: {
    color: mobileColors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  settingsEvidenceRowValue: {
    maxWidth: 92,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },
  settingsEvidenceRowValueSuccess: {
    color: "#047857",
  },
  settingsEvidenceRowValueWarning: {
    color: "#B45309",
  },
  settingsEvidenceRowValueDanger: {
    color: "#B91C1C",
  },
  settingsFootnote: {
    color: mobileColors.mutedSoft,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  developerSection: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.card,
    backgroundColor: "#FAFBFF",
    padding: 12,
  },
  developerSectionHeader: {
    gap: 4,
    minWidth: 0,
  },
  environmentCard: {
    gap: 4,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    padding: 14,
  },
  contractCard: {
    gap: 8,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    padding: 14,
  },
  homeSectionCard: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  activeScreenFrame: {
    flex: 1,
    minWidth: 0,
  },
  dmInboxScreen: {
    gap: 16,
  },
  dmListCard: {
    gap: 12,
    minWidth: 0,
  },
  dmInboxHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  dmComposeButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: mobileColors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  dmInboxHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  dmInboxTitle: {
    color: mobileColors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
  },
  dmInboxDescription: {
    color: mobileColors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  dmSummaryCard: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#D8D2FF",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 14,
    shadowColor: mobileColors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  dmSummaryIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#EDE9FE",
  },
  dmSummaryContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  dmSummaryTitle: {
    color: mobileColors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  dmSummaryDescription: {
    color: mobileColors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  dmSummaryMetricGrid: {
    gap: 8,
    width: 88,
  },
  cardHeaderRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  dmListMetricStack: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    maxWidth: 128,
  },
  dmSearchRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dmSearchShell: {
    minHeight: 50,
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
  },
  dmSearchFilterButton: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  inboxSearchShell: {
    minHeight: 46,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  inboxSearchIcon: {
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  inboxSearchInput: {
    minHeight: 44,
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 0,
  },
  inboxFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    minWidth: 0,
  },
  inboxFilterButton: {
    minHeight: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  inboxFilterButtonActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  inboxFilterButtonDisabled: {
    opacity: 0.56,
  },
  inboxFilterButtonText: {
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  inboxFilterButtonTextActive: {
    color: mobileColors.accentStrong,
  },
  inboxFilterButtonTextDisabled: {
    color: mobileColors.mutedSoft,
  },
  inboxResultText: {
    color: mobileColors.mutedSoft,
    fontSize: 11,
    fontWeight: "800",
  },
  dmSectionHeaderRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dmSectionTitle: {
    color: mobileColors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  dmConversationList: {
    gap: 2,
    minWidth: 0,
  },
  dmConversationCard: {
    minHeight: 86,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: mobileColors.shadow,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.045,
    shadowRadius: 12,
    elevation: 1,
  },
  dmConversationCardSelected: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F8F7FF",
  },
  dmConversationCardPressed: {
    opacity: 0.88,
  },
  dmConversationContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  dmConversationTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dmConversationName: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  dmConversationRightMeta: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dmConversationTime: {
    color: mobileColors.mutedSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  dmConversationPreview: {
    color: mobileColors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  dmConversationFooterRow: {
    minHeight: 24,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },
  dmUnreadBadge: {
    minWidth: 20,
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 6,
  },
  dmActivePresencePill: {
    minHeight: 24,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
  },
  dmActivePresenceDot: {
    width: 6,
    height: 6,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.success,
  },
  dmActivePresenceText: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "900",
  },
  metricMiniPill: {
    minWidth: 52,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  metricMiniValue: {
    color: mobileColors.text,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "900",
  },
  metricMiniLabel: {
    marginTop: 2,
    color: mobileColors.mutedSoft,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  storeReadyCard: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F8FFFB",
  },
  syncCard: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  syncHeader: {
    gap: 3,
    minWidth: 0,
  },
  syncDescription: {
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  syncChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  syncChip: {
    minHeight: 44,
    minWidth: 118,
    flexGrow: 1,
    flexBasis: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  syncChipFresh: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  syncChipStale: {
    borderColor: "#FED7AA",
    backgroundColor: "#FFF7ED",
  },
  syncChipError: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  syncDot: {
    width: 9,
    height: 9,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.mutedSoft,
  },
  syncDotFresh: {
    backgroundColor: mobileColors.success,
  },
  syncDotStale: {
    backgroundColor: mobileColors.warning,
  },
  syncDotError: {
    backgroundColor: "#EF4444",
  },
  syncChipText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  syncChipLabel: {
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  syncChipValue: {
    color: mobileColors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  workspaceCard: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.card,
    backgroundColor: "#FAFBFF",
    padding: 12,
  },
  workspaceBrowserShell: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  mobileServerRail: {
    width: 56,
    alignItems: "center",
    gap: 8,
    borderRightWidth: 1,
    borderRightColor: "#E8ECF8",
    paddingRight: 7,
    paddingVertical: 2,
  },
  mobileServerRailLogo: {
    width: 38,
    height: 38,
    borderRadius: 14,
  },
  mobileServerRailDivider: {
    width: 28,
    height: 1,
    borderRadius: mobileRadii.pill,
    backgroundColor: "#E4E7F4",
  },
  mobileServerRailList: {
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  mobileServerRailItem: {
    position: "relative",
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 17,
  },
  mobileServerRailItemActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
    shadowColor: "#6D5DFB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 13,
    elevation: 3,
  },
  mobileServerRailBadge: {
    position: "absolute",
    right: -2,
    top: -3,
    minWidth: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 15,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  mobileServerRailAddButton: {
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: 17,
    backgroundColor: "#F8FAFF",
    opacity: 0.74,
  },
  mobileWorkspacePanel: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  mobileChannelChatKeyboard: {
    flex: 1,
    minWidth: 0,
  },
  mobileChannelChatScreen: {
    flex: 1,
    minWidth: 0,
    gap: 0,
    backgroundColor: "#FFFFFF",
  },
  mobileChannelChatHeader: {
    minHeight: 68,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  mobileChannelChatBackButton: {
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: "transparent",
  },
  mobileChannelChatIconButton: {
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    borderRadius: 16,
    backgroundColor: "#F8FAFF",
  },
  mobileChannelChatIconButtonActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  mobileChannelChatIconButtonDisabled: {
    opacity: 0.58,
  },
  mobileChannelChatHash: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#F2EFFF",
  },
  mobileChannelChatHashText: {
    color: mobileColors.accentStrong,
    fontSize: 24,
    fontWeight: "900",
  },
  mobileChannelChatHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  mobileChannelChatTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  mobileChannelChatTitlePrefix: {
    color: mobileColors.accentStrong,
    fontSize: 15,
    fontWeight: "900",
  },
  mobileChannelChatTitle: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  mobileChannelChatMetaRow: {
    marginTop: 3,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  mobileChannelChatServerName: {
    maxWidth: "62%",
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  mobileChannelChatDot: {
    color: mobileColors.success,
    fontSize: 11,
    fontWeight: "900",
  },
  mobileChannelChatMemberCount: {
    color: mobileColors.success,
    fontSize: 11,
    fontWeight: "900",
  },
  mobileChannelChatTopic: {
    marginTop: 4,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  mobileChannelChatBodyShell: {
    position: "relative",
    flex: 1,
    minWidth: 0,
  },
  mobileChannelChatBody: {
    flex: 1,
    minWidth: 0,
  },
  mobileChannelChatBodyContent: {
    flexGrow: 1,
    minHeight: 180,
    minWidth: 0,
    gap: 13,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 18,
  },
  mobileChannelChatBodyEmptyContent: {
    justifyContent: "center",
  },
  channelScrollToBottomButton: {
    position: "absolute",
    right: 14,
    bottom: 14,
    zIndex: 3,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  mobileChannelTypingIndicator: {
    minHeight: 22,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
  },
  mobileChannelTypingText: {
    minWidth: 0,
    flexShrink: 1,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  mobileChannelTypingDots: {
    flexDirection: "row",
    gap: 3,
  },
  mobileChannelTypingDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: mobileColors.mutedSoft,
  },
  mobileVoiceChannelScreen: {
    flex: 1,
    minWidth: 0,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: mobileRadii.card,
    backgroundColor: "#FFFFFF",
    padding: 10,
  },
  mobileVoiceChannelHeader: {
    minHeight: 54,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2FF",
    paddingBottom: 9,
  },
  mobileVoiceHeaderDisabledButton: {
    opacity: 0.56,
  },
  mobileVoiceChannelHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  mobileVoiceChannelTitle: {
    color: mobileColors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  mobileVoiceStatusRow: {
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  mobileVoiceError: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FEF2F2",
    color: "#B91C1C",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mobileVoiceChannelContent: {
    gap: 10,
    minWidth: 0,
    paddingBottom: 6,
  },
  mobileVoiceStatusText: {
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  mobileVoiceSectionCard: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  mobileVoiceSectionHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  mobileVoiceSectionTitle: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  mobileVoiceSectionCount: {
    minWidth: 24,
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F4F1FF",
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 21,
    paddingHorizontal: 7,
    textAlign: "center",
  },
  mobileVoiceParticipantList: {
    gap: 7,
    minWidth: 0,
  },
  mobileVoiceParticipantRow: {
    minHeight: 58,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#EEF2FF",
    borderRadius: 15,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mobileVoiceParticipantRowSpeaking: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  mobileVoiceParticipantText: {
    flex: 1,
    minWidth: 0,
  },
  mobileVoiceParticipantTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mobileVoiceParticipantTitle: {
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  mobileVoiceSelfBadge: {
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#EDE9FE",
    color: mobileColors.accentStrong,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 18,
    paddingHorizontal: 7,
  },
  mobileVoiceParticipantSubtitle: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  mobileVoiceLevelBars: {
    width: 34,
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
  },
  mobileVoiceLevelBar: {
    width: 4,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.success,
  },
  mobileVoiceEmptyText: {
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  mobileVoiceInviteCandidateList: {
    gap: 7,
    minWidth: 0,
  },
  mobileVoiceInviteCandidateRow: {
    minHeight: 56,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#EEF2FF",
    borderRadius: 18,
    backgroundColor: "#FAFBFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mobileVoiceInviteCandidateText: {
    flex: 1,
    minWidth: 0,
  },
  mobileVoiceInviteCandidateTitle: {
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  mobileVoiceInviteCandidateSubtitle: {
    marginTop: 1,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  mobileVoiceInviteCandidateError: {
    marginTop: 3,
    color: "#DC2626",
    fontSize: 10,
    fontWeight: "800",
  },
  mobileVoiceInviteEmpty: {
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  mobileVoiceInviteButton: {
    minHeight: 34,
    minWidth: 78,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    paddingHorizontal: 12,
  },
  mobileVoiceInviteButtonDisabled: {
    backgroundColor: "#EEF2FF",
  },
  mobileVoiceInviteButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  mobileVoiceInviteButtonTextDisabled: {
    color: mobileColors.accentStrong,
  },
  mobileVoiceInviteOverlay: {
    position: "absolute",
    top: 10,
    left: 8,
    right: 8,
    zIndex: 30,
  },
  mobileVoiceInviteOverlayCard: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#C4B5FD",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 10,
    shadowColor: "#6D5DFB",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
  mobileVoiceInviteOverlayIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#F5F3FF",
  },
  mobileVoiceInviteOverlayText: {
    flex: 1,
    minWidth: 0,
  },
  mobileVoiceInviteOverlayTitle: {
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  mobileVoiceInviteOverlayDescription: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  mobileVoiceInviteOverlayActions: {
    gap: 6,
    alignItems: "stretch",
  },
  mobileVoiceInviteOverlayGhostButton: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 10,
  },
  mobileVoiceInviteOverlayGhostText: {
    color: mobileColors.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  mobileVoiceInviteOverlayPrimaryButton: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    paddingHorizontal: 12,
  },
  mobileVoiceInviteOverlayPrimaryText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  mobileVoiceInfoRow: {
    minHeight: 38,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF2FF",
    paddingTop: 9,
  },
  mobileVoiceInfoLabel: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  mobileVoiceInfoValue: {
    maxWidth: "48%",
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },
  mobileVoiceControlBar: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 5,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 7,
    shadowColor: "#6D5DFB",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  mobileVoiceControlButton: {
    width: 49,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 3,
    paddingVertical: 6,
  },
  mobileVoiceControlButtonPrimary: {
    borderColor: mobileColors.accentStrong,
    backgroundColor: mobileColors.accentStrong,
  },
  mobileVoiceControlButtonDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  mobileVoiceControlButtonActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  mobileVoiceControlButtonDisabled: {
    opacity: 0.48,
  },
  mobileVoiceControlLabel: {
    color: mobileColors.muted,
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  mobileVoiceControlLabelPrimary: {
    color: "#FFFFFF",
  },
  mobileVoiceControlLabelDanger: {
    color: "#DC2626",
  },
  mobileVoiceControlLabelDisabled: {
    color: mobileColors.mutedSoft,
  },
  mobileWorkspaceEmpty: {
    gap: 8,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: mobileRadii.card,
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  mobileWorkspaceHeader: {
    minHeight: 50,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  mobileWorkspaceHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  mobileWorkspaceTitle: {
    color: mobileColors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  mobileWorkspaceMeta: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  mobileWorkspaceSearchRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mobileWorkspaceSearchBox: {
    minHeight: 40,
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
  },
  mobileWorkspaceSearchInput: {
    minHeight: 40,
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "700",
    paddingVertical: 0,
  },
  mobileWorkspaceSectionList: {
    gap: 8,
    minWidth: 0,
  },
  mobileWorkspaceSection: {
    gap: 3,
    minWidth: 0,
  },
  mobileWorkspaceSectionHeader: {
    minHeight: 28,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    paddingHorizontal: 1,
    paddingVertical: 3,
  },
  mobileWorkspaceSectionTitle: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.mutedSoft,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  mobileWorkspaceSectionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mobileWorkspaceSectionCount: {
    minWidth: 18,
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F4F1FF",
    color: mobileColors.accentStrong,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 17,
    paddingHorizontal: 5,
    textAlign: "center",
  },
  mobileWorkspaceChannelList: {
    gap: 2,
    minWidth: 0,
  },
  mobileWorkspaceChannelRow: {
    minHeight: 40,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  mobileWorkspaceChannelRowActive: {
    borderColor: "#DDD6FE",
    backgroundColor: "#F4F1FF",
  },
  mobileWorkspaceChannelIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EEF2FF",
  },
  mobileWorkspaceChannelIconVoice: {
    backgroundColor: "#ECFDF5",
  },
  mobileWorkspaceChannelText: {
    flex: 1,
    minWidth: 0,
  },
  mobileWorkspaceChannelName: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  mobileWorkspaceChannelMeta: {
    marginTop: 1,
    color: mobileColors.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  mobileWorkspaceUnreadDot: {
    minWidth: 20,
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#EEF2FF",
    color: mobileColors.accentStrong,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 18,
    paddingHorizontal: 5,
    textAlign: "center",
  },
  workspaceHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  workspaceHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  workspaceSelectedServer: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  workspaceHint: {
    color: mobileColors.mutedSoft,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  workspaceChannelList: {
    gap: 7,
    minWidth: 0,
  },
  workspaceChannelRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  workspaceChannelIcon: {
    width: 28,
    color: mobileColors.accentStrong,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  workspaceChannelIconLarge: {
    width: 34,
    height: 34,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#EEF2FF",
    color: mobileColors.accentStrong,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 34,
    textAlign: "center",
  },
  contractTitle: {
    color: mobileColors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  contractDescription: {
    color: mobileColors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  contractEndpoint: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#EEF2FF",
    color: mobileColors.accentStrong,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  bootstrapNotice: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F5F3FF",
    padding: 12,
  },
  bootstrapNoticeError: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  bootstrapNoticeText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  retryButton: {
    minHeight: mobileSizing.minTouchTarget,
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  retryButtonText: {
    color: mobileColors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  syncHealthBanner: {
    minWidth: 0,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  syncHealthBannerError: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  syncHealthIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
  },
  syncHealthIconRefreshing: {
    backgroundColor: "#FFFFFF",
  },
  syncHealthIconError: {
    backgroundColor: "#FEE2E2",
  },
  syncHealthIconText: {
    color: "#DC2626",
    fontSize: 16,
    fontWeight: "900",
  },
  syncHealthText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  syncHealthTitle: {
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  syncHealthDescription: {
    color: mobileColors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  syncHealthRetryButton: {
    minHeight: mobileSizing.minTouchTarget,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  syncHealthRetryText: {
    color: mobileColors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  notificationRuntimeCard: {
    gap: 12,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  notificationRuntimeCardReady: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F8FFFB",
  },
  notificationRuntimeCardWarning: {
    borderColor: "#FED7AA",
    backgroundColor: "#FFF7ED",
  },
  notificationRuntimeHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  notificationRuntimeIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
  },
  notificationRuntimeIconText: {
    color: mobileColors.accentStrong,
    fontSize: 14,
    fontWeight: "900",
  },
  notificationRuntimeText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  notificationRuntimeTitle: {
    color: mobileColors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  notificationRuntimeDescription: {
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  notificationRuntimeError: {
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FEF2F2",
    color: "#B91C1C",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  notificationRuntimeFootnote: {
    color: mobileColors.mutedSoft,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  mediaRuntimeStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  mediaRuntimeStatusPill: {
    minHeight: 46,
    flexGrow: 1,
    flexBasis: 138,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mediaRuntimeStatusText: {
    flex: 1,
    minWidth: 0,
  },
  mediaRuntimeStatusLabel: {
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  mediaRuntimeStatusValue: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  mediaSelectedAssetCard: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  mediaSelectedAssetLabel: {
    color: mobileColors.mutedSoft,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  mediaSelectedAssetName: {
    marginTop: 3,
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  mediaSelectedAssetMeta: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  homeSummaryCard: {
    gap: 12,
    minWidth: 0,
    borderRadius: 18,
    backgroundColor: mobileColors.accentStrong,
    padding: 14,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  homePrimaryServerRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  homePrimaryServerText: {
    flex: 1,
    minWidth: 0,
  },
  homePrimaryServerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  homePrimaryServerMeta: {
    marginTop: 2,
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "800",
  },
  homeMetricGrid: {
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
  },
  homeMetricTile: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  homeMetricValue: {
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
  },
  homeMetricLabel: {
    marginTop: 3,
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "800",
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: 96,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricValue: {
    color: mobileColors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
  },
  metricLabel: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  continueCard: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  continueActionList: {
    gap: 8,
    minWidth: 0,
  },
  continueActionRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 16,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  continueActionRowDisabled: {
    opacity: 0.66,
  },
  continueActionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.control,
    backgroundColor: "#EEF2FF",
  },
  continueActionIconServer: {
    backgroundColor: "#F0FDF4",
  },
  continueActionIconVoice: {
    backgroundColor: "#FFF7ED",
  },
  continueActionIconText: {
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
  },
  continueActionText: {
    flex: 1,
    minWidth: 0,
  },
  continueActionBadge: {
    minWidth: 24,
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: 7,
  },
  compactList: {
    gap: 8,
    minWidth: 0,
  },
  compactListRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  compactListRowButton: {
    borderWidth: 1,
    borderColor: "transparent",
  },
  compactListRowSelected: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  compactListRowPressed: {
    opacity: 0.86,
  },
  compactListText: {
    flex: 1,
    minWidth: 0,
  },
  compactListTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactListTitle: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  compactListTime: {
    color: mobileColors.mutedSoft,
    fontSize: 11,
    fontWeight: "900",
  },
  compactListMeta: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  dmMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    minWidth: 0,
  },
  statusChip: {
    minHeight: 24,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
  },
  statusChipAccent: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  statusChipSuccess: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.mutedSoft,
  },
  statusChipDotAccent: {
    backgroundColor: mobileColors.accentStrong,
  },
  statusChipDotSuccess: {
    backgroundColor: mobileColors.success,
  },
  statusChipText: {
    flexShrink: 1,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  channelMentionBadge: {
    minWidth: 24,
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: 7,
  },
  avatarShell: {
    position: "relative",
    width: 38,
    height: 38,
  },
  avatarShellLarge: {
    width: 44,
    height: 44,
  },
  avatarShellSmall: {
    width: 28,
    height: 28,
  },
  avatarMark: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#EDE9FE",
  },
  avatarMarkLarge: {
    width: 44,
    height: 44,
    borderRadius: 16,
  },
  avatarMarkSmall: {
    width: 28,
    height: 28,
    borderRadius: 10,
  },
  avatarMarkText: {
    color: mobileColors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  avatarMarkTextSmall: {
    fontSize: 10,
  },
  avatarStatus: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.mutedSoft,
  },
  avatarStatusActive: {
    backgroundColor: mobileColors.success,
  },
  dmPreviewCard: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  dmConversationHeader: {
    minHeight: 58,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dmBackButton: {
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 15,
    backgroundColor: "#F8FAFF",
  },
  dmBackButtonText: {
    color: mobileColors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  dmConversationHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  dmPreviewHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dmPreviewTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  dmPreviewTitle: {
    color: mobileColors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  dmPreviewMeta: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  dmRefreshButton: {
    minWidth: 54,
    minHeight: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
  },
  dmRefreshButtonText: {
    color: mobileColors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  messageSearchCard: {
    gap: 8,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    padding: 10,
  },
  messageSearchInputShell: {
    minHeight: 46,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  messageSearchIcon: {
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  messageSearchInput: {
    minHeight: mobileSizing.minTouchTarget,
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 11,
    paddingVertical: 0,
  },
  messageSearchClearButton: {
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
  },
  messageSearchClearText: {
    color: mobileColors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  messageSearchButton: {
    minHeight: mobileSizing.minTouchTarget,
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    paddingHorizontal: 12,
  },
  messageSearchButtonDisabled: {
    opacity: 0.52,
  },
  messageSearchButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  messageSearchHelperText: {
    color: mobileColors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  messageSearchStatusRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  messageSearchStatusText: {
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  messageSearchErrorText: {
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    color: "#B91C1C",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  messageSearchResults: {
    gap: 8,
    minWidth: 0,
  },
  messageSearchResultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  messageSearchResultsTitle: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  messageSearchResultCount: {
    minWidth: 28,
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#EEF2FF",
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: "center",
  },
  messageSearchResultList: {
    gap: 7,
    minWidth: 0,
  },
  messageSearchResultRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 9,
  },
  messageSearchResultText: {
    flex: 1,
    minWidth: 0,
  },
  messageSearchResultBody: {
    marginTop: 4,
    color: mobileColors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  messageSearchResultMeta: {
    marginTop: 4,
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
  },
  dmErrorRow: {
    gap: 10,
    minWidth: 0,
  },
  dmMessageList: {
    gap: 8,
    minWidth: 0,
  },
  messageStreamItem: {
    gap: 8,
    minWidth: 0,
  },
  messageDateSeparator: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  messageDateLine: {
    height: 1,
    flex: 1,
    backgroundColor: "#E5E7FF",
  },
  messageDateText: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    color: mobileColors.mutedSoft,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    textTransform: "uppercase",
  },
  messagePreviewRow: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  messagePreviewRowOwn: {
    justifyContent: "flex-end",
  },
  messagePreviewRowChannel: {
    gap: 12,
    paddingRight: 2,
  },
  messagePreviewBubble: {
    flexShrink: 1,
    maxWidth: "86%",
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    borderBottomLeftRadius: 8,
    backgroundColor: "#FAFBFF",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  messagePreviewBubbleOwn: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 8,
    borderColor: "#DDD6FE",
    backgroundColor: "#F5F3FF",
  },
  messagePreviewBubbleChannel: {
    flex: 1,
    maxWidth: "100%",
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  messagePreviewHeaderChannel: {
    gap: 7,
  },
  messagePreviewAuthorChannel: {
    flex: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  messagePreviewBodyChannel: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  dmMessageRow: {
    alignSelf: "flex-start",
    maxWidth: "94%",
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    borderBottomLeftRadius: 8,
    backgroundColor: "#FAFBFF",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  dmMessageRowOwn: {
    alignSelf: "flex-end",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 8,
    borderColor: "#DDD6FE",
    backgroundColor: "#F5F3FF",
  },
  channelMessageRow: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: "#FAFBFF",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  dmMessageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  dmMessageAuthor: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  dmMessageTime: {
    color: mobileColors.mutedSoft,
    fontSize: 11,
    fontWeight: "800",
  },
  dmMessageBody: {
    marginTop: 5,
    color: mobileColors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  messageAttachmentList: {
    gap: 7,
    marginTop: 8,
    minWidth: 0,
  },
  messageAttachmentCard: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#E5E7FF",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 8,
  },
  messageAttachmentImage: {
    width: 48,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
  },
  messageAttachmentIcon: {
    width: 48,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
  },
  messageAttachmentIconText: {
    color: mobileColors.accentStrong,
    fontSize: 10,
    fontWeight: "900",
  },
  messageAttachmentMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  messageAttachmentName: {
    color: mobileColors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  messageAttachmentInfo: {
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  messageReactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    minWidth: 0,
  },
  messageReactionChip: {
    minHeight: 24,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
  },
  messageReactionText: {
    color: mobileColors.text,
    fontSize: 11,
    fontWeight: "900",
  },
  dmMessageMeta: {
    marginTop: 6,
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "800",
  },
  dmComposer: {
    gap: 8,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    padding: 8,
  },
  channelComposer: {
    marginHorizontal: 4,
    marginTop: 2,
    marginBottom: 6,
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  dmComposerToolbar: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dmAttachButton: {
    minWidth: 38,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
  },
  dmAttachButtonDisabled: {
    opacity: 0.68,
  },
  dmAttachButtonText: {
    color: mobileColors.accentStrong,
    fontSize: 16,
    fontWeight: "900",
  },
  dmComposerToolbarText: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  dmComposerAttachmentCard: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dmComposerAttachmentText: {
    flex: 1,
    minWidth: 0,
  },
  dmComposerAttachmentTitle: {
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  dmComposerAttachmentMeta: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  dmComposerAttachmentClear: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F5F3FF",
  },
  dmComposerAttachmentClearText: {
    color: mobileColors.accentStrong,
    fontSize: 13,
    fontWeight: "900",
  },
  dmComposerAttachmentNotice: {
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  dmComposerInput: {
    minHeight: 44,
    maxHeight: 112,
    minWidth: 0,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  channelComposerInputShell: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  channelComposerControlRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  mobileChannelComposerActions: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  channelComposerIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    borderRadius: 14,
    backgroundColor: "#F8FAFF",
  },
  channelComposerIconButtonDisabled: {
    opacity: 0.56,
  },
  channelComposerIconButtonUnavailable: {
    opacity: 0.72,
  },
  channelComposerGifButton: {
    minWidth: 46,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    borderRadius: 14,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 9,
  },
  channelComposerGifButtonText: {
    color: mobileColors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  channelComposerInput: {
    minHeight: 30,
    maxHeight: 88,
    borderRadius: 0,
    backgroundColor: "transparent",
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  channelComposerSubmitActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  channelComposerVoiceButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  channelComposerSendButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: mobileColors.accentStrong,
    shadowColor: mobileColors.accentStrong,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 3,
  },
  channelComposerSendButtonDisabled: {
    backgroundColor: "#C4B5FD",
    shadowOpacity: 0,
    elevation: 0,
  },
  dmSendButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    paddingHorizontal: 14,
  },
  dmSendButtonDisabled: {
    backgroundColor: "#C7D2FE",
  },
  dmSendButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  dmSendErrorText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  releaseBudgetList: {
    gap: 7,
  },
  qualityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  releaseBudgetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  releaseBudgetMetric: {
    flexShrink: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  releaseBudgetTarget: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 86,
    textAlign: "right",
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  environmentLabel: {
    color: mobileColors.mutedSoft,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  environmentValue: {
    color: mobileColors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  environmentUrl: {
    color: mobileColors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  diagnosticsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  diagnosticPill: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  diagnosticLabel: {
    color: mobileColors.mutedSoft,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  diagnosticValue: {
    marginTop: 2,
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  statusCard: {
    flexDirection: "row",
    gap: 12,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F5F3FF",
    padding: 14,
  },
  statusCardWarning: {
    borderColor: "#FED7AA",
    backgroundColor: "#FFF7ED",
  },
  statusCardSuccess: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  statusIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accent,
  },
  statusIconWarning: {
    backgroundColor: mobileColors.warning,
  },
  statusIconSuccess: {
    backgroundColor: mobileColors.success,
  },
  statusIconText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  statusCardText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  statusCardTitle: {
    color: mobileColors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  statusCardDescription: {
    color: mobileColors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  permissionCard: {
    gap: 12,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    padding: 14,
  },
  permissionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
  },
  permissionHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  permissionTitle: {
    color: mobileColors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  permissionCountBadge: {
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  permissionCountText: {
    color: mobileColors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  permissionChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  permissionChip: {
    minHeight: 34,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
  },
  permissionChipDot: {
    width: 8,
    height: 8,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.mutedSoft,
  },
  permissionChipDotGranted: {
    backgroundColor: mobileColors.success,
  },
  permissionChipDotDenied: {
    backgroundColor: "#EF4444",
  },
  permissionChipText: {
    flexShrink: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  premiumAuthScreen: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: mobileRadii.card,
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  premiumAuthGlowTop: {
    position: "absolute",
    top: -92,
    right: -86,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(124,58,237,0.12)",
  },
  premiumAuthGlowBottom: {
    position: "absolute",
    bottom: -104,
    left: -84,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(20,184,166,0.12)",
  },
  premiumAuthDotField: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  premiumAuthDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#8B5CF6",
  },
  premiumAuthContent: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: 11,
    minWidth: 0,
  },
  premiumAuthStack: {
    gap: 11,
    minWidth: 0,
  },
  premiumAuthHeader: {
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  premiumAuthBrandRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minWidth: 0,
  },
  premiumAuthLogo: {
    width: 38,
    height: 38,
    borderRadius: 13,
  },
  premiumAuthBrandText: {
    color: mobileColors.text,
    fontSize: 23,
    fontWeight: "900",
  },
  premiumAuthTitle: {
    marginTop: 8,
    color: mobileColors.text,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "900",
    textAlign: "center",
  },
  premiumAuthSubtitle: {
    color: mobileColors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  premiumAuthLoadingCard: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(221,214,254,0.9)",
    borderRadius: mobileRadii.card,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 22,
  },
  premiumAuthLoadingIcon: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#F5F3FF",
  },
  premiumAuthLoadingTitle: {
    color: mobileColors.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  premiumAuthProfileGrid: {
    minWidth: 0,
    flexDirection: "row",
    gap: 7,
  },
  premiumAuthProfileOption: {
    minHeight: 50,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.96)",
    borderRadius: mobileRadii.control,
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: 7,
  },
  premiumAuthProfileOptionActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "#FFFFFF",
    shadowColor: "#6D4AFF",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { height: 8, width: 0 },
    elevation: 2,
  },
  premiumAuthProfileIcon: {
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  premiumAuthProfileLabel: {
    flexShrink: 1,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  premiumAuthProfilePreviewPill: {
    position: "absolute",
    top: 4,
    right: 5,
    maxWidth: 52,
    overflow: "hidden",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 5,
    paddingVertical: 2,
    color: mobileColors.accentStrong,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  premiumAuthProfileCheck: {
    position: "absolute",
    right: 5,
    bottom: 5,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: mobileColors.accent,
  },
  premiumAuthFormCard: {
    gap: 10,
    minWidth: 0,
  },
  premiumAuthInputShell: {
    minHeight: 50,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "rgba(203,213,225,0.92)",
    borderRadius: mobileRadii.control,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingLeft: 14,
    paddingRight: 8,
  },
  premiumAuthInput: {
    minHeight: 48,
    flex: 1,
    minWidth: 0,
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 0,
  },
  premiumAuthIconButton: {
    width: mobileSizing.minTouchTarget,
    height: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
  },
  premiumAuthInlineRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  premiumAuthCheckboxRow: {
    minHeight: mobileSizing.minTouchTarget,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  premiumAuthCheckbox: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C4B5FD",
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  premiumAuthCheckboxChecked: {
    borderColor: mobileColors.accent,
    backgroundColor: mobileColors.accent,
  },
  premiumAuthCheckboxText: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  premiumAuthTextButton: {
    minHeight: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    paddingHorizontal: 4,
  },
  premiumAuthTextButtonText: {
    color: mobileColors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  premiumAuthPrimaryButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: mobileRadii.control,
    backgroundColor: mobileColors.accent,
    shadowColor: "#6D4AFF",
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 4,
  },
  premiumAuthPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  premiumAuthSecondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(203,213,225,0.94)",
    borderRadius: mobileRadii.control,
    backgroundColor: "rgba(255,255,255,0.72)",
    paddingHorizontal: 12,
  },
  premiumAuthSecondaryButtonText: {
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  premiumAuthSocialGroup: {
    gap: 9,
    minWidth: 0,
  },
  premiumAuthDividerRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  premiumAuthDivider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(203,213,225,0.86)",
  },
  premiumAuthDividerText: {
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  premiumAuthSocialRow: {
    minWidth: 0,
    flexDirection: "row",
    gap: 8,
  },
  premiumAuthSocialButton: {
    minHeight: 42,
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(203,213,225,0.9)",
    borderRadius: mobileRadii.control,
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  premiumAuthSocialWhisprIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
  },
  premiumAuthSecurityCard: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(203,213,225,0.9)",
    borderRadius: mobileRadii.control,
    backgroundColor: "rgba(255,255,255,0.8)",
    padding: 10,
  },
  premiumAuthSecurityIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: mobileColors.success,
  },
  premiumAuthSecurityText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  premiumAuthSecurityTitle: {
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  premiumAuthSecurityDescription: {
    color: mobileColors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  premiumAuthCloudflareBadge: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 70,
  },
  premiumAuthCloudflareText: {
    color: mobileColors.text,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  premiumAuthFooterRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  premiumAuthFooterText: {
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  premiumAuthStrength: {
    gap: 7,
    minWidth: 0,
  },
  premiumAuthStrengthHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  premiumAuthStrengthText: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
  },
  premiumAuthStrengthTrack: {
    minWidth: 0,
    height: 5,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  premiumAuthStrengthFill: {
    borderRadius: 999,
  },
  premiumAuthStrengthLabel: {
    fontSize: 11,
    fontWeight: "900",
  },
  authSummary: {
    flex: 1,
    minWidth: 0,
    color: mobileColors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  authGatePanel: {
    gap: 10,
    minWidth: 0,
  },
  authModeTabs: {
    minHeight: mobileSizing.minTouchTarget + 8,
    flexDirection: "row",
    gap: 6,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    padding: 4,
  },
  authModeButton: {
    minHeight: mobileSizing.minTouchTarget,
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.control - 4,
    paddingHorizontal: 10,
  },
  authModeButtonActive: {
    backgroundColor: "#F5F3FF",
  },
  authModeButtonText: {
    color: mobileColors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  authModeButtonTextActive: {
    color: mobileColors.accentStrong,
  },
  authGateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F5F3FF",
    padding: 14,
  },
  authGateIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accent,
  },
  authGateIconChecking: {
    backgroundColor: mobileColors.warning,
  },
  authGateIconText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  authGateText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  authGateTitle: {
    color: mobileColors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "900",
  },
  authBrowserNote: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  authBrowserNoteTitle: {
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  authBrowserActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  authBrowserNoteText: {
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  authFormCard: {
    minWidth: 0,
    gap: 10,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  authField: {
    gap: 6,
    minWidth: 0,
  },
  authLabel: {
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  authInput: {
    minHeight: 46,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    color: mobileColors.text,
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 14,
  },
  authFormError: {
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FEF2F2",
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  authFormNotice: {
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F0FDF4",
    color: "#047857",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  authDevFillButton: {
    minHeight: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 12,
  },
  authDevFillButtonText: {
    color: mobileColors.accentStrong,
    fontSize: 13,
    fontWeight: "900",
  },
  authInlineActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    minWidth: 0,
  },
  authInlineButton: {
    minHeight: mobileSizing.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  authInlineButtonText: {
    color: mobileColors.accentStrong,
    fontSize: 13,
    fontWeight: "900",
  },
  emptyState: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.card,
    backgroundColor: "#FAFBFF",
    padding: 18,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#EDE9FE",
  },
  emptyIconSuccess: {
    backgroundColor: "#DFF8EA",
  },
  emptyIconText: {
    color: mobileColors.accentStrong,
    fontSize: 24,
    fontWeight: "900",
  },
  emptyStateText: {
    maxWidth: 250,
    textAlign: "center",
    color: mobileColors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    minWidth: 0,
  },
  actionButton: {
    minHeight: 46,
    flexGrow: 1,
    flexBasis: 136,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
  },
  actionButtonPrimary: {
    borderColor: mobileColors.accent,
    backgroundColor: mobileColors.accent,
  },
  actionButtonDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  actionButtonDisabled: {
    opacity: 0.62,
  },
  actionButtonPressed: {
    opacity: 0.78,
  },
  actionButtonText: {
    textAlign: "center",
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  actionButtonTextPrimary: {
    color: "#FFFFFF",
  },
  actionButtonTextDanger: {
    color: "#DC2626",
  },
  actionButtonTextDisabled: {
    opacity: 0.86,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.card,
    backgroundColor: mobileColors.card,
    padding: 8,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  tabButton: {
    minHeight: 54,
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: mobileRadii.control,
  },
  tabButtonActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  tabButtonPressed: {
    backgroundColor: "#F8FAFC",
  },
  tabIcon: {
    fontSize: 17,
  },
  tabLabel: {
    maxWidth: "100%",
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  tabLabelActive: {
    color: mobileColors.accentStrong,
  },
});
