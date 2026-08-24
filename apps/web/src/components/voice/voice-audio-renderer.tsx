"use client";

import { useEffect, useRef } from "react";
import { RemoteAudioTrack, type Room, Track } from "livekit-client";
import { DEFAULT_AUDIO_DEVICE_ID } from "@/store/voice-store";

type AudioElementWithSinkId = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

function RemoteAudioElement({
  outputDeviceId,
  track,
}: {
  outputDeviceId: string;
  track: RemoteAudioTrack;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    const element = audioRef.current as AudioElementWithSinkId | null;
    if (!element?.setSinkId) {
      return;
    }

    void element
      .setSinkId(
        outputDeviceId === DEFAULT_AUDIO_DEVICE_ID ? DEFAULT_AUDIO_DEVICE_ID : outputDeviceId,
      )
      .catch(() => undefined);
  }, [outputDeviceId]);

  return <audio autoPlay hidden playsInline ref={audioRef} />;
}

export function VoiceAudioRenderer({
  outputDeviceId,
  room,
}: {
  outputDeviceId: string;
  room: Room | null;
}) {
  const audioTracks: Array<{ id: string; track: RemoteAudioTrack }> = [];

  if (room) {
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.getTrackPublications()) {
        if (
          publication.source === Track.Source.Microphone &&
          publication.track instanceof RemoteAudioTrack
        ) {
          audioTracks.push({
            id: publication.trackSid,
            track: publication.track,
          });
        }
      }
    }
  }

  if (audioTracks.length === 0) {
    return null;
  }

  return (
    <div aria-hidden="true" className="hidden">
      {audioTracks.map((entry) => (
        <RemoteAudioElement key={entry.id} outputDeviceId={outputDeviceId} track={entry.track} />
      ))}
    </div>
  );
}
