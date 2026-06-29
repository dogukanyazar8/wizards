import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MobileBootstrapPayload, MobileDMMessagesResponse } from "@wizards/types";
import whisprIcon from "../../assets/whispr-icon.png";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileAuth } from "../auth/mobile-auth-context";
import {
  fetchMobileBootstrap,
  MOBILE_BOOTSTRAP_ENDPOINT,
  summarizeMobileBootstrap,
  type MobileBootstrapSummary,
} from "../bootstrap/mobile-bootstrap";
import { getMobileRuntimeConfig } from "../config/environment";
import {
  type MobileDeepLinkParseResult,
} from "../deep-link/mobile-deep-links";
import { useMobileDeepLinks } from "../deep-link/use-mobile-deep-links";
import { mobileColors, mobileRadii, mobileSpacing } from "../design/tokens";
import { fetchMobileDMMessages } from "../dm/mobile-dm-client";
import { mobileCopy } from "../locale/mobile-copy";
import {
  createMobileNavigationState,
  MOBILE_TABS,
  mobileNavigationReducer,
  resolveMobileRoute,
  type MobileTabId,
} from "../navigation/mobile-navigation";
import {
  createInitialMobilePermissionReadiness,
  getPermissionReadinessForFeature,
  summarizeMobilePermissionReadiness,
  type MobilePermissionIntentId,
  type MobilePermissionReadiness,
  type MobilePermissionSummary,
} from "../permissions/mobile-permission-contract";
import { MOBILE_RELEASE_BUDGETS } from "../release/mobile-release-contract";

const copy = mobileCopy.tr;
const runtimeConfig = getMobileRuntimeConfig();

const tabLabels: Record<MobileTabId, string> = {
  messages: copy.tabMessages,
  overview: copy.tabOverview,
  settings: copy.tabSettings,
  voice: copy.tabVoice,
};

const tabIcons: Record<MobileTabId, string> = {
  messages: "D",
  overview: "W",
  settings: "A",
  voice: "V",
};

const permissionLabels: Record<MobilePermissionIntentId, string> = {
  camera: copy.permissionCamera,
  microphone: copy.permissionMicrophone,
  notifications: copy.permissionNotifications,
  photoLibrary: copy.permissionPhotoLibrary,
};

type MobileBootstrapViewState =
  | {
      error: null;
      payload: null;
      status: "idle" | "loading";
      summary: null;
    }
  | {
      error: null;
      payload: MobileBootstrapPayload;
      status: "ready";
      summary: MobileBootstrapSummary;
    }
  | {
      error: string;
      payload: null;
      status: "error";
      summary: null;
    };

type MobileDMMessagesViewState =
  | {
      conversationId: null;
      error: null;
      payload: null;
      status: "idle";
    }
  | {
      conversationId: string;
      error: null;
      payload: MobileDMMessagesResponse | null;
      status: "loading";
    }
  | {
      conversationId: string;
      error: null;
      payload: MobileDMMessagesResponse;
      status: "ready";
    }
  | {
      conversationId: string;
      error: string;
      payload: null;
      status: "error";
    };

const INITIAL_BOOTSTRAP_STATE: MobileBootstrapViewState = {
  error: null,
  payload: null,
  status: "idle",
  summary: null,
};

const INITIAL_DM_MESSAGES_STATE: MobileDMMessagesViewState = {
  conversationId: null,
  error: null,
  payload: null,
  status: "idle",
};

