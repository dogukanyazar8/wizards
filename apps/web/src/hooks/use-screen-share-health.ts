"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import {
  RoomEvent,
  Track,
  type Room,
  type LocalVideoTrack,
  type RemoteVideoTrack,
  type RemoteTrack,
} from "livekit-client";
import type { VoiceScreenShareViewModel } from "@/lib/voice/participant-mapping";
import {
  createScreenShareHealthSampler,
  startScreenShareHealthPolling,
} from "@/lib/voice/screen-share-health-sampler";
import { publishScreenShareHealthEvents } from "@/lib/telemetry/screen-share-health-events";
import type { ScreenShareHealthSnapshot } from "@wizards/types";
import { useVoiceStore } from "@/store/voice-store";
import {
  getVoicePerformanceNow,
  getVoicePerformanceDurationMs,
  recordVoicePerformanceMetric,
} from "@/lib/voice/performance";

export function useScreenShareHealthSampler(
  shares: readonly VoiceScreenShareViewModel[],
  activeId: string | null,
  room: Room | null,
) {
  const subscribedAt = useRef(new WeakMap<object, number>());
  useEffect(() => {
    if (!room) return;
    const onSubscribed = (track: RemoteTrack) => {
      if (track.source === Track.Source.ScreenShare)
        subscribedAt.current.set(track, getVoicePerformanceNow());
    };
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
    };
  }, [room]);
  const active = shares.find((share) => share.id === activeId) ?? shares[0];
  const localTrack = shares.find((share) => share.isLocal)?.track as
    LocalVideoTrack | null | undefined;
  const remoteTrack = active && !active.isLocal ? (active.track as RemoteVideoTrack | null) : null;
  const showLocal = active?.isLocal === true;

  const onSendSample = useEffectEvent((snapshot: ScreenShareHealthSnapshot | null) => {
    if (showLocal) useVoiceStore.getState().setScreenShareHealth(snapshot);
  });
  const onReceiveSample = useEffectEvent((snapshot: ScreenShareHealthSnapshot | null) => {
    if (!showLocal) useVoiceStore.getState().setScreenShareHealth(snapshot);
  });
  useEffect(() => {
    useVoiceStore.getState().setScreenShareHealth(null);
  }, [active?.id, active?.track]);

  // Watching another share must not end/restart the local sender's summary window.
  useEffect(() => {
    if (!localTrack) return;
    const send = createScreenShareHealthSampler({
      onSample: onSendSample,
      onSummary: publishScreenShareHealthEvents,
    });
    const stopPolling = startScreenShareHealthPolling(() => {
      const sender = localTrack.sender;
      void send.sample(
        sender ? { identity: sender, direction: "send", readStats: () => sender.getStats() } : null,
      );
    });
    return () => {
      stopPolling();
      send.stop();
    };
  }, [localTrack]);

  useEffect(() => {
    if (!remoteTrack) return;
    const receive = createScreenShareHealthSampler({
      onSample: onReceiveSample,
      onSummary: publishScreenShareHealthEvents,
      onFirstDecodedFrame: () => {
        const startedAt = subscribedAt.current.get(remoteTrack);
        if (startedAt === undefined) return;
        subscribedAt.current.delete(remoteTrack);
        recordVoicePerformanceMetric({
          operation: "screen_share_first_remote_frame",
          runtime: "client",
          result: "success",
          durationMs: getVoicePerformanceDurationMs(startedAt),
        });
      },
    });
    const stopPolling = startScreenShareHealthPolling(() => {
      const receiver = remoteTrack.receiver;
      void receive.sample(
        receiver
          ? { identity: receiver, direction: "receive", readStats: () => receiver.getStats() }
          : null,
      );
    });
    return () => {
      stopPolling();
      receive.stop();
    };
  }, [remoteTrack]);
}
