import {
  Track,
  VideoPresets,
  type TrackPublishDefaults,
  type TrackPublishOptions,
  type VideoCaptureOptions,
  type VideoEncoding,
  type VideoPreset,
  type VideoResolution,
} from "livekit-client";

/**
 * Camera quality tiers published by the mobile client. Values are explicit and
 * never derived from `VideoPresets.hXXX.resolution`, because that getter also
 * carries an `aspectRatio` constraint which react-native-webrtc ignores while
 * Chromium honours it — the two platforms would negotiate different captures.
 */
export type MobileCameraQualityTier = "h720" | "h1080";

export type MobileCameraFacing = "environment" | "user";

/** Codec actually negotiated for the local camera publication. */
export type MobileCameraVideoCodec = "h264" | "vp8";

export const DEFAULT_MOBILE_CAMERA_QUALITY_TIER: MobileCameraQualityTier = "h720";

export function applyMobileVoiceAudioBitrate(
  publishDefaults: TrackPublishDefaults,
  audioBitrate: number,
): TrackPublishDefaults {
  return {
    ...publishDefaults,
    audioPreset: {
      ...publishDefaults.audioPreset,
      maxBitrate: audioBitrate,
    },
  };
}

/** H.264 is the only codec with a hardware encoder on every shipped handset. */
export const MOBILE_CAMERA_VIDEO_CODEC: MobileCameraVideoCodec = "h264";

/**
 * `backupCodec` only applies to SVC codecs, so H.264 has no automatic fallback.
 * A device without a usable H.264 encoder gets one manual VP8 retry instead.
 */
export const MOBILE_CAMERA_FALLBACK_CODEC: MobileCameraVideoCodec = "vp8";

/** Cameras carry motion: keep frames flowing, shed resolution when squeezed. */
export const MOBILE_CAMERA_DEGRADATION_PREFERENCE: RTCDegradationPreference = "maintain-framerate";

export const MOBILE_CAMERA_FRAME_RATE = 30;

const MOBILE_CAMERA_RESOLUTIONS: Record<MobileCameraQualityTier, VideoResolution> = {
  h720: { frameRate: MOBILE_CAMERA_FRAME_RATE, height: 720, width: 1280 },
  h1080: { frameRate: MOBILE_CAMERA_FRAME_RATE, height: 1080, width: 1920 },
};

const MOBILE_CAMERA_ENCODINGS: Record<MobileCameraQualityTier, VideoEncoding> = {
  h720: { maxBitrate: 2_500_000, maxFramerate: MOBILE_CAMERA_FRAME_RATE },
  h1080: { maxBitrate: 3_500_000, maxFramerate: MOBILE_CAMERA_FRAME_RATE },
};

/**
 * One extra layer only. LiveKit's default three-layer ladder makes a phone
 * encode the full stream plus h180 and h360 at the same time, which pins the
 * CPU and starves the primary layer. Read lazily so importing this contract
 * never depends on the livekit-client preset table being initialised.
 */
function getMobileCameraSimulcastLayers(): VideoPreset[] {
  return [VideoPresets.h360];
}

export function isMobileCameraQualityTier(value: unknown): value is MobileCameraQualityTier {
  return value === "h720" || value === "h1080";
}

export function normalizeMobileCameraQualityTier(value: unknown): MobileCameraQualityTier {
  return isMobileCameraQualityTier(value) ? value : DEFAULT_MOBILE_CAMERA_QUALITY_TIER;
}

export function getMobileCameraResolution(
  tier: MobileCameraQualityTier = DEFAULT_MOBILE_CAMERA_QUALITY_TIER,
): VideoResolution {
  return { ...MOBILE_CAMERA_RESOLUTIONS[normalizeMobileCameraQualityTier(tier)] };
}

export function getMobileCameraEncoding(
  tier: MobileCameraQualityTier = DEFAULT_MOBILE_CAMERA_QUALITY_TIER,
): VideoEncoding {
  return { ...MOBILE_CAMERA_ENCODINGS[normalizeMobileCameraQualityTier(tier)] };
}

export function buildMobileCameraCaptureOptions(
  facingMode: MobileCameraFacing,
  tier: MobileCameraQualityTier = DEFAULT_MOBILE_CAMERA_QUALITY_TIER,
): VideoCaptureOptions {
  return {
    facingMode,
    frameRate: MOBILE_CAMERA_FRAME_RATE,
    resolution: getMobileCameraResolution(tier),
  };
}

