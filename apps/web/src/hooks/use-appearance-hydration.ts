"use client";

import { useLayoutEffect } from "react";
import {
  readStoredChannelSidebarWidth,
  readStoredNotificationAutoClose,
  readStoredNotificationLimit,
  readStoredServerRailWidth,
} from "@/lib/appearance";
import { APP_UI_STORAGE_KEY, useAppStore } from "@/lib/store";

/**
 * Migrates older appearance-only localStorage keys into the persisted UI store
 * before paint, then marks the UI state as hydrated for route restoration.
 */
export function useAppearanceHydration() {
  const hydrationDone = useAppStore((state) => state.appearanceHydrated);

  useLayoutEffect(() => {
    const hasPersistedUiState =
      typeof window !== "undefined" && window.localStorage.getItem(APP_UI_STORAGE_KEY) !== null;

    const patch: Partial<{
      appearanceHydrated: boolean;
      channelSidebarWidth: number;
      serverRailWidth: number;
      notificationLimit: number;
      notificationAutoClose: boolean;
    }> = {
      appearanceHydrated: true,
    };

    if (!hasPersistedUiState) {
      const current = useAppStore.getState();
      const legacyChannelSidebarWidth = readStoredChannelSidebarWidth();
      const legacyServerRailWidth = readStoredServerRailWidth();
      const legacyNotificationLimit = readStoredNotificationLimit();
      const legacyNotificationAutoClose = readStoredNotificationAutoClose();

      if (current.channelSidebarWidth !== legacyChannelSidebarWidth) {
        patch.channelSidebarWidth = legacyChannelSidebarWidth;
      }

      if (current.serverRailWidth !== legacyServerRailWidth) {
        patch.serverRailWidth = legacyServerRailWidth;
      }

      if (current.notificationLimit !== legacyNotificationLimit) {
        patch.notificationLimit = legacyNotificationLimit;
      }

      if (current.notificationAutoClose !== legacyNotificationAutoClose) {
        patch.notificationAutoClose = legacyNotificationAutoClose;
      }
    }

    useAppStore.setState(patch);
  }, []);

  return hydrationDone;
}
