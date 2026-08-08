import { Track } from "livekit-client";

/**
 * Listener-side control over a remote screen share's audio.
 *
 * Mobile gets a mute switch, not a slider: there is no per-participant volume
 * surface on the phone to hang a second control off, and a 4pt-wide slider in
 * the share viewer would be worse than useless.
 *
 * `setVolume` is the mechanism rather than `setEnabled(false)`. Both exist on
 * React Native — `RemoteAudioTrack.setVolume` routes to react-native-webrtc's
 * `MediaStreamTrack._setVolume` — but `setEnabled` writes livekit's
 * `requestedDisabled`, the same field the background rule in
 * `mobile-remote-video-background.ts` owns for video. Keeping the audio mute on
 * the volume path means the two rules can never read each other's state.
 *
 * Volume also survives a track that has not arrived yet: livekit stores it in
 * `volumeMap` and applies it the moment the publication is subscribed, so a
 * listener who muted before the sharer started stays muted.
 */

/** Everything muted; livekit's own scale is 0-10, with 1 as unity gain. */
const MUTED_SCREEN_SHARE_AUDIO_VOLUME = 0;
const FULL_SCREEN_SHARE_AUDIO_VOLUME = 1;

/** The subset of `RemoteParticipant` this rule needs, so it stays testable. */
export type MobileScreenShareAudioParticipant = {
  readonly identity?: string;
  setVolume?: (volume: number, source?: Track.Source.ScreenShareAudio) => void;
};

export type MobileScreenShareAudioRoom = {
  readonly remoteParticipants?: ReadonlyMap<string, MobileScreenShareAudioParticipant>;
};

export function resolveMobileScreenShareAudioVolume(muted: boolean): number {
  return muted ? MUTED_SCREEN_SHARE_AUDIO_VOLUME : FULL_SCREEN_SHARE_AUDIO_VOLUME;
}

/**
 * Applies the listener's mute choice to every remote participant's share audio,
 * and returns the identities it reached.
 *
 * Only `Track.Source.ScreenShareAudio` is ever named, so the microphone mix and
 * the video publication are both untouched — a muted share keeps its picture.
 */
export function applyMobileScreenShareAudioMute(
  room: MobileScreenShareAudioRoom | null | undefined,
  muted: boolean,
): string[] {
  const participants = room?.remoteParticipants;

  if (!participants) {
    return [];
  }

  const volume = resolveMobileScreenShareAudioVolume(muted);
  const applied: string[] = [];

  for (const participant of participants.values()) {
    if (typeof participant?.setVolume !== "function") {
      continue;
    }

    try {
      participant.setVolume(volume, Track.Source.ScreenShareAudio);
      applied.push(participant.identity ?? "");
    } catch {
      // One participant refusing must not leave the rest at the old volume.
    }
  }

  return applied;
}
