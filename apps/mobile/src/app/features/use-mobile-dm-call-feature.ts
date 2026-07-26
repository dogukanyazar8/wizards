import { useCallback, useEffect } from "react";

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
import { useMobileDMCallStore } from "../../state/mobile-dm-call-store";
import { setMobileDirectCallStarter } from "./mobile-direct-call-bridge";
import { shouldAlertMobileIncomingCall } from "../../notifications/mobile-notification-preferences";
import { useMobileNotificationPreferences } from "../providers/mobile-notification-preferences-provider";
import { useToast } from "../components/kit/toast";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";

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
  const session = useMobileDMCallStore((state) => state.session);
  const { preferences } = useMobileNotificationPreferences();
  const { showToast } = useToast();
  // Handlers read the live session from the store so listeners never close over a stale copy.
  const readSession = useCallback(() => useMobileDMCallStore.getState().session, []);
  const setSession = useCallback(
    (next: MobileDMCallSession | null) => useMobileDMCallStore.getState().setSession(next),
    [],
  );

  const teardown = useCallback(
    async (options: { leaveRoom: boolean }) => {
      useMobileDMCallStore.getState().clear();
      if (options.leaveRoom) {
        // Teardown runs from socket handlers and timers, so a failing leave must not
        // escape as an unhandled rejection.
        await Promise.resolve(leaveVoiceChannel()).catch(() => undefined);
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
      if (readSession()) {
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
    [emitDMCallCancel, emitDMCallStart, joinDirectCall, readSession, setSession, teardown],
  );

  const acceptCall = useCallback(async () => {
    const current = readSession();
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
  }, [emitDMCallAccept, emitDMCallEnd, joinDirectCall, readSession, setSession, teardown]);

  const declineCall = useCallback(async () => {
    const current = readSession();
    if (!current?.peer) {
      return;
    }

    emitDMCallDecline({
      conversationId: current.conversationId,
      fromUserId: current.peer.id,
    });
    await teardown({ leaveRoom: false });
  }, [emitDMCallDecline, readSession, teardown]);

  const endCall = useCallback(async () => {
    const current = readSession();
    if (!current) {
      return;
    }

    if (current.status === "ringing-out") {
      emitDMCallCancel({ conversationId: current.conversationId });
    } else {
      emitDMCallEnd({ conversationId: current.conversationId });
    }

    await teardown({ leaveRoom: true });
  }, [emitDMCallCancel, emitDMCallEnd, readSession, teardown]);

  // The voice-room screen cancels through the store so the emit logic stays in one place.
  useEffect(() => {
    useMobileDMCallStore.getState().setEndCallHandler(endCall);
    return () => useMobileDMCallStore.getState().setEndCallHandler(null);
  }, [endCall]);

  // Answering from the Android call notification reuses this handler rather than
  // rebuilding the join flow behind the deep link.
  useEffect(() => {
    useMobileDMCallStore.getState().setAnswerCallHandler(acceptCall);
    return () => useMobileDMCallStore.getState().setAnswerCallHandler(null);
  }, [acceptCall]);

  const handleRealtimeEvent = useCallback(
    (event: MobileRealtimeEventEnvelope) => {
      if (event.eventName === "dm:call:incoming") {
        const payload = getMobileDMCallIncomingPayload(event.payload);
        // A second ring while already in a call is ignored: DM calls are exclusive.
        if (payload && !readSession()) {
          setSession(createMobileIncomingCall(payload));
        }
        return;
      }

      if (event.eventName === "dm:call:accepted") {
        const payload = getMobileDMCallAcceptedPayload(event.payload);
        if (payload && isMobileCallSignalForSession(readSession(), payload.conversationId)) {
          useMobileDMCallStore
            .getState()
            .updateSession((current) =>
              markMobileCallConnected(current, current.isVideo || payload.video),
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
        const current = readSession();
        if (payload && isMobileCallSignalForSession(current, payload.conversationId)) {
          const wasRingingIn = current?.status === "ringing-in";
          // Only the caller is told the call was refused; the callee already knows.
          if (event.eventName === "dm:call:declined" && current?.status === "ringing-out") {
            showToast({
              title: copy.directCallDeclinedNotice.replace("{name}", current.title),
              variant: "warning",
            });
          }
          void teardown({ leaveRoom: !wasRingingIn });
        }
      }
    },
    [readSession, setSession, showToast, teardown],
  );

  useEffect(() => subscribe(handleRealtimeEvent), [handleRealtimeEvent, subscribe]);

  // Both sides drop the call on the same deadline, so nobody is left ringing alone.
  useEffect(() => {
    if (!session || session.ringExpiresAt === null) {
      return;
    }

    const timer = setInterval(() => {
      const current = readSession();
      if (!current || !hasMobileRingExpired(current, Date.now())) {
        return;
      }

      if (current.status === "ringing-out") {
        emitDMCallCancel({ conversationId: current.conversationId });
        showToast({
          title: copy.directCallUnansweredNotice.replace("{name}", current.title),
          variant: "warning",
        });
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
  }, [emitDMCallCancel, emitDMCallDecline, readSession, session, showToast, teardown]);

  // Published so surfaces outside the product shell (11b profile card) ring
  // through this same handshake rather than opening a parallel call path.
  useEffect(() => setMobileDirectCallStarter(startCall), [startCall]);

  return {
    acceptCall,
    callSession: session,
    declineCall,
    endCall,
    /** Vibrate on an inbound ring only when the notification preferences allow it. */
    incomingCallAlertsEnabled:
      preferences.vibration && shouldAlertMobileIncomingCall(preferences, new Date()),
    incomingCall: session?.status === "ringing-in" ? session : null,
    startCall,
  };
}
