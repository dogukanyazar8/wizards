import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ChatMessage,
  MobileBootstrapPayload,
  MobileChannelMessagesResponse,
  MobileDMMessagesResponse,
  MobileWorkspaceChannelSummary,
  MobileWorkspaceServerDetailResponse,
} from "@wizards/types";
import {
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AppStateStatus,
} from "react-native";
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
import type { MobileSessionDiagnostics } from "../auth/session-types";
import { useMobileDeepLinks } from "../deep-link/use-mobile-deep-links";
import { mobileColors, mobileRadii, mobileSpacing } from "../design/tokens";
import {
  fetchMobileDMMessages,
  MOBILE_DM_MESSAGES_LIMIT,
  sendMobileDMMessage,
} from "../dm/mobile-dm-client";
import { mobileCopy } from "../locale/mobile-copy";
import {
  createMobileNavigationState,
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
import {
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_QA_DEVICE_MATRIX,
  summarizeMobileQualityGate,
} from "../quality/mobile-quality-gate";
import { MOBILE_RELEASE_BUDGETS } from "../release/mobile-release-contract";
import {
  createInitialMobileSyncSnapshot,
  formatMobileSyncAge,
  isMobileSyncStale,
  markMobileSyncFailed,
  markMobileSyncStarted,
  markMobileSyncSucceeded,
  shouldRefreshOnForeground,
  type MobileSyncSnapshot,
} from "../sync/mobile-sync-contract";
import { validateMobileStoreReadiness } from "../release/mobile-store-contract";
import {
  fetchMobileChannelMessages,
  fetchMobileWorkspaceServer,
} from "../workspace/mobile-workspace-client";
import {
  findInitialMobileWorkspaceChannel,
  formatMobileDisplayTime,
  getMobileChannelPriority,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  getMobileMessageBodyPreview,
  getMobileMessageEngagementCounts,
  getMobileWorkspaceChannels,
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
import { MobileAppShell } from "./mobile-app-shell";

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
  blocked: copy.settingsBlockedLabel,
  disabled: copy.settingsFeatureDisabled,
  missing: copy.settingsMissingLabel,
  pending: copy.settingsPendingLabel,
  ready: copy.settingsReadyLabel,
  refreshToken: copy.settingsRefreshTokenLabel,
  scopeCount: copy.settingsScopeCountLabel,
  session: copy.settingsSessionLabel,
  storeBlockers: copy.settingsStoreBlockersLabel,
  storeWarnings: copy.settingsStoreWarningsLabel,
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

type MobileDMSendViewState = {
  conversationId: string | null;
  error: string | null;
  status: "idle" | "sending" | "error";
};

type MobileWorkspaceServerViewState =
  | {
      error: null;
      payload: null;
      serverId: null;
      status: "idle";
    }
  | {
      error: null;
      payload: MobileWorkspaceServerDetailResponse;
      serverId: string;
      status: "ready";
    }
  | {
      error: null;
      payload: MobileWorkspaceServerDetailResponse | null;
      serverId: string;
      status: "loading";
    }
  | {
      error: string;
      payload: null;
      serverId: string;
      status: "error";
    };

type MobileChannelMessagesViewState =
  | {
      channelId: null;
      error: null;
      payload: null;
      status: "idle";
    }
  | {
      channelId: string;
      error: null;
      payload: MobileChannelMessagesResponse | null;
      status: "loading";
    }
  | {
      channelId: string;
      error: null;
      payload: MobileChannelMessagesResponse;
      status: "ready";
    }
  | {
      channelId: string;
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

const INITIAL_DM_SEND_STATE: MobileDMSendViewState = {
  conversationId: null,
  error: null,
  status: "idle",
};

const INITIAL_WORKSPACE_SERVER_STATE: MobileWorkspaceServerViewState = {
  error: null,
  payload: null,
  serverId: null,
  status: "idle",
};

const INITIAL_CHANNEL_MESSAGES_STATE: MobileChannelMessagesViewState = {
  channelId: null,
  error: null,
  payload: null,
  status: "idle",
};

const INITIAL_BOOTSTRAP_SYNC_STATE = createInitialMobileSyncSnapshot("bootstrap");
const INITIAL_DM_SYNC_STATE = createInitialMobileSyncSnapshot("dm");
const INITIAL_WORKSPACE_SYNC_STATE = createInitialMobileSyncSnapshot("workspace");
const INITIAL_CHANNEL_SYNC_STATE = createInitialMobileSyncSnapshot("channel");

export function WhisprMobileRoot() {
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
  const [bootstrapSyncState, setBootstrapSyncState] = useState<MobileSyncSnapshot>(
    INITIAL_BOOTSTRAP_SYNC_STATE,
  );
  const bootstrapRequestIdRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [selectedDMConversationId, setSelectedDMConversationId] = useState<string | null>(
    null,
  );
  const [dmMessagesState, setDMMessagesState] =
    useState<MobileDMMessagesViewState>(INITIAL_DM_MESSAGES_STATE);
  const [dmSyncState, setDMSyncState] =
    useState<MobileSyncSnapshot>(INITIAL_DM_SYNC_STATE);
  const [dmSendState, setDMSendState] =
    useState<MobileDMSendViewState>(INITIAL_DM_SEND_STATE);
  const dmMessagesRequestIdRef = useRef(0);
  const [selectedWorkspaceServerId, setSelectedWorkspaceServerId] = useState<string | null>(
    null,
  );
  const [selectedWorkspaceChannelId, setSelectedWorkspaceChannelId] = useState<string | null>(
    null,
  );
  const [workspaceServerState, setWorkspaceServerState] =
    useState<MobileWorkspaceServerViewState>(INITIAL_WORKSPACE_SERVER_STATE);
  const [channelMessagesState, setChannelMessagesState] =
    useState<MobileChannelMessagesViewState>(INITIAL_CHANNEL_MESSAGES_STATE);
  const [workspaceSyncState, setWorkspaceSyncState] = useState<MobileSyncSnapshot>(
    INITIAL_WORKSPACE_SYNC_STATE,
  );
  const [channelSyncState, setChannelSyncState] = useState<MobileSyncSnapshot>(
    INITIAL_CHANNEL_SYNC_STATE,
  );
  const workspaceServerRequestIdRef = useRef(0);
  const channelMessagesRequestIdRef = useRef(0);
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
      setBootstrapSyncState(INITIAL_BOOTSTRAP_SYNC_STATE);
      return;
    }

    setBootstrapSyncState(markMobileSyncStarted);
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
      setBootstrapSyncState(markMobileSyncSucceeded);
    } catch {
      if (bootstrapRequestIdRef.current !== requestId) {
        return;
      }

      setBootstrapSyncState(markMobileSyncFailed);
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
        setDMSyncState(INITIAL_DM_SYNC_STATE);
        return;
      }

      setDMSyncState(markMobileSyncStarted);
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
        setDMSyncState(markMobileSyncSucceeded);
      } catch {
        if (dmMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setDMSyncState(markMobileSyncFailed);
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

  const handleSendDMMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const conversationId = selectedDMConversationId;
      const trimmedContent = content.trim();

      if (status !== "signed-in" || !conversationId || trimmedContent.length === 0) {
        return false;
      }

      setDMSendState({
        conversationId,
        error: null,
        status: "sending",
      });

      try {
        const response = await sendMobileDMMessage(apiClient, {
          conversationId,
          content: trimmedContent,
        });

        setDMMessagesState((current) => {
          if (current.conversationId !== conversationId || !current.payload) {
            return current;
          }

          const hasMessage = current.payload.messages.some(
            (message) => message.id === response.message.id,
          );
          const messages = hasMessage
            ? current.payload.messages
            : [...current.payload.messages, response.message].slice(-MOBILE_DM_MESSAGES_LIMIT);

          return {
            conversationId,
            error: null,
            payload: {
              ...current.payload,
              messages,
            },
            status: "ready",
          };
        });

        setDMSendState({
          conversationId,
          error: null,
          status: "idle",
        });
        setDMSyncState(markMobileSyncSucceeded);
        void loadBootstrap();
        return true;
      } catch {
        setDMSendState({
          conversationId,
          error: copy.dmSendFailed,
          status: "error",
        });
        return false;
      }
    },
    [apiClient, loadBootstrap, selectedDMConversationId, status],
  );

  const loadChannelMessages = useCallback(
    async (channelId: string) => {
      const requestId = channelMessagesRequestIdRef.current + 1;
      channelMessagesRequestIdRef.current = requestId;

      if (status !== "signed-in") {
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        return;
      }

      setChannelSyncState(markMobileSyncStarted);
      setChannelMessagesState((current) => ({
        channelId,
        error: null,
        payload:
          current.channelId === channelId && current.status === "ready"
            ? current.payload
            : null,
        status: "loading",
      }));

      try {
        const payload = await fetchMobileChannelMessages(apiClient, { channelId });
        if (channelMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setChannelMessagesState({
          channelId,
          error: null,
          payload,
          status: "ready",
        });
        setChannelSyncState(markMobileSyncSucceeded);
      } catch {
        if (channelMessagesRequestIdRef.current !== requestId) {
          return;
        }

        setChannelSyncState(markMobileSyncFailed);
        setChannelMessagesState({
          channelId,
          error: copy.workspaceChannelLoadFailed,
          payload: null,
          status: "error",
        });
      }
    },
    [apiClient, status],
  );

  const loadWorkspaceServer = useCallback(
    async (serverId: string, preferredChannelId?: string | null) => {
      const requestId = workspaceServerRequestIdRef.current + 1;
      workspaceServerRequestIdRef.current = requestId;

      if (status !== "signed-in") {
        setWorkspaceServerState(INITIAL_WORKSPACE_SERVER_STATE);
        setWorkspaceSyncState(INITIAL_WORKSPACE_SYNC_STATE);
        setSelectedWorkspaceServerId(null);
        setSelectedWorkspaceChannelId(null);
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        return;
      }

      setSelectedWorkspaceServerId(serverId);
      setWorkspaceSyncState(markMobileSyncStarted);
      setWorkspaceServerState((current) => ({
        serverId,
        error: null,
        payload:
          current.serverId === serverId && current.status === "ready"
            ? current.payload
            : null,
        status: "loading",
      }));

      try {
        const payload = await fetchMobileWorkspaceServer(apiClient, { serverId });
        if (workspaceServerRequestIdRef.current !== requestId) {
          return;
        }

        setWorkspaceServerState({
          serverId,
          error: null,
          payload,
          status: "ready",
        });
        setWorkspaceSyncState(markMobileSyncSucceeded);

        const selectedChannel = findInitialMobileWorkspaceChannel(
          payload.detail,
          preferredChannelId,
        );
        setSelectedWorkspaceChannelId(selectedChannel?.id ?? null);

        if (selectedChannel?.type === "TEXT") {
          void loadChannelMessages(selectedChannel.id);
        } else {
          channelMessagesRequestIdRef.current += 1;
          setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
          setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        }
      } catch {
        if (workspaceServerRequestIdRef.current !== requestId) {
          return;
        }

        setWorkspaceSyncState(markMobileSyncFailed);
        setWorkspaceServerState({
          serverId,
          error: copy.workspaceLoadFailed,
          payload: null,
          status: "error",
        });
        setSelectedWorkspaceChannelId(null);
        channelMessagesRequestIdRef.current += 1;
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
      }
    },
    [apiClient, loadChannelMessages, status],
  );

  const handleOpenDMConversation = useCallback(
    (conversationId: string) => {
      setSelectedDMConversationId(conversationId);
      setDMSendState(INITIAL_DM_SEND_STATE);
      void loadDMMessages(conversationId);
    },
    [loadDMMessages],
  );

  const handleOpenWorkspaceServer = useCallback(
    (serverId: string) => {
      void loadWorkspaceServer(serverId);
    },
    [loadWorkspaceServer],
  );

  const handleOpenWorkspaceChannel = useCallback(
    (channel: MobileWorkspaceChannelSummary) => {
      setSelectedWorkspaceChannelId(channel.id);

      if (channel.type !== "TEXT") {
        channelMessagesRequestIdRef.current += 1;
        setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        return;
      }

      void loadChannelMessages(channel.id);
    },
    [loadChannelMessages],
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

  const refreshVisibleMobileData = useCallback(() => {
    if (status !== "signed-in") {
      return;
    }

    void loadBootstrap();

    if (selectedDMConversationId) {
      void loadDMMessages(selectedDMConversationId);
    }

    if (selectedWorkspaceServerId) {
      void loadWorkspaceServer(selectedWorkspaceServerId, selectedWorkspaceChannelId);
      return;
    }

    if (selectedWorkspaceChannelId) {
      void loadChannelMessages(selectedWorkspaceChannelId);
    }
  }, [
    loadBootstrap,
    loadChannelMessages,
    loadDMMessages,
    loadWorkspaceServer,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    status,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      const returnedToForeground =
        nextState === "active" &&
        (previousState === "background" || previousState === "inactive");

      if (!returnedToForeground || status !== "signed-in") {
        return;
      }

      const shouldRefresh =
        shouldRefreshOnForeground(bootstrapSyncState) ||
        (selectedDMConversationId ? shouldRefreshOnForeground(dmSyncState) : false) ||
        (selectedWorkspaceServerId
          ? shouldRefreshOnForeground(workspaceSyncState)
          : false) ||
        (selectedWorkspaceChannelId ? shouldRefreshOnForeground(channelSyncState) : false);

      if (shouldRefresh) {
        refreshVisibleMobileData();
      }
    });

    return () => subscription.remove();
  }, [
    bootstrapSyncState,
    channelSyncState,
    dmSyncState,
    refreshVisibleMobileData,
    selectedDMConversationId,
    selectedWorkspaceChannelId,
    selectedWorkspaceServerId,
    status,
    workspaceSyncState,
  ]);

  useEffect(() => {
    if (status !== "signed-in") {
      bootstrapRequestIdRef.current += 1;
      dmMessagesRequestIdRef.current += 1;
      setBootstrapState(INITIAL_BOOTSTRAP_STATE);
      setBootstrapSyncState(INITIAL_BOOTSTRAP_SYNC_STATE);
      setSelectedDMConversationId(null);
      setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
      setDMSyncState(INITIAL_DM_SYNC_STATE);
      setDMSendState(INITIAL_DM_SEND_STATE);
      workspaceServerRequestIdRef.current += 1;
      channelMessagesRequestIdRef.current += 1;
      setSelectedWorkspaceServerId(null);
      setSelectedWorkspaceChannelId(null);
      setWorkspaceServerState(INITIAL_WORKSPACE_SERVER_STATE);
      setChannelMessagesState(INITIAL_CHANNEL_MESSAGES_STATE);
      setWorkspaceSyncState(INITIAL_WORKSPACE_SYNC_STATE);
      setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
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
      setDMSendState(INITIAL_DM_SEND_STATE);
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

      if (result.intent.type === "invite") {
        dispatchNavigation({ tab: "messages", type: "select" });
        return;
      }

      if (result.intent.path.startsWith("/channels")) {
        const target = parseMobileChannelsRoute(result.intent.path);
        if (target?.serverId && target.serverId !== "@me") {
          dispatchNavigation({ tab: "messages", type: "select" });
          void loadWorkspaceServer(target.serverId, target.channelId);
          return;
        }

        dispatchNavigation({ tab: "messages", type: "select" });
        return;
      }

      if (result.intent.type === "route" && result.intent.path.startsWith("/settings")) {
        dispatchNavigation({ tab: "settings", type: "select" });
      }
    },
    [completeAuthHandoff, loadWorkspaceServer],
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

  return (
    <MobileAppShell
      authStatus={status}
      currentTab={navigation.currentTab}
      onSelectTab={(tab) => dispatchNavigation({ tab, type: "select" })}
      signedInUserLabel={signedInUserLabel}
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
          bootstrapSyncState={bootstrapSyncState}
          dmMessagesState={dmMessagesState}
          dmSyncState={dmSyncState}
          dmSendState={dmSendState}
          diagnostics={diagnostics}
          lastDeepLink={lastDeepLink}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          error={error}
          authStatusLabel={authStatusLabel}
          channelMessagesState={channelMessagesState}
          channelSyncState={channelSyncState}
          signedInUserLabel={signedInUserLabel}
          onOpenWebSignIn={() => void openWebSignIn()}
          onOpenDMConversation={handleOpenDMConversation}
          onOpenWorkspaceChannel={handleOpenWorkspaceChannel}
          onOpenWorkspaceServer={handleOpenWorkspaceServer}
          onRefreshBootstrap={() => void loadBootstrap()}
          onRefreshChannelMessages={() => {
            if (selectedWorkspaceChannelId) {
              void loadChannelMessages(selectedWorkspaceChannelId);
            }
          }}
          onRefreshDMConversation={() => {
            if (selectedDMConversationId) {
              void loadDMMessages(selectedDMConversationId);
            }
          }}
          onRefreshWorkspaceServer={() => {
            if (selectedWorkspaceServerId) {
              void loadWorkspaceServer(selectedWorkspaceServerId, selectedWorkspaceChannelId);
            }
          }}
          onRefresh={() => void refreshSessionFromStorage()}
          onSendDMMessage={handleSendDMMessage}
          onSignOut={() => void signOut()}
          selectedDMConversation={selectedDMConversation}
          selectedDMConversationId={selectedDMConversationId}
          selectedWorkspaceChannelId={selectedWorkspaceChannelId}
          selectedWorkspaceServerId={selectedWorkspaceServerId}
          status={status}
          workspaceSyncState={workspaceSyncState}
          workspaceServerState={workspaceServerState}
        />
      )}
    </MobileAppShell>
  );
}

