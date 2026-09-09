"use client";

import React, { useEffect, useState } from "react";

import { useVoiceState } from "@/components/providers/voice-context";
import { ShortcutHelpDialog } from "@/components/shortcuts/shortcut-help-dialog";
import { resolveAppShortcut } from "@/lib/shortcuts/catalog";
import {
  getRelativeShortcutTarget,
  type ShortcutNavigationTarget,
} from "@/lib/shortcuts/navigation";

const CONTROLLER_SHORTCUT_IDS = [
  "shortcuts.help",
  "navigation.nextUnread",
  "navigation.previousUnread",
  "navigation.next",
  "navigation.previous",
  "navigation.nextRegion",
  "navigation.previousRegion",
  "voice.leave",
  "voice.toggleCamera",
  "voice.toggleScreenShare",
] as const;

function focusRelativeRegion(direction: -1 | 1) {
  const regions = Array.from(
    document.querySelectorAll<HTMLElement>("[data-shortcut-region]"),
  ).filter((region) => region.getClientRects().length > 0 && !region.closest("[inert]"));

  if (regions.length === 0) return;

  const activeIndex = regions.findIndex((region) => region.contains(document.activeElement));
  const nextIndex =
    activeIndex < 0
      ? direction > 0
        ? 0
        : regions.length - 1
      : (activeIndex + direction + regions.length) % regions.length;

  regions[nextIndex]?.focus({ preventScroll: true });
}

export function AppShortcutController({
  activeTargetId,
  navigationTargets,
  onNavigate,
}: {
  activeTargetId: string | null;
  navigationTargets: readonly ShortcutNavigationTarget[];
  onNavigate: (href: string) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { leaveChannel, sessionMode, toggleCamera, toggleScreenShare } = useVoiceState();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = resolveAppShortcut(CONTROLLER_SHORTCUT_IDS, event);
      if (!shortcut) return;

      if (shortcut === "shortcuts.help") {
        event.preventDefault();
        setHelpOpen((current) => !current);
        return;
      }

      if (shortcut === "navigation.nextRegion" || shortcut === "navigation.previousRegion") {
        event.preventDefault();
        focusRelativeRegion(shortcut === "navigation.nextRegion" ? 1 : -1);
        return;
      }

      if (
        shortcut === "navigation.next" ||
        shortcut === "navigation.previous" ||
        shortcut === "navigation.nextUnread" ||
        shortcut === "navigation.previousUnread"
      ) {
        const direction =
          shortcut === "navigation.next" || shortcut === "navigation.nextUnread" ? 1 : -1;
        const target = getRelativeShortcutTarget(navigationTargets, activeTargetId, direction, {
          unreadOnly:
            shortcut === "navigation.nextUnread" || shortcut === "navigation.previousUnread",
        });

        if (target) {
          event.preventDefault();
          onNavigate(target.href);
        }
        return;
      }

      if (!sessionMode) return;

      event.preventDefault();
      if (shortcut === "voice.leave") void leaveChannel();
      else if (shortcut === "voice.toggleCamera") void toggleCamera();
      else void toggleScreenShare();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTargetId,
    leaveChannel,
    navigationTargets,
    onNavigate,
    sessionMode,
    toggleCamera,
    toggleScreenShare,
  ]);

  return <ShortcutHelpDialog onClose={() => setHelpOpen(false)} open={helpOpen} />;
}
