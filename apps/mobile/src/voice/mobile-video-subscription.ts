import { VideoQuality, type AdaptiveStreamSettings } from "livekit-client";

/**
 * Subscription side of the mobile video contract, matching
 * `apps/web/src/lib/voice/video-subscription.ts`.
 *
 * `pixelDensity: "screen"` resolves to `PixelRatio.get()` on React Native
 * (`@livekit/react-native` publishes it through `LiveKitReactNativeGlobal`), so
 * a tile asks for the layer its real pixel box needs instead of livekit's flat
 * 1x/2x guess.
 *
 * `pauseVideoInBackground` is declared for parity, but on React Native it is
 * inert: livekit only installs an app-visibility listener when `document`
 * exists (`isWeb()`), so `isInBackground` never flips and no remote video is
 * paused. The app's own AppState rule stands in for it and owns both halves —
 * `mobile-voice-background-media.ts` for local camera and screen share teardown,
 * `mobile-remote-video-background.ts` for the remote downloads — behind one
 * capture-consent guard that keeps a permission dialog's transient background
 * from stopping the stream the user is starting.
 */
export const MOBILE_VOICE_ADAPTIVE_STREAM_SETTINGS: AdaptiveStreamSettings = {
  pauseVideoInBackground: true,
  pixelDensity: "screen",
};

/**
 * Which surface the room was opened for. A channel room paints many tiles and
 * needs adaptive stream to keep the download bounded; a DM call paints exactly
 * one remote video, fullscreen.
 */
export type MobileVoiceRoomSessionMode = "channel" | "direct";

/**
 * Adaptive stream is a ceiling, never a floor: `emitTrackUpdate` sends
 * `min(videoDimensionsAdaptiveStream, requested)` on every branch. In a channel
 * room that is the point. In a 1:1 call it buys nothing — there is one remote
 * video and it fills the screen — while every layout change re-measures the
 * tile and briefly drops the subscription to a smaller layer, which is seen as
 * the call going soft. So a direct call turns it off and lets the quality
 * ceiling decide.
 *
 * Turning it off costs nothing in the background: `pauseVideoInBackground` was
 * already inert on React Native, and `mobile-remote-video-background.ts` — which
 * drives `setEnabled` straight off `AppState` — keeps working in both modes.
 *
 * `dynacast` stays on in both modes.
 */
export function getMobileVoiceRoomSubscriptionOptions({
  sessionMode,
}: {
  sessionMode: MobileVoiceRoomSessionMode;
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
    adaptiveStream: { ...MOBILE_VOICE_ADAPTIVE_STREAM_SETTINGS },
    dynacast: true,
  };
}

/**
 * The stage, a fullscreen viewer and the active speaker take the top layer;
 * grid tiles cap one below so dynacast can retire it. Read lazily so importing
 * this contract never depends on the livekit-client enum being initialised.
 */
export function resolveVoiceVideoQuality({ isStage }: { isStage: boolean }): VideoQuality {
  return isStage ? VideoQuality.HIGH : VideoQuality.MEDIUM;
}

/**
 * The subset of `RemoteTrackPublication` this contract needs. Local
 * publications carry no `setVideoQuality`, so they fall through untouched.
 */
export type MobileVoiceQualityPublication = {
  isSubscribed?: boolean;
  setVideoQuality?: (quality: VideoQuality) => void;
};

/**
 * Sets the ceiling on a tile's subscribed layer — a ceiling, not a floor.
 *
 * While adaptive stream is on (channel rooms) livekit sends
 * `min(videoDimensionsAdaptiveStream, requested)`, so the smaller of the two
 * wins and this never makes a small or late-measured tile pull a large layer;
 * it only stops a stage tile from being capped low. With adaptive stream off
 * (direct calls) there is no second input, so the ceiling is what the
 * subscription actually gets.
 *
 * Returns the applied quality, or null when there was nothing to apply: a
 * participant who just turned their camera off leaves an undefined publication,
 * and that is an ordinary frame, not an error.
 */
export function setVoiceVideoQualityCeiling(
  publication: MobileVoiceQualityPublication | null | undefined,
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

/**
 * Short edge, in source pixels, of the extra simulcast layer the mobile ladder
 * publishes (`VideoPresets.h360`, 640x360). A tile that requests less than this
 * is asking for a layer that does not exist.
 */
export const MOBILE_CAMERA_TILE_TARGET_SHORT_EDGE_PX = 360;

/** The grid's historical minimum: tiles never get narrower than this. */
export const MOBILE_CAMERA_TILE_FLOOR_DP = 148;

/**
 * Density-points a camera tile needs so `pixelDensity: "screen"` requests the
 * h360 layer rather than something below the ladder. The number comes from the
 * device's own pixel ratio; a 3x phone already clears it at the historical
 * minimum, a 2x phone needs a wider tile.
 */
export function getMobileCameraTileMinWidth(pixelRatio: number): number {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    return MOBILE_CAMERA_TILE_FLOOR_DP;
  }

  return Math.max(
    MOBILE_CAMERA_TILE_FLOOR_DP,
    Math.ceil(MOBILE_CAMERA_TILE_TARGET_SHORT_EDGE_PX / pixelRatio),
  );
}
