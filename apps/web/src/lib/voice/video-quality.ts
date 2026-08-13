import {
  Track,
  type ScalabilityMode,
  type TrackPublishDefaults,
  type TrackPublishOptions,
  type VideoCaptureOptions,
  type VideoCodec,
  type VideoEncoding,
  type VideoResolution,
} from "livekit-client";

/**
 * Camera quality tiers published by web and desktop clients. The tier decides
 * capture resolution and the explicit encoder budget; nothing here is derived
 * from `VideoPresets`, because those presets also carry an `aspectRatio`
 * constraint that pillarboxes the capture on Chromium.
 */
export type CameraQualityTier = "h720" | "h1080";

export const DEFAULT_CAMERA_QUALITY_TIER: CameraQualityTier = "h1080";

export function applyVoiceAudioBitrate(
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

/** VP9 buys ~30% bitrate efficiency over VP8 at the same perceived quality. */
export const CAMERA_VIDEO_CODEC: VideoCodec = "vp9";

/** Temporal + spatial SVC layers, key-frame aligned, so SFU can drop layers. */
export const CAMERA_SCALABILITY_MODE: ScalabilityMode = "L3T3_KEY";

/** Cameras carry motion: keep frames flowing, shed resolution when squeezed. */
export const CAMERA_DEGRADATION_PREFERENCE: RTCDegradationPreference = "maintain-framerate";

export const CAMERA_FRAME_RATE = 30;

const CAMERA_RESOLUTIONS: Record<CameraQualityTier, VideoResolution> = {
  h720: { frameRate: CAMERA_FRAME_RATE, height: 720, width: 1280 },
  h1080: { frameRate: CAMERA_FRAME_RATE, height: 1080, width: 1920 },
};

const CAMERA_ENCODINGS: Record<CameraQualityTier, VideoEncoding> = {
  h720: { maxBitrate: 2_500_000, maxFramerate: CAMERA_FRAME_RATE },
  h1080: { maxBitrate: 4_000_000, maxFramerate: CAMERA_FRAME_RATE },
};

export function isCameraQualityTier(value: unknown): value is CameraQualityTier {
  return value === "h720" || value === "h1080";
}

export function normalizeCameraQualityTier(value: unknown): CameraQualityTier {
  return isCameraQualityTier(value) ? value : DEFAULT_CAMERA_QUALITY_TIER;
}

export function getCameraResolution(
  tier: CameraQualityTier = DEFAULT_CAMERA_QUALITY_TIER,
): VideoResolution {
  return { ...CAMERA_RESOLUTIONS[normalizeCameraQualityTier(tier)] };
}

export function getCameraEncoding(
  tier: CameraQualityTier = DEFAULT_CAMERA_QUALITY_TIER,
): VideoEncoding {
  return { ...CAMERA_ENCODINGS[normalizeCameraQualityTier(tier)] };
}

export function getCameraCaptureOptions(
  tier: CameraQualityTier = DEFAULT_CAMERA_QUALITY_TIER,
  deviceId?: string,
): VideoCaptureOptions {
  const options: VideoCaptureOptions = {
    facingMode: "user",
    frameRate: { ideal: CAMERA_FRAME_RATE, max: CAMERA_FRAME_RATE },
    resolution: getCameraResolution(tier),
  };

  if (deviceId) {
    options.deviceId = deviceId;
  }

  return options;
}

/**
 * Room publish defaults this module installs that a screen share publication can
 * silently inherit — because `getScreenSharePublishOptions` never restates them.
 *
 * - `videoEncoding`: inert. `computeVideoEncodings` overwrites it with
 *   `screenShareEncoding` whenever the source is a screen share, so the camera
 *   budget can never reach a share.
 *
 * Every other key on the room defaults must be restated explicitly by
 * `getScreenSharePublishOptions`. The "no silent inheritance" contract test
 * walks `Object.keys(getCameraRoomPublishDefaults())` and enforces exactly that.
 */
export const SCREEN_SHARE_INERT_CAMERA_ROOM_DEFAULT_KEYS = {
  videoEncoding: "livekit swaps in screenShareEncoding for screen share sources",
} as const satisfies Partial<Record<keyof TrackPublishDefaults, string>>;

/**
 * The full camera publish contract, installed room-wide as a safety net so a
 * camera publish path that forgets `getCameraPublishOptions()` still negotiates
 * VP9 SVC instead of silently dropping to livekit's VP8 default.
 *
 * Codec, SVC mode, backup codec and degradation preference used to be withheld
 * here because the same room defaults also feed screen share publications. That
 * reason is gone: `getScreenSharePublishOptions` now sets `videoCodec`,
 * `scalabilityMode`, `backupCodec` and `degradationPreference` explicitly, and
 * livekit merges per-publish options over room defaults
 * (`{...roomOptions.publishDefaults, ...options}`), so the camera values here
 * are always overwritten on the share path.
 */
export function getCameraRoomPublishDefaults(
  tier: CameraQualityTier = DEFAULT_CAMERA_QUALITY_TIER,
): TrackPublishDefaults {
  return {
    backupCodec: true,
    degradationPreference: CAMERA_DEGRADATION_PREFERENCE,
    scalabilityMode: CAMERA_SCALABILITY_MODE,
    videoCodec: CAMERA_VIDEO_CODEC,
    videoEncoding: getCameraEncoding(tier),
  };
}

export function getCameraPublishOptions(
  tier: CameraQualityTier = DEFAULT_CAMERA_QUALITY_TIER,
): TrackPublishOptions {
  return {
    backupCodec: true,
    degradationPreference: CAMERA_DEGRADATION_PREFERENCE,
    scalabilityMode: CAMERA_SCALABILITY_MODE,
    source: Track.Source.Camera,
    videoCodec: CAMERA_VIDEO_CODEC,
    videoEncoding: getCameraEncoding(tier),
  };
}

export function getCameraRoomDefaults(
  tier: CameraQualityTier = DEFAULT_CAMERA_QUALITY_TIER,
  deviceId?: string,
): {
  publishDefaults: TrackPublishDefaults;
  videoCaptureDefaults: VideoCaptureOptions;
} {
  return {
    publishDefaults: getCameraRoomPublishDefaults(tier),
    videoCaptureDefaults: getCameraCaptureOptions(tier, deviceId),
  };
}
