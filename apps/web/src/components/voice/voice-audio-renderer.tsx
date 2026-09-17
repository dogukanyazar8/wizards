"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { RemoteAudioTrack, type Room, Track } from "livekit-client";
import { useTracks } from "@livekit/components-react";
import { DEFAULT_AUDIO_DEVICE_ID, useVoiceStore } from "@/store/voice-store";
import { createAudioOutputRouter } from "@/lib/voice/audio-output-router";
import { logWarning } from "@/lib/logger";

function RemoteAudioElement({
  outputDeviceId,
  track,
  onOutputError,
}: {
  outputDeviceId: string;
  track: RemoteAudioTrack;
  onOutputError: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const routerRef = useRef<ReturnType<typeof createAudioOutputRouter> | null>(null);
  const reportOutputError = useEffectEvent(onOutputError);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) {
      return;
    }

    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    const router = createAudioOutputRouter(element, (result, requestedDeviceId) => {
      if (result.status === "applied") return;
      logWarning("[voice] Audio output routing failed", result.error);
      const store = useVoiceStore.getState();
      if (store.audioPreferences.outputDeviceId !== requestedDeviceId) return;
      if (result.status === "fallback") {
        store.setAudioPreference("outputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
      } else {
        reportOutputError();
      }
    });
    routerRef.current = router;
    return () => {
      router.dispose();
      routerRef.current = null;
    };
  }, []);

  useEffect(() => {
    void routerRef.current?.select(outputDeviceId);
  }, [outputDeviceId]);

  return <audio autoPlay hidden playsInline ref={audioRef} />;
}

export function VoiceAudioRenderer({
  outputDeviceId,
  room,
  onOutputError,
}: {
  outputDeviceId: string;
  room: Room;
  onOutputError: () => void;
}) {
  // Room mutates in place. Subscribe here so memoized parents cannot hide new
  // tracks from playback. Speaking-level updates must not drive audio mounting.
  const tracks = useTracks([Track.Source.Microphone], {
    room,
    onlySubscribed: true,
    updateOnlyOn: [],
  });
  const audioTracks = tracks.flatMap(({ participant, publication }) =>
    !participant.isLocal && publication.track instanceof RemoteAudioTrack
      ? [{ id: publication.trackSid, track: publication.track }]
      : [],
  );

  if (audioTracks.length === 0) {
    return null;
  }

  return (
    <div aria-hidden="true" className="hidden">
      {audioTracks.map((entry) => (
        <RemoteAudioElement
          key={entry.id}
          outputDeviceId={outputDeviceId}
          track={entry.track}
          onOutputError={onOutputError}
        />
      ))}
    </div>
  );
}
