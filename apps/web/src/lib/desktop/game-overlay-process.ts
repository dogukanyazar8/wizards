"use client";

import type { VoiceOverlayAnchor, VoiceOverlaySize } from "@wizards/types";
import {
  DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR,
  DEFAULT_DESKTOP_GAME_OVERLAY_SIZE,
  DEFAULT_DESKTOP_GAME_OVERLAY_SPEAKING_ONLY,
  sanitizeDesktopGameOverlayAnchor,
  sanitizeDesktopGameOverlaySize,
} from "@/lib/desktop/voice-mini";

const MAX_EXECUTABLE_NAME_LENGTH = 128;
export const MAX_DESKTOP_GAME_OVERLAY_GAME_SETTINGS = 64;

export const DESKTOP_GAME_OVERLAY_EXECUTABLE_NAMES = [
  "cs2.exe",
  "dota2.exe",
  "fortniteclient-win64-shipping.exe",
  "javaw.exe",
  "league of legends.exe",
  "minecraft.exe",
  "osu!.exe",
  "osu.exe",
  "rocketleague.exe",
  "valorant-win64-shipping.exe",
] as const;

const DESKTOP_GAME_OVERLAY_EXECUTABLE_WHITELIST: ReadonlySet<string> = new Set(
  DESKTOP_GAME_OVERLAY_EXECUTABLE_NAMES,
);

export interface DesktopGameOverlayGamePreference {
  anchor: VoiceOverlayAnchor;
  enabled: boolean;
  size: VoiceOverlaySize;
  speakingOnly: boolean;
}

export type DesktopGameOverlayGameSettings = Record<string, DesktopGameOverlayGamePreference>;

export const DEFAULT_DESKTOP_GAME_OVERLAY_GAME_PREFERENCE: DesktopGameOverlayGamePreference = {
  anchor: DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR,
  enabled: true,
  size: DEFAULT_DESKTOP_GAME_OVERLAY_SIZE,
  speakingOnly: DEFAULT_DESKTOP_GAME_OVERLAY_SPEAKING_ONLY,
};

export function sanitizeDesktopExecutableName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const rawBasename = value.split(/[\\/]/u).pop() ?? "";
  if (/[\0\r\n]/u.test(rawBasename)) {
    return null;
  }

  const basename = rawBasename.replace(/\s+/g, " ").trim();
  if (basename.length === 0 || basename.length > MAX_EXECUTABLE_NAME_LENGTH) {
    return null;
  }

  return basename;
}

export function normalizeDesktopExecutableName(value: unknown) {
  return sanitizeDesktopExecutableName(value)?.toLowerCase() ?? null;
}

export function isWhitelistedDesktopGameExecutable(value: unknown) {
  const executableName = normalizeDesktopExecutableName(value);
  return executableName ? DESKTOP_GAME_OVERLAY_EXECUTABLE_WHITELIST.has(executableName) : false;
}

export function sanitizeDesktopGameOverlayGamePreference(
  value: unknown,
): DesktopGameOverlayGamePreference {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_DESKTOP_GAME_OVERLAY_GAME_PREFERENCE;
  }

  const record = value as Record<string, unknown>;
  return {
    anchor: sanitizeDesktopGameOverlayAnchor(record.anchor),
    enabled: record.enabled !== false,
    size: sanitizeDesktopGameOverlaySize(record.size),
    speakingOnly:
      typeof record.speakingOnly === "boolean"
        ? record.speakingOnly
        : DEFAULT_DESKTOP_GAME_OVERLAY_SPEAKING_ONLY,
  };
}

export function sanitizeDesktopGameOverlayGameSettings(
  value: unknown,
): DesktopGameOverlayGameSettings {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, preference]) => {
        const executableName = normalizeDesktopExecutableName(key);
        if (!executableName || !isWhitelistedDesktopGameExecutable(executableName)) {
          return null;
        }

        return [executableName, sanitizeDesktopGameOverlayGamePreference(preference)] as const;
      })
      .filter((entry): entry is readonly [string, DesktopGameOverlayGamePreference] =>
        Boolean(entry),
      )
      .slice(0, MAX_DESKTOP_GAME_OVERLAY_GAME_SETTINGS),
  );
}

export function resolveDesktopGameOverlayProcessGate({
  fallbackPreference,
  foregroundProcessName,
  gameSettings,
  processDetectionEnabled,
}: {
  fallbackPreference?: DesktopGameOverlayGamePreference;
  foregroundProcessName: string | null;
  gameSettings: DesktopGameOverlayGameSettings;
  processDetectionEnabled: boolean;
}) {
  if (!processDetectionEnabled) {
    return {
      allowed: true,
      executableName: null,
      preference: null,
      reason: "process-detection-disabled" as const,
    };
  }

  const executableName = normalizeDesktopExecutableName(foregroundProcessName);
  if (!executableName || !isWhitelistedDesktopGameExecutable(executableName)) {
    return {
      allowed: false,
      executableName,
      preference: null,
      reason: "not-whitelisted" as const,
    };
  }

  const preference =
    gameSettings[executableName] ??
    fallbackPreference ??
    DEFAULT_DESKTOP_GAME_OVERLAY_GAME_PREFERENCE;
  return {
    allowed: preference.enabled,
    executableName,
    preference,
    reason: preference.enabled ? ("allowed" as const) : ("disabled-for-game" as const),
  };
}