interface ActiveScreenProps {
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  bootstrapSyncState: MobileSyncSnapshot;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSyncState: MobileSyncSnapshot;
  currentTab: MobileTabId;
  dmMessagesState: MobileDMMessagesViewState;
  dmSendState: MobileDMSendViewState;
  dmSyncState: MobileSyncSnapshot;
  diagnostics: MobileSessionDiagnostics;
  error: string | null;
  lastDeepLink: MobileDeepLinkParseResult | null;
  onOpenDMConversation(conversationId: string): void;
  onOpenWebSignIn(): void;
  onOpenWorkspaceChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenWorkspaceServer(serverId: string): void;
  onRefreshBootstrap(): void;
  onRefreshChannelMessages(): void;
  onRefreshDMConversation(): void;
  onRefreshWorkspaceServer(): void;
  onRefresh(): void;
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

function ActiveScreen({
  authStatusLabel,
  bootstrapState,
  bootstrapSyncState,
  channelMessagesState,
  channelSyncState,
  currentTab,
  dmMessagesState,
  dmSendState,
  dmSyncState,
  diagnostics,
  error,
  lastDeepLink,
  onOpenDMConversation,
  onOpenWebSignIn,
  onOpenWorkspaceChannel,
  onOpenWorkspaceServer,
  onRefreshBootstrap,
  onRefreshChannelMessages,
  onRefreshDMConversation,
  onRefreshWorkspaceServer,
  onRefresh,
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
  switch (currentTab) {
    case "messages":
      return (
        <ScreenShell
          eyebrow={copy.tabMessages}
          title={copy.messagesTitle}
          description={copy.messagesDescription}
        >
          <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
          {bootstrapState.status === "ready" &&
          bootstrapState.payload.home.directMessages.recent.length > 0 ? (
            <>
              <MobileSyncStatusCard
                items={[
                  { label: copy.syncBootstrapLabel, snapshot: bootstrapSyncState },
                  { label: copy.syncDmLabel, snapshot: dmSyncState },
                ]}
              />
              <DirectMessageListCard
                conversations={bootstrapState.payload.home.directMessages.recent}
                totalCount={bootstrapState.payload.home.directMessages.totalCount}
                unreadCount={bootstrapState.payload.home.directMessages.unreadCount}
                selectedConversationId={selectedDMConversationId}
                onOpenConversation={onOpenDMConversation}
              />
              <DMConversationPreviewCard
                conversation={selectedDMConversation}
                currentUserId={bootstrapState.payload.user.id}
                sendState={dmSendState}
                state={dmMessagesState}
                onRetry={onRefreshDMConversation}
                onSendMessage={onSendDMMessage}
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
          <MobileSyncStatusCard
            items={[{ label: copy.syncBootstrapLabel, snapshot: bootstrapSyncState }]}
          />
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
          <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
          <SettingsAccountCard
            authStatusLabel={authStatusLabel}
            bootstrapState={bootstrapState}
            signedInUserLabel={signedInUserLabel}
            status={status}
          />
          <SettingsSecurityCard diagnostics={diagnostics} lastDeepLink={lastDeepLink} />
          {bootstrapState.status === "ready" ? (
            <SettingsFeatureReadinessCard features={bootstrapState.payload.features} />
          ) : null}
          <PermissionReadinessCard readiness={permissionReadiness} summary={permissionSummary} />
          <SettingsPermissionEvidenceCard summary={permissionSummary} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.actionRow}>
            <ActionButton label={copy.secondaryAction} onPress={onRefresh} variant="secondary" />
            {status === "signed-in" ? (
              <ActionButton label={copy.signOutAction} onPress={onSignOut} variant="danger" />
            ) : (
              <ActionButton label={copy.primaryAction} onPress={onOpenWebSignIn} variant="primary" />
            )}
          </View>
          <DeveloperDiagnosticsCard
            bootstrapSyncState={bootstrapSyncState}
          />
        </ScreenShell>
      );
    case "overview":
    default:
      return (
        <ScreenShell
          eyebrow={signedInUserLabel ?? copy.tabOverview}
          title={copy.overviewTitle}
          description={copy.overviewDescription}
        >
          <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
          <HomeSummaryCard state={bootstrapState} onRetry={onRefreshBootstrap} />
          <WorkspacePreviewCard
            bootstrapState={bootstrapState}
            channelMessagesState={channelMessagesState}
            selectedChannelId={selectedWorkspaceChannelId}
            selectedServerId={selectedWorkspaceServerId}
            serverState={workspaceServerState}
            onOpenChannel={onOpenWorkspaceChannel}
            onOpenServer={onOpenWorkspaceServer}
            onRefreshChannel={onRefreshChannelMessages}
            onRefreshServer={onRefreshWorkspaceServer}
          />
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
  const storeEvidence = getMobileStoreEvidence(mobileStoreReadiness, settingsEvidenceLabels);
  const releaseEvidence = getMobileReleaseEvidence({
    budgetCount: MOBILE_RELEASE_BUDGETS.length,
    qualitySummary: mobileQualitySummary,
    releaseBudgets: MOBILE_RELEASE_BUDGETS,
  });

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
      <SettingsEvidenceList items={releaseEvidence} />
      <SettingsEvidenceList items={storeEvidence} />
      <ReleaseReadinessCard />
      <StoreReadinessCard />
      <MobileQualityGateCard />
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
  onOpenServer,
  selectedServerId,
  servers,
}: {
  onOpenServer?(serverId: string): void;
  selectedServerId?: string | null;
  servers: MobileBootstrapPayload["home"]["servers"]["recent"];
}) {
  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.homeRecentServersTitle}</Text>
      {servers.length > 0 ? (
        <View style={styles.compactList}>
          {servers.map((server) => (
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
  onOpenChannel,
  onOpenServer,
  onRefreshChannel,
  onRefreshServer,
  selectedChannelId,
  selectedServerId,
  serverState,
}: {
  bootstrapState: MobileBootstrapViewState;
  channelMessagesState: MobileChannelMessagesViewState;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenServer(serverId: string): void;
  onRefreshChannel(): void;
  onRefreshServer(): void;
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
              state={channelMessagesState}
              onRetry={onRefreshChannel}
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

  return (
    <View style={styles.workspaceChannelList}>
      {channels.map((channel) => {
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
  onRetry,
  state,
}: {
  channel: MobileWorkspaceChannelSummary;
  onRetry(): void;
  state: MobileChannelMessagesViewState;
}) {
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
        <View style={styles.dmMessageList}>
          {state.payload.messages.map((message) => (
            <MessagePreviewRow key={message.id} message={message} />
          ))}
        </View>
      ) : null}
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.workspaceNoMessages}</Text>
      ) : null}
    </View>
  );
}

function MessagePreviewRow({
  message,
  own = false,
}: {
  message: ChatMessage | MobileDMMessagesResponse["messages"][number];
  own?: boolean;
}) {
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });
  const { attachmentCount, reactionCount } = getMobileMessageEngagementCounts(message);

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
        {attachmentCount > 0 || reactionCount > 0 ? (
          <Text style={styles.dmMessageMeta} numberOfLines={1}>
            {attachmentCount > 0 ? `${attachmentCount} ${copy.attachmentsSuffix}` : ""}
            {attachmentCount > 0 && reactionCount > 0 ? " - " : ""}
            {reactionCount > 0 ? `${reactionCount} ${copy.reactionsSuffix}` : ""}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

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
      <View style={styles.compactList}>
        {conversations.map((conversation) => {
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
        <View style={styles.dmMessageList}>
          {state.payload.messages.map((message) => (
            <MessagePreviewRow
              key={message.id}
              message={message}
              own={message.userId === currentUserId}
            />
          ))}
        </View>
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
  sendState,
}: {
  onSend(content: string): Promise<boolean>;
  sendState: MobileDMSendViewState;
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
        accessibilityLabel={copy.dmComposerPlaceholder}
        maxLength={2000}
        multiline
        onChangeText={setDraft}
        placeholder={copy.dmComposerPlaceholder}
        placeholderTextColor={mobileColors.mutedSoft}
        style={styles.dmComposerInput}
        value={draft}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isSending ? copy.dmSendingAction : copy.dmSendAction}
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
          {isSending ? copy.dmSendingAction : copy.dmSendAction}
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
      <View style={avatarShellStyles}>
        <Image
          source={{ uri: imageUrl }}
          style={avatarStyles}
          accessibilityIgnoresInvertColors
        />
        {status ? <View style={[styles.avatarStatus, status === "active" && styles.avatarStatusActive]} /> : null}
      </View>
    );
  }

  return (
    <View style={avatarShellStyles}>
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

function parseMobileChannelsRoute(
  path: string,
): { channelId: string | null; serverId: string } | null {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  if (segments[0] !== "channels" || !segments[1]) {
    return null;
  }

  return {
    channelId: segments[2] ?? null,
    serverId: segments[1],
  };
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
  dmListCard: {
    gap: 10,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#FAFBFF",
    padding: 12,
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
    height: 38,
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
