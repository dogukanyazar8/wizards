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

/**
 * Every local publication a screen share can own: the picture and, when the
 * sharer opted into share audio, the surface's audio as a separate
 * `ScreenShareAudio` publication.
 *
 * Both have to come down together. An audio track left behind keeps
 * broadcasting whatever the sharer's machine is playing after the picture is
 * gone, which is the worst failure this feature can have.
 */
export function getLocalScreenShareTracks(room: Room): LocalTrack[] {
  return room.localParticipant
    .getTrackPublications()
    .filter(
      (publication) =>
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio,
    )
    .map((publication) => publication.track)
    .filter((track): track is LocalTrack => track instanceof LocalTrack);
}

type ScreenShareAudioConstraints = MediaTrackConstraints & {
  suppressLocalAudioPlayback?: boolean;
};

/**
 * Stops the captured surface's audio from also coming out of the sharer's own
 * speakers, which would otherwise echo everything they share.
 *
 * This has to be applied to the track, not asked for at capture time:
 * livekit-client 2.21 declares `suppressLocalAudioPlayback` on
 * `ScreenShareCaptureOptions` but drops it while building the `getDisplayMedia`
 * constraints, so the capture option alone never reaches the browser.
 *
 * Best effort by design — a browser that rejects the constraint keeps playing
 * the audio locally, which is a worse experience but still a working share.
 * Returns whether a screen-share audio track was there to constrain.
 */
export function suppressLocalScreenShareAudioPlayback(room: Room): boolean {
  const mediaStreamTrack = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)
    ?.track?.mediaStreamTrack;

  if (typeof mediaStreamTrack?.applyConstraints !== "function") {
    return false;
  }

  const constraints: ScreenShareAudioConstraints = { suppressLocalAudioPlayback: true };
  void mediaStreamTrack.applyConstraints(constraints).catch(() => undefined);

  return true;
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
 * participant's volume slider does not reach it. Web publishes it whenever the
 * sharer opts in; mobile still captures video only. livekit also remembers a
 * volume set before the track exists (`volumeMap`) and applies it the moment one
 * is subscribed, so a listener who deafened first stays deafened when a share
 * with audio arrives.
 */
const REMOTE_AUDIO_VOLUME_SOURCES = [
  Track.Source.Microphone,
  Track.Source.ScreenShareAudio,
] as const;

const FULL_SCREEN_SHARE_VOLUME = 100;

/**
 * The share-audio slider narrows the sharer's participant volume, it does not
 * replace it — two independent authorities over one stream would let a listener
 * turn a muted person's shared tab back on. Whichever control is lower wins, and
 * deafening still zeroes both because it zeroes the participant volume first.
 */
export function resolveScreenShareAudioVolume(
  participantVolume: number,
  screenShareVolume: number,
) {
  if (!Number.isFinite(screenShareVolume)) {
    return participantVolume;
  }

  const ceiling = Math.min(FULL_SCREEN_SHARE_VOLUME, Math.max(0, screenShareVolume));

  return participantVolume * (ceiling / FULL_SCREEN_SHARE_VOLUME);
}

export function applyRemoteAudioState(
  room: Room,
  isDeafened: boolean,
  participantVolumes: Record<string, number>,
  defaultParticipantVolume: number,
  screenShareVolume: number = FULL_SCREEN_SHARE_VOLUME,
) {
  for (const participant of room.remoteParticipants.values()) {
    const participantVolume = resolveParticipantVolume(
      participant.identity,
      isDeafened,
      participantVolumes,
      defaultParticipantVolume,
    );

    // Per source, not per participant: one source throwing must not leave the
    // other one carrying a stale volume — least of all an un-deafened one.
    for (const source of REMOTE_AUDIO_VOLUME_SOURCES) {
      try {
        participant.setVolume(
          source === Track.Source.ScreenShareAudio
            ? resolveScreenShareAudioVolume(participantVolume, screenShareVolume)
            : participantVolume,
          source,
        );
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
