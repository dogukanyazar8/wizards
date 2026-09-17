import {
  getScreenShareBitrateKbps,
  SCREEN_SHARE_RESOLUTION_DIMENSIONS,
  splitScreenShareQualityId,
  type ScreenShareResolution,
  type ScreenShareFrameRate,
  type ScreenShareMode,
} from "@wizards/types";
import type { ScreenShareCodecChoice } from "./screen-share-codec";
import {
  Track,
  VideoPreset,
  type ScalabilityMode,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type VideoCodec,
  type VideoEncoding,
} from "livekit-client";

export type ScreenShareQualityId = "h720fps60" | "h1080fps60" | "h1440fps60";

export type ScreenShareQualityOption = {
  descriptionKey: string;
  id: ScreenShareQualityId;
  labelKey: string;
  shortLabel: string;
};

export const DEFAULT_SCREEN_SHARE_QUALITY_ID: ScreenShareQualityId = "h1080fps60";

export function getScreenSharePreset(
  resolution: ScreenShareResolution,
  frameRate: ScreenShareFrameRate,
  mode: ScreenShareMode,
) {
  const size = SCREEN_SHARE_RESOLUTION_DIMENSIONS[resolution];
  return new VideoPreset(
    size.width,
    size.height,
    getScreenShareBitrateKbps(mode, resolution, frameRate) * 1000,
    frameRate,
  );
}

const SCREEN_SHARE_PRESETS = {
  h720fps60: getScreenSharePreset("h720", 60, "text"),
  h1080fps60: getScreenSharePreset("h1080", 60, "text"),
  h1440fps60: getScreenSharePreset("h1440", 60, "text"),
};

export function resolveCapturedScreenShareResolution(
  requested: ScreenShareResolution,
  height: number | undefined,
): ScreenShareResolution {
  if (requested !== "h2160" || height === undefined || height >= 2160) return requested;
  return height >= 1440 ? "h1440" : height >= 1080 ? "h1080" : "h720";
}

const LEGACY_SCREEN_SHARE_QUALITY_ALIASES: Record<string, ScreenShareQualityId> = {
  h720fps30: "h720fps60",
  h1080fps30: "h1080fps60",
  h1440fps30: "h1440fps60",
};

export const SCREEN_SHARE_QUALITY_OPTIONS: ScreenShareQualityOption[] = [
  {
    descriptionKey: "voice.screenShare.quality.72060.description",
    id: "h720fps60",
    labelKey: "voice.screenShare.quality.72060.label",
    shortLabel: "720p",
  },
  {
    descriptionKey: "voice.screenShare.quality.108060.description",
    id: "h1080fps60",
    labelKey: "voice.screenShare.quality.108060.label",
    shortLabel: "1080p",
  },
  {
    descriptionKey: "voice.screenShare.quality.144060.description",
    id: "h1440fps60",
    labelKey: "voice.screenShare.quality.144060.label",
    shortLabel: "1440p",
  },
];

export function isScreenShareQualityId(value: unknown): value is ScreenShareQualityId {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(SCREEN_SHARE_PRESETS, value)
  );
}

export function normalizeScreenShareQualityId(value: unknown): ScreenShareQualityId {
  if (isScreenShareQualityId(value)) {
    return value;
  }

  if (typeof value === "string" && value in LEGACY_SCREEN_SHARE_QUALITY_ALIASES) {
    return LEGACY_SCREEN_SHARE_QUALITY_ALIASES[value] ?? DEFAULT_SCREEN_SHARE_QUALITY_ID;
  }

  return DEFAULT_SCREEN_SHARE_QUALITY_ID;
}

export function getScreenShareQualityPreset(qualityId: ScreenShareQualityId) {
  const axes = splitScreenShareQualityId(qualityId)!;
  return getScreenSharePreset(axes.resolution, axes.frameRate, "text");
}

