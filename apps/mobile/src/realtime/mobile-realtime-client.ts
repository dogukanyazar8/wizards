import { io, type Socket } from "socket.io-client";
import { MOBILE_CLIENT_HEADERS } from "../api/mobile-client-headers";
import {
  createMobileRealtimeEventEnvelope,
  MOBILE_REALTIME_RECONNECT_POLICY,
  MOBILE_REALTIME_SERVER_EVENTS,
  type MobileRealtimeEventEnvelope,
  type MobileRealtimeServerEventName,
} from "./mobile-realtime-contract";

export type MobileRealtimeClientTargets = {
  channelId: string | null;
  conversationId: string | null;
  serverId: string | null;
  voiceChannelId: string | null;
};

export type MobileRealtimeClient = {
  connect(): Promise<void>;
  disconnect(): void;
  emitChannelTypingStart(channelId: string): void;
  emitChannelTypingStop(channelId: string): void;
  emitDMCallAccept(input: { conversationId: string; fromUserId: string; video: boolean }): void;
  emitDMCallCancel(input: { conversationId: string }): void;
  emitDMCallDecline(input: { conversationId: string; fromUserId: string }): void;
  emitDMCallEnd(input: { conversationId: string }): void;
  /**
   * Faz 5 §B5. Entering a call that is already running: no ring, because the
   * people inside are already talking and 2d's banner is pressed by somebody who
   * can see that.
   */
  emitDMCallJoin(input: { conversationId: string; video?: boolean }): void;
  emitDMCallStart(input: { conversationId: string; video: boolean }): void;
  /** §2 "1a".6.4: acknowledges that this device now holds the newest message. */
  emitDMMessageDelivered(conversationId: string): void;
  emitDMTypingStart(conversationId: string): void;
  emitDMTypingStop(conversationId: string): void;
  emitVoiceInviteAccept(input: { channelId: string; inviteId: string; serverId: string }): void;
  emitVoiceInviteDecline(input: { channelId: string; inviteId: string; serverId: string }): void;
  emitVoiceInviteSend(input: { channelId: string; serverId: string; targetUserId: string }): void;
  setActiveTargets(targets: MobileRealtimeClientTargets): void;
};

export type MobileRealtimeClientOptions = {
  getAccessToken: () => Promise<string | null>;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (code: string) => void;
  onEvent: (event: MobileRealtimeEventEnvelope) => void;
  onReconnectAttempt?: () => void;
  socketUrl: string;
};

type MutableSocketAuth = {
  auth?: { token?: string };
};

