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
  shouldForceMobileRealtimeReconnect,
} from "../../realtime/mobile-realtime-state";
import {
  pruneMobileChannelTypingState,
  replaceMobileChannelTypingUsers,
} from "../../realtime/mobile-typing-state";
import { purgeMobileQueryCache } from "../../query/mobile-query-persistence";
import { mobileMessageStore } from "../../storage/mobile-message-store-database";
import { addMobileSecurityBreadcrumb } from "../../observability/mobile-sentry";
import {
  planMobileSessionWipe,
  runMobileSessionWipe,
  type MobileSessionAuthSnapshot,
} from "../../state/mobile-session-wipe";
import { resetMobileSessionState } from "../../state/reset-mobile-session-state";
import { mobileTypingStoreWriters } from "../../state/mobile-typing-store";
import { useMobileActiveTargetStore } from "../../state/mobile-active-target-store";
import { MobileConnectivityBanner } from "../components/mobile-connectivity-banner";
import { getMobileConnectivityHealth } from "../mobile-connectivity-presentation";
import {
  MobileConnectivityPhaseProvider,
  useMobileConnectivityPhaseState,
} from "./mobile-connectivity-context";
import { useMobileNetworkRefresh, useMobileNetworkStatus } from "./mobile-network-provider";
import { useMobileQueryClient } from "./mobile-query-provider";

const MOBILE_CHANNEL_TYPING_STOP_DELAY_MS = 3_000;
const MOBILE_CHANNEL_TYPING_START_THROTTLE_MS = 1_500;
/** Collapses a burst of incoming DMs into one "iletildi" acknowledgement. */
export const MOBILE_DM_DELIVERY_ACK_DELAY_MS = 300;

type MobileRealtimeEventListener = (event: MobileRealtimeEventEnvelope) => void;

/**
 * Typing is deliberately absent: it is published to `useMobileTypingStore` so the
 * surfaces that draw it subscribe directly. Every consumer of this context is a
 * consumer of *connection* state, which moves rarely.
 */
interface MobileRealtimeRuntime {
  readonly connection: MobileRealtimeConnectionSnapshot;
  emitDMCallAccept(input: { conversationId: string; fromUserId: string; video: boolean }): void;
  emitDMCallCancel(input: { conversationId: string }): void;
  emitDMCallDecline(input: { conversationId: string; fromUserId: string }): void;
  emitDMCallEnd(input: { conversationId: string }): void;
  emitDMCallStart(input: { conversationId: string; video: boolean }): void;
  emitVoiceInviteAccept(input: { channelId: string; inviteId: string; serverId: string }): void;
  emitVoiceInviteDecline(input: { channelId: string; inviteId: string; serverId: string }): void;
  emitVoiceInviteSend(input: { channelId: string; serverId: string; targetUserId: string }): void;
  reconnect(): void;
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
  const networkStatus = useMobileNetworkStatus();
  const refreshNetworkStatus = useMobileNetworkRefresh();
  /** Bumped by the banner's manual retry; the connect effect below keys on it. */
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const clientRef = useRef<MobileRealtimeClient | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const listenersRef = useRef(new Set<MobileRealtimeEventListener>());
  const typingStopTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingLastStartAtRef = useRef<Record<string, number>>({});
  const typingPruneTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const deliveryAckTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [connection, dispatchConnection] = useReducer(
    mobileRealtimeReducer,
    undefined,
    createInitialMobileRealtimeSnapshot,
  );
  const connectionRef = useRef(connection);
  // Typing lives in its own store: it arrives for every channel and conversation
  // the viewer is in, and publishing it through this context made the product
  // root — and with it the navigator and every screen-props object — re-render
  // for a stranger typing somewhere nobody is looking.
  const setTyping = mobileTypingStoreWriters.patchChannels;
  const setDMTyping = mobileTypingStoreWriters.patchDMs;
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

  /**
   * §2 "1a".6.4: this device is the only honest source for "iletildi", so an
   * incoming DM is acknowledged back to the server.
   *
   * Trailing debounce, not one ack per message: the server marks a timestamp,
   * so a burst of five messages needs exactly one ack — and it has to be the one
   * *after* the last of them, or the mark lands behind `lastMessageAt`.
   */
  const scheduleDeliveryAck = useCallback((conversationId: string) => {
    const existing = deliveryAckTimersRef.current[conversationId];
    if (existing) {
      clearTimeout(existing);
    }
    deliveryAckTimersRef.current[conversationId] = setTimeout(() => {
      delete deliveryAckTimersRef.current[conversationId];
      clientRef.current?.emitDMMessageDelivered(conversationId);
    }, MOBILE_DM_DELIVERY_ACK_DELAY_MS);
  }, []);

  const handleEvent = useCallback(
    (event: MobileRealtimeEventEnvelope) => {
      dispatchConnection({ event, type: "event-received" });
      bridge.handleEvent(event);

      if (event.eventName === "dm:message:new") {
        const incoming = getMobileDMIncomingMessagePayload(event.payload);
        if (incoming && incoming.authorId !== session?.user.id) {
          scheduleDeliveryAck(incoming.conversationId);
        }
      }

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
      scheduleDeliveryAck,
      scheduleDMTypingPrune,
      scheduleTypingPrune,
      session?.user.displayName,
      session?.user.id,
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
  }, [
    bridge,
    connection.visibility,
    getAccessToken,
    handleEvent,
    reconnectNonce,
    session?.user.id,
    status,
  ]);

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