export function WhisprMobileRoot() {
  const insets = useSafeAreaInsets();
  const {
    apiClient,
    completeAuthHandoff,
    diagnostics,
    error,
    openWebSignIn,
    refreshSessionFromStorage,
    session,
    signOut,
    status,
  } = useMobileAuth();
  const [navigation, dispatchNavigation] = useReducer(
    mobileNavigationReducer,
    undefined,
    () => createMobileNavigationState(),
  );
  const [bootstrapState, setBootstrapState] =
    useState<MobileBootstrapViewState>(INITIAL_BOOTSTRAP_STATE);
  const bootstrapRequestIdRef = useRef(0);
  const [selectedDMConversationId, setSelectedDMConversationId] = useState<string | null>(
    null,
  );
  const [dmMessagesState, setDMMessagesState] =
    useState<MobileDMMessagesViewState>(INITIAL_DM_MESSAGES_STATE);
  const dmMessagesRequestIdRef = useRef(0);
  const [lastDeepLink, setLastDeepLink] = useState<MobileDeepLinkParseResult | null>(null);
  const route = resolveMobileRoute(navigation.currentTab, status);
  const permissionReadiness = useMemo(() => createInitialMobilePermissionReadiness(), []);
  const permissionSummary = useMemo(
    () => summarizeMobilePermissionReadiness(permissionReadiness),
    [permissionReadiness],
  );

  const loadBootstrap = useCallback(async () => {
    const requestId = bootstrapRequestIdRef.current + 1;
    bootstrapRequestIdRef.current = requestId;

    if (status !== "signed-in") {
      setBootstrapState(INITIAL_BOOTSTRAP_STATE);
      return;
    }

    setBootstrapState((current) =>
      current.status === "ready"
        ? current
        : {
            error: null,
            payload: null,
            status: "loading",
            summary: null,
          },
    );

    try {
      const payload = await fetchMobileBootstrap(apiClient);
      if (bootstrapRequestIdRef.current !== requestId) {
        return;
      }

      setBootstrapState({
        error: null,
        payload,
        status: "ready",
        summary: summarizeMobileBootstrap(payload),
      });
    } catch {
      if (bootstrapRequestIdRef.current !== requestId) {
        return;
      }

      setBootstrapState({
        error: copy.bootstrapLoadFailed,
        payload: null,
        status: "error",
        summary: null,
      });
    }
  }, [apiClient, status]);

  const loadDMMessages = useCallback(
    async (conversationId: string) => {
      const requestId = dmMessagesRequestIdRef.current + 1;
      dmMessagesRequestIdRef.current = requestId;

      if (status !== "signed-in") {
        setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
        return;
      }

      setDMMessagesState((current) => ({
        conversationId,
        error: null,
        payload:
          current.conversationId === conversationId && current.status === "ready"
            ? current.payload
            : null,
        status: "loading",
      }));

      try {
        const payload = await fetchMobileDMMessages(apiClient, { conversationId });
        if (dmMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setDMMessagesState({
          conversationId,
          error: null,
          payload,
          status: "ready",
        });
      } catch {
        if (dmMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setDMMessagesState({
          conversationId,
          error: copy.dmMessagesLoadFailed,
          payload: null,
          status: "error",
        });
      }
    },
    [apiClient, status],
  );

  const handleOpenDMConversation = useCallback(
    (conversationId: string) => {
      setSelectedDMConversationId(conversationId);
      void loadDMMessages(conversationId);
    },
    [loadDMMessages],
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
    if (status !== "signed-in") {
      bootstrapRequestIdRef.current += 1;
      dmMessagesRequestIdRef.current += 1;
      setBootstrapState(INITIAL_BOOTSTRAP_STATE);
      setSelectedDMConversationId(null);
      setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
      return;
    }

    void loadBootstrap();
  }, [loadBootstrap, status]);

  useEffect(() => {
    if (bootstrapState.status !== "ready" || !selectedDMConversationId) {
      return;
    }

    const hasSelectedConversation = bootstrapState.payload.home.directMessages.recent.some(
      (conversation) => conversation.id === selectedDMConversationId,
    );

    if (!hasSelectedConversation) {
      dmMessagesRequestIdRef.current += 1;
      setSelectedDMConversationId(null);
      setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
    }
  }, [bootstrapState, selectedDMConversationId]);

  const handleDeepLink = useCallback(
    (result: MobileDeepLinkParseResult) => {
      setLastDeepLink(result);

      if (!result.ok) {
        return;
      }

      if (result.intent.type === "auth-handoff") {
        const callbackPath = result.intent.callbackPath;
        void completeAuthHandoff({
          callbackPath,
          handoffToken: result.intent.token,
        }).then((completed) => {
          if (!completed) {
            dispatchNavigation({ tab: "settings", type: "select" });
            return;
          }

          dispatchNavigation({
            tab: callbackPath.startsWith("/settings") ? "settings" : "messages",
            type: "select",
          });
        });
        return;
      }

      if (result.intent.type === "invite" || result.intent.path.startsWith("/channels")) {
        dispatchNavigation({ tab: "messages", type: "select" });
        return;
      }

      if (result.intent.type === "route" && result.intent.path.startsWith("/settings")) {
        dispatchNavigation({ tab: "settings", type: "select" });
      }
    },
    [completeAuthHandoff],
  );

  useMobileDeepLinks({
    onDeepLink: handleDeepLink,
    runtimeConfig,
  });

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

  const topInset = Math.max(insets.top, 12);
  const bottomInset = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.safeArea, { paddingTop: topInset }]}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Image source={whisprIcon} style={styles.logo} accessibilityIgnoresInvertColors />
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>{copy.status}</Text>
            <Text style={styles.title}>{copy.appTitle}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {copy.appSubtitle}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.authStatusDot,
                status === "signed-in" && styles.authStatusDotReady,
                status === "checking" && styles.authStatusDotChecking,
              ]}
            />
            <Text style={styles.statusBadgeText} numberOfLines={1}>
              {status === "signed-in" ? signedInUserLabel ?? "Aktif" : status}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 4 }]}
          alwaysBounceVertical={false}
        >
          {route.isBlocked ? (
            <AuthGate
              reason={route.blockedReason}
              onOpenWebSignIn={() => void openWebSignIn()}
              onRefresh={() => void refreshSessionFromStorage()}
            />
          ) : (
            <ActiveScreen
              currentTab={route.currentTab}
              bootstrapState={bootstrapState}
              dmMessagesState={dmMessagesState}
              diagnostics={diagnostics}
              lastDeepLink={lastDeepLink}
              permissionReadiness={permissionReadiness}
              permissionSummary={permissionSummary}
              error={error}
              authStatusLabel={authStatusLabel}
              signedInUserLabel={signedInUserLabel}
              onOpenWebSignIn={() => void openWebSignIn()}
              onOpenDMConversation={handleOpenDMConversation}
              onRefreshBootstrap={() => void loadBootstrap()}
              onRefreshDMConversation={() => {
                if (selectedDMConversationId) {
                  void loadDMMessages(selectedDMConversationId);
                }
              }}
              onRefresh={() => void refreshSessionFromStorage()}
              onSignOut={() => void signOut()}
              selectedDMConversation={selectedDMConversation}
              selectedDMConversationId={selectedDMConversationId}
              status={status}
            />
          )}
        </ScrollView>

        <View
          style={[styles.tabBar, { marginBottom: bottomInset }]}
          accessibilityRole="tablist"
        >
          {MOBILE_TABS.map((tab) => {
            const isActive = navigation.currentTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityLabel={tabLabels[tab.id]}
                accessibilityState={{ selected: isActive }}
                onPress={() => dispatchNavigation({ tab: tab.id, type: "select" })}
                style={({ pressed }) => [
                  styles.tabButton,
                  isActive && styles.tabButtonActive,
                  pressed && styles.tabButtonPressed,
                ]}
              >
                <Text style={styles.tabIcon}>{tabIcons[tab.id]}</Text>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tabLabels[tab.id]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

interface ActiveScreenProps {
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  currentTab: MobileTabId;
  dmMessagesState: MobileDMMessagesViewState;
  diagnostics: {
    hasRefreshToken: boolean;
    hasSession: boolean;
    scopeCount: number;
  };
  error: string | null;
  lastDeepLink: MobileDeepLinkParseResult | null;
  onOpenDMConversation(conversationId: string): void;
  onOpenWebSignIn(): void;
  onRefreshBootstrap(): void;
  onRefreshDMConversation(): void;
  onRefresh(): void;
  onSignOut(): void;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  selectedDMConversation:
    | MobileBootstrapPayload["home"]["directMessages"]["recent"][number]
    | null;
  selectedDMConversationId: string | null;
  signedInUserLabel: string | null;
  status: string;
}

function ActiveScreen({
  authStatusLabel,
  bootstrapState,
  currentTab,
  dmMessagesState,
  diagnostics,
  error,
  lastDeepLink,
  onOpenDMConversation,
  onOpenWebSignIn,
  onRefreshBootstrap,
  onRefreshDMConversation,
  onRefresh,
  onSignOut,
  permissionReadiness,
  permissionSummary,
  selectedDMConversation,
  selectedDMConversationId,
  signedInUserLabel,
  status,
}: ActiveScreenProps) {
  switch (currentTab) {
    case "messages":
      return (
        <ScreenShell
          eyebrow={copy.tabMessages}
          title={copy.messagesTitle}
          description={copy.messagesDescription}
        >
          <DeepLinkStatusCard result={lastDeepLink} />
          <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
          {bootstrapState.status === "ready" &&
          bootstrapState.payload.home.directMessages.recent.length > 0 ? (
            <>
              <DirectMessageListCard
                conversations={bootstrapState.payload.home.directMessages.recent}
                selectedConversationId={selectedDMConversationId}
                onOpenConversation={onOpenDMConversation}
              />
              <DMConversationPreviewCard
                conversation={selectedDMConversation}
                currentUserId={bootstrapState.payload.user.id}
                state={dmMessagesState}
                onRetry={onRefreshDMConversation}
              />
            </>
          ) : bootstrapState.status === "idle" ||
            (bootstrapState.status === "ready" &&
              bootstrapState.payload.home.directMessages.recent.length === 0) ? (
            <EmptyState tone="accent" label={copy.messagesEmpty} />
          ) : null}
        </ScreenShell>
      );
    case "voice":
      return (
        <ScreenShell eyebrow={copy.tabVoice} title={copy.voiceEmpty} description={copy.voiceDescription}>
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
            readiness={permissionReadiness}
            summary={permissionSummary}
            compactFeature="voice"
          />
          <EmptyState tone="success" label={copy.voiceEmpty} />
        </ScreenShell>
      );
    case "settings":
      return (
        <ScreenShell
          eyebrow={copy.tabSettings}
          title={authStatusLabel}
          description={copy.settingsDescription}
        >
          <SessionDiagnostics diagnostics={diagnostics} />
          <DeepLinkStatusCard result={lastDeepLink} />
          <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
          <PermissionReadinessCard readiness={permissionReadiness} summary={permissionSummary} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.actionRow}>
            <ActionButton label={copy.secondaryAction} onPress={onRefresh} variant="secondary" />
            {status === "signed-in" ? (
              <ActionButton label={copy.signOutAction} onPress={onSignOut} variant="danger" />
            ) : (
              <ActionButton label={copy.primaryAction} onPress={onOpenWebSignIn} variant="primary" />
            )}
          </View>
        </ScreenShell>
      );
    case "overview":
    default:
      return (
        <ScreenShell
          eyebrow={signedInUserLabel ?? copy.tabOverview}
          title={copy.foundation}
          description={copy.overviewDescription}
        >
          <HomeSummaryCard state={bootstrapState} onRetry={onRefreshBootstrap} />
          {bootstrapState.status === "ready" ? (
            <RecentServersCard servers={bootstrapState.payload.home.servers.recent} />
          ) : null}
          <View style={styles.guardrailList}>
            <Guardrail label={copy.guardrail1} />
            <Guardrail label={copy.guardrail2} />
            <Guardrail label={copy.guardrail3} />
          </View>
          <EnvironmentCard />
          <BootstrapContractCard />
          <ReleaseReadinessCard />
          <SessionDiagnostics diagnostics={diagnostics} />
          <DeepLinkStatusCard result={lastDeepLink} />
          <PermissionReadinessCard readiness={permissionReadiness} summary={permissionSummary} />
          {status !== "signed-in" ? (
            <ActionButton label={copy.primaryAction} onPress={onOpenWebSignIn} variant="primary" />
          ) : null}
        </ScreenShell>
      );
  }
}

function AuthGate({
  onOpenWebSignIn,
  onRefresh,
  reason,
}: {
  onOpenWebSignIn(): void;
  onRefresh(): void;
  reason: "auth-required" | "checking" | null;
}) {
  const isChecking = reason === "checking";

  return (
    <ScreenShell
      eyebrow={copy.status}
      title={isChecking ? copy.authChecking : copy.gatedSignedOut}
      description={isChecking ? copy.gatedChecking : copy.authSummary}
    >
      <View style={styles.authGateCard}>
        <View style={[styles.authGateIcon, isChecking && styles.authGateIconChecking]}>
          <Text style={styles.authGateIconText}>{isChecking ? "..." : "!"}</Text>
        </View>
        <Text style={styles.authSummary}>{isChecking ? copy.gatedChecking : copy.gatedSignedOut}</Text>
      </View>
      <View style={styles.actionRow}>
        <ActionButton label={copy.secondaryAction} onPress={onRefresh} variant="secondary" />
        {!isChecking ? (
          <ActionButton label={copy.primaryAction} onPress={onOpenWebSignIn} variant="primary" />
        ) : null}
      </View>
    </ScreenShell>
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

function HomeSummaryCard({
  onRetry,
  state,
}: {
  onRetry(): void;
  state: MobileBootstrapViewState;
}) {
  if (state.status !== "ready") {
    return <BootstrapStateNotice state={state} onRetry={onRetry} />;
  }

  return (
    <View style={styles.homeSummaryCard}>
      <MetricTile label={copy.homeServersLabel} value={state.summary.workspaceCount} />
      <MetricTile label={copy.homeDmLabel} value={state.summary.directMessageCount} />
      <MetricTile label={copy.homeUnreadLabel} value={state.summary.unreadDirectMessageCount} />
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

function RecentServersCard({
  servers,
}: {
  servers: MobileBootstrapPayload["home"]["servers"]["recent"];
}) {
  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.homeRecentServersTitle}</Text>
      {servers.length > 0 ? (
        <View style={styles.compactList}>
          {servers.map((server) => (
            <View key={server.id} style={styles.compactListRow}>
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
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.contractDescription}>{copy.homeNoServers}</Text>
      )}
    </View>
  );
}

function DirectMessageListCard({
  conversations,
  onOpenConversation,
  selectedConversationId,
}: {
  conversations: MobileBootstrapPayload["home"]["directMessages"]["recent"];
  onOpenConversation(conversationId: string): void;
  selectedConversationId: string | null;
}) {
  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.homeRecentDmsTitle}</Text>
      <View style={styles.compactList}>
        {conversations.map((conversation) => {
          const title =
            conversation.name ??
            conversation.participants
              .map((participant) => participant.displayName ?? participant.username)
              .join(", ") ??
            copy.directMessageFallback;
          const isSelected = conversation.id === selectedConversationId;

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
              <AvatarMark label={title} imageUrl={conversation.iconUrl ?? conversation.participants[0]?.avatarUrl ?? null} />
              <View style={styles.compactListText}>
                <Text style={styles.compactListTitle} numberOfLines={1}>
                  {title || copy.directMessageFallback}
                </Text>
                <Text style={styles.compactListMeta} numberOfLines={1}>
                  {conversation.participantCount} {copy.peopleSuffix}
                  {conversation.unreadCount > 0
                    ? ` - ${conversation.unreadCount} ${copy.unreadSuffix}`
                    : ""}
                  {conversation.muted ? ` - ${copy.mutedSuffix}` : ""}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DMConversationPreviewCard({
  conversation,
  currentUserId,
  onRetry,
  state,
}: {
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  currentUserId: string;
  onRetry(): void;
  state: MobileDMMessagesViewState;
}) {
  if (!conversation) {
    return <EmptyState tone="accent" label={copy.dmSelectConversation} />;
  }

  const title = getMobileConversationTitle(conversation);
  const responseConversation = state.payload?.conversation;
  const participantCount =
    responseConversation?.participants.length ?? conversation.participantCount;

  return (
    <View style={styles.dmPreviewCard}>
      <View style={styles.dmPreviewHeader}>
        <AvatarMark
          label={title}
          imageUrl={conversation.iconUrl ?? conversation.participants[0]?.avatarUrl ?? null}
        />
        <View style={styles.dmPreviewTitleBlock}>
          <Text style={styles.dmPreviewTitle} numberOfLines={1}>
            {responseConversation?.name ?? title}
          </Text>
          <Text style={styles.dmPreviewMeta} numberOfLines={1}>
            {participantCount} {copy.peopleSuffix}
            {conversation.unreadCount > 0
              ? ` - ${conversation.unreadCount} ${copy.unreadSuffix}`
              : ""}
          </Text>
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
          <Text style={styles.dmRefreshButtonText}>R</Text>
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
        <View style={styles.dmMessageList}>
          {state.payload.messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.dmMessageRow,
                message.userId === currentUserId && styles.dmMessageRowOwn,
              ]}
            >
              <View style={styles.dmMessageHeader}>
                <Text style={styles.dmMessageAuthor} numberOfLines={1}>
                  {message.author.displayName ?? message.author.username}
                </Text>
                <Text style={styles.dmMessageTime}>{formatMobileMessageTime(message.createdAt)}</Text>
              </View>
              <Text style={styles.dmMessageBody} numberOfLines={4}>
                {message.deletedAt
                  ? copy.dmDeletedMessage
                  : message.content.trim() || copy.dmAttachmentOnlyMessage}
              </Text>
              {message.attachments.length > 0 || message.reactions.length > 0 ? (
                <Text style={styles.dmMessageMeta} numberOfLines={1}>
                  {message.attachments.length > 0
                    ? `${message.attachments.length} ${copy.attachmentsSuffix}`
                    : ""}
                  {message.attachments.length > 0 && message.reactions.length > 0 ? " - " : ""}
                  {message.reactions.length > 0
                    ? `${message.reactions.length} ${copy.reactionsSuffix}`
                    : ""}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.dmNoMessages}</Text>
      ) : null}
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

function AvatarMark({ imageUrl, label }: { imageUrl: string | null; label: string }) {
  const fallback = label.trim().slice(0, 2).toUpperCase() || "W";

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={styles.avatarMark}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View style={styles.avatarMark}>
      <Text style={styles.avatarMarkText}>{fallback}</Text>
    </View>
  );
}

function ReleaseReadinessCard() {
  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.releaseTitle}</Text>
      <Text style={styles.contractTitle}>{copy.releaseReady}</Text>
      <View style={styles.releaseBudgetList}>
        {MOBILE_RELEASE_BUDGETS.slice(0, 3).map((budget) => (
          <View key={budget.metric} style={styles.releaseBudgetRow}>
            <Text style={styles.releaseBudgetMetric}>{budget.metric}</Text>
            <Text style={styles.releaseBudgetTarget}>{budget.target}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SessionDiagnostics({
  diagnostics,
}: {
  diagnostics: {
    hasRefreshToken: boolean;
    hasSession: boolean;
    scopeCount: number;
  };
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

function getMobileConversationTitle(
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number],
) {
  const participantNames = conversation.participants
    .map((participant) => participant.displayName ?? participant.username)
    .filter(Boolean);

  return (
    conversation.name ??
    (participantNames.length > 0
      ? participantNames.join(", ")
      : copy.directMessageFallback)
  );
}

function formatMobileMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function DiagnosticPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagnosticPill}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={styles.diagnosticValue}>{value}</Text>
    </View>
  );
}

function Guardrail({ label }: { label: string }) {
  return (
    <View style={styles.guardrail}>
      <View style={styles.guardrailDot} />
      <Text style={styles.guardrailText}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  variant,
}: {
  label: string;
  onPress(): void;
  variant: "danger" | "primary" | "secondary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "primary" && styles.actionButtonPrimary,
        variant === "danger" && styles.actionButtonDanger,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === "primary" && styles.actionButtonTextPrimary,
          variant === "danger" && styles.actionButtonTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileColors.background,
  },
  shell: {
    flex: 1,
    paddingHorizontal: mobileSpacing.page,
    paddingTop: 8,
    minWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.card,
    backgroundColor: mobileColors.card,
    padding: 14,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 2,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 2,
    color: mobileColors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  statusBadge: {
    maxWidth: 92,
    minWidth: 0,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
  },
  statusBadgeText: {
    flex: 1,
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  authStatusDot: {
    width: 10,
    height: 10,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.warning,
  },
  authStatusDotReady: {
    backgroundColor: mobileColors.success,
  },
  authStatusDotChecking: {
    backgroundColor: mobileColors.mutedSoft,
  },
  contentScroll: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    flexGrow: 1,
    paddingVertical: mobileSpacing.section,
    minWidth: 0,
  },
  screenCard: {
    flexGrow: 1,
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.card,
    backgroundColor: mobileColors.card,
    padding: 16,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 3,
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
    fontSize: 22,
    lineHeight: 29,
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
    marginTop: 8,
    minWidth: 0,
  },
  guardrailList: {
    gap: 9,
  },
  guardrail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: mobileRadii.control,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  guardrailDot: {
    width: 9,
    height: 9,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.success,
  },
  guardrailText: {
    flex: 1,
    color: mobileColors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
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
    minHeight: 36,
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
  homeSummaryCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
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
  compactListTitle: {
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  compactListMeta: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  avatarMark: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#EDE9FE",
  },
  avatarMarkText: {
    color: mobileColors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
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
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F5F3FF",
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
  dmMessageMeta: {
    marginTop: 6,
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "800",
  },
  releaseBudgetList: {
    gap: 7,
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
  authGateCard: {
    flexDirection: "row",
    alignItems: "center",
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
