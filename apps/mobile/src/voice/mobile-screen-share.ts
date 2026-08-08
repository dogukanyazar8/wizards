import {
  Track,
  VideoPreset,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type VideoCodec,
} from "livekit-client";

export type MobileScreenShareQualityId = "h720fps30" | "h1080fps30";

export const DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID: MobileScreenShareQualityId = "h720fps30";

/** Ceiling for the mobile ladder: 1080p30 at 4 Mbps, matching the web tiers. */
export const MOBILE_SCREEN_SHARE_MAX_BITRATE = 4_000_000;

const MOBILE_SCREEN_SHARE_PRESETS: Record<MobileScreenShareQualityId, VideoPreset> = {
  h720fps30: new VideoPreset(1280, 720, 2_000_000, 30),
  h1080fps30: new VideoPreset(1920, 1080, MOBILE_SCREEN_SHARE_MAX_BITRATE, 30),
};

/**
 * The share is read as text, so the encoder must drop frames before it drops
 * pixels. Without this WebRTC shrinks the resolution under CPU pressure and the
 * shared screen turns into mush.
 */
export const MOBILE_SCREEN_SHARE_DEGRADATION_PREFERENCE: RTCDegradationPreference =
  "maintain-resolution";

/** Hardware encoder on every shipped handset; no SVC, so no backup codec. */
export const MOBILE_SCREEN_SHARE_VIDEO_CODEC: VideoCodec = "h264";

export const MOBILE_SCREEN_SHARE_QUALITY_OPTIONS = [
  {
    id: "h720fps30",
    label: "720p 30fps",
  },
  {
    id: "h1080fps30",
    label: "1080p 30fps",
  },
] as const satisfies readonly {
  readonly id: MobileScreenShareQualityId;
  readonly label: string;
}[];

export function isMobileScreenShareQualityId(value: unknown): value is MobileScreenShareQualityId {
  return value === "h720fps30" || value === "h1080fps30";
}

export function normalizeMobileScreenShareQualityId(value: unknown): MobileScreenShareQualityId {
  if (isMobileScreenShareQualityId(value)) {
    return value;
  }

  if (value === "h1080fps60") {
    return "h1080fps30";
  }

  return DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID;
}

/**
 * The user's stored choice, mirrored here so a call site that forgets to pass a
 * quality still publishes what the user picked instead of silently falling back
 * to 720p. The voice runtime writes it whenever the stored preferences change.
 */
let preferredMobileScreenShareQualityId: MobileScreenShareQualityId =
  DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID;

export function setPreferredMobileScreenShareQualityId(value: unknown): MobileScreenShareQualityId {
  preferredMobileScreenShareQualityId = normalizeMobileScreenShareQualityId(value);
  return preferredMobileScreenShareQualityId;
}

export function getPreferredMobileScreenShareQualityId(): MobileScreenShareQualityId {
  return preferredMobileScreenShareQualityId;
}

/**
 * `audio: false` is deliberate and unchanged: mobile never captures device audio
 * with a share.
 *
 * The receiving side is a known gap, recorded here because mobile has no module
 * that owns it. Web routes remote audio through `applyRemoteAudioState`, which
 * now covers `Track.Source.ScreenShareAudio` as well as the microphone; mobile
 * has no deafen or per-participant volume path at all, so a share-audio track
 * published by any client simply plays. Closing that needs the volume/deafen
 * infrastructure first, not a change here.
 */
export function getMobileScreenShareCaptureOptions(
  qualityId: unknown = getPreferredMobileScreenShareQualityId(),
): ScreenShareCaptureOptions {
  const preset = MOBILE_SCREEN_SHARE_PRESETS[normalizeMobileScreenShareQualityId(qualityId)];

  return {
    audio: false,
    contentHint: "detail",
    resolution: preset.resolution,
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: "exclude",
    video: true,
  };
}

export function getMobileScreenSharePublishOptions(
  qualityId: unknown = getPreferredMobileScreenShareQualityId(),
): TrackPublishOptions {
  const preset = MOBILE_SCREEN_SHARE_PRESETS[normalizeMobileScreenShareQualityId(qualityId)];

  return {
    // H.264 has no SVC, so there is no backup codec to fall back to.
    backupCodec: false,
    degradationPreference: MOBILE_SCREEN_SHARE_DEGRADATION_PREFERENCE,
    screenShareEncoding: preset.encoding,
    source: Track.Source.ScreenShare,
    videoCodec: MOBILE_SCREEN_SHARE_VIDEO_CODEC,
  };
}

export function validateMobileScreenShareQualityContract(): string[] {
  const issues: string[] = [];
  const optionIds = MOBILE_SCREEN_SHARE_QUALITY_OPTIONS.map((option) => option.id);

  if (DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID !== "h720fps30") {
    issues.push("Mobile screen share must default to h720fps30.");
  }

  if (optionIds.includes("h1440fps60" as MobileScreenShareQualityId)) {
    issues.push("Mobile screen share must not expose 1440p60 capture.");
  }

  for (const option of MOBILE_SCREEN_SHARE_QUALITY_OPTIONS) {
    const captureOptions = getMobileScreenShareCaptureOptions(option.id);
    const publishOptions = getMobileScreenSharePublishOptions(option.id);

    if (captureOptions.audio !== false) {
      issues.push(`${option.id} must not capture device audio in phase 1.`);
    }

    if (captureOptions.contentHint !== "detail") {
      issues.push(`${option.id} must prefer detailed screen content.`);
    }

    if ((captureOptions.resolution?.height ?? 0) > 1080) {
      issues.push(`${option.id} must stay at or below 1080p on mobile.`);
    }

    if ((captureOptions.resolution?.frameRate ?? 0) > 30) {
      issues.push(`${option.id} must stay at or below 30fps on mobile.`);
    }

    if (publishOptions.source !== Track.Source.ScreenShare) {
      issues.push(`${option.id} must publish as a LiveKit screen share source.`);
    }

    if ((publishOptions.screenShareEncoding?.maxFramerate ?? 0) > 30) {
      issues.push(`${option.id} publish encoding must stay at or below 30fps.`);
    }

    if ((publishOptions.screenShareEncoding?.maxBitrate ?? 0) > MOBILE_SCREEN_SHARE_MAX_BITRATE) {
      issues.push(`${option.id} publish encoding must stay at or below 4 Mbps on mobile.`);
    }

    if (publishOptions.videoCodec !== MOBILE_SCREEN_SHARE_VIDEO_CODEC) {
      issues.push(`${option.id} must publish with the hardware H.264 encoder.`);
    }

    if (publishOptions.degradationPreference !== MOBILE_SCREEN_SHARE_DEGRADATION_PREFERENCE) {
      issues.push(`${option.id} must hold resolution instead of framerate.`);
    }
  }

  return issues;
}
