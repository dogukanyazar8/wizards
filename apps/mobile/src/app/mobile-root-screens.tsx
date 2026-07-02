import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import type {
  ChatMessage,
  MobileBootstrapPayload,
  MobileChannelMessagesResponse,
  MobileDMMessagesResponse,
  MobileWorkspaceChannelSummary,
} from "@wizards/types";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { MobileSessionDiagnostics } from "../auth/session-types";
import { MOBILE_BOOTSTRAP_ENDPOINT } from "../bootstrap/mobile-bootstrap";
import { getMobileRuntimeConfig } from "../config/environment";
import type { MobileDeepLinkParseResult } from "../deep-link/mobile-deep-links";
import {
  mobileColors,
  mobileRadii,
  mobileSizing,
  mobileSpacing,
} from "../design/tokens";
import { MOBILE_DM_MESSAGES_LIMIT } from "../dm/mobile-dm-client";
import { mobileCopy } from "../locale/mobile-copy";
import type { MobileTabId } from "../navigation/mobile-navigation";
import type {
  MobilePermissionIntentId,
  MobilePermissionReadiness,
  MobilePermissionSummary,
} from "../permissions/mobile-permission-contract";
import { getPermissionReadinessForFeature } from "../permissions/mobile-permission-contract";
import {
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_QA_DEVICE_MATRIX,
  summarizeMobileQualityGate,
} from "../quality/mobile-quality-gate";
import { MOBILE_RELEASE_BUDGETS } from "../release/mobile-release-contract";
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
  getMobileChannelPriority,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  getMobileHomeQuickActions,
  getMobileMessageBodyPreview,
  getMobileMessageEngagementCounts,
  getMobileMessageStreamItems,
  getMobileWorkspaceChannels,
  MOBILE_RENDER_LIMITS,
  type MobileConversationFilter,
  type MobileHomeQuickAction,
} from "./mobile-display-model";
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
  MobileWorkspaceServerViewState,
} from "./mobile-screen-state";
import { INITIAL_CHANNEL_SEND_STATE, INITIAL_DM_SEND_STATE } from "./mobile-screen-state";
import { getVisibleMobileSyncHealth } from "./mobile-screen-sync";

const copy = mobileCopy.tr;
const runtimeConfig = getMobileRuntimeConfig();
const mobileQualitySummary = summarizeMobileQualityGate();
const mobileStoreReadiness = validateMobileStoreReadiness();

const permissionLabels: Record<MobilePermissionIntentId, string> = {
  camera: copy.permissionCamera,
  microphone: copy.permissionMicrophone,
  notifications: copy.permissionNotifications,
  photoLibrary: copy.permissionPhotoLibrary,
};

const settingsEvidenceLabels = {
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

const MOBILE_AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_AUTH_USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,32}$/;
const MOBILE_AUTH_MIN_PASSWORD_LENGTH = 8;

function normalizeMobileAuthInputEmail(value: string) {
  return value.trim().toLowerCase();
}

interface ActiveScreenProps {
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  bootstrapSyncState: MobileSyncSnapshot;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  channelSyncState: MobileSyncSnapshot;
  currentTab: MobileTabId;
  dmMessagesState: MobileDMMessagesViewState;
  dmSendState: MobileDMSendViewState;
  dmSyncState: MobileSyncSnapshot;
  diagnostics: MobileSessionDiagnostics;
  error: string | null;
  lastDeepLink: MobileDeepLinkParseResult | null;
  onOpenDMConversation(conversationId: string): void;
  onCloseDMConversation(): void;
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onOpenWorkspaceChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenWorkspaceServer(serverId: string): void;
  onRefreshBootstrap(): void;
  onRefreshChannelMessages(): void;
  onRefreshDMConversation(): void;
  onRefreshWorkspaceServer(): void;
  onRefresh(): void;
  onRefreshVisibleData(): void;
  onSelectTab(tab: MobileTabId): void;
  onSendChannelMessage(content: string): Promise<boolean>;
  onSendDMMessage(content: string): Promise<boolean>;
  onSignOut(): void;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  selectedDMConversation:
    | MobileBootstrapPayload["home"]["directMessages"]["recent"][number]
    | null;
  selectedDMConversationId: string | null;
  selectedWorkspaceChannelId: string | null;
  selectedWorkspaceServerId: string | null;
  signedInUserLabel: string | null;
  status: string;
  workspaceServerState: MobileWorkspaceServerViewState;
  workspaceSyncState: MobileSyncSnapshot;
}

