import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { MobileApiClient } from "../api/mobile-api-client";
import { useToast } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { mobileCopy } from "../locale/mobile-copy";
import { runMobileServerUserSettingsUpdate } from "./mobile-server-user-settings";
import type { MobileServerUserSettingsPatch } from "./mobile-server-cache";

/**
 * The 6c toggles' one writer. Faz 1 §C3 and Faz 2 §C8 both pin the endpoint:
 * `starred`, `muted` and `notificationLevel` never get a switch-per-endpoint.
 *
 * The in-flight set lives on a ref so it survives re-renders — a double tap
 * re-renders the card between the two presses, and a state-held guard would be
 * read stale by the second one.
 */
export function useMobileServerUserSettings(client: MobileApiClient, serverId: string | null) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { locale } = useMobileLocaleRuntime();
  const inFlight = useRef(new Set<string>());

  const update = useCallback(
    (settings: MobileServerUserSettingsPatch) => {
      if (!serverId) {
        return;
      }

      void runMobileServerUserSettingsUpdate({
        client,
        inFlight: inFlight.current,
        onError: () => {
          showToast({ title: mobileCopy[locale].serverMenuSettingsSaveFailed, variant: "error" });
        },
        queryClient,
        serverId,
        settings,
      });
    },
    [client, locale, queryClient, serverId, showToast],
  );

  return { update };
}
