import {
  CHANNEL_BITRATE_OPTIONS,
  CHANNEL_SLOW_MODE_DELAYS,
  CHANNEL_USER_LIMIT_MAX,
  CHANNEL_VIDEO_QUALITY_MODES,
  type WorkspaceChannel,
  type WorkspaceChannelPermissionPreset,
} from "@wizards/types";

export type ChannelAdvancedSettings = Pick<
  WorkspaceChannel,
  "bitrate" | "rtcRegion" | "slowModeDelay" | "userLimit" | "videoQualityMode"
>;

export type CreateChannelDraft = {
  advancedSettings: ChannelAdvancedSettings;
  allowedRoleIds: readonly string[];
  categoryId: string | null;
  name: string;
  preset: WorkspaceChannelPermissionPreset;
  topic: string;
  type: WorkspaceChannel["type"];
};

export function hasCreateChannelProgress(
  current: CreateChannelDraft,
  baseline: CreateChannelDraft,
): boolean {
  const currentRoles = [...current.allowedRoleIds].sort();
  const baselineRoles = [...baseline.allowedRoleIds].sort();

  return (
    current.name.trim().length > 0 ||
    current.topic.trim().length > 0 ||
    current.type !== baseline.type ||
    current.categoryId !== baseline.categoryId ||
    current.preset !== baseline.preset ||
    currentRoles.length !== baselineRoles.length ||
    currentRoles.some((roleId, index) => roleId !== baselineRoles[index]) ||
    current.advancedSettings.bitrate !== baseline.advancedSettings.bitrate ||
    current.advancedSettings.rtcRegion !== baseline.advancedSettings.rtcRegion ||
    current.advancedSettings.slowModeDelay !== baseline.advancedSettings.slowModeDelay ||
    current.advancedSettings.userLimit !== baseline.advancedSettings.userLimit ||
    current.advancedSettings.videoQualityMode !== baseline.advancedSettings.videoQualityMode
  );
}

export function createChannelAdvancedSettings(
  channel?: Partial<ChannelAdvancedSettings> | null,
): ChannelAdvancedSettings {
  return {
    bitrate: channel?.bitrate ?? 64_000,
    rtcRegion: channel?.rtcRegion ?? null,
    slowModeDelay: channel?.slowModeDelay ?? 0,
    userLimit: channel?.userLimit ?? 0,
    videoQualityMode: channel?.videoQualityMode ?? "AUTO",
  };
}

export function getChannelAdvancedSettingsInput(
  type: WorkspaceChannel["type"],
  settings: ChannelAdvancedSettings,
) {
  if (type === "TEXT") {
    return { slowModeDelay: settings.slowModeDelay } as const;
  }

  return {
    bitrate: settings.bitrate,
    rtcRegion: settings.rtcRegion,
    userLimit: settings.userLimit,
    videoQualityMode: settings.videoQualityMode,
  } as const;
}

export function isChannelAdvancedSettingsValid(
  type: WorkspaceChannel["type"],
  settings: ChannelAdvancedSettings,
  availableRtcRegions: readonly string[] = [],
) {
  if (type === "TEXT") {
    return CHANNEL_SLOW_MODE_DELAYS.some((delay) => delay === settings.slowModeDelay);
  }

  return (
    CHANNEL_BITRATE_OPTIONS.some((bitrate) => bitrate === settings.bitrate) &&
    Number.isInteger(settings.userLimit) &&
    settings.userLimit >= 0 &&
    settings.userLimit <= CHANNEL_USER_LIMIT_MAX &&
    (settings.rtcRegion === null || availableRtcRegions.includes(settings.rtcRegion)) &&
    CHANNEL_VIDEO_QUALITY_MODES.includes(settings.videoQualityMode)
  );
}
