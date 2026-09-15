"use client";

declare global {
  interface Window {
    __WHISPR_DESKTOP_CLIENT_NAVIGATION_READY__?: true;
    __WHISPR_DESKTOP__?: {
      features?: {
        updater?: boolean;
      };
      platform: "tauri";
      os?: string;
      launchMode?: "autostart" | "interactive";
      releaseRing?: "dev" | "stable" | "production" | "uat";
      shell: "desktop";
    };
  }
}

export const WHISPR_DESKTOP_BEFORE_CLOSE_EVENT = "whispr:desktop-before-close";
export const WHISPR_DESKTOP_COMMAND_EVENT = "whispr:desktop-command";
export const WHISPR_DESKTOP_GAME_OVERLAY_SNAPSHOT_EVENT = "whispr:desktop-game-overlay-snapshot";
export const WHISPR_DESKTOP_VOICE_MINI_SNAPSHOT_EVENT = "whispr:desktop-voice-mini-snapshot";

const DESKTOP_MAIN_WINDOW_WIDTH = 1920;
const DESKTOP_MAIN_WINDOW_HEIGHT = 1080;
const DESKTOP_MIN_WINDOW_WIDTH = 960;
const DESKTOP_MIN_WINDOW_HEIGHT = 640;
const DESKTOP_MAIN_VIEWPORT_READY_WIDTH = 900;
const DESKTOP_PROMOTION_VERIFY_INTERVAL_MS = 50;
const DESKTOP_PROMOTION_VERIFY_ATTEMPTS = 12;
const MAX_DESKTOP_INTERNAL_PATH_LENGTH = 768;

export type WhisprDesktopCommand =
  | "desktop-surface-ready"
  | "navigate"
  | "open-desktop-diagnostics"
  | "open-settings"
  | "hide-game-overlay"
  | "refresh-game-overlay"
  | "leave-voice"
  | "toggle-admin-console"
  | "voice-shortcut-push-to-talk-start"
  | "voice-shortcut-push-to-talk-stop"
  | "toggle-deafen"
  | "toggle-mute";

export interface WhisprDesktopCommandDetail {
  command: WhisprDesktopCommand;
  issuedAtMs?: number | null;
  path?: string | null;
  surface?: "game-overlay" | "voice-mini" | null;
}

export interface WhisprDesktopBeforeCloseDetail {
  requestId?: number;
}

export function isWhisprDesktopRuntime() {
  return typeof window !== "undefined" && window.__WHISPR_DESKTOP__?.shell === "desktop";
}

export function isWhisprDesktopAutostartLaunch() {
  return isWhisprDesktopRuntime() && window.__WHISPR_DESKTOP__?.launchMode === "autostart";
}

export function setWhisprDesktopClientNavigationReady(ready: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  if (!ready) {
    delete window.__WHISPR_DESKTOP_CLIENT_NAVIGATION_READY__;
    return;
  }

  if (isWhisprDesktopRuntime()) {
    window.__WHISPR_DESKTOP_CLIENT_NAVIGATION_READY__ = true;
  }
}

export function isWhisprDesktopUpdaterEnabled() {
  return Boolean(isWhisprDesktopRuntime() && window.__WHISPR_DESKTOP__?.features?.updater);
}

export function getWhisprDesktopReleaseRing() {
  return window.__WHISPR_DESKTOP__?.releaseRing ?? "uat";
}

async function runDesktopWindowStep(step: () => Promise<void>) {
  try {
    await step();
    return true;
  } catch {
    return false;
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function waitForPromotedDesktopViewport() {
  for (let attempt = 0; attempt < DESKTOP_PROMOTION_VERIFY_ATTEMPTS; attempt += 1) {
    if (window.innerWidth >= DESKTOP_MAIN_VIEWPORT_READY_WIDTH) {
      return true;
    }

    await wait(DESKTOP_PROMOTION_VERIFY_INTERVAL_MS);
  }

  return window.innerWidth >= DESKTOP_MAIN_VIEWPORT_READY_WIDTH;
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

/**
 * Pencereyi gizler.
 *
 * Açılış biterken pencere **büyütülürken** gizli tutulur: yeniden boyutlanma, kökteki
 * `zoom` kalkması ve kabuğun ilk tam ölçü çizimi kullanıcıya boş bir çerçeve olarak
 * görünüyordu. Tasarımın "splash kapanınca ana pencere gösterilir" kuralının tek
 * pencereli karşılığı budur (SPEC-SPLASH §8).
 */
export async function hideWhisprDesktopWindow() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().hide();
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
    const { invoke } = await import("@tauri-apps/api/core");
    const promoted = await invoke<boolean>("promote_desktop_main_window");
    if (promoted && (await waitForPromotedDesktopViewport())) {
      return true;
    }
  } catch {
    // Older dev shells may not expose the Rust promotion command yet. Fall back
    // to the legacy JS path so local desktop sessions can still boot.
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
      currentWindow.setSize(new LogicalSize(DESKTOP_MAIN_WINDOW_WIDTH, DESKTOP_MAIN_WINDOW_HEIGHT)),
    );
    await runDesktopWindowStep(() =>
      currentWindow.setMinSize(
        new LogicalSize(DESKTOP_MIN_WINDOW_WIDTH, DESKTOP_MIN_WINDOW_HEIGHT),
      ),
    );
    await runDesktopWindowStep(() => currentWindow.center());
    if (!isWhisprDesktopAutostartLaunch()) {
      await runDesktopWindowStep(() => currentWindow.show());
    }

    return resized;
  } catch {
    return false;
  }
}

export function getWhisprDesktopBeforeCloseRequestId(event: Event): number | null {
  const requestId = (event as CustomEvent<WhisprDesktopBeforeCloseDetail>).detail?.requestId;

  if (typeof requestId !== "number") {
    return null;
  }

  return Number.isSafeInteger(requestId) && requestId > 0 ? requestId : null;
}

export async function completeWhisprDesktopBeforeClose(requestId: number) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("complete_desktop_before_close", { requestId });
    return true;
  } catch {
    return false;
  }
}

/**
 * Kabuğun `navigate` komutundan güvenli iç yolu çıkarır — Ş13.
 *
 * `runtime.test.ts` bu yardımcıyı bir güvenlik iddiası olarak çağırıyordu ama karşılığı hiç
 * yazılmamıştı (tip kontrolü kırıktı). Kural iki parçalı ve ikisi de burada duruyor: komut
 * gerçekten `navigate` olmalı **ve** yol iç bir yol olmalı. Çağrı yerinde iki `if` yazmak,
 * birinin bir gün unutulması demekti — dış bir adres `router.push`'a düşerdi.
 */
export function getWhisprDesktopNavigationPath(event: Event): string | null {
  const detail = (event as CustomEvent<WhisprDesktopCommandDetail>).detail;

  if (detail?.command !== "navigate") {
    return null;
  }

  return isSafeDesktopInternalPath(detail.path) ? detail.path : null;
}

export function isSafeDesktopInternalPath(value: string | null | undefined): value is string {
  return Boolean(
    value &&
    value.length <= MAX_DESKTOP_INTERNAL_PATH_LENGTH &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\"),
  );
}
