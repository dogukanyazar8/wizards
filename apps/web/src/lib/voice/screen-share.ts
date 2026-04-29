import {
  ScreenSharePresets,
  Track,
  VideoPreset,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type VideoEncoding,
} from "livekit-client";

export type ScreenShareQualityId =
  | "h1080fps30"
  | "h720fps30"
  | "h720fps60"
  | "h1080fps60"
  | "h1440fps30";

export type ScreenShareQualityOption = {
  descriptionKey: string;
  id: ScreenShareQualityId;
  labelKey: string;
  shortLabel: string;
};

export const DEFAULT_SCREEN_SHARE_QUALITY_ID: ScreenShareQualityId = "h1080fps30";

const H720_FPS60_PRESET = new VideoPreset(1280, 720, 3_500_000, 60);
const H1080_FPS60_PRESET = new VideoPreset(1920, 1080, 6_000_000, 60);
const H1440_FPS30_PRESET = new VideoPreset(2560, 1440, 8_500_000, 30);

const SCREEN_SHARE_PRESETS: Record<ScreenShareQualityId, VideoPreset> = {
  h1080fps30: ScreenSharePresets.h1080fps30,
  h720fps30: ScreenSharePresets.h720fps30,
  h720fps60: H720_FPS60_PRESET,
  h1080fps60: H1080_FPS60_PRESET,
  h1440fps30: H1440_FPS30_PRESET,
};

export const SCREEN_SHARE_QUALITY_OPTIONS: ScreenShareQualityOption[] = [
  {
    descriptionKey: "voice.screenShare.quality.72030.description",
    id: "h720fps30",
    labelKey: "voice.screenShare.quality.72030.label",
    shortLabel: "720p 30",
  },
  {
    descriptionKey: "voice.screenShare.quality.108030.description",
    id: "h1080fps30",
    labelKey: "voice.screenShare.quality.108030.label",
    shortLabel: "1080p 30",
  },
  {
    descriptionKey: "voice.screenShare.quality.72060.description",
    id: "h720fps60",
    labelKey: "voice.screenShare.quality.72060.label",
    shortLabel: "720p 60",
  },
  {
    descriptionKey: "voice.screenShare.quality.108060.description",
    id: "h1080fps60",
    labelKey: "voice.screenShare.quality.108060.label",
    shortLabel: "1080p 60",
  },
  {
    descriptionKey: "voice.screenShare.quality.144030.description",
    id: "h1440fps30",
    labelKey: "voice.screenShare.quality.144030.label",
    shortLabel: "1440p 30",
  },
];

export function isScreenShareQualityId(value: unknown): value is ScreenShareQualityId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SCREEN_SHARE_PRESETS, value)
  );
}

export function getScreenShareQualityPreset(qualityId: ScreenShareQualityId) {
  return SCREEN_SHARE_PRESETS[qualityId];
}

export function getScreenShareCaptureOptions(
  qualityId: ScreenShareQualityId,
): ScreenShareCaptureOptions {
  const preset = getScreenShareQualityPreset(qualityId);

  return {
    audio: false,
    contentHint: "detail",
    resolution: preset.resolution,
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
  };
}

export function getScreenSharePublishOptions(
  qualityId: ScreenShareQualityId,
): TrackPublishOptions {
  const preset = getScreenShareQualityPreset(qualityId);

  return {
    screenShareEncoding: preset.encoding,
    source: Track.Source.ScreenShare,
  };
}

export function buildScreenShareMediaConstraints(
  qualityId: ScreenShareQualityId,
): MediaTrackConstraints {
  const preset = getScreenShareQualityPreset(qualityId);
  const frameRate = preset.encoding.maxFramerate ?? preset.resolution.frameRate ?? 15;

  return {
    frameRate: { ideal: frameRate },
    height: { ideal: preset.height },
    width: { ideal: preset.width },
  };
}

export function applyScreenShareEncodingToSender(
  sender: RTCRtpSender,
  encoding: VideoEncoding,
) {
  const parameters = sender.getParameters();
  const baseEncodings =
    parameters.encodings && parameters.encodings.length > 0
      ? parameters.encodings
      : [{} as RTCRtpEncodingParameters];

  const encodings = baseEncodings.map((entry) => {
    const nextEntry: RTCRtpEncodingParameters = {
      ...entry,
      maxBitrate: encoding.maxBitrate,
    };

    if (typeof encoding.maxFramerate === "number") {
      nextEntry.maxFramerate = encoding.maxFramerate;
    }

    return nextEntry;
  });

  return sender.setParameters({
    ...parameters,
    encodings,
  });
}