  // A wipe is driven by the transition out of a signed-in session, never by the
  // current status: `checking` is the first status of every cold start, and
  // wiping there threw away the persisted cache on every launch — the exact data
  // that was persisted to make the launch fast.
  const authSnapshotRef = useRef<MobileSessionAuthSnapshot | null>(null);
  const wipeRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    const next: MobileSessionAuthSnapshot = { status, userId: session?.user.id ?? null };
    const plan = planMobileSessionWipe(next, authSnapshotRef.current);
    authSnapshotRef.current = next;

    if (status === "signed-in") {
      mobileMessageStore.resume();
    }

    if (!plan) {
      return;
    }

    const previousWipe = wipeRef.current ?? Promise.resolve();
    wipeRef.current = previousWipe.then(() =>
      runMobileSessionWipe(plan, {
        cancelRealtimeWork: async () => {
          bridge.cancelPending();
        },
        closeMessageStore: () => mobileMessageStore.close(),
        dropMemoryCaches: () => {
          queryClient.removeQueries({ queryKey: mobileQueryKeys.all });
          resetMobileSessionState();
        },
        purgeMessageStore: (previousUserId) => mobileMessageStore.purgeUser(previousUserId),
        // Clearing the in-memory cache only schedules a throttled empty write, so
        // drop the persisted file outright — a signed-out device must not keep the
        // previous account's servers and conversations readable on disk.
        purgeQueryCache: () => purgeMobileQueryCache(getMobileRuntimeConfig().environment),
        report: (result) => {
          if (result.status === "partial") {
            addMobileSecurityBreadcrumb(`session-wipe-incomplete:${result.failedSteps.join(",")}`);
          }
        },
      }),
    );
  }, [bridge, queryClient, session?.user.id, status]);

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
      for (const timer of Object.values(deliveryAckTimersRef.current)) {
        clearTimeout(timer);
      }
      typingStopTimersRef.current = {};
      typingLastStartAtRef.current = {};
      typingPruneTimersRef.current = {};
      deliveryAckTimersRef.current = {};
    },
    [bridge],
  );

  const subscribe = useCallback((listener: MobileRealtimeEventListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Tearing the socket down and standing a fresh one up is the only reconnect
  // socket.io offers once its own retry budget is spent, and the connect effect
  // already owns that lifecycle — so the retry re-runs the effect.
  const reconnect = useCallback(() => {
    setReconnectNonce((current) => current + 1);
  }, []);

  // The OS says the network works again, but socket.io stopped retrying — the
  // one case its own backoff can never recover from. `connectionRef` is read
  // instead of `connection` so a status transition alone cannot re-trigger this.
  useEffect(() => {
    if (shouldForceMobileRealtimeReconnect({ networkStatus, realtime: connectionRef.current })) {
      reconnect();
    }
  }, [networkStatus, reconnect]);

  const connectivityHealth = getMobileConnectivityHealth({
    authStatus: status,
    networkStatus,
    realtime: connection,
  });
  const connectivityPhase = useMobileConnectivityPhaseState(connectivityHealth);

  /**
   * The bar's retry asks the OS first, then the socket.
   *
   * Offline is usually a state the user has just left — Wi-Fi back on, airplane
   * mode off — and NetInfo can take seconds to notice on its own. Rebuilding the
   * socket against a network the app still believes is dead only burns the retry
   * budget, so the OS answer has to land before the reconnect.
   */
  const retryConnectivity = useCallback(async () => {
    await refreshNetworkStatus();
    reconnect();
  }, [reconnect, refreshNetworkStatus]);

  const value = useMemo<MobileRealtimeRuntime>(
    () => ({
      connection,
      emitDMCallAccept: (input) => clientRef.current?.emitDMCallAccept(input),
      emitDMCallCancel: (input) => clientRef.current?.emitDMCallCancel(input),
      emitDMCallDecline: (input) => clientRef.current?.emitDMCallDecline(input),
      emitDMCallEnd: (input) => clientRef.current?.emitDMCallEnd(input),
      emitDMCallStart: (input) => clientRef.current?.emitDMCallStart(input),
      emitVoiceInviteAccept: (input) => clientRef.current?.emitVoiceInviteAccept(input),
      emitVoiceInviteDecline: (input) => clientRef.current?.emitVoiceInviteDecline(input),
      emitVoiceInviteSend: (input) => clientRef.current?.emitVoiceInviteSend(input),
      reconnect,
      stopChannelTyping,
      stopDMTyping,
      subscribe,
      updateChannelTyping,
      updateDMTyping,
    }),
    [
      connection,
      reconnect,
      stopChannelTyping,
      stopDMTyping,
      subscribe,
      updateChannelTyping,
      updateDMTyping,
    ],
  );

  return (
    <MobileRealtimeRuntimeContext.Provider value={value}>
      {/* The phase is published rather than kept inside the bar: the screens
          below have their own failure surfaces and must stand down while the bar
          is already telling this story. */}
      <MobileConnectivityPhaseProvider phase={connectivityPhase}>
        <MobileConnectivityBanner onRetry={retryConnectivity} phase={connectivityPhase} />
        {children}
      </MobileConnectivityPhaseProvider>
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

/**
 * Just enough of a `dm:message:new` payload to decide whether this device owes
 * the sender a delivery acknowledgement: which conversation, and who wrote it.
 */
export function getMobileDMIncomingMessagePayload(payload: unknown): {
  authorId: string | null;
  conversationId: string;
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.conversationId !== "string" || record.conversationId.trim().length === 0) {
    return null;
  }

  const author = record.author;
  const authorId =
    author && typeof author === "object" && !Array.isArray(author)
      ? (author as Record<string, unknown>).id
      : record.userId;

  return {
    authorId: typeof authorId === "string" ? authorId : null,
    conversationId: record.conversationId,
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
