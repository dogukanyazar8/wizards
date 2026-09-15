"use client";

import { keyboardPlatform } from "@wizards/ui/platform-keyboard.mjs";
import { useClientPlatform } from "@/hooks/use-client-platform";

import {
  getAppShortcutLabels,
  getAppShortcutAccessibleLabels,
  getAppShortcutAriaKeyShortcuts,
  type AppShortcutId,
} from "@/lib/shortcuts/catalog";

export function useAppShortcutLabels(id: AppShortcutId): string[] {
  const platform = keyboardPlatform(useClientPlatform());
  return getAppShortcutLabels(id, platform);
}

export function useAppShortcutLabel(id: AppShortcutId): string {
  return useAppShortcutLabels(id)[0] ?? "";
}

export function useAppShortcutAccessibleLabels(id: AppShortcutId): string[] {
  return getAppShortcutAccessibleLabels(id, keyboardPlatform(useClientPlatform()));
}

export function useAppShortcutAriaKeyShortcuts(id: AppShortcutId): string {
  return getAppShortcutAriaKeyShortcuts(id, keyboardPlatform(useClientPlatform()));
}
