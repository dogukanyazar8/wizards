import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { MobileWorkspaceChannelSummary } from "@wizards/types";
import {
  AppState,
  type AppStateStatus,
} from "react-native";
import { useMobileAuth } from "../auth/mobile-auth-context";
import {
  fetchMobileBootstrap,
  summarizeMobileBootstrap,
} from "../bootstrap/mobile-bootstrap";
import { getMobileRuntimeConfig } from "../config/environment";
import {
  type MobileDeepLinkParseResult,
} from "../deep-link/mobile-deep-links";
import { useMobileDeepLinks } from "../deep-link/use-mobile-deep-links";
import {
  fetchMobileDMMessages,
  MOBILE_DM_MESSAGES_LIMIT,
  sendMobileDMMessage,
} from "../dm/mobile-dm-client";
import { mobileCopy } from "../locale/mobile-copy";
import {
  createMobileNavigationState,
  getMobileTabForRoutePath,
  mobileNavigationReducer,
  parseMobileChannelsRoutePath,
  resolveMobileRoute,
  type MobileTabId,
} from "../navigation/mobile-navigation";
import {
  createInitialMobilePermissionReadiness,
  summarizeMobilePermissionReadiness,
} from "../permissions/mobile-permission-contract";
import {
  isMobileSyncRefreshing,
  markMobileSyncFailed,
  markMobileSyncStarted,
  markMobileSyncSucceeded,
  shouldRefreshOnForeground,
  type MobileSyncSnapshot,
} from "../sync/mobile-sync-contract";
import {
  fetchMobileChannelMessages,
  fetchMobileWorkspaceServer,
  MOBILE_CHANNEL_MESSAGES_LIMIT,
  sendMobileChannelMessage,
} from "../workspace/mobile-workspace-client";
import {
  findInitialMobileWorkspaceChannel,
} from "./mobile-display-model";
import { MobileAppShell } from "./mobile-app-shell";
import {
  INITIAL_BOOTSTRAP_STATE,
  INITIAL_BOOTSTRAP_SYNC_STATE,
  INITIAL_CHANNEL_MESSAGES_STATE,
  INITIAL_CHANNEL_SEND_STATE,
  INITIAL_CHANNEL_SYNC_STATE,
  INITIAL_DM_MESSAGES_STATE,
  INITIAL_DM_SEND_STATE,
  INITIAL_DM_SYNC_STATE,
  INITIAL_WORKSPACE_SERVER_STATE,
  INITIAL_WORKSPACE_SYNC_STATE,
  type MobileBootstrapViewState,
  type MobileChannelMessagesViewState,
  type MobileChannelSendViewState,
  type MobileDMMessagesViewState,
  type MobileDMSendViewState,
  type MobileWorkspaceServerViewState,
} from "./mobile-screen-state";
import { ActiveScreen, AuthGate } from "./mobile-root-screens";

const copy = mobileCopy.tr;
const runtimeConfig = getMobileRuntimeConfig();