/**
 * The constraint a browser only knows about if it can capture the audio playing
 * on the surface being shared. Chromium reports it; Firefox and Safari do not,
 * and they also return a silent share, so this one name is the whole capability
 * question.
 */
const SCREEN_SHARE_AUDIO_CONSTRAINT = "suppressLocalAudioPlayback";

/** The slice of `MediaDevices` the capability probe reads. */
export type ScreenShareAudioCapabilityProbe = {
  getDisplayMedia?: unknown;
  getSupportedConstraints?: () => unknown;
};

/**
 * Whether this browser can capture the shared surface's audio at all.
 *
 * A capability probe, not a browser sniff: it asks whether display capture
 * exists and whether the audio-playback constraint is among the supported
 * constraints. A Chromium fork that drops the feature reports the truth, and a
 * browser that later gains it starts working without a version table.
 */
export function isScreenShareAudioSupported(
  mediaDevices: ScreenShareAudioCapabilityProbe | null | undefined = typeof navigator ===
  "undefined"
    ? null
    : navigator.mediaDevices,
): boolean {
  if (typeof mediaDevices?.getDisplayMedia !== "function") {
    return false;
  }

  if (typeof mediaDevices.getSupportedConstraints !== "function") {
    return false;
  }

  try {
    const constraints = mediaDevices.getSupportedConstraints() as Record<string, unknown> | null;

    return constraints?.[SCREEN_SHARE_AUDIO_CONSTRAINT] === true;
  } catch {
    // A probe must never be the reason a share cannot start.
    return false;
  }
}

/**
 * `shareSystemAudio` is the user's stored preference, off by default.
 *
 * When it is on the browser is asked for the surface's audio, told to offer
 * system audio as a source, and told to stop playing the captured audio out of
 * the sharer's own speakers — otherwise the sharer hears their own tab twice.
 * The behavior preferences are picker hints. Self exclusion covers the current
 * browser tab, not every application window or a full-monitor capture.
 *
 * None of this is a requirement: a browser without the feature, or a user who
 * leaves the picker's audio checkbox unticked, simply produces a video-only
 * stream. That is a normal share, not a failure.
 */
type CaptureAxes = {
  resolution: ScreenShareResolution;
  frameRate: ScreenShareFrameRate;
  mode: ScreenShareMode;
  shareSystemAudio?: boolean;
  excludeSelfWindow?: boolean;
  allowSourceSwitch?: boolean;
};
export function getScreenShareCaptureOptions(
  qualityId: ScreenShareQualityId | CaptureAxes,
  {
    shareSystemAudio = false,
    excludeSelfWindow = true,
    allowSourceSwitch = true,
  }: {
    shareSystemAudio?: boolean;
    excludeSelfWindow?: boolean;
    allowSourceSwitch?: boolean;
  } = {},
): ScreenShareCaptureOptions {
  const axes =
    typeof qualityId === "string"
      ? { ...splitScreenShareQualityId(qualityId)!, mode: "text" as const }
      : qualityId;
  if (typeof qualityId !== "string") {
    shareSystemAudio = qualityId.shareSystemAudio ?? false;
    excludeSelfWindow = qualityId.excludeSelfWindow ?? true;
    allowSourceSwitch = qualityId.allowSourceSwitch ?? true;
  }
  const preset = getScreenSharePreset(axes.resolution, axes.frameRate, axes.mode);
  const contentHint = axes.mode === "motion" ? "motion" : "detail";

  if (!shareSystemAudio) {
    return {
      audio: false,
      contentHint,
      resolution: preset.resolution,
      selfBrowserSurface: excludeSelfWindow ? "exclude" : "include",
      surfaceSwitching: allowSourceSwitch ? "include" : "exclude",
    };
  }

  return {
    audio: true,
    contentHint,
    resolution: preset.resolution,
    selfBrowserSurface: excludeSelfWindow ? "exclude" : "include",
    suppressLocalAudioPlayback: true,
    surfaceSwitching: allowSourceSwitch ? "include" : "exclude",
    systemAudio: "include",
  };
}

