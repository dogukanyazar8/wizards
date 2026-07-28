import { useEffect, useMemo, useRef } from "react";
import type { MobileAccountAppearance } from "@wizards/types";

import {
  createMobileAppearanceSyncQueue,
  resolveMobileAppearanceHydration,
} from "../../account/mobile-appearance-sync";
import { updateMobileAccountSettings } from "../../account/mobile-account-settings-client";
import { useMobileAccountSettingsQuery } from "../../account/mobile-account-settings-query";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { useMobileAppearancePreferences } from "./mobile-theme-provider";

/**
 * Keeps the message-body appearance (§3) in step with the account.
 *
 * Mounted inside the auth tree because it needs the API client, while the
 * preference state itself lives in `MobileThemeProvider` above it — the reader
 * still gets an instant, offline-safe local write, and this only carries the
 * value outward and pulls a newer one in once per session.
 */
export function MobileAppearanceSyncBridge() {
  const { apiClient, status } = useMobileAuth();
  const preferences = useMobileAppearancePreferences();
  const settingsQuery = useMobileAccountSettingsQuery(apiClient, status === "signed-in");
  const hasHydratedRef = useRef(false);

  const queue = useMemo(
    () =>
      createMobileAppearanceSyncQueue({
        write: (appearance) => updateMobileAccountSettings(apiClient, appearance),
      }),
    [apiClient],
  );

  const local = useMemo<MobileAccountAppearance>(
    () => ({
      messageCompact: preferences.messageCompact,
      messageFollowSystemFont: preferences.messageFollowSystemFont,
      messageFontSize: preferences.messageFontSize,
    }),
    [preferences.messageCompact, preferences.messageFollowSystemFont, preferences.messageFontSize],
  );

  // Signing out ends the session's reconciliation, so the next account starts
  // its own rather than inheriting this one's verdict.
  useEffect(() => {
    if (status !== "signed-in") {
      hasHydratedRef.current = false;
      queue.cancel();
    }
  }, [queue, status]);

  useEffect(() => () => queue.cancel(), [queue]);

  useEffect(() => {
    if (status !== "signed-in") {
      return;
    }

    const decision = resolveMobileAppearanceHydration({
      hasHydrated: hasHydratedRef.current,
      local,
      localReady: preferences.messagePreferencesReady,
      remote: settingsQuery.data?.appearance,
    });

    if (decision.type === "idle") {
      // Reaching a matching pair still counts as reconciled, otherwise a later
      // local change would be read as the first payload and pull the server
      // value back over it.
      if (preferences.messagePreferencesReady && settingsQuery.data) {
        hasHydratedRef.current = true;
      }
      return;
    }

    hasHydratedRef.current = true;

    if (decision.type === "adopt-remote") {
      preferences.setMessageFontSize(decision.appearance.messageFontSize);
      preferences.setMessageCompact(decision.appearance.messageCompact);
      preferences.setMessageFollowSystemFont(decision.appearance.messageFollowSystemFont);
      return;
    }

    queue.queue(decision.appearance);
  }, [local, preferences, queue, settingsQuery.data, status]);

  // Every local change after reconciliation flows outward, debounced so a slider
  // drag across four stops is one request.
  useEffect(() => {
    if (status !== "signed-in" || !hasHydratedRef.current) {
      return;
    }

    queue.queue(local);
  }, [local, queue, status]);

  return null;
}
