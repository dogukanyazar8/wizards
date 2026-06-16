"use client";

import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import type {
  VoiceMiniSnapshot,
  VoiceOverlayAnchor,
  VoiceOverlayPreferences,
  VoiceOverlaySize,
} from "@wizards/types";

export type DesktopVoiceShortcutAction =
  | "hideGameOverlay"
  | "pushToTalk"
  | "toggleDeafen"
  | "toggleMute";

export interface DesktopVoiceShortcutRegistration {
  action: DesktopVoiceShortcutAction;
  shortcut: string;
}

export interface DesktopVoiceShortcutStatus {
  enabled: boolean;
  registered: DesktopVoiceShortcutRegistration[];
}

export interface DesktopVoiceShortcutConfig {
  hideGameOverlay?: string | null;
  pushToTalk?: string | null;
  shortcutsEnabled: boolean;
  toggleDeafen?: string | null;
  toggleMute?: string | null;
}

export type DesktopVoiceMiniCommand = "leaveVoice" | "toggleDeafen" | "toggleMute";

export type DesktopActivityStatus = "idle" | "offline" | "reconnecting" | "streaming" | "voice";

export type DesktopPlatformFeatureStatus = "available" | "research_gated" | "unsupported";

export interface DesktopPlatformFeature {
  status: DesktopPlatformFeatureStatus;
  strategy: string;
}

export interface DesktopPlatformCapabilities {
  arch: string;
  hardwareEncode: DesktopPlatformFeature;
  nativeScreenCapture: DesktopPlatformFeature;
  platform: string;
  richPresence: DesktopPlatformFeature;
  systemAudioCapture: DesktopPlatformFeature;
}

export interface DesktopCompanionSurfaceInfo {
  exists: boolean;
  height: number | null;
  minimized: boolean;
  visible: boolean;
  width: number | null;
  x: number | null;
  y: number | null;
}

export interface DesktopCompanionSurfacesStatus {
  gameOverlay: DesktopCompanionSurfaceInfo;
  lastError?: string | null;
  voiceMini: DesktopCompanionSurfaceInfo;
}

export interface DesktopGameOverlayLayout {
  anchor: VoiceOverlayAnchor;
  size: VoiceOverlaySize;
}

export type DesktopSurfaceHealth = "idle" | "needs-repair" | "ready";

const MIN_COMPANION_SURFACE_SIZE_PX = 24;
const DESKTOP_COMMAND_TIMEOUT_MS = 4_000;

async function getTauriInvoke() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