/**
 * A shared screen is read as text, so the encoder drops frames before it drops
 * pixels. Left unset, WebRTC shrinks the resolution under CPU pressure and the
 * share turns unreadable.
 */
export const SCREEN_SHARE_DEGRADATION_PREFERENCE: RTCDegradationPreference = "maintain-resolution";

export const SCREEN_SHARE_VIDEO_CODEC: VideoCodec = "vp9";

/** Temporal + spatial SVC layers, key-frame aligned, so the SFU can drop layers. */
export const SCREEN_SHARE_SCALABILITY_MODE: ScalabilityMode = "L3T3_KEY";

export function getScreenSharePublishOptions(
  input:
    | ScreenShareQualityId
    | { preset: VideoPreset; codecChoice: ScreenShareCodecChoice; mode: ScreenShareMode },
): TrackPublishOptions {
  const { preset, codecChoice, mode } =
    typeof input === "string"
      ? {
          preset: getScreenShareQualityPreset(input),
          codecChoice: { codec: "vp9" as const },
          mode: "text",
        }
      : input;
  const h264 = codecChoice.codec === "h264";
  return {
    backupCodec: !h264,
    degradationPreference: mode === "motion" ? "maintain-framerate" : "maintain-resolution",
    ...(h264
      ? {
          simulcast: true,
          screenShareSimulcastLayers: [2, 4].map(
            (scale) =>
              new VideoPreset(
                Math.round(preset.width / scale),
                Math.round(preset.height / scale),
                Math.round(preset.encoding.maxBitrate / (scale * scale)),
                preset.encoding.maxFramerate,
              ),
          ),
        }
      : { scalabilityMode: SCREEN_SHARE_SCALABILITY_MODE }),
    screenShareEncoding: preset.encoding,
    source: Track.Source.ScreenShare,
    videoCodec: codecChoice.codec,
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

type ScalableRtpEncodingParameters = RTCRtpEncodingParameters & {
  scalabilityMode?: string;
};

export function isScalableScreenShareEncoding(
  encodings: readonly RTCRtpEncodingParameters[] | undefined,
): boolean {
  return (encodings ?? []).some(
    (entry) => typeof (entry as ScalableRtpEncodingParameters).scalabilityMode === "string",
  );
}

/**
 * Re-applies the selected quality ceiling to a live sender.
 *
 * Simulcast and SVC lay their encodings out differently: simulcast publishes one
 * entry per spatial layer, SVC publishes a single entry that carries
 * `scalabilityMode` and expands into layers inside the encoder. Writing the same
 * bitrate onto every entry is right for simulcast but would flatten an SVC send
 * into whatever the last entry said, so under SVC only the first encoding is
 * rewritten and its `scalabilityMode` is preserved untouched. Dropping that
 * field silently collapses the share to a single layer.
 */
export function applyScreenShareEncodingToSender(sender: RTCRtpSender, encoding: VideoEncoding) {
  const parameters = sender.getParameters();
  const baseEncodings =
    parameters.encodings && parameters.encodings.length > 0
      ? parameters.encodings
      : [{} as RTCRtpEncodingParameters];
  const isScalable = isScalableScreenShareEncoding(parameters.encodings);

  const applyEncoding = (entry: RTCRtpEncodingParameters): RTCRtpEncodingParameters => {
    const nextEntry: RTCRtpEncodingParameters = {
      ...entry,
      maxBitrate: encoding.maxBitrate,
    };

    if (typeof encoding.maxFramerate === "number") {
      nextEntry.maxFramerate = encoding.maxFramerate;
    }

    return nextEntry;
  };

  const encodings = isScalable
    ? baseEncodings.map((entry, index) => (index === 0 ? applyEncoding(entry) : entry))
    : baseEncodings.map(applyEncoding);

  return sender.setParameters({
    ...parameters,
    encodings,
  });
}
