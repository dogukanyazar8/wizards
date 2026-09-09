"use client";

import { useSyncExternalStore } from "react";

import {
  getAppShortcutLabels,
  type AppShortcutId,
  type AppShortcutPlatform,
} from "@/lib/shortcuts/catalog";

const NEVER_CHANGES = () => () => undefined;
const readServerPlatform = (): AppShortcutPlatform => "windows";

function readBrowserPlatform(): AppShortcutPlatform {
  return /mac/i.test(window.navigator.platform || window.navigator.userAgent) ? "macos" : "windows";
}

export function useAppShortcutLabels(id: AppShortcutId): string[] {
  const platform = useSyncExternalStore(NEVER_CHANGES, readBrowserPlatform, readServerPlatform);
  return getAppShortcutLabels(id, platform);
}

export function useAppShortcutLabel(id: AppShortcutId): string {
  return useAppShortcutLabels(id)[0] ?? "";
}
