"use client";

import { useCallback, useEffect } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceState } from "@/components/providers/voice-provider";
import { useSocket } from "@/hooks/use-socket";
import { hasRingExpired, signalMatchesSession, type DMCallPeer } from "@/lib/dm/call-state";
import { useDMCallStore } from "@/store/dm-call-store";

const RING_TICK_MS = 1_000;

/**
 * Owns the DM call lifecycle: ring signalling over the socket plus the LiveKit session
 * through the voice provider. Mount exactly once (see DMCallController); components read
 * the resulting state from useDMCallStore and trigger actions through useDMCallActions.
 */
export function useDMCallController() {
  const socket = useSocket();
  const { t } = useI18n();
  const { joinDirectCall, leaveChannel, toggleCamera } = useVoiceState();
  const session = useDMCallStore((state) => state.session);
  // Handlers read the live session from the store so listeners never close over a stale copy.
  const readSession = useCallback(() => useDMCallStore.getState().session, []);

  const teardown = useCallback(
    async (message: string | null) => {
      const store = useDMCallStore.getState();
      store.clear();
      if (message) {
        store.setErrorMessage(message);
      }
      await leaveChannel().catch(() => undefined);
    },
    [leaveChannel],
  );

  useEffect(() => {
    const handleIncoming = (data: {
      conversationId: string;
      expiresAt: string;
      fromUser: DMCallPeer;
      video: boolean;
    }) => {
      // An incoming call while already in one is ignored: DM calls are exclusive.
      if (readSession()) {
        return;
      }

      useDMCallStore.getState().receiveIncoming({
        conversationId: data.conversationId,
        expiresAt: data.expiresAt,
        peer: data.fromUser,
        video: data.video,
      });
    };

    const handleAccepted = (data: { conversationId: string; video: boolean }) => {
      if (!signalMatchesSession(readSession(), data.conversationId)) {
        return;
      }

      useDMCallStore.getState().setConnected(readSession()?.isVideo || data.video);
    };

    const handleDeclined = (data: { conversationId: string }) => {
      if (!signalMatchesSession(readSession(), data.conversationId)) {
        return;
      }

      void teardown(t("dm.call.declined"));
    };

    const handleCancelled = (data: { conversationId: string }) => {
      if (!signalMatchesSession(readSession(), data.conversationId)) {
        return;
      }

      void teardown(t("dm.call.cancelled"));
    };

    const handleEnded = (data: { conversationId: string }) => {
      if (!signalMatchesSession(readSession(), data.conversationId)) {
        return;
      }

      void teardown(t("dm.call.ended"));
    };

    socket.on("dm:call:incoming", handleIncoming);
    socket.on("dm:call:accepted", handleAccepted);
    socket.on("dm:call:declined", handleDeclined);
    socket.on("dm:call:cancelled", handleCancelled);
    socket.on("dm:call:ended", handleEnded);

    return () => {
      socket.off("dm:call:incoming", handleIncoming);
      socket.off("dm:call:accepted", handleAccepted);
      socket.off("dm:call:declined", handleDeclined);
      socket.off("dm:call:cancelled", handleCancelled);
      socket.off("dm:call:ended", handleEnded);
    };
  }, [readSession, socket, t, teardown]);

  // Both sides give up on the same deadline, so neither is left ringing alone.
  useEffect(() => {
    if (!session || session.ringExpiresAt === null) {
      return;
    }

    const timer = window.setInterval(() => {
      const current = readSession();
      if (!hasRingExpired(current, Date.now()) || !current) {
        return;
      }

      if (current.status === "ringing-out") {
        socket.emit("dm:call:cancel", { conversationId: current.conversationId });
      } else if (current.peer) {
        socket.emit("dm:call:decline", {
          conversationId: current.conversationId,
          fromUserId: current.peer.id,
        });
      }

      void teardown(t("dm.call.unanswered"));
    }, RING_TICK_MS);

    return () => window.clearInterval(timer);
  }, [readSession, session, socket, t, teardown]);

  const startCall = useCallback(
    async ({
      conversationId,
      peer,
      video,
    }: {
      conversationId: string;
      peer: DMCallPeer | null;
      video: boolean;
    }) => {
      const store = useDMCallStore.getState();
      if (store.session) {
        return;
      }

      store.startOutgoing({ conversationId, peer, video });
      socket.emit("dm:call:start", { conversationId, video });

      try {
        await joinDirectCall({ conversationId });
        if (video) {
          await toggleCamera();
        }
      } catch {
        socket.emit("dm:call:cancel", { conversationId });
        await teardown(t("dm.call.errors.connectFailed"));
      }
    },
    [joinDirectCall, socket, t, teardown, toggleCamera],
  );

  const acceptCall = useCallback(async () => {
    const current = readSession();
    if (!current || current.status !== "ringing-in" || !current.peer) {
      return;
    }

    const store = useDMCallStore.getState();
    store.setConnecting();
    socket.emit("dm:call:accept", {
      conversationId: current.conversationId,
      fromUserId: current.peer.id,
      video: current.isVideo,
    });

    try {
      await joinDirectCall({ conversationId: current.conversationId });
      if (current.isVideo) {
        await toggleCamera();
      }
      useDMCallStore.getState().setConnected();
    } catch {
      socket.emit("dm:call:end", { conversationId: current.conversationId });
      await teardown(t("dm.call.errors.connectFailed"));
    }
  }, [joinDirectCall, readSession, socket, t, teardown, toggleCamera]);

  const declineCall = useCallback(async () => {
    const current = readSession();
    if (!current?.peer) {
      return;
    }

    socket.emit("dm:call:decline", {
      conversationId: current.conversationId,
      fromUserId: current.peer.id,
    });
    await teardown(null);
  }, [readSession, socket, teardown]);

  const endCall = useCallback(async () => {
    const current = readSession();
    if (!current) {
      return;
    }

    socket.emit(current.status === "ringing-out" ? "dm:call:cancel" : "dm:call:end", {
      conversationId: current.conversationId,
    });
    await teardown(null);
  }, [readSession, socket, teardown]);

  return { acceptCall, declineCall, endCall, startCall };
}

export type DMCallActions = ReturnType<typeof useDMCallController>;
