"use client";

import { isWhisprDesktopRuntime } from "./runtime";
import {
  toDesktopShortcutConfig,
  type DesktopShortcutAssignments,
  type DesktopShortcutNativeStatus,
} from "./shortcuts";

export const NATIVE_DESKTOP_SETTINGS_KEY = ["settings", "desktop", "native"] as const;
export type NativeApplicationSettings = {
  registeredGames?: { id: string; executable: string; label: string }[];
  launchOnStartup: boolean;
  closeAction: "tray" | "quit";
  gameDetectionEnabled: boolean;
};
export type NativeUpdaterState = {
  enabled: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  checkedAt?: number;
};
export type NativeDesktopSettings = {
  application: NativeApplicationSettings;
  shortcuts: DesktopShortcutNativeStatus;
  updater: NativeUpdaterState;
  platform: { os: string; arch: string; family: string };
};
export type NativeRecoveryAction =
  "reopen-voice-mini" | "refresh-overlay" | "hide-overlay" | "reset-main-window";

export const NATIVE_SETTINGS_COMMANDS = {
  read: "get_desktop_control_state",
  application: "desktop_control_set_app_settings",
  shortcuts: "configure_desktop_voice_shortcuts",
  check: "desktop_control_check_for_updates",
  install: "desktop_control_install_update",
  diagnostics: "export_desktop_diagnostics_bundle",
  notification: "desktop_control_request_notification_permission",
  notificationPermission: "get_desktop_notification_permission",
  sendNotification: "send_desktop_notification",
  screenCaptureTest: "test_desktop_screen_capture",
  clipboardText: "read_desktop_clipboard_text",
  recovery: "desktop_control_recover",
} as const;

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
async function nativeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isWhisprDesktopRuntime()) throw new Error("Desktop settings require the desktop app.");
  const { invoke } = await import("@tauri-apps/api/core");
  // Do not race writes against a timeout: installation and native dialogs can take time.
  return invoke<T>(command, args);
}

/** Fixed commands and typed payloads; no generic filesystem, process or updater plugin access. */
export function createNativeSettingsClient(invoke: Invoke = nativeInvoke) {
  return {
    read: () => invoke<NativeDesktopSettings>(NATIVE_SETTINGS_COMMANDS.read),
    runningApplications: () =>
      invoke<{ executable: string; displayName: string }[]>("list_desktop_running_applications"),
    application: (settings: NativeApplicationSettings) =>
      invoke<NativeApplicationSettings>(NATIVE_SETTINGS_COMMANDS.application, { settings }),
    shortcuts: (assignments: DesktopShortcutAssignments, enabled: boolean) =>
      invoke<DesktopShortcutNativeStatus>(NATIVE_SETTINGS_COMMANDS.shortcuts, {
        config: toDesktopShortcutConfig(assignments, enabled),
      }),
    check: () => invoke<NativeUpdaterState>(NATIVE_SETTINGS_COMMANDS.check),
    install: (expectedVersion: string) =>
      invoke<void>(NATIVE_SETTINGS_COMMANDS.install, { confirmed: true, expectedVersion }),
    diagnostics: () =>
      invoke<{ path: string; generatedAtMs: number }>(NATIVE_SETTINGS_COMMANDS.diagnostics),
    notificationPermission: () =>
      invoke<"granted" | "denied" | "prompt" | "unknown">(
        NATIVE_SETTINGS_COMMANDS.notificationPermission,
      ),
    clipboardText: () => invoke<string>(NATIVE_SETTINGS_COMMANDS.clipboardText),
    screenCaptureTest: () => invoke<boolean>(NATIVE_SETTINGS_COMMANDS.screenCaptureTest),
    sendNotification: (title: string, body: string) =>
      invoke<void>(NATIVE_SETTINGS_COMMANDS.sendNotification, { title, body }),
    notification: () => invoke<{ message: string }>(NATIVE_SETTINGS_COMMANDS.notification),
    recovery: (action: NativeRecoveryAction) =>
      invoke<{ message: string }>(NATIVE_SETTINGS_COMMANDS.recovery, { action }),
  };
}
export const nativeSettingsClient = createNativeSettingsClient();
