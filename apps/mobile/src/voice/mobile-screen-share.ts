import {
  Track,
  VideoPreset,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
} from "livekit-client";

export type MobileScreenShareQualityId = "h720fps30" | "h1080fps30";

export const DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID: MobileScreenShareQualityId = "h720fps30";

const MOBILE_SCREEN_SHARE_PRESETS: Record<MobileScreenShareQualityId, VideoPreset> = {
  h720fps30: new VideoPreset(1280, 720, 2_000_000, 30),
  h1080fps30: new VideoPreset(1920, 1080, 3_500_000, 30),
};

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

export function getMobileScreenShareCaptureOptions(
  qualityId: unknown = DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
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
  qualityId: unknown = DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
): TrackPublishOptions {
  const preset = MOBILE_SCREEN_SHARE_PRESETS[normalizeMobileScreenShareQualityId(qualityId)];

  return {
    screenShareEncoding: preset.encoding,
    source: Track.Source.ScreenShare,
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
  }

  return issues;
}
