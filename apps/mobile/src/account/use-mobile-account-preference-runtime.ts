import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { ACCOUNT_PREFERENCES_DEFAULT, getSystemTimeZone } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { useMobileAccountPreferencesQuery } from "./mobile-account-preferences-query";
import {
  configureMobileAccountPreferenceRuntime,
  resetMobileAccountPreferenceRuntime,
} from "./mobile-account-preference-runtime";

export function useMobileAccountPreferenceRuntimeBridge({
  client,
  enabled,
  locale,
}: {
  readonly client: MobileApiClient;
  readonly enabled: boolean;
  readonly locale: string;
}): void {
  const query = useMobileAccountPreferencesQuery(client, enabled);
  const [systemTimeZone, setSystemTimeZone] = useState(getSystemTimeZone);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setSystemTimeZone(getSystemTimeZone());
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetMobileAccountPreferenceRuntime();
      return;
    }

    configureMobileAccountPreferenceRuntime({
      locale,
      preferences: query.data ?? ACCOUNT_PREFERENCES_DEFAULT,
      systemTimeZone,
    });
  }, [enabled, locale, query.data, systemTimeZone]);

  useEffect(() => resetMobileAccountPreferenceRuntime, []);
}