export function WhisprMobileRoot() {
  const {
    apiClient,
    completeAuthHandoff,
    diagnostics,
    error,
    openWebRegister,
    openWebSignIn,
    registerWithPassword,
    requestPasswordReset,
    requestVerificationEmail,
    refreshSessionFromStorage,
    session,
    signInWithPassword,
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
  const [channelSendState, setChannelSendState] =
    useState<MobileChannelSendViewState>(INITIAL_CHANNEL_SEND_STATE);
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
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
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

  const handleSendChannelMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const channelId = selectedWorkspaceChannelId;
      const trimmedContent = content.trim();

      if (status !== "signed-in" || !channelId || trimmedContent.length === 0) {
        return false;
      }

      setChannelSendState({
        channelId,
        error: null,
        status: "sending",
      });

      try {
        const response = await sendMobileChannelMessage(apiClient, {
          channelId,
          content: trimmedContent,
        });

        setChannelMessagesState((current) => {
          if (current.channelId !== channelId || !current.payload) {
            return current;
          }

          const hasMessage = current.payload.messages.some(
            (message) => message.id === response.message.id,
          );
          const messages = hasMessage
            ? current.payload.messages
            : [...current.payload.messages, response.message].slice(
                -MOBILE_CHANNEL_MESSAGES_LIMIT,
              );

          return {
            channelId,
            error: null,
            payload: {
              ...current.payload,
              messages,
            },
            status: "ready",
          };
        });

        setChannelSendState({
          channelId,
          error: null,
          status: "idle",
        });
        setChannelSyncState(markMobileSyncSucceeded);
        void loadBootstrap();
        return true;
      } catch {
        setChannelSendState({
          channelId,
          error: copy.channelSendFailed,
          status: "error",
        });
        return false;
      }
    },
    [apiClient, loadBootstrap, selectedWorkspaceChannelId, status],
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
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
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
          setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
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
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
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

  const handleCloseDMConversation = useCallback(() => {
    dmMessagesRequestIdRef.current += 1;
    setSelectedDMConversationId(null);
    setDMMessagesState(INITIAL_DM_MESSAGES_STATE);
    setDMSendState(INITIAL_DM_SEND_STATE);
    setDMSyncState(INITIAL_DM_SYNC_STATE);
  }, []);

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
        setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
        setChannelSyncState(INITIAL_CHANNEL_SYNC_STATE);
        return;
      }

      setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
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
      setChannelSendState(INITIAL_CHANNEL_SEND_STATE);
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

          const target = parseMobileChannelsRoutePath(callbackPath);
          dispatchNavigation({
            tab: getMobileTabForRoutePath(callbackPath),
            type: "select",
          });

          if (target?.serverId && target.serverId !== "@me") {
            void loadWorkspaceServer(target.serverId, target.channelId);
          }
        });
        return;
      }

      if (result.intent.type === "invite") {
        dispatchNavigation({ tab: "overview", type: "select" });
        return;
      }

      if (result.intent.path.startsWith("/channels")) {
        const target = parseMobileChannelsRoutePath(result.intent.path);
        if (target?.serverId && target.serverId !== "@me") {
          dispatchNavigation({ tab: "overview", type: "select" });
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

  const mobileShellUnreadCount =
    bootstrapState.status === "ready"
      ? bootstrapState.payload.home.directMessages.unreadCount
      : 0;

  const isShellRefreshing =
    status === "checking" ||
    isMobileSyncRefreshing(bootstrapSyncState) ||
    (navigation.currentTab === "messages" && isMobileSyncRefreshing(dmSyncState)) ||
    (navigation.currentTab === "overview" &&
      (isMobileSyncRefreshing(workspaceSyncState) ||
        isMobileSyncRefreshing(channelSyncState))) ||
    (navigation.currentTab === "voice" && isMobileSyncRefreshing(workspaceSyncState));

  const handleShellRefresh = useCallback(() => {
    if (route.isBlocked) {
      void refreshSessionFromStorage();
      return;
    }

    refreshVisibleMobileData();
  }, [refreshSessionFromStorage, refreshVisibleMobileData, route.isBlocked]);

  return (
    <MobileAppShell
      authStatus={status}
      currentTab={navigation.currentTab}
      directMessageUnreadCount={mobileShellUnreadCount}
      isRefreshing={isShellRefreshing}
      onRefresh={handleShellRefresh}
      onSelectTab={(tab) => dispatchNavigation({ tab, type: "select" })}
      signedInUserLabel={signedInUserLabel}
    >
      {route.isBlocked ? (
        <AuthGate
          reason={route.blockedReason}
          onOpenWebRegister={() => void openWebRegister()}
          onOpenWebSignIn={() => void openWebSignIn()}
          onRegisterWithPassword={registerWithPassword}
          onRefresh={() => void refreshSessionFromStorage()}
          onRequestPasswordReset={requestPasswordReset}
          onRequestVerificationEmail={requestVerificationEmail}
          onSignInWithPassword={signInWithPassword}
        />
      ) : (
        <ActiveScreen
          currentTab={route.currentTab}
          bootstrapState={bootstrapState}
          bootstrapSyncState={bootstrapSyncState}
          channelSyncState={channelSyncState}
          dmMessagesState={dmMessagesState}
          dmSendState={dmSendState}
          dmSyncState={dmSyncState}
          diagnostics={diagnostics}
          lastDeepLink={lastDeepLink}
          permissionReadiness={permissionReadiness}
          permissionSummary={permissionSummary}
          error={error}
          authStatusLabel={authStatusLabel}
          channelMessagesState={channelMessagesState}
          channelSendState={channelSendState}
          onOpenWebRegister={() => void openWebRegister()}
          signedInUserLabel={signedInUserLabel}
          onOpenWebSignIn={() => void openWebSignIn()}
          onCloseDMConversation={handleCloseDMConversation}
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
          onRefreshVisibleData={refreshVisibleMobileData}
          onSelectTab={(tab) => dispatchNavigation({ tab, type: "select" })}
          onSendChannelMessage={handleSendChannelMessage}
          onSendDMMessage={handleSendDMMessage}
          onSignOut={() => void signOut()}
          selectedDMConversation={selectedDMConversation}
          selectedDMConversationId={selectedDMConversationId}
          selectedWorkspaceChannelId={selectedWorkspaceChannelId}
          selectedWorkspaceServerId={selectedWorkspaceServerId}
          status={status}
          workspaceServerState={workspaceServerState}
          workspaceSyncState={workspaceSyncState}
        />
      )}
    </MobileAppShell>
  );
}
