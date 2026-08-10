import type { QueryClient } from "@tanstack/react-query";
import type { MobileBootstrapPayload } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { updateMobileServerUserSettings } from "../about/mobile-community-invite-client";
import { mobileQueryKeys } from "./mobile-query-keys";
import {
  patchMobileServerUserSettingsCaches,
  type MobileServerUserSettingsPatch,
} from "./mobile-server-cache";

/**
 * Reads back exactly the keys the caller is about to overwrite, so a rollback
 * restores those and nothing else. The rail summary is the source: it is what
 * 6c draws its toggles from, and it is loaded whenever the sheet can be open.
 */
function snapshotServerUserSettings(
  queryClient: QueryClient,
  serverId: string,
  settings: MobileServerUserSettingsPatch,
): MobileServerUserSettingsPatch {
  const bootstrap = queryClient.getQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap());
  const server = bootstrap?.home.servers.recent.find((entry) => entry.id === serverId);
  if (!server) {
    return {};
  }

  return {
    ...(settings.muted === undefined ? {} : { muted: server.muted }),
    ...(settings.notificationLevel === undefined
      ? {}
      : { notificationLevel: server.notificationLevel }),
    ...(settings.starred === undefined ? {} : { starred: server.starred }),
  };
}

/**
 * 6c §C: the card paints its new state immediately, the write follows, and a
 * failure puts the old state back. Success is silent — the card already says
 * what happened — so only the failure raises a toast.
 *
 * `inFlight` holds the preference names a request is currently carrying. A
 * second tap on the same card while its write is open is dropped rather than
 * queued: two racing writes of one boolean end wherever the network decides.
 * The guard is per preference, so muting while a star is still saving works.
 *
 * Written as a plain function over explicit dependencies rather than a
 * mutation hook so the optimistic path, the rollback and the double-tap guard
 * are assertable without a React renderer. The hook wrapper lives beside it in
 * `use-mobile-server-user-settings.ts`; this file stays free of React Native
 * imports so the node test runner can load it.
 */
export async function runMobileServerUserSettingsUpdate(input: {
  client: MobileApiClient;
  inFlight: Set<string>;
  onError(): void;
  queryClient: QueryClient;
  serverId: string;
  settings: MobileServerUserSettingsPatch;
}): Promise<void> {
  const { client, inFlight, onError, queryClient, serverId, settings } = input;
  const keys = Object.keys(settings);
  if (keys.length === 0 || keys.some((key) => inFlight.has(key))) {
    return;
  }

  for (const key of keys) {
    inFlight.add(key);
  }

  const previous = snapshotServerUserSettings(queryClient, serverId, settings);
  patchMobileServerUserSettingsCaches({ queryClient, serverId, settings });

  try {
    const response = await updateMobileServerUserSettings(client, serverId, settings);
    // Publish what the server stored, not what was asked for: the row is
    // created lazily and the response is the authoritative post-write state.
    patchMobileServerUserSettingsCaches({
      queryClient,
      serverId,
      settings: {
        muted: response.settings.muted,
        notificationLevel: response.settings.notificationLevel,
        starred: response.settings.starred,
      },
    });
  } catch {
    patchMobileServerUserSettingsCaches({ queryClient, serverId, settings: previous });
    onError();
  } finally {
    for (const key of keys) {
      inFlight.delete(key);
    }
  }
}