function withDesktopCommandTimeout<T>(
  promise: Promise<T>,
  command: string,
  timeoutMs = DESKTOP_COMMAND_TIMEOUT_MS,
) {
  let timeoutId: number | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Desktop command timed out: ${command}`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

async function invokeDesktopCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const invoke = await getTauriInvoke();
  return withDesktopCommandTimeout(invoke<T>(command, args), command);
}

export async function getDesktopMainWindowFocused() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  try {
    return await invokeDesktopCommand<boolean>("get_desktop_main_window_focused");
  } catch {
    // Fall back to Tauri's window API for older dev shells that do not expose
    // the native foreground-window command yet.
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().isFocused();
  } catch {
    return document.visibilityState === "visible" && window.document.hasFocus();
  }
}

function buildDesktopOverlayTestSnapshot(
  label: "game-overlay" | "voice-mini",
  overlayPreferences?: VoiceOverlayPreferences,
): VoiceMiniSnapshot {
  return {
    active: true,
    connection: {
      quality: "good",
      rttMs: null,
    },
    participants: [
      {
        audioLevel: label === "game-overlay" ? 0.76 : 0.42,
        avatarUrl: null,
        displayName: label === "game-overlay" ? "Whispr Overlay" : "Whispr Mini",
        isDeafened: false,
        isLocal: true,
        isMuted: false,
        isSpeaking: true,
        userId: `desktop-test-${label}`,
      },
    ],
    overlay: overlayPreferences,
    updatedAt: new Date().toISOString(),
  };
}

async function publishDesktopTestSnapshot(
  publishSnapshot: (snapshot: VoiceMiniSnapshot) => Promise<boolean>,
  label: "game-overlay" | "voice-mini",
  overlayPreferences?: VoiceOverlayPreferences,
) {
  const snapshot = buildDesktopOverlayTestSnapshot(label, overlayPreferences);
  await publishSnapshot(snapshot);

  for (const delayMs of [250, 750, 1500, 2500, 4000]) {
    window.setTimeout(() => {
      void publishSnapshot({ ...snapshot, updatedAt: new Date().toISOString() }).catch(
        () => undefined,
      );
    }, delayMs);
  }
}

function getDesktopGameOverlayLayout(
  overlayPreferences?: Pick<VoiceOverlayPreferences, "anchor" | "size"> | null,
): DesktopGameOverlayLayout | null {
  return overlayPreferences
    ? {
        anchor: overlayPreferences.anchor,
        size: overlayPreferences.size,
      }
    : null;
}

export function isDesktopCompanionSurfaceReady(surface: DesktopCompanionSurfaceInfo) {
  return (
    surface.exists &&
    surface.visible &&
    !surface.minimized &&
    (surface.width ?? 0) >= MIN_COMPANION_SURFACE_SIZE_PX &&
    (surface.height ?? 0) >= MIN_COMPANION_SURFACE_SIZE_PX
  );
}

export function resolveDesktopGameOverlayHealth(
  status: DesktopCompanionSurfacesStatus | null,
  shouldBeVisible: boolean,
): DesktopSurfaceHealth {
  if (!shouldBeVisible) {
    return "idle";
  }

  return status && isDesktopCompanionSurfaceReady(status.gameOverlay) ? "ready" : "needs-repair";
}

export async function configureDesktopVoiceShortcuts(
  config: DesktopVoiceShortcutConfig,
): Promise<DesktopVoiceShortcutStatus | null> {
  if (!isWhisprDesktopRuntime()) {
    return null;
  }

  return invokeDesktopCommand<DesktopVoiceShortcutStatus>("configure_desktop_voice_shortcuts", {
    config,
  });
}

export async function getDesktopAutostartEnabled() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("get_desktop_autostart_enabled");
}

export async function setDesktopAutostartEnabled(enabled: boolean) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("set_desktop_autostart_enabled", { enabled });
}

export async function getDesktopQuitOnCloseEnabled() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("get_desktop_quit_on_close_enabled");
}

export async function setDesktopQuitOnCloseEnabled(enabled: boolean) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("set_desktop_quit_on_close_enabled", { enabled });
}

export async function getDesktopPlatformCapabilities() {
  if (!isWhisprDesktopRuntime()) {
    return null;
  }

  return invokeDesktopCommand<DesktopPlatformCapabilities>("get_desktop_platform_capabilities");
}

export async function getDesktopCompanionSurfacesStatus() {
  if (!isWhisprDesktopRuntime()) {
    return null;
  }

  return invokeDesktopCommand<DesktopCompanionSurfacesStatus>(
    "get_desktop_companion_surfaces_status",
  );
}

export async function refreshDesktopCompanionSurfaces() {
  if (!isWhisprDesktopRuntime()) {
    return null;
  }

  return invokeDesktopCommand<DesktopCompanionSurfacesStatus>("refresh_desktop_companion_surfaces", {
    layout: null,
  });
}

export async function refreshDesktopCompanionSurfacesWithLayout(layout: DesktopGameOverlayLayout) {
  if (!isWhisprDesktopRuntime()) {
    return null;
  }

  return invokeDesktopCommand<DesktopCompanionSurfacesStatus>("refresh_desktop_companion_surfaces", {
    layout,
  });
}

export async function repairDesktopGameOverlaySurface(
  overlayPreferences: Pick<VoiceOverlayPreferences, "anchor" | "size">,
) {
  if (!isWhisprDesktopRuntime()) {
    return null;
  }

  const layout = getDesktopGameOverlayLayout(overlayPreferences);
  if (!layout) {
    return null;
  }

  await setDesktopGameOverlayVisible(true, layout);
  return refreshDesktopCompanionSurfacesWithLayout(layout);
}

export async function hideDesktopGameOverlaySurface() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return setDesktopGameOverlayVisible(false);
}

export async function setDesktopActivityStatus(status: DesktopActivityStatus) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("set_desktop_activity_status", { status });
}

export async function setDesktopVoiceMiniVisible(visible: boolean) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("set_desktop_voice_mini_visible", { visible });
}

export async function setDesktopGameOverlayVisible(
  visible: boolean,
  layout?: DesktopGameOverlayLayout | null,
) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("set_desktop_game_overlay_visible", {
    layout: layout ?? null,
    visible,
  });
}

export async function publishDesktopVoiceMiniSnapshot(snapshot: VoiceMiniSnapshot) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("publish_desktop_voice_mini_snapshot", { snapshot });
}

export async function publishDesktopGameOverlaySnapshot(snapshot: VoiceMiniSnapshot) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("publish_desktop_game_overlay_snapshot", { snapshot });
}

export async function testDesktopGameOverlaySurface(overlayPreferences?: VoiceOverlayPreferences) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  const layout = getDesktopGameOverlayLayout(overlayPreferences);
  await setDesktopGameOverlayVisible(true, layout);
  if (layout) {
    await refreshDesktopCompanionSurfacesWithLayout(layout);
  } else {
    await refreshDesktopCompanionSurfaces();
  }
  await publishDesktopTestSnapshot(
    publishDesktopGameOverlaySnapshot,
    "game-overlay",
    overlayPreferences,
  );
  return true;
}

export async function testDesktopVoiceMiniSurface() {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  await setDesktopVoiceMiniVisible(true);
  await refreshDesktopCompanionSurfaces();
  await publishDesktopTestSnapshot(publishDesktopVoiceMiniSnapshot, "voice-mini");
  return true;
}

export async function dispatchDesktopVoiceMiniCommand(command: DesktopVoiceMiniCommand) {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  return invokeDesktopCommand<boolean>("dispatch_desktop_voice_mini_command", { command });
}
