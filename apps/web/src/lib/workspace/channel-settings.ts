import type { WorkspaceChannelType } from "@wizards/types";

import { ApiError } from "@/lib/api";

type ChannelSettingsInput = {
  bitrate?: number | undefined;
  rtcRegion?: string | null | undefined;
  slowModeDelay?: number | undefined;
  userLimit?: number | undefined;
  videoQualityMode?: "AUTO" | "FULL" | undefined;
};

type PersistedChannelSettings = {
  bitrate?: number;
  rtcRegion?: string | null;
  slowModeDelay?: number;
  userLimit?: number;
  videoQualityMode?: "AUTO" | "FULL";
};

type ChannelCreateSettingsInput = ChannelSettingsInput & { type: WorkspaceChannelType };
type PersistedChannelCreateSettings =
  | { slowModeDelay: number }
  | {
      bitrate: number;
      rtcRegion: string | null;
      userLimit: number;
      videoQualityMode: "AUTO" | "FULL";
    };

function normalizeRtcRegion(region: string | null | undefined) {
  return !region || region === "AUTO" ? null : region;
}

function assertSettingsMatchChannelType(type: WorkspaceChannelType, input: ChannelSettingsInput) {
  if (
    type === "TEXT" &&
    (input.bitrate !== undefined ||
      input.rtcRegion !== undefined ||
      input.userLimit !== undefined ||
      input.videoQualityMode !== undefined)
  ) {
    throw new ApiError("Voice settings are not available for text channels", 400);
  }

  if (type === "VOICE" && input.slowModeDelay !== undefined) {
    throw new ApiError("Slow mode is not available for voice channels", 400);
  }
}

export function buildChannelCreateSettings(
  input: ChannelCreateSettingsInput,
): PersistedChannelCreateSettings {
  assertSettingsMatchChannelType(input.type, input);

  if (input.type === "TEXT") {
    return { slowModeDelay: input.slowModeDelay ?? 0 };
  }

  return {
    bitrate: input.bitrate ?? 64_000,
    rtcRegion: normalizeRtcRegion(input.rtcRegion),
    userLimit: input.userLimit ?? 0,
    videoQualityMode: input.videoQualityMode ?? "AUTO",
  };
}

export function buildChannelUpdateSettings(
  type: WorkspaceChannelType,
  input: ChannelSettingsInput,
): PersistedChannelSettings {
  assertSettingsMatchChannelType(type, input);

  if (type === "TEXT") {
    return input.slowModeDelay === undefined ? {} : { slowModeDelay: input.slowModeDelay };
  }

  return {
    ...(input.bitrate === undefined ? {} : { bitrate: input.bitrate }),
    ...(input.rtcRegion === undefined ? {} : { rtcRegion: normalizeRtcRegion(input.rtcRegion) }),
    ...(input.userLimit === undefined ? {} : { userLimit: input.userLimit }),
    ...(input.videoQualityMode === undefined ? {} : { videoQualityMode: input.videoQualityMode }),
  };
}
