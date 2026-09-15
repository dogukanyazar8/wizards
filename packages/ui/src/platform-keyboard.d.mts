export type ClientPlatform =
  "windows" | "macos" | "linux" | "chromeos" | "ios" | "android" | "unknown";
export type KeyboardPlatform = "windows" | "macos" | "linux" | "unknown";
export type PlatformSignals = {
  nativePlatform?: string | null;
  userAgentDataPlatform?: string | null;
  platform?: string | null;
  userAgent?: string | null;
  maxTouchPoints?: number;
};
export function normalizePlatform(value?: string | null): ClientPlatform;
export function detectPlatform(signals?: PlatformSignals): ClientPlatform;
export function keyboardPlatform(platform?: string | null): KeyboardPlatform;
export function formatShortcutParts(accelerator: string, platform?: string | null): string[];
export function formatShortcut(accelerator: string, platform?: string | null): string;
export function readableShortcut(parts: readonly string[]): string;
