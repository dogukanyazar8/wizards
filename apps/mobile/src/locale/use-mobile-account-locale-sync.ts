import { useEffect, useRef } from "react";

import type { MobileApiClient } from "../api/mobile-api-client";
import { syncMobileAccountLocale } from "./mobile-locale-client";
import type { MobileLocale } from "./mobile-locale-preferences";

/**
 * Mirrors the app's active language onto the account.
 *
 * Everything the server writes for this user — mention bodies, push titles — is
 * translated with `User.locale`, not with the phone's language. That column was
 * only ever written when someone opened Language settings and changed it by
 * hand, so a Turkish app installed on a fresh account kept receiving English
 * notifications forever. Reconciling against the bootstrap payload fixes it for
 * everyone on the next launch, and costs one PATCH only when the two disagree.
 */
export function useMobileAccountLocaleSync(input: {
  readonly accountLocale: MobileLocale | null;
  readonly client: MobileApiClient;
  readonly isSignedIn: boolean;
  readonly locale: MobileLocale;
}): void {
  const { accountLocale, client, isSignedIn, locale } = input;
  const syncedLocaleRef = useRef<MobileLocale | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      syncedLocaleRef.current = null;
      return;
    }

    // `accountLocale` is null until bootstrap lands; syncing then would race the
    // real value and could overwrite a deliberate choice with the default.
    if (accountLocale === null || accountLocale === locale) {
      return;
    }

    if (syncedLocaleRef.current === locale) {
      return;
    }

    syncedLocaleRef.current = locale;
    syncMobileAccountLocale(client, locale, true);
  }, [accountLocale, client, isSignedIn, locale]);
}
