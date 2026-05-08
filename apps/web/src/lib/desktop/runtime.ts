"use client";

declare global {
  interface Window {
    __WHISPR_DESKTOP__?: {
      platform: "tauri";
      shell: "desktop";
    };
  }
}

export const WHISPR_DESKTOP_BEFORE_CLOSE_EVENT = "whispr:desktop-before-close";
export const WHISPR_DESKTOP_COMMAND_EVENT = "whispr:desktop-command";

export type WhisprDesktopCommand =
  | "navigate"
  | "open-desktop-diagnostics"
  | "open-settings"
  | "toggle-deafen"
  | "toggle-mute";

export interface WhisprDesktopCommandDetail {
  command: WhisprDesktopCommand;
  path?: string | null;
}

export function isWhisprDesktopRuntime() {
  return typeof window !== "undefined" && window.__WHISPR_DESKTOP__?.shell === "desktop";
}

export function isSafeDesktopInternalPath(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      value.length <= 768 &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\"),
  );
}
