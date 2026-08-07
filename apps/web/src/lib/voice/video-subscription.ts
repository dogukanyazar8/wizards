import { VideoQuality, type AdaptiveStreamSettings } from "livekit-client";

/**
 * Subscription side of the video contract: which simulcast layer each surface
 * asks for, and which layers the publisher is allowed to stop producing.
 *
 * `pixelDensity: "screen"` makes the requested layer follow the real device
 * pixels behind a tile instead of livekit's flat 1x/2x guess, so a retina stage
 * stops asking for a layer meant for a 1x screen.
 *
 * `pauseVideoInBackground` only ever touches subscribed remote video: livekit
 * flips `RemoteVideoTrack` visibility off while the tab is hidden. Audio keeps
 * flowing, and the same `visibilitychange` listener replays the video elements
 * when the tab comes back.
 */
export const VOICE_ADAPTIVE_STREAM_SETTINGS: AdaptiveStreamSettings = {
  pauseVideoInBackground: true,
  pixelDensity: "screen",
};

/**
 * Which surface the room was opened for. A channel room paints many tiles and
 * needs adaptive stream to keep the download bounded; a DM call paints exactly
 * one remote video, fullscreen.
 */
export type VoiceRoomSessionMode = "channel" | "direct";

/**
 * Adaptive stream is a ceiling, never a floor: `emitTrackUpdate` sends
 * `min(videoDimensionsAdaptiveStream, requested)` on every branch. In a channel
 * room that is the point. In a 1:1 call it buys nothing — there is one remote
 * video and it fills the screen — while every layout change re-measures the
 * element and briefly drops the subscription to a smaller layer, which is seen
 * as the call going soft. So a direct call turns it off and lets the quality
 * ceiling decide.
 *
 * `dynacast` stays on in both modes: without it a publisher keeps encoding
 * layers nobody subscribes to, which is exactly what drains a phone publishing
 * into a web-only room.
 */
export function getVoiceRoomSubscriptionOptions({
  sessionMode,
}: {
  sessionMode: VoiceRoomSessionMode;
}): {
  adaptiveStream: AdaptiveStreamSettings | false;
  dynacast: boolean;
} {
  if (sessionMode === "direct") {
    return {
      adaptiveStream: false,
      dynacast: true,
    };
  }

  return {
    adaptiveStream: { ...VOICE_ADAPTIVE_STREAM_SETTINGS },
    dynacast: true,
  };
}

/**
 * The stage, a fullscreen viewer and the active speaker take the top layer;
 * corner previews cap one below so dynacast can retire it. Read lazily so
 * importing this contract never depends on the livekit-client enum being
 * initialised.
 */
export function resolveVoiceVideoQuality({ isStage }: { isStage: boolean }): VideoQuality {
  return isStage ? VideoQuality.HIGH : VideoQuality.MEDIUM;
}

/**
 * The subset of `RemoteTrackPublication` this contract needs. Local
 * publications carry no `setVideoQuality`, so they fall through untouched.
 */
export type VoiceQualityPublication = {
  isSubscribed?: boolean;
  setVideoQuality?: (quality: VideoQuality) => void;
};

/**
 * Sets the ceiling on a tile's subscribed layer — a ceiling, not a floor.
 *
 * While adaptive stream is on (channel rooms) livekit sends
 * `min(videoDimensionsAdaptiveStream, requested)`, so the smaller of the two
 * wins and this can never make a small or late-measured tile pull a large
 * layer; it only stops a large tile from being capped low. With adaptive stream
 * off (direct calls) there is no second input, so the ceiling is what the
 * subscription actually gets.
 *
 * Returns the applied quality, or null when there was nothing to apply: a
 * participant who just turned their camera off leaves an undefined publication,
 * and that is an ordinary frame, not an error.
 */
export function setVoiceVideoQualityCeiling(
  publication: VoiceQualityPublication | null | undefined,
  { isStage }: { isStage: boolean },
): VideoQuality | null {
  if (!publication || typeof publication.setVideoQuality !== "function") {
    return null;
  }

  // livekit logs a warning for settings changes on an unsubscribed publication.
  if (publication.isSubscribed === false) {
    return null;
  }

  const quality = resolveVoiceVideoQuality({ isStage });
  publication.setVideoQuality(quality);

  return quality;
}