/**
 * Room publish defaults this module installs that a screen share publication can
 * silently inherit — because `getMobileScreenSharePublishOptions` never restates
 * them.
 *
 * - `simulcast`: identical to livekit-client's own `publishDefaults` baseline
 *   (`true`), so installing it cannot change any publication.
 * - `videoEncoding`: inert. `computeVideoEncodings` overwrites it with
 *   `screenShareEncoding` whenever the source is a screen share.
 * - `videoSimulcastLayers`: inert. The same function reads
 *   `screenShareSimulcastLayers` instead for screen share sources.
 *
 * Every other key on the room defaults must be restated explicitly by
 * `getMobileScreenSharePublishOptions`. The "no silent inheritance" contract
 * test walks `Object.keys(getMobileCameraRoomPublishDefaults())` and enforces
 * exactly that.
 */
export const SCREEN_SHARE_INERT_MOBILE_CAMERA_ROOM_DEFAULT_KEYS = {
  simulcast: "matches livekit-client's own publishDefaults baseline of true",
  videoEncoding: "livekit swaps in screenShareEncoding for screen share sources",
  videoSimulcastLayers: "livekit reads screenShareSimulcastLayers for screen share sources",
} as const satisfies Partial<Record<keyof TrackPublishDefaults, string>>;

/**
 * The full camera publish contract, installed room-wide as a safety net so a
 * camera publish path that forgets `getMobileCameraPublishOptions()` still
 * negotiates hardware H.264 instead of silently dropping to livekit's VP8
 * default.
 *
 * Codec, backup codec and degradation preference used to be withheld here
 * because the same room defaults also feed screen share publications. That
 * reason is gone: `getMobileScreenSharePublishOptions` now sets `videoCodec`,
 * `backupCodec` and `degradationPreference` explicitly, and livekit merges
 * per-publish options over room defaults
 * (`{...roomOptions.publishDefaults, ...options}`), so the camera values here
 * are always overwritten on the share path.
 */
export function getMobileCameraRoomPublishDefaults(
  tier: MobileCameraQualityTier = DEFAULT_MOBILE_CAMERA_QUALITY_TIER,
): TrackPublishDefaults {
  return {
    backupCodec: false,
    degradationPreference: MOBILE_CAMERA_DEGRADATION_PREFERENCE,
    simulcast: true,
    videoCodec: MOBILE_CAMERA_VIDEO_CODEC,
    videoEncoding: getMobileCameraEncoding(tier),
    videoSimulcastLayers: getMobileCameraSimulcastLayers(),
  };
}

export function getMobileCameraPublishOptions(
  tier: MobileCameraQualityTier = DEFAULT_MOBILE_CAMERA_QUALITY_TIER,
  codec: MobileCameraVideoCodec = MOBILE_CAMERA_VIDEO_CODEC,
): TrackPublishOptions {
  return {
    backupCodec: false,
    degradationPreference: MOBILE_CAMERA_DEGRADATION_PREFERENCE,
    simulcast: true,
    source: Track.Source.Camera,
    videoCodec: codec,
    videoEncoding: getMobileCameraEncoding(tier),
    videoSimulcastLayers: getMobileCameraSimulcastLayers(),
  };
}

export function getMobileCameraRoomDefaults(
  facingMode: MobileCameraFacing = "user",
  tier: MobileCameraQualityTier = DEFAULT_MOBILE_CAMERA_QUALITY_TIER,
): {
  publishDefaults: TrackPublishDefaults;
  videoCaptureDefaults: VideoCaptureOptions;
} {
  return {
    publishDefaults: getMobileCameraRoomPublishDefaults(tier),
    videoCaptureDefaults: buildMobileCameraCaptureOptions(facingMode, tier),
  };
}

export type MobileCameraPublishTarget = {
  setCameraEnabled(
    enabled: boolean,
    options?: VideoCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<unknown>;
};

export type MobileCameraPublishResult = {
  codec: MobileCameraVideoCodec;
};

/**
 * Publishes the camera with the H.264 contract and, on failure, retries exactly
 * once with VP8. One retry only: a device that rejects both codecs must surface
 * the error instead of looping.
 */
export async function enableMobileCameraWithCodecFallback(
  target: MobileCameraPublishTarget,
  input: {
    facingMode: MobileCameraFacing;
    tier?: MobileCameraQualityTier;
  },
): Promise<MobileCameraPublishResult> {
  const tier = normalizeMobileCameraQualityTier(input.tier);
  const captureOptions = buildMobileCameraCaptureOptions(input.facingMode, tier);

  try {
    await target.setCameraEnabled(true, captureOptions, getMobileCameraPublishOptions(tier));
    return { codec: MOBILE_CAMERA_VIDEO_CODEC };
  } catch {
    await target.setCameraEnabled(
      true,
      captureOptions,
      getMobileCameraPublishOptions(tier, MOBILE_CAMERA_FALLBACK_CODEC),
    );
    return { codec: MOBILE_CAMERA_FALLBACK_CODEC };
  }
}
