import { LocalAudioTrack, LocalTrack, LocalVideoTrack, type Room, Track } from "livekit-client";

import { logError } from "@/lib/logger";
import {
  applyScreenShareEncodingToSender,
  getScreenShareQualityPreset,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";

export function resolveParticipantVolume(
  userId: string,
  isDeafened: boolean,
  participantVolumes: Record<string, number>,
  defaultParticipantVolume: number,
) {
  if (isDeafened) {
    return 0;
  }

  return (participantVolumes[userId] ?? defaultParticipantVolume) / 100;
}

export function getLocalMicrophoneTrack(targetRoom: Room | null) {
  const microphonePublication =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track ?? null;

  return microphonePublication instanceof LocalAudioTrack ? microphonePublication : null;
}

export function isLocalMicrophoneTrackLive(
  track: LocalAudioTrack | null,
): track is LocalAudioTrack {
  return track?.mediaStreamTrack.readyState === "live";
}

export function getLocalCameraTrack(targetRoom: Room | null) {
  const cameraPublication =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;

  return cameraPublication instanceof LocalVideoTrack ? cameraPublication : null;
}

export function isLocalCameraTrackLive(track: LocalVideoTrack | null) {
  return track?.mediaStreamTrack.readyState === "live";
}

export function getLocalScreenShareTrack(targetRoom: Room | null) {
  const screenShareTrack =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null;

  return screenShareTrack instanceof LocalVideoTrack ? screenShareTrack : null;
}

export function isLocalScreenShareTrackLive(track: LocalVideoTrack | null) {
  return track?.mediaStreamTrack.readyState === "live";
}

export async function applyScreenShareQualityToTrack(
  track: LocalVideoTrack,
  qualityId: ScreenShareQualityId,
) {
  const preset = getScreenShareQualityPreset(qualityId);

  if (track.sender) {
    await applyScreenShareEncodingToSender(track.sender, preset.encoding);
  }
}

export async function stopLocalTracks(room: Room) {
  const publications = room.localParticipant.getTrackPublications();
  const localTracks = publications
    .map((publication) => publication.track)
    .filter((track): track is LocalTrack => track instanceof LocalTrack);

  await Promise.all(
    localTracks.map((track) =>
      track instanceof LocalAudioTrack && track.getProcessor()
        ? track.stopProcessor().catch(() => undefined)
        : Promise.resolve(),
    ),
  );

  await Promise.all(
    localTracks.map((track) =>
      room.localParticipant.unpublishTrack(track, false).catch(() => undefined),
    ),
  );

  for (const track of localTracks) {
    track.stop();
    track.detach();
  }
}

/**
 * Every remote audio source livekit lets a participant volume be set on.
 *
 * Screen-share audio is a second, independent publication: without it in this
 * list, deafening leaves a shared tab's audio playing at full volume and the
 * participant's volume slider does not reach it. Nothing publishes it yet — both
 * capture paths still pass `audio: false` — but livekit remembers a volume set
 * before the track exists (`volumeMap`) and applies it the moment one is
 * subscribed, so setting it here also covers a track published by some other
 * client or a later release.
 */
const REMOTE_AUDIO_VOLUME_SOURCES = [
  Track.Source.Microphone,
  Track.Source.ScreenShareAudio,
] as const;

export function applyRemoteAudioState(
  room: Room,
  isDeafened: boolean,
  participantVolumes: Record<string, number>,
  defaultParticipantVolume: number,
) {
  for (const participant of room.remoteParticipants.values()) {
    const volume = resolveParticipantVolume(
      participant.identity,
      isDeafened,
      participantVolumes,
      defaultParticipantVolume,
    );

    // Per source, not per participant: one source throwing must not leave the
    // other one carrying a stale volume — least of all an un-deafened one.
    for (const source of REMOTE_AUDIO_VOLUME_SOURCES) {
      try {
        participant.setVolume(volume, source);
      } catch (error) {
        logError("[voice] Remote participant volume sync failed", error);
      }
    }
  }
}

export function runNonFatalVoiceJoinStep(step: string, action: () => void) {
  try {
    action();
  } catch (error) {
    logError(`[voice] Non-fatal join step failed: ${step}`, error);
  }
}
