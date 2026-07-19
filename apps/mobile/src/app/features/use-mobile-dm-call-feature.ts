import { useCallback, useEffect, useRef, useState } from "react";

import type { MobileRealtimeEventEnvelope } from "../../realtime/mobile-realtime-contract";
import {
  createMobileIncomingCall,
  createMobileOutgoingCall,
  getMobileDMCallAcceptedPayload,
  getMobileDMCallIncomingPayload,
  getMobileDMCallSignalPayload,
  hasMobileRingExpired,
  isMobileCallSignalForSession,
  markMobileCallConnected,
  type MobileDMCallSession,
} from "../../voice/mobile-dm-call-state";
import {
  launchMobileDirectCall,
  openMobileVoiceRoom,
} from "../../voice/mobile-voice-room-route-navigation";

const RING_TICK_MS = 1_000;

export type MobileDMCallEmitters = {
  emitDMCallAccept(input: { conversationId: string; fromUserId: string; video: boolean }): void;
  emitDMCallCancel(input: { conversationId: string }): void;
  emitDMCallDecline(input: { conversationId: string; fromUserId: string }): void;
  emitDMCallEnd(input: { conversationId: string }): void;
  emitDMCallStart(input: { conversationId: string; video: boolean }): void;
};

/** Emitters arrive as individual props so the product shell needs no wrapper memo. */
type MobileDMCallFeatureInput = MobileDMCallEmitters & {
  joinDirectCall: Parameters<typeof launchMobileDirectCall>[0]["joinDirectCall"];
  leaveVoiceChannel: () => Promise<void> | void;
  subscribe: (listener: (event: MobileRealtimeEventEnvelope) => void) => () => void;
};

/**
 * DM call ring handshake for mobile. The LiveKit session itself stays in the voice runtime;
 * this feature only decides when to join, when to hang up, and what the ring UI shows.
 */
export function useMobileDMCallFeature({
  emitDMCallAccept,
  emitDMCallCancel,
  emitDMCallDecline,
  emitDMCallEnd,
  emitDMCallStart,
  joinDirectCall,
  leaveVoiceChannel,
  subscribe,
}: MobileDMCallFeatureInput) {
  const [session, setSession] = useState<MobileDMCallSession | null>(null);
  const sessionRef = useRef<MobileDMCallSession | null>(null);
  sessionRef.current = session;

  const teardown = useCallback(
    async (options: { leaveRoom: boolean }) => {
      setSession(null);
      if (options.leaveRoom) {
        await leaveVoiceChannel();
      }
    },
    [leaveVoiceChannel],
  );

  const startCall = useCallback(
    async ({
      conversationId,
      title,
      video,
    }: {
      conversationId: string;
      title: string;
      video: boolean;
    }) => {
      if (sessionRef.current) {
        return;
      }

      setSession(createMobileOutgoingCall({ conversationId, now: Date.now(), title, video }));
      emitDMCallStart({ conversationId, video });

      const joined = await launchMobileDirectCall({
        conversationId,
        joinDirectCall,
        openVoiceRoom: openMobileVoiceRoom,
        title,
        video,
      });

      if (!joined) {
        emitDMCallCancel({ conversationId });
        await teardown({ leaveRoom: false });
      }
    },
    [emitDMCallCancel, emitDMCallStart, joinDirectCall, teardown],
  );

  const acceptCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.status !== "ringing-in" || !current.peer) {
      return;
    }

    emitDMCallAccept({
      conversationId: current.conversationId,
      fromUserId: current.peer.id,
      video: current.isVideo,
    });
    setSession(markMobileCallConnected(current));

    const joined = await launchMobileDirectCall({
      conversationId: current.conversationId,
      joinDirectCall,
      openVoiceRoom: openMobileVoiceRoom,
      title: current.title,
      video: current.isVideo,
    });

    if (!joined) {
      emitDMCallEnd({ conversationId: current.conversationId });
      await teardown({ leaveRoom: false });
    }
  }, [emitDMCallAccept, emitDMCallEnd, joinDirectCall, teardown]);

  const declineCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current?.peer) {
      return;
    }

    emitDMCallDecline({
      conversationId: current.conversationId,
      fromUserId: current.peer.id,
    });
    await teardown({ leaveRoom: false });
  }, [emitDMCallDecline, teardown]);

  const endCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) {
      return;
    }

    if (current.status === "ringing-out") {
      emitDMCallCancel({ conversationId: current.conversationId });
    } else {
      emitDMCallEnd({ conversationId: current.conversationId });
    }

    await teardown({ leaveRoom: true });
  }, [emitDMCallCancel, emitDMCallEnd, teardown]);

  const handleRealtimeEvent = useCallback(
    (event: MobileRealtimeEventEnvelope) => {
      if (event.eventName === "dm:call:incoming") {
        const payload = getMobileDMCallIncomingPayload(event.payload);
        // A second ring while already in a call is ignored: DM calls are exclusive.
        if (payload && !sessionRef.current) {
          setSession(createMobileIncomingCall(payload));
        }
        return;
      }

      if (event.eventName === "dm:call:accepted") {
        const payload = getMobileDMCallAcceptedPayload(event.payload);
        if (payload && isMobileCallSignalForSession(sessionRef.current, payload.conversationId)) {
          setSession((current) =>
            current ? markMobileCallConnected(current, current.isVideo || payload.video) : current,
          );
        }
        return;
      }

      if (
        event.eventName === "dm:call:declined" ||
        event.eventName === "dm:call:cancelled" ||
        event.eventName === "dm:call:ended"
      ) {
        const payload = getMobileDMCallSignalPayload(event.payload);
        if (payload && isMobileCallSignalForSession(sessionRef.current, payload.conversationId)) {
          const wasRingingIn = sessionRef.current?.status === "ringing-in";
          void teardown({ leaveRoom: !wasRingingIn });
        }
      }
    },
    [teardown],
  );

  useEffect(() => subscribe(handleRealtimeEvent), [handleRealtimeEvent, subscribe]);

  // Both sides drop the call on the same deadline, so nobody is left ringing alone.
  useEffect(() => {
    if (!session || session.ringExpiresAt === null) {
      return;
    }

    const timer = setInterval(() => {
      const current = sessionRef.current;
      if (!current || !hasMobileRingExpired(current, Date.now())) {
        return;
      }

      if (current.status === "ringing-out") {
        emitDMCallCancel({ conversationId: current.conversationId });
        void teardown({ leaveRoom: true });
        return;
      }

      if (current.peer) {
        emitDMCallDecline({
          conversationId: current.conversationId,
          fromUserId: current.peer.id,
        });
      }
      void teardown({ leaveRoom: false });
    }, RING_TICK_MS);

    return () => clearInterval(timer);
  }, [emitDMCallCancel, emitDMCallDecline, session, teardown]);

  return {
    acceptCall,
    callSession: session,
    declineCall,
    endCall,
    incomingCall: session?.status === "ringing-in" ? session : null,
    startCall,
  };
}