async function resolveSocketAuthToken(
  getAccessToken: MobileRealtimeClientOptions["getAccessToken"],
) {
  const token = await getAccessToken();
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function getMobileVoiceStatesWatchPayload(serverId: string) {
  return { serverId };
}

export function createMobileRealtimeClient(
  options: MobileRealtimeClientOptions,
): MobileRealtimeClient {
  let socket: (Socket & MutableSocketAuth) | null = null;
  let activeChannelId: string | null = null;
  let activeConversationId: string | null = null;
  let activeServerId: string | null = null;
  let activeVoiceChannelId: string | null = null;
  let disposed = false;

  const emitActiveTargetJoins = () => {
    if (!socket?.connected) {
      return;
    }

    if (activeChannelId) {
      socket.emit("channel:join", activeChannelId);
    }

    if (activeConversationId) {
      socket.emit("dm:join", activeConversationId);
    }

    if (activeServerId) {
      socket.emit("voice:states:watch", getMobileVoiceStatesWatchPayload(activeServerId));
    }

    if (activeVoiceChannelId && activeServerId) {
      socket.emit("voice:join", {
        channelId: activeVoiceChannelId,
        serverId: activeServerId,
      });
    }
  };

  const bindSocketEvents = (boundSocket: Socket) => {
    boundSocket.on("connect", () => {
      options.onConnected?.();
      emitActiveTargetJoins();
    });

    boundSocket.on("disconnect", () => {
      options.onDisconnected?.();
    });

    boundSocket.on("connect_error", (error) => {
      options.onError?.(error instanceof Error ? error.message : "connect_error");
    });

    boundSocket.io.on("reconnect_attempt", () => {
      options.onReconnectAttempt?.();
      void resolveSocketAuthToken(options.getAccessToken).then((token) => {
        if (!socket || !token) {
          return;
        }

        socket.auth = { token };
      });
    });

    for (const eventName of MOBILE_REALTIME_SERVER_EVENTS) {
      boundSocket.on(eventName, (payload: unknown) => {
        options.onEvent(
          createMobileRealtimeEventEnvelope(eventName as MobileRealtimeServerEventName, payload),
        );
      });
    }
  };

  const ensureSocket = () => {
    if (socket) {
      return socket;
    }

    socket = io(options.socketUrl, {
      autoConnect: false,
      // `startAppSession` runs off the socket handshake, so REST headers alone
      // would leave every session unattributed.
      extraHeaders: { ...MOBILE_CLIENT_HEADERS },
      reconnection: true,
      reconnectionAttempts: MOBILE_REALTIME_RECONNECT_POLICY.maxAttempts,
      reconnectionDelay: MOBILE_REALTIME_RECONNECT_POLICY.initialDelayMs,
      reconnectionDelayMax: MOBILE_REALTIME_RECONNECT_POLICY.maxDelayMs,
      timeout: MOBILE_REALTIME_RECONNECT_POLICY.timeoutMs,
      transports: ["websocket"],
    }) as Socket & MutableSocketAuth;
    bindSocketEvents(socket);
    return socket;
  };

  return {
    async connect() {
      if (disposed) {
        return;
      }

      const nextSocket = ensureSocket();
      if (nextSocket.connected) {
        emitActiveTargetJoins();
        return;
      }

      const token = await resolveSocketAuthToken(options.getAccessToken);
      if (!token) {
        options.onError?.("missing_token");
        return;
      }

      nextSocket.auth = { token };
      nextSocket.connect();
    },

    disconnect() {
      disposed = true;

      if (!socket) {
        return;
      }

      if (socket.connected) {
        if (activeChannelId) {
          socket.emit("channel:leave", activeChannelId);
        }

        if (activeConversationId) {
          socket.emit("dm:leave", activeConversationId);
        }

        if (activeVoiceChannelId && activeServerId) {
          socket.emit("voice:leave", {
            channelId: activeVoiceChannelId,
            serverId: activeServerId,
          });
        }

        if (activeServerId) {
          socket.emit("voice:states:unwatch", getMobileVoiceStatesWatchPayload(activeServerId));
        }
      }

      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    },

    emitChannelTypingStart(channelId) {
      if (!socket?.connected || channelId.trim().length === 0) {
        return;
      }

      socket.emit("typing:start", channelId);
    },

    emitChannelTypingStop(channelId) {
      if (!socket?.connected || channelId.trim().length === 0) {
        return;
      }

      socket.emit("typing:stop", channelId);
    },

    emitDMCallJoin(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("dm:call:join", input);
    },

    emitDMCallStart(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("dm:call:start", input);
    },

    emitDMCallAccept(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("dm:call:accept", input);
    },

    emitDMCallDecline(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("dm:call:decline", input);
    },

    emitDMCallCancel(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("dm:call:cancel", input);
    },

    emitDMCallEnd(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("dm:call:end", input);
    },

    emitDMMessageDelivered(conversationId) {
      if (!socket?.connected || conversationId.trim().length === 0) {
        return;
      }
      socket.emit("dm:message:delivered", { conversationId });
    },

    emitDMTypingStart(conversationId) {
      if (!socket?.connected || conversationId.trim().length === 0) {
        return;
      }
      socket.emit("dm:typing:start", { conversationId });
    },

    emitDMTypingStop(conversationId) {
      if (!socket?.connected || conversationId.trim().length === 0) {
        return;
      }
      socket.emit("dm:typing:stop", { conversationId });
    },

    emitVoiceInviteAccept(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("voice:invite:accept", input);
    },

    emitVoiceInviteDecline(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("voice:invite:decline", input);
    },

    emitVoiceInviteSend(input) {
      if (!socket?.connected) {
        return;
      }

      socket.emit("voice:invite:send", input);
    },

    setActiveTargets(targets) {
      const previousChannelId = activeChannelId;
      const previousConversationId = activeConversationId;
      const previousServerId = activeServerId;
      const previousVoiceChannelId = activeVoiceChannelId;
      activeChannelId = targets.channelId;
      activeConversationId = targets.conversationId;
      activeServerId = targets.serverId;
      activeVoiceChannelId = targets.voiceChannelId;

      if (!socket?.connected) {
        return;
      }

      if (previousChannelId && previousChannelId !== activeChannelId) {
        socket.emit("channel:leave", previousChannelId);
      }

      if (previousConversationId && previousConversationId !== activeConversationId) {
        socket.emit("dm:leave", previousConversationId);
      }

      if (
        previousVoiceChannelId &&
        previousVoiceChannelId !== activeVoiceChannelId &&
        previousServerId
      ) {
        socket.emit("voice:leave", {
          channelId: previousVoiceChannelId,
          serverId: previousServerId,
        });
      }

      if (previousServerId && previousServerId !== activeServerId) {
        socket.emit("voice:states:unwatch", getMobileVoiceStatesWatchPayload(previousServerId));
      }

      if (activeChannelId && activeChannelId !== previousChannelId) {
        socket.emit("channel:join", activeChannelId);
      }

      if (activeConversationId && activeConversationId !== previousConversationId) {
        socket.emit("dm:join", activeConversationId);
      }

      if (activeServerId && activeServerId !== previousServerId) {
        socket.emit("voice:states:watch", getMobileVoiceStatesWatchPayload(activeServerId));
      }

      if (
        activeVoiceChannelId &&
        activeServerId &&
        (activeVoiceChannelId !== previousVoiceChannelId || activeServerId !== previousServerId)
      ) {
        socket.emit("voice:join", {
          channelId: activeVoiceChannelId,
          serverId: activeServerId,
        });
      }
    },
  };
}
