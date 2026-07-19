import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../../config/environment";
import { mobileQueryKeys } from "../../query/mobile-query-keys";
import { getMobileWorkspaceQueryOptions } from "../../query/mobile-workspace-query";
import {
  type MobileRealtimeConnectionSnapshot,
  type MobileRealtimeEventEnvelope,
} from "../../realtime/mobile-realtime-contract";
import {
  createMobileRealtimeClient,
  type MobileRealtimeClient,
} from "../../realtime/mobile-realtime-client";
import { createMobileRealtimeQueryBridge } from "../../realtime/realtime-query-bridge";
import {
  createInitialMobileRealtimeSnapshot,
  getMobileRealtimeForegroundBackfillSources,
  getMobileRealtimeVisibilityFromAppState,
  mobileRealtimeReducer,
  shouldConnectMobileRealtime,
} from "../../realtime/mobile-realtime-state";
import {
  createInitialMobileChannelTypingState,
  pruneMobileChannelTypingState,
  replaceMobileChannelTypingUsers,
  type MobileChannelTypingState,
} from "../../realtime/mobile-typing-state";
import { resetMobileSessionState } from "../../state/reset-mobile-session-state";
import { useMobileActiveTargetStore } from "../../state/mobile-active-target-store";
import { useMobileQueryClient } from "./mobile-query-provider";

const MOBILE_CHANNEL_TYPING_STOP_DELAY_MS = 3_000;
const MOBILE_CHANNEL_TYPING_START_THROTTLE_MS = 1_500;

type MobileRealtimeEventListener = (event: MobileRealtimeEventEnvelope) => void;

interface MobileRealtimeRuntime {
  readonly connection: MobileRealtimeConnectionSnapshot;
  readonly dmTyping: MobileChannelTypingState;
  readonly typing: MobileChannelTypingState;
  emitVoiceInviteAccept(input: { channelId: string; inviteId: string; serverId: string }): void;
  emitVoiceInviteDecline(input: { channelId: string; inviteId: string; serverId: string }): void;
  emitVoiceInviteSend(input: { channelId: string; serverId: string; targetUserId: string }): void;
  stopChannelTyping(channelId: string): void;
  stopDMTyping(conversationId: string): void;
  subscribe(listener: MobileRealtimeEventListener): () => void;
  updateChannelTyping(channelId: string, content: string): void;
  updateDMTyping(conversationId: string, content: string): void;
}

const MobileRealtimeRuntimeContext = createContext<MobileRealtimeRuntime | null>(null);

