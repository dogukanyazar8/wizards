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

const DESKTOP_MAIN_WINDOW_WIDTH = 1920;
const DESKTOP_MAIN_WINDOW_HEIGHT = 1080;
const DESKTOP_MIN_WINDOW_WIDTH = 960;
const DESKTOP_MIN_WINDOW_HEIGHT = 640;

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

async function runDesktopWindowStep(step: () => Promise<void>) {
  try {
    await step();
    return true;
  } catch {
    return false;
  }
}

export async function showWhisprDesktopWindow() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().show();
    return true;
  } catch {
    return false;
  }
}

export async function promoteWhisprDesktopWindow() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  try {
    const [{ LogicalSize }, { getCurrentWindow }] = await Promise.all([
      import("@tauri-apps/api/dpi"),
      import("@tauri-apps/api/window"),
    ]);
    const currentWindow = getCurrentWindow();

    await runDesktopWindowStep(() => currentWindow.setMinSize(null));
    await runDesktopWindowStep(() => currentWindow.setResizable(true));
    const resized = await runDesktopWindowStep(() =>
      currentWindow.setSize(
        new LogicalSize(DESKTOP_MAIN_WINDOW_WIDTH, DESKTOP_MAIN_WINDOW_HEIGHT),
      ),
    );
    await runDesktopWindowStep(() =>
      currentWindow.setMinSize(
        new LogicalSize(DESKTOP_MIN_WINDOW_WIDTH, DESKTOP_MIN_WINDOW_HEIGHT),
      ),
    );
    await runDesktopWindowStep(() => currentWindow.center());
    await runDesktopWindowStep(() => currentWindow.show());

    return resized;
  } catch {
    return false;
  }
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