export function ActiveScreen({
  authStatusLabel,
  bootstrapState,
  bootstrapSyncState,
  channelMessagesState,
  channelSendState,
  channelSyncState,
  currentTab,
  dmMessagesState,
  dmSendState,
  dmSyncState,
  diagnostics,
  error,
  lastDeepLink,
  onOpenDMConversation,
  onCloseDMConversation,
  onOpenWebRegister,
  onOpenWebSignIn,
  onOpenWorkspaceChannel,
  onOpenWorkspaceServer,
  onRefreshBootstrap,
  onRefreshChannelMessages,
  onRefreshDMConversation,
  onRefreshWorkspaceServer,
  onRefresh,
  onRefreshVisibleData,
  onSelectTab,
  onSendChannelMessage,
  onSendDMMessage,
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
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

  switch (currentTab) {
    case "messages":
      return (
        <MessagesScreen
          bootstrapState={bootstrapState}
          dmMessagesState={dmMessagesState}
          dmSendState={dmSendState}
          selectedConversation={selectedDMConversation}
          selectedConversationId={selectedDMConversationId}
          syncHealth={syncHealth}
          onCloseConversation={onCloseDMConversation}
          onOpenConversation={onOpenDMConversation}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshConversation={onRefreshDMConversation}
          onRefreshVisibleData={onRefreshVisibleData}
          onSendMessage={onSendDMMessage}
        />
      );
    case "voice":
      return (
        <VoiceScreen
          bootstrapState={bootstrapState}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          syncHealth={syncHealth}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshVisibleData={onRefreshVisibleData}
        />
      );
    case "notifications":
      return (
        <NotificationsScreen
          bootstrapState={bootstrapState}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          syncHealth={syncHealth}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshVisibleData={onRefreshVisibleData}
        />
      );
    case "settings":
      return (
        <ProfileSettingsScreen
          authStatusLabel={authStatusLabel}
          bootstrapState={bootstrapState}
          bootstrapSyncState={bootstrapSyncState}
          diagnostics={diagnostics}
          error={error}
          lastDeepLink={lastDeepLink}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          showDiagnostics={showDiagnostics}
          signedInUserLabel={signedInUserLabel}
          status={status}
          syncHealth={syncHealth}
          onOpenWebRegister={onOpenWebRegister}
          onOpenWebSignIn={onOpenWebSignIn}
          onRefresh={onRefresh}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshVisibleData={onRefreshVisibleData}
          onSignOut={onSignOut}
          onToggleDiagnostics={() => setShowDiagnostics((value) => !value)}
        />
      );
    case "overview":
    default:
      return (
        <OverviewScreen
          bootstrapState={bootstrapState}
          channelMessagesState={channelMessagesState}
          channelSendState={channelSendState}
          selectedWorkspaceChannelId={selectedWorkspaceChannelId}
          selectedWorkspaceServerId={selectedWorkspaceServerId}
          signedInUserLabel={signedInUserLabel}
          syncHealth={syncHealth}
          workspaceServerState={workspaceServerState}
          onOpenDMConversation={onOpenDMConversation}
          onOpenWorkspaceChannel={onOpenWorkspaceChannel}
          onOpenWorkspaceServer={onOpenWorkspaceServer}
          onRefreshBootstrap={onRefreshBootstrap}
          onRefreshChannelMessages={onRefreshChannelMessages}
          onRefreshVisibleData={onRefreshVisibleData}
          onRefreshWorkspaceServer={onRefreshWorkspaceServer}
          onSendChannelMessage={onSendChannelMessage}
          onSelectTab={onSelectTab}
        />
      );
  }
}

function MessagesScreen({
  bootstrapState,
  dmMessagesState,
  dmSendState,
  selectedConversation,
  selectedConversationId,
  syncHealth,
  onOpenConversation,
  onCloseConversation,
  onRefreshBootstrap,
  onRefreshConversation,
  onRefreshVisibleData,
  onSendMessage,
}: {
  bootstrapState: MobileBootstrapViewState;
  dmMessagesState: MobileDMMessagesViewState;
  dmSendState: MobileDMSendViewState;
  selectedConversation:
    | MobileBootstrapPayload["home"]["directMessages"]["recent"][number]
    | null;
  selectedConversationId: string | null;
  syncHealth: MobileSyncHealthSummary;
  onCloseConversation(): void;
  onOpenConversation(conversationId: string): void;
  onRefreshBootstrap(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onSendMessage(content: string): Promise<boolean>;
}) {
  const hasConversations =
    bootstrapState.status === "ready" &&
    bootstrapState.payload.home.directMessages.recent.length > 0;
  const shouldShowEmpty =
    bootstrapState.status === "idle" ||
    (bootstrapState.status === "ready" &&
      bootstrapState.payload.home.directMessages.recent.length === 0);

  if (selectedConversation) {
    return (
      <DMConversationScreen
        conversation={selectedConversation}
        currentUserId={bootstrapState.status === "ready" ? bootstrapState.payload.user.id : ""}
        sendState={dmSendState}
        state={dmMessagesState}
        syncHealth={syncHealth}
        onBack={onCloseConversation}
        onRefreshConversation={onRefreshConversation}
        onRefreshVisibleData={onRefreshVisibleData}
        onSendMessage={onSendMessage}
      />
    );
  }

  return (
    <View style={styles.chatScreen}>
      <DMInboxHeader />
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      {hasConversations ? (
        <DirectMessageListCard
          conversations={bootstrapState.payload.home.directMessages.recent}
          totalCount={bootstrapState.payload.home.directMessages.totalCount}
          unreadCount={bootstrapState.payload.home.directMessages.unreadCount}
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
    </View>
  );
}

function DMConversationScreen({
  conversation,
  currentUserId,
  onBack,
  onRefreshConversation,
  onRefreshVisibleData,
  onSendMessage,
  sendState,
  state,
  syncHealth,
}: {
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
  currentUserId: string;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
  syncHealth: MobileSyncHealthSummary;
  onBack(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
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
          style={({ pressed }) => [
            styles.dmBackButton,
            pressed && styles.actionButtonPressed,
          ]}
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
          style={({ pressed }) => [
            styles.dmRefreshButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
        </Pressable>
      </View>
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <DMConversationPreviewCard
        conversation={conversation}
        currentUserId={currentUserId}
        sendState={sendState}
        state={state}
        onRetry={onRefreshConversation}
        onSendMessage={onSendMessage}
      />
    </View>
  );
}

function VoiceScreen({
  bootstrapState,
  permissionReadiness,
  permissionSummary,
  syncHealth,
  onRefreshBootstrap,
  onRefreshVisibleData,
}: {
  bootstrapState: MobileBootstrapViewState;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  syncHealth: MobileSyncHealthSummary;
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
      <EmptyState tone="success" label={copy.voiceEmpty} />
    </ScreenShell>
  );
}

function NotificationsScreen({
  bootstrapState,
  permissionReadiness,
  permissionSummary,
  syncHealth,
  onRefreshBootstrap,
  onRefreshVisibleData,
}: {
  bootstrapState: MobileBootstrapViewState;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  syncHealth: MobileSyncHealthSummary;
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
      <EmptyState tone="accent" label={copy.notificationsEmpty} />
    </ScreenShell>
  );
}

function ProfileSettingsScreen({
  authStatusLabel,
  bootstrapState,
  bootstrapSyncState,
  diagnostics,
  error,
  lastDeepLink,
  permissionReadiness,
  permissionSummary,
  showDiagnostics,
  signedInUserLabel,
  status,
  syncHealth,
  onOpenWebRegister,
  onOpenWebSignIn,
  onRefresh,
  onRefreshBootstrap,
  onRefreshVisibleData,
  onSignOut,
  onToggleDiagnostics,
}: {
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  bootstrapSyncState: MobileSyncSnapshot;
  diagnostics: MobileSessionDiagnostics;
  error: string | null;
  lastDeepLink: MobileDeepLinkParseResult | null;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  showDiagnostics: boolean;
  signedInUserLabel: string | null;
  status: string;
  syncHealth: MobileSyncHealthSummary;
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onRefresh(): void;
  onRefreshBootstrap(): void;
  onRefreshVisibleData(): void;
  onSignOut(): void;
  onToggleDiagnostics(): void;
}) {
  return (
    <ScreenShell
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
      <SettingsMobileOverviewCard
        bootstrapState={bootstrapState}
        diagnostics={diagnostics}
        lastDeepLink={lastDeepLink}
        permissionSummary={permissionSummary}
      />
      <SettingsNativePermissionCard
        readiness={permissionReadiness}
        summary={permissionSummary}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actionRow}>
        <ActionButton label={copy.secondaryAction} onPress={onRefresh} variant="secondary" />
        {status === "signed-in" ? (
          <ActionButton label={copy.signOutAction} onPress={onSignOut} variant="danger" />
        ) : (
          <>
            <ActionButton
              label={copy.authOpenSignInAction}
              onPress={onOpenWebSignIn}
              variant="primary"
            />
            <ActionButton
              label={copy.authOpenRegisterAction}
              onPress={onOpenWebRegister}
              variant="secondary"
            />
          </>
        )}
        <ActionButton
          label={
            showDiagnostics
              ? copy.settingsDiagnosticsHideAction
              : copy.settingsDiagnosticsShowAction
          }
          onPress={onToggleDiagnostics}
          variant="secondary"
        />
      </View>
      {showDiagnostics ? (
        <>
          <SettingsSecurityCard diagnostics={diagnostics} lastDeepLink={lastDeepLink} />
          {bootstrapState.status === "ready" ? (
            <SettingsFeatureReadinessCard features={bootstrapState.payload.features} />
          ) : null}
          <PermissionReadinessCard readiness={permissionReadiness} summary={permissionSummary} />
          <SettingsPermissionEvidenceCard summary={permissionSummary} />
          <SettingsReleaseQualityCard />
          <DeveloperDiagnosticsCard bootstrapSyncState={bootstrapSyncState} />
        </>
      ) : null}
    </ScreenShell>
  );
}

function OverviewScreen({
  bootstrapState,
  channelMessagesState,
  channelSendState,
  selectedWorkspaceChannelId,
  selectedWorkspaceServerId,
  signedInUserLabel,
  syncHealth,
  workspaceServerState,
  onOpenDMConversation,
  onOpenWorkspaceChannel,
  onOpenWorkspaceServer,
  onRefreshBootstrap,
  onRefreshChannelMessages,
  onRefreshVisibleData,
  onRefreshWorkspaceServer,
  onSendChannelMessage,
  onSelectTab,
}: {
  bootstrapState: MobileBootstrapViewState;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  selectedWorkspaceChannelId: string | null;
  selectedWorkspaceServerId: string | null;
  signedInUserLabel: string | null;
  syncHealth: MobileSyncHealthSummary;
  workspaceServerState: MobileWorkspaceServerViewState;
  onOpenDMConversation(conversationId: string): void;
  onOpenWorkspaceChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenWorkspaceServer(serverId: string): void;
  onRefreshBootstrap(): void;
  onRefreshChannelMessages(): void;
  onRefreshVisibleData(): void;
  onRefreshWorkspaceServer(): void;
  onSendChannelMessage(content: string): Promise<boolean>;
  onSelectTab(tab: MobileTabId): void;
}) {
  return (
    <View style={styles.homeScreen}>
      <HomeGreetingHeader
        state={bootstrapState}
        signedInUserLabel={signedInUserLabel}
        onOpenNotifications={() => onSelectTab("notifications")}
      />
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      <HomeSummaryCard state={bootstrapState} />
      <HomeQuickActionsCard
        state={bootstrapState}
        onOpenConversation={onOpenDMConversation}
        onOpenServer={onOpenWorkspaceServer}
        onOpenTab={onSelectTab}
      />
      {bootstrapState.status === "ready" ? (
        <RecentServersCard
          servers={bootstrapState.payload.home.servers.recent}
          selectedServerId={selectedWorkspaceServerId}
          onOpenServer={onOpenWorkspaceServer}
        />
      ) : null}
      {selectedWorkspaceServerId ? (
        <WorkspacePreviewCard
          bootstrapState={bootstrapState}
          channelMessagesState={channelMessagesState}
          channelSendState={channelSendState}
          selectedChannelId={selectedWorkspaceChannelId}
          selectedServerId={selectedWorkspaceServerId}
          serverState={workspaceServerState}
          onOpenChannel={onOpenWorkspaceChannel}
          onOpenServer={onOpenWorkspaceServer}
          onRefreshChannel={onRefreshChannelMessages}
          onRefreshServer={onRefreshWorkspaceServer}
          onSendChannelMessage={onSendChannelMessage}
        />
      ) : null}
    </View>
  );
}

export function AuthGate({
  onOpenWebRegister,
  onOpenWebSignIn,
  onRegisterWithPassword,
  onRefresh,
  onRequestPasswordReset,
  onRequestVerificationEmail,
  onSignInWithPassword,
  reason,
}: {
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onRegisterWithPassword(input: {
    confirmPassword: string;
    email: string;
    password: string;
    username: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  onRefresh(): void;
  onRequestPasswordReset(input: {
    email: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  onRequestVerificationEmail(input: {
    email: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  onSignInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<{ ok: true } | { message: string; ok: false }>;
  reason: "auth-required" | "checking" | null;
}) {
  const isChecking = reason === "checking";
  const [mode, setMode] = useState<"forgot" | "register" | "sign-in">("sign-in");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerificationSubmitting, setIsVerificationSubmitting] = useState(false);

  const modeCopy =
    mode === "sign-in"
      ? {
          action: copy.authNativeSignInAction,
          description: copy.authSignInDescription,
          icon: "->",
          title: copy.authSignInTitle,
        }
      : mode === "register"
        ? {
            action: copy.authNativeRegisterAction,
            description: copy.authRegisterDescription,
            icon: "+",
            title: copy.authRegisterTitle,
          }
        : {
            action: copy.authNativeForgotAction,
            description: copy.authForgotDescription,
            icon: "?",
            title: copy.authForgotTitle,
          };

  const selectMode = (nextMode: "forgot" | "register" | "sign-in") => {
    setMode(nextMode);
    setFormError(null);
    setFormNotice(null);
  };

  const validateEmail = (value: string) => {
    if (!MOBILE_AUTH_EMAIL_PATTERN.test(value)) {
      return copy.authNativeInvalidEmail;
    }

    return null;
  };

  const validatePassword = (value: string) => {
    if (value.length < MOBILE_AUTH_MIN_PASSWORD_LENGTH) {
      return copy.authNativePasswordTooShort;
    }

    return null;
  };

  const validateUsername = (value: string) => {
    if (!MOBILE_AUTH_USERNAME_PATTERN.test(value)) {
      return copy.authNativeUsernameInvalid;
    }

    return null;
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedEmail = normalizeMobileAuthInputEmail(email);
    const trimmedUsername = username.trim();
    setFormError(null);
    setFormNotice(null);

    if (!trimmedEmail || (mode !== "forgot" && !password)) {
      setFormError(copy.authNativeMissingFields);
      return;
    }

    const emailError = validateEmail(trimmedEmail);
    if (emailError) {
      setFormError(emailError);
      return;
    }

    if (mode !== "forgot") {
      const passwordError = validatePassword(password);
      if (passwordError) {
        setFormError(passwordError);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === "sign-in") {
        const result = await onSignInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (!result.ok) {
          setFormError(result.message || copy.authNativeGenericError);
        }
        return;
      }

      if (mode === "register") {
        if (!trimmedUsername || !confirmPassword) {
          setFormError(copy.authNativeMissingFields);
          return;
        }

        const usernameError = validateUsername(trimmedUsername);
        if (usernameError) {
          setFormError(usernameError);
          return;
        }

        if (password !== confirmPassword) {
          setFormError(copy.authNativePasswordMismatch);
          return;
        }

        const result = await onRegisterWithPassword({
          confirmPassword,
          email: trimmedEmail,
          password,
          username: trimmedUsername,
        });

        if (result.ok) {
          setFormNotice(copy.authNativeVerificationNotice.replace("{email}", result.email));
          setMode("sign-in");
          setPassword("");
          setConfirmPassword("");
        } else {
          setFormError(result.message || copy.authNativeGenericError);
        }
        return;
      }

      const result = await onRequestPasswordReset({ email: trimmedEmail });
      if (result.ok) {
        setFormNotice(copy.authNativeForgotNotice.replace("{email}", result.email));
        setMode("sign-in");
      } else {
        setFormError(result.message || copy.authNativeGenericError);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestVerificationEmail = async () => {
    if (isSubmitting || isVerificationSubmitting) {
      return;
    }

    const trimmedEmail = normalizeMobileAuthInputEmail(email);
    setFormError(null);
    setFormNotice(null);

    if (!trimmedEmail) {
      setFormError(copy.authNativeMissingFields);
      return;
    }

    const emailError = validateEmail(trimmedEmail);
    if (emailError) {
      setFormError(emailError);
      return;
    }

    setIsVerificationSubmitting(true);
    try {
      const result = await onRequestVerificationEmail({ email: trimmedEmail });
      if (result.ok) {
        setFormNotice(
          copy.authNativeVerificationResendNotice.replace("{email}", result.email),
        );
        setMode("sign-in");
      } else {
        setFormError(result.message || copy.authNativeGenericError);
      }
    } finally {
      setIsVerificationSubmitting(false);
    }
  };

  return (
    <ScreenShell
      eyebrow={copy.status}
      title={isChecking ? copy.authChecking : copy.authWelcomeTitle}
      description={isChecking ? copy.gatedChecking : copy.authWelcomeDescription}
    >
      {isChecking ? (
        <View style={styles.authGateCard}>
          <View style={[styles.authGateIcon, styles.authGateIconChecking]}>
            <Text style={styles.authGateIconText}>...</Text>
          </View>
          <Text style={styles.authSummary}>{copy.gatedChecking}</Text>
        </View>
      ) : (
        <View style={styles.authGatePanel}>
          <View style={styles.authModeTabs}>
            <AuthModeButton
              active={mode === "sign-in"}
              label={copy.authModeSignIn}
              onPress={() => selectMode("sign-in")}
            />
            <AuthModeButton
              active={mode === "register"}
              label={copy.authModeRegister}
              onPress={() => selectMode("register")}
            />
          </View>
          <View style={styles.authGateCard}>
            <View style={styles.authGateIcon}>
              <Text style={styles.authGateIconText}>{modeCopy.icon}</Text>
            </View>
            <View style={styles.authGateText}>
              <Text style={styles.authGateTitle}>{modeCopy.title}</Text>
              <Text style={styles.authSummary}>{modeCopy.description}</Text>
            </View>
          </View>
          <View style={styles.authFormCard}>
            <View style={styles.authField}>
              <Text style={styles.authLabel}>{copy.authNativeEmailLabel}</Text>
              <TextInput
                accessibilityLabel={copy.authNativeEmailLabel}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder={copy.authNativeEmailPlaceholder}
                placeholderTextColor={mobileColors.muted}
                returnKeyType={mode === "forgot" ? "done" : "next"}
                style={styles.authInput}
                textContentType="emailAddress"
                value={email}
              />
            </View>
            {mode === "register" ? (
              <View style={styles.authField}>
                <Text style={styles.authLabel}>{copy.authNativeUsernameLabel}</Text>
                <TextInput
                  accessibilityLabel={copy.authNativeUsernameLabel}
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect={false}
                  onChangeText={setUsername}
                  placeholder={copy.authNativeUsernamePlaceholder}
                  placeholderTextColor={mobileColors.muted}
                  returnKeyType="next"
                  style={styles.authInput}
                  textContentType="username"
                  value={username}
                />
              </View>
            ) : null}
            {mode !== "forgot" ? (
              <View style={styles.authField}>
                <Text style={styles.authLabel}>{copy.authNativePasswordLabel}</Text>
                <TextInput
                  accessibilityLabel={copy.authNativePasswordLabel}
                  autoCapitalize="none"
                  autoComplete={mode === "register" ? "new-password" : "password"}
                  autoCorrect={false}
                  onChangeText={setPassword}
                  placeholder={copy.authNativePasswordPlaceholder}
                  placeholderTextColor={mobileColors.muted}
                  returnKeyType={mode === "register" ? "next" : "done"}
                  secureTextEntry
                  style={styles.authInput}
                  textContentType={mode === "register" ? "newPassword" : "password"}
                  value={password}
                />
              </View>
            ) : null}
            {mode === "register" ? (
              <View style={styles.authField}>
                <Text style={styles.authLabel}>{copy.authNativeConfirmPasswordLabel}</Text>
                <TextInput
                  accessibilityLabel={copy.authNativeConfirmPasswordLabel}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoCorrect={false}
                  onChangeText={setConfirmPassword}
                  placeholder={copy.authNativeConfirmPasswordPlaceholder}
                  placeholderTextColor={mobileColors.muted}
                  returnKeyType="done"
                  secureTextEntry
                  style={styles.authInput}
                  textContentType="newPassword"
                  value={confirmPassword}
                />
              </View>
            ) : null}
            {formError ? <Text style={styles.authFormError}>{formError}</Text> : null}
            {formNotice ? <Text style={styles.authFormNotice}>{formNotice}</Text> : null}
            <ActionButton
              disabled={isSubmitting}
              label={isSubmitting ? copy.authNativeSubmitting : modeCopy.action}
              onPress={() => void handleSubmit()}
              variant="primary"
            />
            <View style={styles.authInlineActions}>
              {mode !== "forgot" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.authNativeForgotLink}
                  onPress={() => selectMode("forgot")}
                  style={({ pressed }) => [
                    styles.authInlineButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.authInlineButtonText}>{copy.authNativeForgotLink}</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.authNativeBackToSignIn}
                  onPress={() => selectMode("sign-in")}
                  style={({ pressed }) => [
                    styles.authInlineButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.authInlineButtonText}>{copy.authNativeBackToSignIn}</Text>
                </Pressable>
              )}
              {mode !== "forgot" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.authNativeVerificationResendAction}
                  disabled={isSubmitting || isVerificationSubmitting}
                  onPress={() => void handleRequestVerificationEmail()}
                  style={({ pressed }) => [
                    styles.authInlineButton,
                    (pressed || isVerificationSubmitting) && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.authInlineButtonText}>
                    {isVerificationSubmitting
                      ? copy.authNativeSubmitting
                      : copy.authNativeVerificationResendAction}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={styles.authBrowserNote}>
            <Text style={styles.authBrowserNoteTitle}>{copy.authNativeWebFallbackTitle}</Text>
            <Text style={styles.authBrowserNoteText}>{copy.authSecureBrowserNote}</Text>
            <View style={styles.authBrowserActions}>
              <ActionButton
                label={copy.authNativeWebSignInFallback}
                onPress={onOpenWebSignIn}
                variant="secondary"
              />
              <ActionButton
                label={copy.authNativeWebRegisterFallback}
                onPress={onOpenWebRegister}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      )}
      <View style={styles.actionRow}>
        <ActionButton label={copy.secondaryAction} onPress={onRefresh} variant="secondary" />
      </View>
    </ScreenShell>
  );
}

function AuthModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.authModeButton,
        active && styles.authModeButtonActive,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <Text style={[styles.authModeButtonText, active && styles.authModeButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ScreenShell({
  children,
  description,
  eyebrow,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <View style={styles.screenCard}>
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
  const user =
    bootstrapState.status === "ready"
      ? bootstrapState.payload.user
      : null;
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
  const notificationsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.pushNotifications : null;
  const voiceFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.voice : null;
  const deepLinkStatus = getDeepLinkStatusLabel(lastDeepLink);
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

function SettingsNativePermissionCard({
  readiness,
  summary,
}: {
  readiness: readonly MobilePermissionReadiness[];
  summary: MobilePermissionSummary;
}) {
  const rows: NativeSettingsRowItem[] = readiness.map((item) => ({
    description: copy.settingsMobilePermissionDescription,
    id: item.intent.id,
    label: permissionLabels[item.intent.id],
    tone: getPermissionStatusTone(item.status),
    value: getPermissionStatusLabel(item.status),
  }));

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
    </SettingsSection>
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

function SettingsSecurityCard({
  diagnostics,
  lastDeepLink,
}: {
  diagnostics: MobileSessionDiagnostics;
  lastDeepLink: MobileDeepLinkParseResult | null;
}) {
  const evidence = getMobileSessionEvidence(diagnostics, settingsEvidenceLabels);

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
  const evidence = getMobileFeatureEvidence(features, settingsEvidenceLabels);

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

function SettingsPermissionEvidenceCard({
  summary,
}: {
  summary: MobilePermissionSummary;
}) {
  const evidence = getMobilePermissionEvidence(summary, settingsEvidenceLabels);

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
      <MobileQualityGateCard />
    </View>
  );
}

function SettingsReleaseQualityCard() {
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
        <MetricMiniPill
          label={copy.qualityDeviceLabel}
          value={mobileQualitySummary.targetCount}
        />
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
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
        </Pressable>
      ) : null}
    </View>
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
          {isError
            ? copy.syncHealthErrorDescription
            : copy.syncHealthRefreshingDescription}
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
                  {action.kind === "direct-message"
                    ? "DM"
                    : action.kind === "server"
                      ? "#"
                      : "VO"}
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
                onOpenServer
                  ? `${copy.openWorkspaceServerAction}: ${server.name}`
                  : server.name
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
  bootstrapState,
  channelMessagesState,
  channelSendState,
  onOpenChannel,
  onOpenServer,
  onRefreshChannel,
  onRefreshServer,
  onSendChannelMessage,
  selectedChannelId,
  selectedServerId,
  serverState,
}: {
  bootstrapState: MobileBootstrapViewState;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenServer(serverId: string): void;
  onRefreshChannel(): void;
  onRefreshServer(): void;
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
      ? getMobileWorkspaceChannels(serverState.payload.detail).find(
          (channel) => channel.id === selectedChannelId,
        ) ?? null
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
            style={({ pressed }) => [
              styles.dmRefreshButton,
              pressed && styles.actionButtonPressed,
            ]}
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
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.actionButtonPressed,
            ]}
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
              label={serverState.payload.detail.server.shortName ?? serverState.payload.detail.server.name}
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
              channel={selectedChannel}
              currentUserId={bootstrapState.payload.user.id}
              sendState={channelSendState}
              state={channelMessagesState}
              onRetry={onRefreshChannel}
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

  const visibleChannels = getBoundedMobileList(
    channels,
    MOBILE_RENDER_LIMITS.channels,
  );

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
            <Text style={styles.workspaceChannelIcon}>
              {channel.type === "TEXT" ? "#" : "V"}
            </Text>
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
                <StatusChip label={typeLabel} tone={channel.type === "VOICE" ? "success" : "muted"} />
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

function ChannelMessagesPreviewCard({
  channel,
  currentUserId,
  onRetry,
  onSendMessage,
  sendState,
  state,
}: {
  channel: MobileWorkspaceChannelSummary;
  currentUserId: string;
  onRetry(): void;
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
          style={({ pressed }) => [
            styles.dmRefreshButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
        </Pressable>
      </View>

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
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : null}
      {state.payload && state.payload.messages.length > 0 ? (
        <MessageStream
          currentUserId={currentUserId}
          messages={state.payload.messages}
        />
      ) : null}
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.workspaceNoMessages}</Text>
      ) : null}
      {state.status === "ready" ? (
        <DMComposer
          placeholder={copy.channelComposerPlaceholder}
          sendActionLabel={copy.channelSendAction}
          sendState={channelSendState}
          sendingActionLabel={copy.channelSendingAction}
          onSend={onSendMessage}
        />
      ) : null}
    </View>
  );
}

type MobileRenderableMessage =
  | ChatMessage
  | MobileDMMessagesResponse["messages"][number];

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

function MessageReactionList({
  reactions,
}: {
  reactions: MobileRenderableMessage["reactions"];
}) {
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
  message,
  own = false,
}: {
  message: MobileRenderableMessage;
  own?: boolean;
}) {
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });

  return (
    <View style={[styles.messagePreviewRow, own && styles.messagePreviewRowOwn]}>
      {!own ? (
        <AvatarMark
          label={message.author.displayName ?? message.author.username}
          imageUrl={message.author.avatarUrl}
          size="small"
          status={message.author.status === "ONLINE" ? "active" : "idle"}
        />
      ) : null}
      <View style={[styles.messagePreviewBubble, own && styles.messagePreviewBubbleOwn]}>
        <View style={styles.dmMessageHeader}>
          <Text style={styles.dmMessageAuthor} numberOfLines={1}>
            {own ? copy.messageYouLabel : message.author.displayName ?? message.author.username}
          </Text>
          <Text style={styles.dmMessageTime}>{formatMobileDisplayTime(message.createdAt)}</Text>
        </View>
        <Text style={styles.dmMessageBody} numberOfLines={4}>
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
  totalCount,
  unreadCount,
}: {
  conversations: MobileBootstrapPayload["home"]["directMessages"]["recent"];
  onOpenConversation(conversationId: string): void;
  selectedConversationId: string | null;
  totalCount: number;
  unreadCount: number;
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
    () =>
      getBoundedMobileList(
        filteredConversations,
        MOBILE_RENDER_LIMITS.conversations,
      ),
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
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.environmentLabel}>{copy.homeRecentDmsTitle}</Text>
          <Text style={styles.contractDescription}>{copy.messagesDescription}</Text>
        </View>
        <View style={styles.dmListMetricStack}>
          <MetricMiniPill label={copy.homeDmLabel} value={totalCount} />
          <MetricMiniPill label={copy.homeUnreadLabel} value={unreadCount} />
        </View>
      </View>
      <View style={styles.inboxSearchShell}>
        <Text style={styles.inboxSearchIcon}>{copy.directMessageSearchLabel}</Text>
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
          value={query}
        />
      </View>
      <View style={styles.inboxFilterRow}>
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
      <Text style={styles.inboxResultText}>
        {filteredConversations.length} {copy.directMessageResultCount}
      </Text>
      <View style={styles.compactList}>
        {visibleConversations.map((conversation) => {
          const title = getMobileConversationTitle(
            conversation,
            copy.directMessageFallback,
          );
          const isSelected = conversation.id === selectedConversationId;
          const activeCount = getMobileConversationActiveCount(conversation);
          const lastActivity = formatMobileDisplayTime(conversation.lastMessageAt);

          return (
            <Pressable
              key={conversation.id}
              accessibilityRole="button"
              accessibilityLabel={`${copy.openConversationAction}: ${
                title || copy.directMessageFallback
              }`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onOpenConversation(conversation.id)}
              style={({ pressed }) => [
                styles.compactListRow,
                styles.compactListRowButton,
                isSelected && styles.compactListRowSelected,
                pressed && styles.compactListRowPressed,
              ]}
            >
              <AvatarMark
                label={getMobileConversationInitialsLabel(
                  conversation,
                  copy.directMessageFallback,
                )}
                imageUrl={getMobileConversationAvatarUrl(conversation)}
                status={activeCount > 0 ? "active" : "idle"}
              />
              <View style={styles.compactListText}>
                <View style={styles.compactListTitleRow}>
                  <Text style={styles.compactListTitle} numberOfLines={1}>
                    {title || copy.directMessageFallback}
                  </Text>
                  {lastActivity ? (
                    <Text style={styles.compactListTime}>{lastActivity}</Text>
                  ) : null}
                </View>
                <View style={styles.dmMetaRow}>
                  <StatusChip
                    label={`${activeCount}/${conversation.participantCount} ${copy.activePeopleSuffix}`}
                    tone={activeCount > 0 ? "success" : "muted"}
                  />
                  {conversation.unreadCount > 0 ? (
                    <StatusChip
                      label={`${conversation.unreadCount} ${copy.unreadSuffix}`}
                      tone="accent"
                    />
                  ) : null}
                  {conversation.muted ? (
                    <StatusChip label={copy.mutedSuffix} tone="muted" />
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      {filteredConversations.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.directMessageFilteredEmpty}</Text>
      ) : null}
    </View>
  );
}

function DMConversationPreviewCard({
  conversation,
  currentUserId,
  onRetry,
  onSendMessage,
  sendState,
  state,
}: {
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  currentUserId: string;
  onRetry(): void;
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
          style={({ pressed }) => [
            styles.dmRefreshButton,
            pressed && styles.actionButtonPressed,
          ]}
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
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.actionButtonPressed,
            ]}
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
        <DMComposer sendState={conversationSendState} onSend={onSendMessage} />
      ) : null}
    </View>
  );
}

function DMComposer({
  onSend,
  placeholder = copy.dmComposerPlaceholder,
  sendActionLabel = copy.dmSendAction,
  sendState,
  sendingActionLabel = copy.dmSendingAction,
}: {
  onSend(content: string): Promise<boolean>;
  placeholder?: string;
  sendActionLabel?: string;
  sendState: MobileChannelSendViewState | MobileDMSendViewState;
  sendingActionLabel?: string;
}) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();
  const isSending = sendState.status === "sending";
  const isDisabled = isSending || trimmedDraft.length === 0;

  const handleSend = useCallback(async () => {
    if (isDisabled) {
      return;
    }

    const didSend = await onSend(trimmedDraft);
    if (didSend) {
      setDraft("");
    }
  }, [isDisabled, onSend, trimmedDraft]);

  return (
    <View style={styles.dmComposer}>
      <TextInput
        accessibilityLabel={placeholder}
        maxLength={2000}
        multiline
        onChangeText={setDraft}
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
      {sendState.status === "error" && sendState.error ? (
        <Text style={styles.dmSendErrorText}>{sendState.error}</Text>
      ) : null}
    </View>
  );
}

function MetricMiniPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricMiniPill}>
      <Text style={styles.metricMiniValue}>{value}</Text>
      <Text style={styles.metricMiniLabel}>{label}</Text>
    </View>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "accent" | "muted" | "success";
}) {
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
        {status ? <View style={[styles.avatarStatus, status === "active" && styles.avatarStatusActive]} /> : null}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="image"
      style={avatarShellStyles}
    >
      <View style={avatarStyles}>
        <Text style={[styles.avatarMarkText, size === "small" && styles.avatarMarkTextSmall]}>
          {fallback}
        </Text>
      </View>
      {status ? <View style={[styles.avatarStatus, status === "active" && styles.avatarStatusActive]} /> : null}
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
      <Text style={styles.contractTitle}>
        {isReady ? copy.storeReady : copy.storeNeedsReview}
      </Text>
      <Text style={styles.contractDescription}>{copy.storeDescription}</Text>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.storePermissionsLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>
          {mobileStoreReadiness.permissionCount}
        </Text>
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

function MobileQualityGateCard() {
  const firstTargets = MOBILE_QA_DEVICE_MATRIX.slice(0, 3)
    .map((target) => target.label)
    .join(" - ");
  const criticalChecks = MOBILE_MANUAL_QA_CHECKS.filter(
    (check) => check.risk === "critical",
  );

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
        <MetricTile
          label={copy.qualityManualLabel}
          value={mobileQualitySummary.manualCheckCount}
        />
        <MetricTile
          label={copy.qualityDeviceLabel}
          value={mobileQualitySummary.targetCount}
        />
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

function SessionDiagnostics({
  diagnostics,
}: {
  diagnostics: MobileSessionDiagnostics;
}) {
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
            <Text style={styles.permissionChipText}>{permissionLabels[item.intent.id]}</Text>
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
  variant,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
  variant: "danger" | "primary" | "secondary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
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

const styles = StyleSheet.create({
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
  dmListCard: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    padding: 12,
  },
  dmInboxHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
    paddingTop: 2,
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
    gap: 7,
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
    paddingVertical: 4,
  },
  messageDateLine: {
    height: 1,
    flex: 1,
    backgroundColor: "#E5E7FF",
  },
  messageDateText: {
    color: mobileColors.mutedSoft,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
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
