export type DesktopRichPresenceAudience = "friends" | "nobody";

export type DesktopStreamerModeReason = "detected" | "manual" | "off";

export interface DesktopStreamerModeResolution {
  active: boolean;
  detectedExecutableName: string | null;
  reason: DesktopStreamerModeReason;
}

export const DEFAULT_DESKTOP_RICH_PRESENCE_AUDIENCE: DesktopRichPresenceAudience = "nobody";

const MAX_DESKTOP_STREAMING_EXECUTABLE_NAME_LENGTH = 128;

export const DESKTOP_STREAMING_EXECUTABLE_NAMES = [
  "obs.exe",
  "obs32.exe",
  "obs64.exe",
  "streamlabs desktop.exe",
  "streamlabs obs.exe",
  "xsplit broadcaster.exe",
  "xsplit.core.exe",
] as const;

const DESKTOP_STREAMING_EXECUTABLE_WHITELIST: ReadonlySet<string> = new Set(
  DESKTOP_STREAMING_EXECUTABLE_NAMES,
);

export function sanitizeDesktopRichPresenceAudience(value: unknown): DesktopRichPresenceAudience {
  return value === "friends" || value === "nobody" ? value : DEFAULT_DESKTOP_RICH_PRESENCE_AUDIENCE;
}

function normalizeDesktopProcessBasename(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const rawBasename = value.split(/[\\/]/u).pop() ?? "";
  if (/[\0\r\n]/u.test(rawBasename)) {
    return null;
  }

  const basename = rawBasename.replace(/\s+/g, " ").trim();
  if (basename.length === 0 || basename.length > MAX_DESKTOP_STREAMING_EXECUTABLE_NAME_LENGTH) {
    return null;
  }

  return basename.toLowerCase();
}

export function isWhitelistedDesktopStreamingExecutable(value: unknown) {
  const executableName = normalizeDesktopProcessBasename(value);
  return executableName ? DESKTOP_STREAMING_EXECUTABLE_WHITELIST.has(executableName) : false;
}

export function resolveDesktopStreamerMode({
  foregroundProcessName,
  manualEnabled,
  processDetectionEnabled,
}: {
  foregroundProcessName: string | null;
  manualEnabled: boolean;
  processDetectionEnabled: boolean;
}): DesktopStreamerModeResolution {
  if (manualEnabled) {
    return {
      active: true,
      detectedExecutableName: null,
      reason: "manual",
    };
  }

  if (!processDetectionEnabled) {
    return {
      active: false,
      detectedExecutableName: null,
      reason: "off",
    };
  }

  const executableName = normalizeDesktopProcessBasename(foregroundProcessName);
  if (!executableName || !DESKTOP_STREAMING_EXECUTABLE_WHITELIST.has(executableName)) {
    return {
      active: false,
      detectedExecutableName: null,
      reason: "off",
    };
  }

  return {
    active: true,
    detectedExecutableName: executableName,
    reason: "detected",
  };
}

export function canPublishDesktopRichPresence({
  audience,
  enabled,
}: {
  audience: DesktopRichPresenceAudience;
  enabled: boolean;
}) {
  return enabled && audience === "friends";
}