export function MobileRealtimeProvider({ children }: PropsWithChildren) {
  const { apiClient, getAccessToken, session, status } = useMobileAuth();
  const queryClient = useMobileQueryClient();
  const clientRef = useRef<MobileRealtimeClient | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const listenersRef = useRef(new Set<MobileRealtimeEventListener>());
  const typingStopTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingLastStartAtRef = useRef<Record<string, number>>({});
  const typingPruneTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [connection, dispatchConnection] = useReducer(
    mobileRealtimeReducer,
    undefined,
    createInitialMobileRealtimeSnapshot,
  );
  const connectionRef = useRef(connection);
  const [typing, setTyping] = useState<MobileChannelTypingState>(
    createInitialMobileChannelTypingState,
  );
  const [dmTyping, setDMTyping] = useState<MobileChannelTypingState>(
    createInitialMobileChannelTypingState,
  );
  const [bridge] = useState(() =>
    createMobileRealtimeQueryBridge({
      getActiveTargets: () => {
        const { channelId, conversationId, serverId, voiceChannelId } =
          useMobileActiveTargetStore.getState();
        return { channelId, conversationId, serverId, voiceChannelId };
      },
      queryClient,
      refreshWorkspace: (serverId) =>
        queryClient.prefetchQuery(getMobileWorkspaceQueryOptions(apiClient, serverId)),
    }),
  );

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  const scheduleTypingPrune = useCallback((channelId: string) => {
    if (typingPruneTimersRef.current[channelId]) {
      return;
    }

    typingPruneTimersRef.current[channelId] = setTimeout(() => {
      delete typingPruneTimersRef.current[channelId];
      setTyping((current) => pruneMobileChannelTypingState(current));
    }, MOBILE_CHANNEL_TYPING_STOP_DELAY_MS + 750);
  }, []);
  const scheduleDMTypingPrune = useCallback((conversationId: string) => {
    const timerKey = `dm-prune:${conversationId}`;
    if (typingPruneTimersRef.current[timerKey]) {
      return;
    }
    typingPruneTimersRef.current[timerKey] = setTimeout(() => {
      delete typingPruneTimersRef.current[timerKey];
      setDMTyping((current) => pruneMobileChannelTypingState(current));
    }, MOBILE_CHANNEL_TYPING_STOP_DELAY_MS + 750);
  }, []);

  const stopChannelTyping = useCallback((channelId: string) => {
    const normalizedChannelId = channelId.trim();
    if (!normalizedChannelId) {
      return;
    }

    const stopTimer = typingStopTimersRef.current[normalizedChannelId];
    if (stopTimer) {
      clearTimeout(stopTimer);
      delete typingStopTimersRef.current[normalizedChannelId];
    }

    delete typingLastStartAtRef.current[normalizedChannelId];
    clientRef.current?.emitChannelTypingStop(normalizedChannelId);
  }, []);

  const updateChannelTyping = useCallback(
    (channelId: string, content: string) => {
      const normalizedChannelId = channelId.trim();
      if (status !== "signed-in" || !normalizedChannelId) {
        return;
      }

      if (!content.trim()) {
        stopChannelTyping(normalizedChannelId);
        return;
      }

      const now = Date.now();
      const lastStartedAt = typingLastStartAtRef.current[normalizedChannelId] ?? 0;
      if (now - lastStartedAt >= MOBILE_CHANNEL_TYPING_START_THROTTLE_MS) {
        clientRef.current?.emitChannelTypingStart(normalizedChannelId);
        typingLastStartAtRef.current[normalizedChannelId] = now;
      }

      const stopTimer = typingStopTimersRef.current[normalizedChannelId];
      if (stopTimer) {
        clearTimeout(stopTimer);
      }
      typingStopTimersRef.current[normalizedChannelId] = setTimeout(() => {
        stopChannelTyping(normalizedChannelId);
      }, MOBILE_CHANNEL_TYPING_STOP_DELAY_MS);
    },
    [status, stopChannelTyping],
  );

  const stopDMTyping = useCallback((conversationId: string) => {
    const normalizedConversationId = conversationId.trim();
    const timerKey = `dm:${normalizedConversationId}`;
    if (!normalizedConversationId) {
      return;
    }
    const stopTimer = typingStopTimersRef.current[timerKey];
    if (stopTimer) {
      clearTimeout(stopTimer);
      delete typingStopTimersRef.current[timerKey];
    }
    delete typingLastStartAtRef.current[timerKey];
    clientRef.current?.emitDMTypingStop(normalizedConversationId);
  }, []);

  const updateDMTyping = useCallback(
    (conversationId: string, content: string) => {
      const normalizedConversationId = conversationId.trim();
      const timerKey = `dm:${normalizedConversationId}`;
      if (status !== "signed-in" || !normalizedConversationId) {
        return;
      }
      if (!content.trim()) {
        stopDMTyping(normalizedConversationId);
        return;
      }
      const now = Date.now();
      const lastStartedAt = typingLastStartAtRef.current[timerKey] ?? 0;
      if (now - lastStartedAt >= MOBILE_CHANNEL_TYPING_START_THROTTLE_MS) {
        clientRef.current?.emitDMTypingStart(normalizedConversationId);
        typingLastStartAtRef.current[timerKey] = now;
      }
      const stopTimer = typingStopTimersRef.current[timerKey];
      if (stopTimer) {
        clearTimeout(stopTimer);
      }
      typingStopTimersRef.current[timerKey] = setTimeout(
        () => stopDMTyping(normalizedConversationId),
        MOBILE_CHANNEL_TYPING_STOP_DELAY_MS,
      );
    },
    [status, stopDMTyping],
  );

  const handleEvent = useCallback(
    (event: MobileRealtimeEventEnvelope) => {
      dispatchConnection({ event, type: "event-received" });
      bridge.handleEvent(event);

      if (event.eventName === "typing:update") {
        const payload = getMobileChannelTypingUpdatePayload(event.payload);
        if (payload) {
          const currentUserNames = [
            session?.user.displayName ?? "",
            session?.user.username ?? "",
          ].filter((name) => name.trim().length > 0);
          setTyping((current) =>
            replaceMobileChannelTypingUsers(current, {
              channelId: payload.channelId,
              currentUserNames,
              now: event.receivedAt,
              usernames: payload.users,
            }),
          );
          scheduleTypingPrune(payload.channelId);
        }
      }
      if (event.eventName === "dm:typing:update") {
        const payload = getMobileDMTypingUpdatePayload(event.payload);
        if (payload) {
          setDMTyping((current) =>
            replaceMobileChannelTypingUsers(current, {
              channelId: payload.conversationId,
              currentUserNames: [session?.user.displayName ?? "", session?.user.username ?? ""],
              now: event.receivedAt,
              usernames: payload.users,
            }),
          );
          scheduleDMTypingPrune(payload.conversationId);
        }
      }

      for (const listener of listenersRef.current) {
        listener(event);
      }
    },
    [
      bridge,
      scheduleDMTypingPrune,
      scheduleTypingPrune,
      session?.user.displayName,
      session?.user.username,
    ],
  );

  useEffect(() => {
    const visibility = getMobileRealtimeVisibilityFromAppState(appStateRef.current);
    if (
      !shouldConnectMobileRealtime({
        authStatus: status,
        hasSession: Boolean(session),
        visibility: connection.visibility,
      })
    ) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      bridge.cancelPending();
      if (status !== "signed-in") {
        if (connection.status !== "idle") {
          dispatchConnection({ type: "reset" });
        }
        return;
      }
      if (visibility === "background" && connection.status !== "background") {
        dispatchConnection({ type: "disconnected" });
      }
      return;
    }

    const client = createMobileRealtimeClient({
      getAccessToken,
      onConnected: () => dispatchConnection({ type: "connected" }),
      onDisconnected: () => dispatchConnection({ type: "disconnected" }),
      onError: (code) => dispatchConnection({ code, type: "connection-error" }),
      onEvent: handleEvent,
      onReconnectAttempt: () => dispatchConnection({ type: "reconnect-attempt" }),
      socketUrl: getMobileRuntimeConfig().socketUrl,
    });
    clientRef.current = client;
    dispatchConnection({ type: "connect-started" });
    void client.connect();

    return () => {
      client.disconnect();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
    // `connection.status` and full `session` are read but intentionally NOT deps:
    // this effect owns the connect/disconnect lifecycle, so re-running it when the
    // connection status changes would reconnect on every status transition (loop),
    // and keying on `session?.user.id` (not the whole session) avoids reconnecting
    // on token refreshes that keep the same user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, connection.visibility, getAccessToken, handleEvent, session?.user.id, status]);

  const channelId = useMobileActiveTargetStore((state) => state.channelId);
  const conversationId = useMobileActiveTargetStore((state) => state.conversationId);
  const serverId = useMobileActiveTargetStore((state) => state.serverId);
  const voiceChannelId = useMobileActiveTargetStore((state) => state.voiceChannelId);

  useEffect(() => {
    clientRef.current?.setActiveTargets({ channelId, conversationId, serverId, voiceChannelId });
  }, [channelId, conversationId, serverId, voiceChannelId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousVisibility = getMobileRealtimeVisibilityFromAppState(appStateRef.current);
      const nextVisibility = getMobileRealtimeVisibilityFromAppState(nextState);
      appStateRef.current = nextState;
      dispatchConnection({ type: "visibility-changed", visibility: nextVisibility });

      const targets = useMobileActiveTargetStore.getState();
      bridge.backfill(
        getMobileRealtimeForegroundBackfillSources({
          authStatus: status,
          nextVisibility,
          previousVisibility,
          realtime: connectionRef.current,
          targets,
        }),
      );
    });
    return () => subscription.remove();
  }, [bridge, status]);

  useEffect(() => {
    if (status === "signed-in") {
      return;
    }
    bridge.cancelPending();
    queryClient.removeQueries({ queryKey: mobileQueryKeys.all });
    resetMobileSessionState();
    setTyping(createInitialMobileChannelTypingState());
    setDMTyping(createInitialMobileChannelTypingState());
  }, [bridge, queryClient, status]);

  useEffect(
    () => () => {
      bridge.dispose();
      clientRef.current?.disconnect();
      for (const timer of Object.values(typingStopTimersRef.current)) {
        clearTimeout(timer);
      }
      for (const timer of Object.values(typingPruneTimersRef.current)) {
        clearTimeout(timer);
      }
      typingStopTimersRef.current = {};
      typingLastStartAtRef.current = {};
      typingPruneTimersRef.current = {};
    },
    [bridge],
  );

  const subscribe = useCallback((listener: MobileRealtimeEventListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<MobileRealtimeRuntime>(
    () => ({
      connection,
      dmTyping,
      emitVoiceInviteAccept: (input) => clientRef.current?.emitVoiceInviteAccept(input),
      emitVoiceInviteDecline: (input) => clientRef.current?.emitVoiceInviteDecline(input),
      emitVoiceInviteSend: (input) => clientRef.current?.emitVoiceInviteSend(input),
      stopChannelTyping,
      stopDMTyping,
      subscribe,
      typing,
      updateChannelTyping,
      updateDMTyping,
    }),
    [
      connection,
      dmTyping,
      stopChannelTyping,
      stopDMTyping,
      subscribe,
      typing,
      updateChannelTyping,
      updateDMTyping,
    ],
  );

  return (
    <MobileRealtimeRuntimeContext.Provider value={value}>
      {children}
    </MobileRealtimeRuntimeContext.Provider>
  );
}

export function useMobileRealtimeRuntime(): MobileRealtimeRuntime {
  const runtime = useContext(MobileRealtimeRuntimeContext);
  if (!runtime) {
    throw new Error("Mobile realtime provider is missing.");
  }
  return runtime;
}

function getMobileChannelTypingUpdatePayload(payload: unknown): {
  channelId: string;
  users: string[];
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.channelId !== "string" || !Array.isArray(record.users)) {
    return null;
  }

  return {
    channelId: record.channelId,
    users: record.users.filter((user): user is string => typeof user === "string"),
  };
}

function getMobileDMTypingUpdatePayload(payload: unknown): {
  conversationId: string;
  users: string[];
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.conversationId !== "string" || !Array.isArray(record.typingUsers)) {
    return null;
  }
  return {
    conversationId: record.conversationId,
    users: record.typingUsers.flatMap((user) => {
      if (!user || typeof user !== "object" || Array.isArray(user)) {
        return [];
      }
      const username = (user as Record<string, unknown>).username;
      return typeof username === "string" ? [username] : [];
    }),
  };
}
